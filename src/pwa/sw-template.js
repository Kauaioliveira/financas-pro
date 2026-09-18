/*
 * Service worker do FinançasPro — modelo preenchido no build por vite.config.ts.
 *
 * Este arquivo é JavaScript puro de propósito: ele roda fora do bundle da aplicação e
 * não pode importar nada de src/. O build troca a marca da constante CONFIG pela lista
 * de estáticos daquele build (veja src/pwa/precache.ts) e emite tudo como dist/sw.js.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: nada do usuário entra em cache. O worker só responde
 * requisições GET da própria origem que sejam arquivos do build. Qualquer chamada ao
 * Supabase (/auth/v1, /rest/v1, ...) passa direto para a rede, sem cache e sem fallback:
 * o cofre cifrado e as respostas de login nunca são gravados. src/pwa/serviceWorker.test.ts
 * carrega este arquivo e falha se isso mudar.
 */

/** { version, assetPrefix, precache } — preenchido no build. */
const CONFIG = __SW_CONFIG__;

/** Um cache por build: trocar de versão descarta tudo o que era da versão anterior. */
const CACHE_NAME = `financaspro-${CONFIG.version}`;

/** Casca da aplicação, servida quando a navegação não alcança a rede. */
const SHELL = '/index.html';

/**
 * Caminhos da própria origem que nunca podem ser lidos nem gravados no cache. Hoje o
 * Supabase fica em outro domínio (e já cai na regra de origem), mas um proxy reverso na
 * frente dele colocaria o cofre e o login aqui.
 */
const NEVER_CACHE = [/^\/auth\/v1\//, /^\/rest\/v1\//, /^\/storage\/v1\//, /^\/functions\/v1\//, /^\/realtime\/v1\//];

/** Arquivo do build: está no precache ou é um asset com hash no nome. */
function isBuildFile(pathname) {
  return CONFIG.precache.includes(pathname) || pathname.startsWith(CONFIG.assetPrefix);
}

/** Só respostas completas da nossa origem viram cache; opacas e erros, nunca. */
function isStorable(response) {
  return Boolean(response) && response.ok && response.type !== 'opaque' && response.type !== 'opaqueredirect';
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CONFIG.precache)),
  );
  // Sem skipWaiting(): a versão nova só assume quando a página pedir (mensagem
  // SKIP_WAITING), para não trocar o código embaixo de um formulário aberto.
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/** Rede primeiro; sem rede, a casca em cache. Usada só para navegação (a página em si). */
async function shellFirst(request) {
  try {
    const response = await fetch(request);
    if (isStorable(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(SHELL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL, { cacheName: CACHE_NAME });
    if (cached) return cached;
    throw error;
  }
}

/** Cache primeiro: os arquivos do build têm hash no nome, então nunca ficam velhos. */
async function buildFileFirst(request) {
  const cached = await caches.match(request, { cacheName: CACHE_NAME });
  if (cached) return cached;
  const response = await fetch(request);
  if (isStorable(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;

  // Tudo que não for leitura de arquivo estático da própria origem segue sem o worker,
  // ou seja, direto para a rede (NetworkOnly). É aqui que o Supabase fica de fora.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some(pattern => pattern.test(url.pathname))) return;

  if (request.mode === 'navigate') {
    event.respondWith(shellFirst(request));
    return;
  }

  if (isBuildFile(url.pathname)) {
    event.respondWith(buildFileFirst(request));
  }
});
