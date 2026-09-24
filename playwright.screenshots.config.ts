import { defineConfig } from '@playwright/test';

// Gerador das capturas do README (docs/screenshots), em e2e-screenshots/.
// Fora da CI e fora do `npm run test:e2e`: roda sozinho com `npm run screenshots`.
// Sem variáveis do Supabase, então o app sobe em modo local, como no build publicado.
export default defineConfig({
  testDir: './e2e-screenshots',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4175',
    headless: true,
    // Desktop, mesmo tamanho para todas as imagens.
    viewport: { width: 1440, height: 1024 },
    deviceScaleFactor: 1,
    // O app segue o prefers-color-scheme do sistema e o tema escuro é o do README.
    // Sem isto o Chromium do Playwright pede tema claro e as capturas saem misturadas.
    colorScheme: 'dark',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // O service worker guardaria arquivos antigos e a captura mostraria o app de ontem.
    serviceWorkers: 'block',
  },
  webServer: {
    // Build próprio: as capturas têm que sair do app como ele está agora.
    command: 'npm run build && npx vite preview --port 4175 --strictPort',
    port: 4175,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
