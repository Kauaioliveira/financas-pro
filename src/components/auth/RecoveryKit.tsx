import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Copy, Printer, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import {
  findWrongConfirmationWords,
  pickConfirmationPositions,
  splitPhrase,
} from '../../lib/crypto';

const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

function formatKitDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('pt-BR');
}

/**
 * Shows the 12 words on screen and mounts a print-only copy in <body>.
 * The phrase lives only in props: it is never written to the URL, storage or logs.
 */
export function RecoveryKitSheet({
  accountName,
  phrase,
  kitId,
  createdAt,
  variant = 'local',
}: {
  accountName: string;
  phrase: string;
  kitId: string;
  createdAt: string;
  /** Cloud accounts recover through the e-mail link; local accounts on this computer. */
  variant?: 'local' | 'cloud';
}) {
  const words = splitPhrase(phrase);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const date = formatKitDate(createdAt);

  function handleCopy() {
    if (!navigator.clipboard) {
      setCopyState('failed');
      return;
    }
    navigator.clipboard.writeText(phrase).then(
      () => {
        setCopyState('copied');
        setTimeout(() => setCopyState('idle'), 2000);
      },
      () => setCopyState('failed'),
    );
  }

  return (
    <div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <dt className="text-slate-400">Conta</dt>
          <dd className="mt-0.5 truncate font-semibold text-slate-100">{accountName}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <dt className="text-slate-400">Criado em</dt>
          <dd className="mt-0.5 font-semibold text-slate-100">{date}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <dt className="text-slate-400">Id do kit</dt>
          <dd className="mt-0.5 font-mono font-semibold text-slate-100">{kitId}</dd>
        </div>
      </dl>

      <ol
        aria-label="Palavras do kit de recuperação"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {words.map((word, index) => (
          <li
            key={index}
            className="flex items-baseline gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2"
          >
            <span className="w-5 flex-shrink-0 text-right text-xs tabular-nums text-slate-400">
              {index + 1}
            </span>
            <span data-kit-word className="font-mono text-sm text-amber-100">
              {word}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
        >
          {copyState === 'copied' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copyState === 'copied' ? 'Copiada!' : 'Copiar frase'}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimir kit
        </button>
      </div>
      <p role="status" className="mt-2 min-h-[1.25rem] text-xs text-slate-400">
        {copyState === 'failed'
          ? 'Não foi possível copiar. Anote as palavras à mão ou imprima o kit.'
          : ''}
      </p>

      {createPortal(
        <div className="kit-print-sheet" aria-hidden="true">
          <h1>FinançasPro — Kit de recuperação</h1>
          <table>
            <tbody>
              <tr>
                <th>Conta</th>
                <td>{accountName}</td>
              </tr>
              <tr>
                <th>Criado em</th>
                <td>{date}</td>
              </tr>
              <tr>
                <th>Id do kit</th>
                <td className="kit-print-mono">{kitId}</td>
              </tr>
            </tbody>
          </table>
          <ol>
            {words.map((word, index) => (
              <li key={index}>
                <span className="kit-print-index">{index + 1}.</span>
                <span className="kit-print-mono">{word}</span>
              </li>
            ))}
          </ol>
          <h2>Como usar</h2>
          <ul>
            <li>
              {variant === 'cloud'
                ? 'Se esquecer a senha, use “Esqueci a senha” no FinançasPro, abra o link que chega por e-mail, crie uma senha nova e digite as 12 palavras na ordem.'
                : 'Se esquecer a senha, abra o FinançasPro neste computador, clique em “Esqueci minha senha” e digite as 12 palavras na ordem.'}
            </li>
            <li>
              Guarde este papel longe do computador. Não fotografe e não salve em nuvem, e-mail ou
              mensagens.
            </li>
            <li>
              As palavras também abrem os backups (.financas.enc) exportados enquanto este kit
              estava ativo.
            </li>
            <li>
              {variant === 'cloud'
                ? 'Quem tiver estas palavras e acesso à sua conta ou a um backup consegue ver seus dados.'
                : 'Quem tiver estas palavras e acesso ao seu computador ou a um backup consegue ver seus dados.'}
            </li>
            <li>
              Se você gerar um kit novo em Configurações, este kit (id {kitId}) deixa de abrir a
              conta.
            </li>
            <li>O FinançasPro não consegue recuperar seus dados sem a sua senha ou este kit.</li>
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Asks for 3 words at random positions before the kit is considered saved. */
export function KitWordConfirmation({
  phrase,
  onConfirmed,
  onBack,
  confirmLabel,
  busyLabel,
  busy = false,
}: {
  phrase: string;
  onConfirmed: () => void;
  onBack: () => void;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
}) {
  const baseId = useId();
  const [positions] = useState(() => pickConfirmationPositions(splitPhrase(phrase).length));
  const [answers, setAnswers] = useState<Record<number, string>>(() =>
    Object.fromEntries(positions.map(position => [position, ''])),
  );
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (positions.some(position => !answers[position]?.trim())) {
      setError('Preencha as 3 palavras.');
      return;
    }
    const wrong = findWrongConfirmationWords(phrase, answers);
    if (wrong.length > 0) {
      const label = wrong.map(position => `nº ${position}`).join(', ');
      setError(
        wrong.length === 1
          ? `A palavra ${label} não confere. Volte ao kit e confira.`
          : `As palavras ${label} não conferem. Volte ao kit e confira.`,
      );
      return;
    }
    setError('');
    onConfirmed();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-3">
        {positions.map((position, index) => {
          const inputId = `${baseId}-word-${position}`;
          return (
            <div key={position}>
              <label
                htmlFor={inputId}
                className="text-xs font-bold uppercase tracking-wide text-slate-400"
              >
                Palavra nº {position}
              </label>
              <input
                id={inputId}
                data-position={position}
                type="text"
                value={answers[position] ?? ''}
                onChange={e => {
                  setAnswers(prev => ({ ...prev, [position]: e.target.value }));
                  setError('');
                }}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={index === 0}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300/50"
              />
            </div>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] disabled:opacity-50 ${FOCUS_RING}`}
        style={{ background: CTA_GRADIENT }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? busyLabel : confirmLabel}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm text-slate-400 transition hover:text-cyan-200 disabled:opacity-50 ${FOCUS_RING}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Voltar ao kit
      </button>
    </form>
  );
}
