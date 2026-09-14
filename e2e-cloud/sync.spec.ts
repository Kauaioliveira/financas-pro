import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { MockSupabase } from './mockSupabase';

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';

interface Device {
  context: BrowserContext;
  page: Page;
}

async function newDevice(browser: Browser, server: MockSupabase): Promise<Device> {
  const context = await browser.newContext();
  await server.install(context);
  const page = await context.newPage();
  await page.goto('/');
  return { context, page };
}

async function signIn(page: Page) {
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
}

async function createAccountWithEmptyVault(page: Page, server: MockSupabase) {
  await page.getByRole('button', { name: /criar conta/i }).click();
  await page.getByLabel('Seu nome').fill('Dono');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByRole('button', { name: /^criar conta$/i }).click();
  await expect(page.getByRole('heading', { name: /confirme seu e-mail/i })).toBeVisible();
  server.confirm(EMAIL);
  await page.getByRole('button', { name: /já confirmei, entrar/i }).click();
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  await expect(page.locator('[data-kit-word]')).toHaveCount(12, { timeout: 20_000 });
  const words = await page.locator('[data-kit-word]').allInnerTexts();
  await page.getByRole('button', { name: /já guardei, confirmar palavras/i }).click();
  for (const input of await page.getByRole('textbox', { name: /palavra nº/i }).all()) {
    await input.fill(words[Number(await input.getAttribute('data-position')) - 1]);
  }
  await page.getByRole('button', { name: /^confirmar palavras$/i }).click();
  await page.getByRole('button', { name: /começar vazio/i }).click();
  await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
}

async function openRules(page: Page) {
  await page.getByRole('button', { name: /^regras/i }).first().click();
  await expect(page.getByRole('heading', { name: /regras de categoria/i })).toBeVisible();
}

const badge = (page: Page, text: RegExp) => page.getByRole('status').filter({ hasText: text });

const cloudVersion = (server: MockSupabase) => [...server.vaults.values()][0].version;

/** Waits until the cloud accepted a push (the badge alone may already say "Sincronizado"). */
async function waitForPush(server: MockSupabase, from: number) {
  await expect.poll(() => cloudVersion(server), { timeout: 15_000 }).toBeGreaterThan(from);
}

/** Two devices signed in to the same empty vault, both on the rules screen. */
async function twoDevices(browser: Browser) {
  const server = new MockSupabase();
  const a = await newDevice(browser, server);
  await createAccountWithEmptyVault(a.page, server);
  const b = await newDevice(browser, server);
  await signIn(b.page);
  await openRules(a.page);
  await openRules(b.page);
  return { server, a, b };
}

/** A edits offline while B edits and syncs; A comes back and hits the conflict. */
async function makeConflict(browser: Browser) {
  const ctx = await twoDevices(browser);
  const { server, a, b } = ctx;

  server.offline.add(a.context);
  await a.page.getByTitle('Importar regras prontas').click();
  const rulesOnA = await a.page.getByTitle('Remover regra').count();
  expect(rulesOnA).toBeGreaterThan(1);
  // supabase-js retries failed reads (1 s, 2 s, 4 s) before giving up.
  await expect(badge(a.page, /sem sincronizar/i)).toBeVisible({ timeout: 25_000 });

  const versionBeforeB = cloudVersion(server);
  await b.page.getByTitle('Importar regras prontas').click();
  await b.page.getByTitle('Remover regra').first().click();
  await b.page.getByTitle('Salvar regras').click();
  await waitForPush(server, versionBeforeB);
  const versionAfterB = cloudVersion(server);

  server.offline.delete(a.context);
  await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(a.page.getByRole('dialog', { name: /dados alterados em dois aparelhos/i })).toBeVisible({ timeout: 15_000 });
  expect([...server.vaults.values()][0].version).toBe(versionAfterB); // nothing was overwritten
  return { ...ctx, rulesOnA };
}

