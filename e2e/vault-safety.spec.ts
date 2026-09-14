import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function registerAndEnter(page: Page, name: string, password: string): Promise<string[]> {
  await page.getByPlaceholder(/ex:/i).fill(name);
  await page.getByPlaceholder(/crie uma senha/i).fill(password);
  await page.getByPlaceholder(/repita a senha/i).fill(password);
  await page.getByRole('button', { name: /criar conta/i }).click();

  await expect(page.locator('[data-kit-word]')).toHaveCount(12, { timeout: 10_000 });
  const words = await page.locator('[data-kit-word]').allInnerTexts();
  await page.getByRole('button', { name: /confirmar palavras/i }).click();
  for (const input of await page.getByRole('textbox', { name: /palavra nº/i }).all()) {
    const position = Number(await input.getAttribute('data-position'));
    await input.fill(words[position - 1]);
  }
  await page.getByRole('button', { name: /confirmar e entrar/i }).click();
  await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 10_000 });
  return words;
}

const CORRUPT = JSON.stringify({
  v: 1, alg: 'AES-GCM', kdf: 'PBKDF2', iv: 'AAAAAAAAAAAAAAAA', salt: '', iterations: 0,
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
});

/** Replaces the stored vault with one that does not decrypt; returns its storage key. */
async function corruptVault(page: Page): Promise<string> {
  return page.evaluate(value => {
    const key = Object.keys(localStorage).find(k => k.endsWith('_vault'))!;
    localStorage.setItem(key, value);
    return key;
  }, CORRUPT);
}

test.describe('Cofre que não abre', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('mostra a tela de erro e nunca grava por cima', async ({ page }) => {
    await registerAndEnter(page, 'Cofre Teste', 'cofre123');
    await page.getByTitle('Sair').click();

    const vaultKey = await corruptVault(page);
    const corrupt = CORRUPT;

    await page.getByPlaceholder(/digite sua senha/i).fill('cofre123');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(
      page.getByRole('heading', { name: /não foi possível abrir seus dados neste aparelho\. nada foi apagado\./i }),
    ).toBeVisible({ timeout: 10_000 });

    // Longer than the save debounce: nothing may be written over the vault.
    await page.waitForTimeout(1_500);
    expect(await page.evaluate(key => localStorage.getItem(key), vaultKey)).toBe(corrupt);

    await page.getByRole('button', { name: /tentar de novo/i }).click();
    await expect(page.getByRole('heading', { name: /nada foi apagado/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /restaurar backup/i })).toBeVisible();

    await page.getByRole('button', { name: /sair da conta/i }).click();
    await expect(page.getByPlaceholder(/digite sua senha/i)).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), vaultKey)).toBe(corrupt);
  });

  test('restaurar backup guarda uma cópia dos dados que não abrem antes de substituir', async ({ page }, testInfo) => {
    const words = await registerAndEnter(page, 'Restaurar Teste', 'restaura1');

    await page.getByTitle('Configurações').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /exportar backup/i }).click(),
    ]);
    const backupPath = testInfo.outputPath('backup.financas.enc');
    await download.saveAs(backupPath);
    await page.keyboard.press('Escape');
    await page.getByTitle('Sair').click();

    const vaultKey = await corruptVault(page);
    await page.getByPlaceholder(/digite sua senha/i).fill('restaura1');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByRole('heading', { name: /nada foi apagado/i })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /restaurar backup/i }).click();
    await page.getByLabel('Arquivo de backup').setInputFiles(backupPath);
    await page.getByLabel(/palavras do kit/i).fill(words.join(' '));
    await page.getByRole('button', { name: /^restaurar$/i }).click();

    await expect(page.getByText(/central financeira/i)).toBeVisible({ timeout: 15_000 });
    const storage = await page.evaluate(key => {
      const copies = Object.keys(localStorage).filter(k => k.startsWith(`${key}_unreadable_`));
      return { copies: copies.map(k => localStorage.getItem(k)), vault: localStorage.getItem(key) };
    }, vaultKey);
    expect(storage.copies).toEqual([CORRUPT]);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), vaultKey)).not.toBe(CORRUPT);
  });
});
