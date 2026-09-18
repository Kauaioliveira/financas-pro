import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { registerServiceWorker } from './registerServiceWorker';

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

/**
 * Aviso de versão nova. A atualização não é aplicada sozinha: recarregar a página no meio
 * de uma importação ou de um formulário perderia o que a pessoa estava fazendo. Quem
 * dispensa o aviso volta a vê-lo no próximo carregamento, então ninguém fica preso numa
 * versão antiga em cache.
 */
export function UpdateBanner() {
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    // setState guarda a função em si, não a chama: daí o callback que a devolve.
    return registerServiceWorker(apply => setApplyUpdate(() => apply));
  }, []);

  if (!applyUpdate) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 print:hidden"
    >
      <div className="flex max-w-md flex-wrap items-center gap-3 rounded-2xl border border-cyan-300/20 bg-slate-950/95 px-4 py-3 text-sm text-slate-200 shadow-lg backdrop-blur">
        <RefreshCw className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
        <p className="flex-1">Nova versão do FinançasPro disponível.</p>
        <button
          type="button"
          onClick={applyUpdate}
          className={`rounded-xl bg-cyan-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 ${FOCUS_RING}`}
        >
          Atualizar agora
        </button>
        <button
          type="button"
          onClick={() => setApplyUpdate(null)}
          className={`rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
