import { test, expect } from '@playwright/test';

/**
 * Instalação e uso sem internet, num navegador de verdade. É o único arquivo que deixa o
 * service worker ligado (os outros o bloqueiam pelo playwright.config.ts, senão serviriam
 * arquivos velhos para os testes).
 */
test.use({ serviceWorkers: 'allow' });

/** Espera o worker instalar e assumir o controle da página. */
async function waitForController(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20_000 });
}

test.describe('PWA — instalável e offline', () => {
  test('a página declara manifesto, tema e ícone para a tela inicial', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#040814');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'FinançasPro');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /icons\/apple-touch-icon/);
  });

  test('o manifesto tem o que o Chrome exige para oferecer a instalação', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as {
      name: string;
      short_name: string;
      display: string;
      lang: string;
      start_url: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };

    expect(manifest.name).toBe('FinançasPro');
    expect(manifest.short_name).toBe('FinançasPro');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.start_url).toBe('/');

    const sizes = manifest.icons.map(icon => `${icon.sizes} ${icon.purpose}`);
    expect(sizes).toContain('192x192 any');
    expect(sizes).toContain('512x512 any');
    expect(sizes).toContain('512x512 maskable');

    for (const icon of manifest.icons) {
      const image = await request.get(icon.src);
      expect(image.status(), `ícone ${icon.src}`).toBe(200);
    }
  });

  test('registra o service worker e abre sem internet', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();
    await waitForController(page);

    await context.setOffline(true);
    await page.reload();

    // Sem rede, a casca e os arquivos do build vêm do cache do worker.
    await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();
    await context.setOffline(false);
  });

  test('o cache do worker só tem arquivos do build', async ({ page }) => {
    await page.goto('/');
    await waitForController(page);

    const keys = await page.evaluate(async () => {
      const names = await caches.keys();
      const all: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) all.push(new URL(request.url).pathname);
      }
      return all;
    });

    expect(keys.length).toBeGreaterThan(0);
    for (const path of keys) {
      expect(path, `não deveria estar em cache: ${path}`).toMatch(
        /^\/(index\.html|manifest\.webmanifest|assets\/|icons\/)/,
      );
    }
  });
});
