import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Estes testes carregam o próprio src/pwa/sw-template.js (o arquivo que vira dist/sw.js)
 * num escopo falso de service worker e observam o que ele faz. É a trava do requisito
 * mais importante do cache offline: NENHUM dado do usuário pode ser guardado. Se alguém
 * fizer o worker responder ou cachear uma chamada ao Supabase, estes testes falham.
 */

const SUPABASE = 'https://abcd1234.supabase.co';
const ORIGIN = 'https://financas.exemplo';

const CONFIG = {
  version: 'teste',
  assetPrefix: '/assets/',
  precache: ['/assets/index-abc123.js', '/icons/icon-192.png', '/index.html', '/manifest.webmanifest'],
};

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

/** Cache em memória com a mesma superfície que o worker usa de CacheStorage. */
class FakeCache {
  entries = new Map<string, string>();

  async put(request: FakeRequest | string, response: { body: string }) {
    this.entries.set(typeof request === 'string' ? request : request.url, response.body);
  }

  async addAll(paths: string[]) {
    for (const path of paths) this.entries.set(path, `conteudo de ${path}`);
  }

  async match(request: FakeRequest | string) {
    const key = typeof request === 'string' ? request : request.url;
    const body = this.entries.get(key) ?? this.entries.get(new URL(key, ORIGIN).pathname);
    return body === undefined ? undefined : { body, cached: true };
  }
}

interface Listeners {
  [event: string]: (event: unknown) => void;
}

/** Carrega o modelo do worker e devolve o que for preciso para observá-lo. */
function loadWorker(options: { networkFails?: boolean } = {}) {
  const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
  const source = template.replace('__SW_CONFIG__', JSON.stringify(CONFIG));

  const listeners: Listeners = {};
  const caches = new Map<string, FakeCache>();
  const fetched: string[] = [];
  const claimed = { value: false };
  const skipped = { value: false };

  const cacheStorage = {
    async open(name: string) {
      if (!caches.has(name)) caches.set(name, new FakeCache());
      return caches.get(name)!;
    },
    async keys() {
      return [...caches.keys()];
    },
    async delete(name: string) {
      return caches.delete(name);
    },
    async match(request: FakeRequest | string, init?: { cacheName?: string }) {
      const cache = init?.cacheName ? caches.get(init.cacheName) : undefined;
      return cache ? cache.match(request) : undefined;
    },
  };

  const self = {
    location: { origin: ORIGIN },
    clients: {
      async claim() {
        claimed.value = true;
      },
    },
    skipWaiting() {
      skipped.value = true;
    },
    addEventListener(event: string, handler: (event: unknown) => void) {
      listeners[event] = handler;
    },
  };

  const sandbox = {
    self,
    caches: cacheStorage,
    URL,
    console,
    async fetch(request: FakeRequest | string) {
      const url = typeof request === 'string' ? request : request.url;
      fetched.push(url);
      if (options.networkFails) throw new TypeError('Failed to fetch');
      return { ok: true, type: 'basic', body: `rede: ${url}`, clone: () => ({ body: `rede: ${url}` }) };
    },
  };

  runInContext(source, createContext(sandbox));

  return { listeners, caches, cacheStorage, fetched, claimed, skipped };
}

function request(url: string, { method = 'GET', mode = 'no-cors' } = {}): FakeRequest {
  return { url, method, mode };
}

/** Dispara um evento de fetch e devolve a resposta, ou null quando o worker não respondeu. */
async function handleFetch(worker: ReturnType<typeof loadWorker>, req: FakeRequest) {
  let responded: Promise<{ body: string; cached?: boolean }> | null = null;
  worker.listeners.fetch({
    request: req,
    respondWith(promise: Promise<{ body: string }>) {
      responded = promise;
    },
    waitUntil() {},
  });
  return responded === null ? null : await responded;
}

async function install(worker: ReturnType<typeof loadWorker>) {
  const waits: Promise<unknown>[] = [];
  worker.listeners.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}

