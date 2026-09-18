import { test, expect } from '@playwright/test';
import { MockSupabase } from './mockSupabase';

/**
 * O que o service worker faz (e não faz) num build de nuvem. O único arquivo da suíte que
 * deixa o worker ligado: os outros o bloqueiam pelo playwright.cloud.config.ts.
 */
test.use({ serviceWorkers: 'allow' });

/** Caminho completo de tudo o que está guardado no cache do navegador. */
async function cachedUrls(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
}

test.describe('PWA no modo nuvem', () => {
  test('nada do Supabase entra no cache do worker', async ({ context, page }) => {
    const server = new MockSupabase();
    await server.install(context);

    await page.goto('/');
    await expect(page.getByRole('button', { name: /criar conta/i })).toBeVisible();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });

    // Uma tentativa de login que falha já é uma ida real ao /auth/v1 do Supabase.
    const call = page.waitForResponse(response => response.url().includes('/auth/v1/token'));
    await page.getByLabel('E-mail', { exact: true }).fill('ninguem@exemplo.com');
    await page.getByLabel('Senha', { exact: true }).fill('senha que nao existe');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await call;

    const urls = await cachedUrls(page);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(url => new URL(url).origin !== new URL(page.url()).origin)).toEqual([]);
    expect(urls.filter(url => /\/auth\/v1\/|\/rest\/v1\//.test(url))).toEqual([]);
  });

  test('sem internet o app abre pelo cache em vez da tela de erro do navegador', async ({ context, page }) => {
    const server = new MockSupabase();
    await server.install(context);

    await page.goto('/');
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: /criar conta/i })).toBeVisible();
    await context.setOffline(false);
  });
});
