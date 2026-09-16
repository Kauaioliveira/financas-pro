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

/** Fills the sign-up form, without ticking the consent boxes. */
async function fillSignUp(page: Page) {
  await page.getByRole('button', { name: /criar conta/i }).click();
  await page.getByLabel('Seu nome').fill('Dono');
  await page.getByLabel('E-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
}

test.describe('Beta: privacidade, termos e consentimento', () => {
  test('o cadastro só acontece com as duas caixas marcadas', async ({ browser }) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    await fillSignUp(page);

    const terms = page.getByRole('checkbox', { name: /li e aceito os termos do beta/i });
    const transfer = page.getByRole('checkbox', { name: /transferência internacional/i });
    const submit = page.getByRole('button', { name: /^criar conta$/i });

    await expect(terms).not.toBeChecked();
    await expect(transfer).not.toBeChecked();
    await expect(submit).toBeDisabled();

    await terms.check();
    await expect(submit).toBeDisabled(); // one is not enough
    await transfer.check();
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByRole('heading', { name: /confirme seu e-mail/i })).toBeVisible({ timeout: 20_000 });

    // The acceptance is recorded with the account, with date and version of the text.
    const metadata = [...server.users.values()][0];
    expect(metadata.metadata.consent_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(String(metadata.metadata.consent_terms_at))).not.toBeNaN();
    expect(metadata.metadata.consent_intl_transfer_at).toBe(metadata.metadata.consent_terms_at);
  });

  test('as duas páginas abrem do cadastro e do rodapé do login, e voltam', async ({ browser }) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);

    // From the login footer.
    await page.getByRole('link', { name: /política de privacidade/i }).click();
    await expect(page).toHaveURL(/#\/privacidade$/);
    const policy = page.getByRole('article', { name: /política de privacidade/i });
    await expect(policy.getByRole('heading', { name: /transferência internacional/i })).toBeVisible();
    await expect(policy.getByText(/são paulo/i)).toBeVisible();
    await expect(policy.getByText(/anpd/i)).toBeVisible();
    // The pending markers are announced, not hidden.
    await expect(policy.getByRole('alert')).toContainText(/precisa preencher/i);

    // From one page to the other, then back to the app.
    await policy.getByRole('link', { name: /termos do beta/i }).click();
    const terms = page.getByRole('article', { name: /termos do beta/i });
    await expect(terms.getByRole('heading', { name: /sem garantia/i })).toBeVisible();
    await terms.getByRole('button', { name: /voltar ao app/i }).click();
    await expect(page.getByRole('heading', { name: /^entrar$/i })).toBeVisible();
    expect(page.url()).not.toContain('#');

    // From the sign-up form, and back to the filled form.
    await fillSignUp(page);
    await page.getByRole('link', { name: /^termos do beta$/i }).click();
    await expect(page.getByRole('article', { name: /termos do beta/i })).toBeVisible();
    await page.getByRole('button', { name: /^voltar$/i }).click();
    await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue(EMAIL);
  });

  test('as duas páginas também são acessíveis em Configurações, já dentro do app', async ({ browser }) => {
    const server = new MockSupabase();
    const page = await newPage(browser, server);
    await fillSignUp(page);
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
    await page.getByRole('button', { name: /começar vazio/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 20_000 });

    await page.getByTitle('Configurações').click();
    await page.getByRole('link', { name: /^política de privacidade$/i }).click();
    await expect(page.getByRole('article', { name: /política de privacidade/i })).toBeVisible();
    await page.getByRole('button', { name: /voltar ao app/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible();
  });

  test('um link direto para a política abre a página', async ({ browser }) => {
    const server = new MockSupabase();
    const context = await browser.newContext();
    await server.install(context);
    const page = await context.newPage();

    await page.goto('/#/privacidade'); // as if the address had been sent in a message

    await expect(page.getByRole('article', { name: /política de privacidade/i })).toBeVisible({ timeout: 20_000 });
  });
});
