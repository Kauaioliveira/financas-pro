import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { MockSupabase } from './mockSupabase';

const EMAIL = 'dono@exemplo.com';
const PASSWORD = 'girafa azul come pastel';

async function newPage(browser: Browser, server: MockSupabase): Promise<Page> {
  const context = await browser.newContext();
  await server.install(context);
  const page = await context.newPage();
  await page.goto('/');
  return page;
}

/** Account with an empty vault, already inside the app. */
async function createAccount(page: Page, server: MockSupabase) {
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

test.describe('Nuvem: opinião dos testadores', () => {
  test('envia a opinião com a tela e a versão, sem nada do cofre', async ({ browser }) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    await createAccount(page, server);

    await page.getByTitle('Dar opinião sobre o beta').click();
    const dialog = page.getByRole('dialog', { name: /dar opinião sobre o beta/i });
    await expect(dialog.getByText(/não cole valores, nomes de estabelecimentos nem dados bancários/i)).toBeVisible();

    await dialog.getByLabel('Tipo').selectOption('ideia');
    await dialog.getByLabel('Sua opinião').fill('Seria bom ter um gráfico por categoria.');
    await expect(dialog.getByText(/caracteres restantes de 2000/i)).toBeVisible();
    await dialog.getByRole('button', { name: /enviar opinião/i }).click();

    await expect(dialog.getByText(/recebemos sua opinião/i)).toBeVisible({ timeout: 15_000 });
    expect(server.feedback).toHaveLength(1);
    expect(server.feedback[0]).toMatchObject({
      kind: 'ideia',
      message: 'Seria bom ter um gráfico por categoria.',
      screen: 'Dashboard',
    });
    expect(server.feedback[0].app_version).toMatch(/^\d+\.\d+\.\d+\+\d{4}-\d{2}-\d{2}$/);

    // Sending another one starts from an empty form.
    await dialog.getByRole('button', { name: /mandar outra/i }).click();
    await expect(dialog.getByLabel('Sua opinião')).toHaveValue('');
    await dialog.getByRole('button', { name: /cancelar/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('erro do servidor: explica e mantém o texto para tentar de novo', async ({ browser }) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    await createAccount(page, server);

    server.feedbackError = { status: 429, body: { code: 'over_request_rate_limit', message: 'rate limit' } };
    await page.getByTitle('Dar opinião sobre o beta').click();
    const dialog = page.getByRole('dialog', { name: /dar opinião sobre o beta/i });
    await dialog.getByLabel('Sua opinião').fill('A tela de importação travou.');
    await dialog.getByRole('button', { name: /enviar opinião/i }).click();

    await expect(dialog.getByRole('alert')).toHaveText(/muitas tentativas em pouco tempo/i, { timeout: 15_000 });
    await expect(dialog.getByLabel('Sua opinião')).toHaveValue('A tela de importação travou.');
    expect(server.feedback).toHaveLength(0);

    await dialog.getByRole('button', { name: /enviar opinião/i }).click();
    await expect(dialog.getByText(/recebemos sua opinião/i)).toBeVisible({ timeout: 15_000 });
    expect(server.feedback).toHaveLength(1);
  });
});