describe('service worker — o que nunca pode ir para o cache', () => {
  const supabaseCalls = [
    `${SUPABASE}/rest/v1/vaults?select=*`,
    `${SUPABASE}/rest/v1/vaults?id=eq.1`,
    `${SUPABASE}/auth/v1/token?grant_type=password`,
    `${SUPABASE}/auth/v1/user`,
    `${SUPABASE}/functions/v1/rotate_vault_keys`,
    `${SUPABASE}/storage/v1/object/cofre`,
  ];

  it.each(supabaseCalls)('deixa %s passar direto para a rede', async url => {
    const worker = loadWorker();
    await install(worker);
    expect(await handleFetch(worker, request(url))).toBeNull();
    expect(await handleFetch(worker, request(url, { method: 'POST' }))).toBeNull();
  });

  it('não responde nem cacheia o Supabase mesmo quando a rede está fora', async () => {
    const worker = loadWorker({ networkFails: true });
    await install(worker);
    for (const url of supabaseCalls) {
      expect(await handleFetch(worker, request(url))).toBeNull();
    }
    const cached = [...worker.caches.values()].flatMap(cache => [...cache.entries.keys()]);
    expect(cached.some(key => key.includes('supabase') || key.includes('/rest/v1') || key.includes('/auth/v1'))).toBe(
      false,
    );
  });

  it('ignora rotas de dados servidas pela própria origem (proxy reverso)', async () => {
    const worker = loadWorker();
    await install(worker);
    for (const path of ['/rest/v1/vaults', '/auth/v1/token', '/functions/v1/feedback', '/storage/v1/object/x']) {
      expect(await handleFetch(worker, request(`${ORIGIN}${path}`))).toBeNull();
    }
  });

  it('ignora envios (POST, PUT, DELETE) da própria origem', async () => {
    const worker = loadWorker();
    await install(worker);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(await handleFetch(worker, request(`${ORIGIN}/index.html`, { method, mode: 'navigate' }))).toBeNull();
    }
  });

  it('guarda na instalação exatamente a lista de estáticos do build', async () => {
    const worker = loadWorker();
    await install(worker);
    const cache = worker.caches.get('financaspro-teste');
    expect([...cache!.entries.keys()].sort()).toEqual([...CONFIG.precache].sort());
  });
});

describe('service worker — o que funciona sem internet', () => {
  it('serve a casca em cache quando a navegação não alcança a rede', async () => {
    const worker = loadWorker({ networkFails: true });
    await install(worker);
    const response = await handleFetch(worker, request(`${ORIGIN}/`, { mode: 'navigate' }));
    expect(response).toEqual({ body: 'conteudo de /index.html', cached: true });
  });

  it('atualiza a casca em cache quando a rede responde', async () => {
    const worker = loadWorker();
    await install(worker);
    const response = await handleFetch(worker, request(`${ORIGIN}/`, { mode: 'navigate' }));
    expect(response).toMatchObject({ body: `rede: ${ORIGIN}/` });
    expect(worker.caches.get('financaspro-teste')!.entries.get('/index.html')).toBe(`rede: ${ORIGIN}/`);
  });

  it('serve arquivo do precache sem tocar na rede', async () => {
    const worker = loadWorker();
    await install(worker);
    const response = await handleFetch(worker, request(`${ORIGIN}/assets/index-abc123.js`));
    expect(response).toEqual({ body: 'conteudo de /assets/index-abc123.js', cached: true });
    expect(worker.fetched).toEqual([]);
  });

  it('guarda no primeiro uso um asset grande que ficou fora do precache', async () => {
    const worker = loadWorker();
    await install(worker);
    const url = `${ORIGIN}/assets/pdf.worker-xyz.mjs`;
    expect(await handleFetch(worker, request(url))).toMatchObject({ body: `rede: ${url}` });
    expect(worker.caches.get('financaspro-teste')!.entries.get(url)).toBe(`rede: ${url}`);
  });

  it('não interfere em arquivos da própria origem que não são do build', async () => {
    const worker = loadWorker();
    await install(worker);
    expect(await handleFetch(worker, request(`${ORIGIN}/algo-que-nao-existe.json`))).toBeNull();
  });
});

describe('service worker — troca de versão', () => {
  it('apaga os caches das versões anteriores ao ativar', async () => {
    const worker = loadWorker();
    await worker.cacheStorage.open('financaspro-versao-velha');
    await install(worker);

    const waits: Promise<unknown>[] = [];
    worker.listeners.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect([...worker.caches.keys()]).toEqual(['financaspro-teste']);
    expect(worker.claimed.value).toBe(true);
  });

  it('só assume o controle quando a página manda SKIP_WAITING', async () => {
    const worker = loadWorker();
    await install(worker);
    expect(worker.skipped.value).toBe(false);

    worker.listeners.message({ data: { type: 'OUTRA_COISA' } });
    expect(worker.skipped.value).toBe(false);

    worker.listeners.message({ data: { type: 'SKIP_WAITING' } });
    expect(worker.skipped.value).toBe(true);
  });
});
