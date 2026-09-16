import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { MockSupabase } from './mockSupabase';

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';

async function newDevice(browser: Browser, server: MockSupabase): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await server.install(context);
  const page = await context.newPage();
  await page.goto('/');
  return { context, page };
}

async function readKitWords(page: Page): Promise<string[]> {
  await expect(page.locator('[data-kit-word]')).toHaveCount(12, { timeout: 20_000 });
  return page.locator('[data-kit-word]').allInnerTexts();
}

async function confirmKit(page: Page, words: string[]) {
  await page.getByRole('button', { name: /já guardei, confirmar palavras/i }).click();
  for (const input of await page.getByRole('textbox', { name: /palavra nº/i }).all()) {
    const position = Number(await input.getAttribute('data-position'));
    await input.fill(words[position - 1]);
  }
  await page.getByRole('button', { name: /^confirmar palavras$/i }).click();
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();
}

/** Register, confirm the e-mail on the mock, sign in and set up the vault. Returns the kit words. */
async function createAccount(page: Page, server: MockSupabase, start: (page: Page) => Promise<void>): Promise<string[]> {
  await page.getByRole('button', { name: /criar conta/i }).click();
  await page.getByLabel('Seu nome').fill('Dono');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByRole('button', { name: /^criar conta$/i }).click();

  await expect(page.getByRole('heading', { name: /confirme seu e-mail/i })).toBeVisible();
  server.confirm(EMAIL);
  await page.getByRole('button', { name: /já confirmei, entrar/i }).click();
  await signIn(page, EMAIL, PASSWORD);

  const words = await readKitWords(page);
  await confirmKit(page, words);
  await expect(page.getByRole('heading', { name: /como quer começar/i })).toBeVisible();
  await start(page);
  await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
  return words;
}

test.describe('Nuvem: conta, cofre e segundo aparelho', () => {
  test('cadastro recusa senha fraca antes de falar com o servidor', async ({ browser }) => {
    const server = new MockSupabase();
    const { page } = await newDevice(browser, server);
    await page.getByRole('button', { name: /criar conta/i }).click();
    await page.getByLabel('Seu nome').fill('Dono');
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Senha', { exact: true }).fill('senha1234567');
    await page.getByLabel('Confirmar senha').fill('senha1234567');
    await page.getByRole('button', { name: /^criar conta$/i }).click();
    await expect(page.getByRole('alert')).toContainText(/muito comum/i);
    expect(server.users.size).toBe(0);
  });

  test('cria conta começando com um backup e abre os mesmos dados em outro aparelho', async ({ browser }, testInfo) => {
    const server = new MockSupabase();
    const backupPath = testInfo.outputPath('backup-local.json');
    const backup = {
      transactions: [{ id: 'e2e-1', date: '2026-09-01', description: 'Padaria E2E', amount: -12.5, type: 'debito', category: 'Alimentação' }],
      cards: [], cardPurchases: [], invoices: [], rules: [], exportDate: '2026-09-14T12:00:00.000Z',
    };
    await (await import('node:fs/promises')).writeFile(backupPath, JSON.stringify(backup));

    const a = await newDevice(browser, server);
    await createAccount(a.page, server, async page => {
      await page.getByRole('button', { name: /começar com um backup/i }).click();
      await page.getByLabel('Arquivo de backup').setInputFiles(backupPath);
      await page.getByRole('button', { name: /^restaurar$/i }).click();
    });
    await expect(a.page.getByRole('status').filter({ hasText: /sincronizado/i })).toBeVisible();

    // The server has only ciphertext; the browser storage has no plaintext nor the password.
    const row = [...server.vaults.values()][0];
    expect(row.ciphertext).not.toContain('Padaria');
    expect(server.users.get(EMAIL)!.password).not.toContain(PASSWORD);
    const storage = await a.page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(storage).not.toContain('Padaria');
    expect(storage).not.toContain(PASSWORD);

    const b = await newDevice(browser, server);
    await signIn(b.page, EMAIL, PASSWORD);
    await expect(b.page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
    await b.page.getByRole('button', { name: /transações/i }).first().click();
    await expect(b.page.getByText('Padaria E2E').first()).toBeVisible();
    expect(server.unexpected).toEqual([]);
  });

  test('senha errada não entra; sem internet abre pelo cache e mostra "Sem sincronizar"', async ({ browser }) => {
    const server = new MockSupabase();
    const a = await newDevice(browser, server);
    await createAccount(a.page, server, page => page.getByRole('button', { name: /começar vazio/i }).click());
    await a.page.getByTitle('Sair').click();

    await signIn(a.page, EMAIL, 'outra senha qualquer aqui');
    await expect(a.page.getByRole('alert')).toContainText(/e-mail ou senha incorretos/i);

    server.online = false;
    await a.page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await a.page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(a.page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
    // supabase-js retries failed reads (1 s, 2 s, 4 s) before giving up.
    await expect(a.page.getByRole('status').filter({ hasText: /sem sincronizar/i })).toBeVisible({ timeout: 25_000 });
  });
});
