/**
 * Registro do service worker (dist/sw.js, gerado pelo build).
 *
 * Só roda em produção: em `npm run dev` e nos testes o worker ficaria na frente do
 * servidor e serviria arquivos velhos. Ele também não assume sozinho uma versão nova —
 * quem decide é a pessoa, pelo aviso de "nova versão" (src/pwa/UpdateBanner.tsx).
 */

const SW_URL = '/sw.js';

/** Intervalo mínimo entre duas checagens de versão quando a aba volta ao foco. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registra o worker e avisa quando há uma versão nova esperando.
 *
 * @param onUpdateReady chamado com a função que aplica a atualização (ela recarrega a página).
 * @returns função que desfaz os ouvintes criados aqui.
 */
export function registerServiceWorker(onUpdateReady: (applyUpdate: () => void) => void): () => void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  let disposed = false;
  let reloading = false;
  let lastCheck = Date.now();

  const applyUpdateWith = (worker: ServiceWorker) => () => {
    // A troca de controlador só acontece depois que o worker novo faz skipWaiting().
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  const onControllerChange = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  let registration: ServiceWorkerRegistration | null = null;

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || !registration) return;
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    // Um app instalado pode ficar aberto por dias; sem isto ele só veria a versão nova
    // no próximo carregamento completo da página.
    void registration.update().catch(() => {});
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  void navigator.serviceWorker
    .register(SW_URL)
    .then(reg => {
      if (disposed) return;
      registration = reg;

      // Já havia uma versão nova esperando de uma visita anterior.
      if (reg.waiting && navigator.serviceWorker.controller) {
        onUpdateReady(applyUpdateWith(reg.waiting));
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // Sem controlador é a primeira instalação: não há versão velha para trocar.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdateReady(applyUpdateWith(installing));
          }
        });
      });
    })
    .catch((error: unknown) => {
      // Sem worker o app continua funcionando online; só não abre sem internet.
      console.warn('FinançasPro: não foi possível registrar o service worker.', error);
    });

  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
