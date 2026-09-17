import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { MockSupabase } from './mockSupabase';

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';
const NEW_PASSWORD = 'pastel de vento na feira';

async function newPage(browser: Browser, server: MockSupabase): Promise<Page> {
  const context = await browser.newContext();
  await server.install(context);
  const page = await context.newPage();
  await page.goto('/');
  return page;
}

async function signIn(page: Page, password: string) {
  await page.getByLabel('E-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();
}

/** Account whose vault starts from a backup with one transaction. Returns the kit words. */
async function createAccount(page: Page, server: MockSupabase, backupPath: string): Promise<string[]> {
  await writeFile(backupPath, JSON.stringify({
    transactions: [{ id: 'e2e-1', date: '2026-09-01', description: 'Padaria E2E', amount: -12.5, type: 'debito', category: 'Alimentação' }],
    cards: [], cardPurchases: [], invoices: [], rules: [], exportDate: '2026-09-14T12:00:00.000Z',
  }));
  await page.getByRole('button', { name: /criar conta/i }).click();
  await page.getByLabel('Seu nome').fill('Dono');
  await page.getByLabel('E-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByRole('checkbox', { name: /li e aceito os termos do beta/i }).check();
  await page.getByRole('checkbox', { name: /transferência internacional/i }).check();
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
  await page.getByRole('button', { name: /começar com um backup/i }).click();
  await page.getByLabel('Arquivo de backup').setInputFiles(backupPath);
  await page.getByRole('button', { name: /^restaurar$/i }).click();
  await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
  await page.getByTitle('Sair').click();
  return words;
}

/** "Esqueci a senha" in this browser, then open the e-mail link and set the new password. */
async function forgotAndReset(page: Page, server: MockSupabase) {
  await page.getByRole('button', { name: /esqueci a senha/i }).click();
  await page.getByLabel('E-mail da conta').fill(EMAIL);
  await page.getByRole('button', { name: /enviar link/i }).click();
  await expect(page.getByRole('status').filter({ hasText: /se houver uma conta com este e-mail/i })).toBeVisible();

  const request = server.resetRequests.at(-1)!;
  expect(request.email).toBe(EMAIL);
  expect(request.challenge).toBeTruthy(); // PKCE: a code challenge, never a token in the link

  await page.goto(request.link);
  await expect(page.getByRole('heading', { name: /nova senha/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('note')).toHaveText(
    'Isto devolve o acesso à sua conta. Para voltar a ver seus dados você vai precisar do kit de recuperação. A FinançasPro não consegue abrir seus dados sem ele.',
  );
  expect(page.url()).not.toContain('code=');

  const pwWrapBefore = JSON.stringify([...server.vaults.values()][0].pw_wrap);
  await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirmar nova senha').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /salvar nova senha/i }).click();
  await expect(page.getByRole('heading', { name: /abrir dados com o kit/i })).toBeVisible({ timeout: 20_000 });
  expect(JSON.stringify([...server.vaults.values()][0].pw_wrap)).toBe(pwWrapBefore); // untouched before the kit
  return pwWrapBefore;
}

test.describe('Nuvem: esqueci a senha e abrir dados com o kit', () => {
  test('pede o link, cria senha nova, abre com o kit e entra em outro aparelho', async ({ browser }, testInfo) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    const words = await createAccount(page, server, testInfo.outputPath('backup.json'));

    // Same message for an e-mail that does not exist.
    await page.getByRole('button', { name: /esqueci a senha/i }).click();
    await page.getByLabel('E-mail da conta').fill('ninguem@exemplo.com');
    await page.getByRole('button', { name: /enviar link/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /se houver uma conta com este e-mail/i })).toBeVisible();
    await page.getByRole('button', { name: /voltar ao login/i }).click();

    const pwWrapBefore = await forgotAndReset(page, server);

    await page.getByLabel(/as 12 palavras do kit/i).fill(words.join(' '));
    await page.getByRole('button', { name: /abrir meus dados/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 30_000 });
    expect(JSON.stringify([...server.vaults.values()][0].pw_wrap)).not.toBe(pwWrapBefore);

    const other = await newPage(browser, server);
    await signIn(other, NEW_PASSWORD);
    await expect(other.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
    await other.getByRole('button', { name: /transações/i }).first().click();
    await expect(other.getByText('Padaria E2E').first()).toBeVisible();
    expect(server.unexpected).toEqual([]);
  });

  test('kit errado não abre; "lembrei a senha antiga" abre sem o kit', async ({ browser }, testInfo) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    const words = await createAccount(page, server, testInfo.outputPath('backup.json'));
    await forgotAndReset(page, server);

    await page.getByLabel(/as 12 palavras do kit/i).fill([...words].reverse().join(' '));
    await page.getByRole('button', { name: /abrir meus dados/i }).click();
    await expect(page.getByRole('alert')).toContainText(/kit de recuperação incorreto/i, { timeout: 30_000 });

    await page.getByRole('button', { name: /lembrei a senha antiga/i }).click();
    await page.getByLabel('Senha antiga').fill(PASSWORD);
    await page.getByRole('button', { name: /abrir com a senha antiga/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 30_000 });
  });

  test('"começar do zero" exige confirmação dupla e cria um kit novo', async ({ browser }, testInfo) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    const oldWords = await createAccount(page, server, testInfo.outputPath('backup.json'));
    await forgotAndReset(page, server);

    await page.getByRole('button', { name: /^começar do zero$/i }).click();
    await expect(page.getByRole('alert')).toContainText('Os dados antigos continuarão cifrados e ninguém conseguirá abri-los');
    await page.getByRole('button', { name: /quero começar do zero/i }).click();
    const confirm = page.getByRole('button', { name: /^começar do zero$/i });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/entendo que os dados antigos/i).check();
    await confirm.click();

    await expect(page.locator('[data-kit-word]')).toHaveCount(12, { timeout: 20_000 });
    const newWords = await page.locator('[data-kit-word]').allInnerTexts();
    expect(newWords).not.toEqual(oldWords);
    await page.getByRole('button', { name: /já guardei, confirmar palavras/i }).click();
    for (const input of await page.getByRole('textbox', { name: /palavra nº/i }).all()) {
      await input.fill(newWords[Number(await input.getAttribute('data-position')) - 1]);
    }
    await page.getByRole('button', { name: /confirmar e começar do zero/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /transações/i }).first().click();
    await expect(page.getByText('Padaria E2E')).toHaveCount(0);
  });
});
