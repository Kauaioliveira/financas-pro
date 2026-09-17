import { useEffect, useId, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquare, X } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_MAX_LENGTH,
  prepareFeedback,
} from '../../lib/cloud/feedback';
import type { FeedbackKind } from '../../lib/cloud/feedback';
import { CTA_GRADIENT, FOCUS_RING } from './CloudUi';
import { errorText } from './errorText';

/**
 * "Dar opinião" of the beta (docs §7). Sends the text the person wrote, the screen
 * they were on and the build of the app — never anything from the vault.
 */
export default function FeedbackDialog({ screen, onClose }: { screen: string; onClose: () => void }) {
  const { provider } = useAuth();
  const titleId = useId();
  const kindId = useId();
  const messageId = useId();
  const counterId = useId();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const appVersion = __FINANCASPRO_VERSION__;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const left = FEEDBACK_MAX_LENGTH - message.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const prepared = prepareFeedback({ kind, message, screen, appVersion });
    if ('error' in prepared) {
      setError(prepared.error);
      return;
    }
    if (!provider.sendFeedback) {
      setError('Enviar opinião só funciona no modo nuvem.');
      return;
    }
    setBusy(true);
    try {
      await provider.sendFeedback(prepared.feedback);
      setMessage('');
      setSent(true);
    } catch (err) {
      setError(errorText(err, 'Não foi possível enviar sua opinião. Tente de novo em instantes.'));
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
        className="dark-surface animate-scale-in relative max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-[24px] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-300 ring-1 ring-inset ring-cyan-400/18">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 id={titleId} className="font-display text-xl font-semibold text-white">
              Dar opinião sobre o beta
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Conte o que deu errado ou o que faltou. Isso vai direto para quem cuida do app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Fechar"
            aria-label="Fechar"
            className={`shell-icon-button h-10 w-10 rounded-xl disabled:opacity-50 ${FOCUS_RING}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {sent ? (
          <div className="mt-6">
            <p role="status" className="flex items-start gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              Recebemos sua opinião. Obrigado por testar.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSent(false)}
                className={`rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
              >
                Mandar outra
              </button>
              <button
                type="button"
                onClick={onClose}
                autoFocus
                className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] ${FOCUS_RING}`}
                style={{ background: CTA_GRADIENT }}
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-5">
            <label htmlFor={kindId} className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Tipo
            </label>
            <select
              id={kindId}
              value={kind}
              onChange={e => { setKind(e.target.value as FeedbackKind); setError(''); }}
              disabled={busy}
              className={`mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 disabled:opacity-60 ${FOCUS_RING}`}
            >
              {FEEDBACK_KINDS.map(option => (
                <option key={option} value={option} className="bg-slate-900">
                  {FEEDBACK_KIND_LABELS[option]}
                </option>
              ))}
            </select>

            <label htmlFor={messageId} className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400">
              Sua opinião
            </label>
            <textarea
              id={messageId}
              value={message}
              onChange={e => { setMessage(e.target.value.slice(0, FEEDBACK_MAX_LENGTH)); setError(''); }}
              rows={6}
              autoFocus
              disabled={busy}
              maxLength={FEEDBACK_MAX_LENGTH}
              aria-describedby={counterId}
              placeholder="Ex.: ao importar o extrato do meu banco, a tela ficou parada em “Lendo arquivo”."
              className={`mt-2 w-full resize-y rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 disabled:opacity-60 ${FOCUS_RING}`}
            />
            <p id={counterId} className="mt-1.5 text-xs text-slate-400">
              {left === 0 ? 'Limite atingido: 2.000 caracteres.' : `${left} caracteres restantes de ${FEEDBACK_MAX_LENGTH}.`}
            </p>

            <div className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
              <strong className="font-semibold">Não cole valores, nomes de estabelecimentos nem dados bancários.</strong>{' '}
              Nada do seu dinheiro é enviado: vão só o texto acima, o nome da tela (<em>{screen}</em>) e a versão do app
              ({appVersion}). Suas transações continuam cifradas neste aparelho.
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200">
                {error}
              </p>
            )}
            <p role="status" className="sr-only">{busy ? 'Enviando sua opinião...' : ''}</p>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className={`rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] disabled:opacity-50 ${FOCUS_RING}`}
                style={{ background: CTA_GRADIENT }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? 'Enviando...' : 'Enviar opinião'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
