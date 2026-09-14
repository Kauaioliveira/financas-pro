import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Reads the 12 words on screen and types the 3 the app asks for. */
async function confirmKitWords(page: Page, submitName: RegExp) {
  const words = await page.locator('[data-kit-word]').allInnerTexts();
  expect(words).toHaveLength(12);

  await page.getByRole('button', { name: /confirmar palavras/i }).click();

  const inputs = page.getByRole('textbox', { name: /palavra nº/i });
  await expect(inputs).toHaveCount(3);
  for (const input of await inputs.all()) {
    const position = Number(await input.getAttribute('data-position'));
    await input.fill(words[position - 1]);
  }
  await page.getByRole('button', { name: submitName }).click();
}

async function register(page: Page, name: string, password: string) {
  await page.getByPlaceholder(/ex:/i).fill(name);
  await page.getByPlaceholder(/crie uma senha/i).fill(password);
  await page.getByPlaceholder(/repita a senha/i).fill(password);
  await page.getByRole('button', { name: /criar conta/i }).click();

  await expect(page.getByRole('heading', { name: /kit de recupera/i })).toBeVisible();
  await confirmKitWords(page, /confirmar e entrar/i);
  await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });
}

test.describe('Smoke — registro e login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('registrar novo usuario e chegar ao dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();
    await register(page, 'Teste Smoke', 'senha123');
  });

  test('cadastro recusa palavras erradas do kit', async ({ page }) => {
    await page.getByPlaceholder(/ex:/i).fill('Kit Errado');
    await page.getByPlaceholder(/crie uma senha/i).fill('senha123');
    await page.getByPlaceholder(/repita a senha/i).fill('senha123');
    await page.getByRole('button', { name: /criar conta/i }).click();

    await expect(page.getByRole('heading', { name: /kit de recupera/i })).toBeVisible();
    await page.getByRole('button', { name: /confirmar palavras/i }).click();
    for (const input of await page.getByRole('textbox', { name: /palavra nº/i }).all()) {
      await input.fill('errada');
    }
    await page.getByRole('button', { name: /confirmar e entrar/i }).click();

    await expect(page.getByRole('alert')).toContainText(/não confere/i);
    await expect(page.getByText(/central financeira/i)).toHaveCount(0);
  });

  test('login com conta existente', async ({ page }) => {
    await register(page, 'Login Test', 'senha456');

    // Sign out
    await page.getByTitle('Sair').click();
    await expect(page.getByRole('heading', { name: /finan.aspro/i })).toBeVisible();

    // Login
    await page.getByPlaceholder(/digite sua senha/i).fill('senha456');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Smoke — kit de recuperação', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await register(page, 'Kit Test', 'kitsenha1');
  });

  test('gerar kit novo em Configuracoes', async ({ page }) => {
    await page.getByTitle('Configurações').click();
    const oldKitText = await page.getByText(/kit atual: id/i).innerText();

    await page.getByRole('button', { name: /gerar kit novo/i }).click();
    await page.getByLabel(/senha da conta/i).fill('kitsenha1');
    await page.getByRole('button', { name: /^continuar$/i }).click();

    await confirmKitWords(page, /ativar kit novo/i);

    await expect(page.getByRole('status').filter({ hasText: /kit novo ativado/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/kit atual: id/i)).not.toHaveText(oldKitText);
  });
});

test.describe('Smoke — backup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await register(page, 'Backup Test', 'backup99');
  });

  test('abrir modal de configuracoes e ver secao de backup', async ({ page }) => {
    await page.getByTitle('Configurações').click();
    await expect(page.getByText(/backup cifrado/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /exportar backup/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /restaurar backup/i })).toBeVisible();
  });

  test('iniciar fluxo de exportacao e preencher senha', async ({ page }) => {
    await page.getByTitle('Configurações').click();
    await page.getByRole('button', { name: /exportar backup/i }).click();

    await expect(page.getByPlaceholder(/senha do backup/i)).toBeVisible();
    await page.getByPlaceholder(/senha do backup/i).fill('test1234');
    await page.getByPlaceholder(/confirmar senha/i).fill('test1234');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^exportar$/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.financas\.enc$/);
  });
});
