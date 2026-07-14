import { test, expect } from '@playwright/test';

test.describe('Smoke — registro e login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('registrar novo usuario e chegar ao dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();

    await page.getByPlaceholder(/ex:/i).fill('Teste Smoke');
    await page.getByPlaceholder(/crie uma senha/i).fill('senha123');
    await page.getByPlaceholder(/repita a senha/i).fill('senha123');
    await page.getByRole('button', { name: /criar conta/i }).click();

    await expect(page.getByRole('heading', { name: /frase de recupera/i })).toBeVisible();

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /entendi/i }).click();

    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });
  });

  test('login com conta existente', async ({ page }) => {
    // Register first
    await page.getByPlaceholder(/ex:/i).fill('Login Test');
    await page.getByPlaceholder(/crie uma senha/i).fill('senha456');
    await page.getByPlaceholder(/repita a senha/i).fill('senha456');
    await page.getByRole('button', { name: /criar conta/i }).click();

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /entendi/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });

    // Sign out
    await page.getByTitle('Sair').click();
    await expect(page.getByRole('heading', { name: /finan.aspro/i })).toBeVisible();

    // Login
    await page.getByPlaceholder(/digite sua senha/i).fill('senha456');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Smoke — backup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Quick registration
    await page.getByPlaceholder(/ex:/i).fill('Backup Test');
    await page.getByPlaceholder(/crie uma senha/i).fill('backup99');
    await page.getByPlaceholder(/repita a senha/i).fill('backup99');
    await page.getByRole('button', { name: /criar conta/i }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /entendi/i }).click();
    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });
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
