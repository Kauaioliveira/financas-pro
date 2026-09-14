import { useEffect, useId, useState } from 'react';
import { AlertTriangle, CloudDownload, CloudUpload, Loader2 } from 'lucide-react';

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';
const OPTION_BUTTON = `flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`;

/**
 * Explicit choice after a version conflict. Nothing is overwritten until the user
 * picks; overwriting the cloud asks for a second confirmation.
 */
export function SyncConflictDialog({
  message,
  onResolve,
  onClose,
}: {
  message: string | null;
  onResolve: (choice: 'use-remote' | 'keep-local') => Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const [step, setStep] = useState<'choose' | 'confirm-overwrite'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  async function resolve(choice: 'use-remote' | 'keep-local') {
    setBusy(true);
    setError('');
    try {
      await onResolve(choice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dark-surface animate-scale-in relative w-full max-w-lg rounded-[24px] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-400/18">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-white">
              {step === 'choose' ? 'Dados alterados em dois aparelhos' : 'Sobrescrever a nuvem?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {step === 'choose'
                ? message ?? 'Os dados foram alterados em outro aparelho enquanto havia alterações não enviadas neste.'
                : 'A versão que está na nuvem, feita em outro aparelho, será substituída pela deste aparelho. Os outros aparelhos passam a ver esta versão.'}
            </p>
          </div>
        </div>

        {step === 'choose' ? (
          <div className="mt-5 space-y-3">
            <button type="button" onClick={() => resolve('use-remote')} disabled={busy} className={OPTION_BUTTON} autoFocus>
              <CloudDownload className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-white">Carregar a versão de outro aparelho</span>
                <span className="block text-xs text-slate-400">
                  As alterações feitas aqui desde o último envio serão descartadas.
                </span>
              </span>
            </button>
            <button type="button" onClick={() => setStep('confirm-overwrite')} disabled={busy} className={OPTION_BUTTON}>
              <CloudUpload className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-white">Manter as deste aparelho e sobrescrever a nuvem</span>
                <span className="block text-xs text-slate-400">Pede confirmação antes de enviar.</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setStep('choose')}
              disabled={busy}
              className={`rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}
              autoFocus
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => resolve('keep-local')}
              disabled={busy}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50 ${FOCUS_RING}`}
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Sim, sobrescrever a nuvem
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200">
            {error}
          </p>
        )}
        <p role="status" className="sr-only">{busy ? 'Aplicando a sua escolha...' : ''}</p>

        {step === 'choose' && (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`mt-4 w-full rounded-xl py-2 text-sm text-slate-400 transition hover:text-cyan-200 disabled:opacity-50 ${FOCUS_RING}`}
          >
            Decidir depois (este aparelho fica sem sincronizar)
          </button>
        )}
      </div>
    </div>
  );
}