test.describe('Nuvem: sincronização entre aparelhos', () => {
  test('dados salvos em um aparelho aparecem no outro sem recarregar a página', async ({ browser }) => {
    const { server, a, b } = await twoDevices(browser);
    const before = cloudVersion(server);
    await b.page.getByTitle('Importar regras prontas').click();
    const count = await b.page.getByTitle('Remover regra').count();
    await waitForPush(server, before);

    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(a.page.getByTitle('Remover regra')).toHaveCount(count, { timeout: 15_000 });
  });

  test('conflito: "Manter as deste aparelho" pede confirmação e só então sobrescreve a nuvem', async ({ browser }) => {
    const { server, a, b, rulesOnA } = await makeConflict(browser);
    const dialog = a.page.getByRole('dialog');
    await dialog.getByRole('button', { name: /manter as deste aparelho/i }).click();
    await expect(a.page.getByRole('dialog', { name: /sobrescrever a nuvem\?/i })).toBeVisible();
    const before = [...server.vaults.values()][0].version;
    await a.page.getByRole('button', { name: /sim, sobrescrever a nuvem/i }).click();
    await expect(badge(a.page, /^sincronizado/i)).toBeVisible({ timeout: 15_000 });
    expect([...server.vaults.values()][0].version).toBe(before + 1);

    await b.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(b.page.getByTitle('Remover regra')).toHaveCount(rulesOnA, { timeout: 15_000 });
  });

  test('conflito: "Carregar a versão de outro aparelho" descarta as alterações locais', async ({ browser }) => {
    const { a, b } = await makeConflict(browser);
    const rulesOnB = await b.page.getByTitle('Remover regra').count();
    await a.page.getByRole('button', { name: /carregar a versão de outro aparelho/i }).click();
    await expect(a.page.getByRole('dialog')).toHaveCount(0);
    await expect(badge(a.page, /^sincronizado/i)).toBeVisible({ timeout: 15_000 });
    await expect(a.page.getByTitle('Remover regra')).toHaveCount(rulesOnB, { timeout: 15_000 });
  });

  test('conflito: "Decidir depois" deixa o aparelho sem sincronizar e o selo reabre a escolha', async ({ browser }) => {
    const { server, a } = await makeConflict(browser);
    const version = [...server.vaults.values()][0].version;
    await a.page.getByRole('button', { name: /decidir depois/i }).click();
    await expect(a.page.getByRole('dialog')).toHaveCount(0);
    await a.page.getByRole('button', { name: /sem sincronizar/i }).click();
    await expect(a.page.getByRole('dialog', { name: /dados alterados em dois aparelhos/i })).toBeVisible();
    expect([...server.vaults.values()][0].version).toBe(version);
  });

  test('nuvem que este aparelho não abre: avisa e preserva os dados locais', async ({ browser }) => {
    const { server, a } = await twoDevices(browser);
    await a.page.getByTitle('Importar regras prontas').click();
    const localRules = await a.page.getByTitle('Remover regra').count();
    await waitForPush(server, 0);

    const cacheBefore = await a.page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('financaspro_cloud_') && k.endsWith('_vault'))?.[1]);
    const row = [...server.vaults.values()][0];
    server.update(row.user_id, {
      ciphertext: JSON.stringify({ v: 1, alg: 'AES-GCM', kdf: 'PBKDF2', iv: 'AAAAAAAAAAAAAAAA', salt: '', iterations: 0, ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==' }),
      version: row.version + 1,
    });

    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(badge(a.page, /não consegue abrir.*preservados/i)).toBeAttached({ timeout: 15_000 });
    await expect(badge(a.page, /sem sincronizar/i)).toBeVisible();
    const cacheAfter = await a.page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('financaspro_cloud_') && k.endsWith('_vault'))?.[1]);
    expect(cacheAfter).toBe(cacheBefore);
    await expect(a.page.getByTitle('Remover regra')).toHaveCount(localRules);
  });
});
