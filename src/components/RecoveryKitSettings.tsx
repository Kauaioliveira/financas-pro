import { useId, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import type { KitRenewal } from '../lib/auth';
import { KitWordConfirmation, RecoveryKitSheet } from './auth/RecoveryKit';

const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

type KitStep = 'idle' | 'reauth' | 'show' | 'confirm' | 'saving';

function formatKitDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('pt-BR');
}

/**
 * "Gerar kit novo": re-authenticate, show and print the kit, confirm 3 words,
 * and only then rotate the data key and save. Closing the modal unmounts this
 * component, which drops the phrase and the pending renewal.
 */
export function RecoveryKitSettings() {
  const { getEnvelope, getDisplayName, prepareKitRenewal } = useAuth();
  const passwordId = useId();
  const [step, setStep] = useState<KitStep>('idle');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [renewal, setRenewal] = useState<KitRenewal | null>(null);
  const [done, setDone] = useState<{ previousKitId: string | null } | null>(null);

  const envelope = getEnvelope();
  const hasKitMetadata = Boolean(envelope?.kitId && envelope?.kitCreatedAt);
  const hasLegacyKit = !hasKitMetadata && Boolean(envelope?.recoveryWrap);

  function cancel() {
    setStep('idle');
    setPassword('');
    setShowPassword(false);
    setError('');
    setRenewal(null);
  }

  async function handleReauth(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Digite a senha da conta.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const prepared = await prepareKitRenewal(password);
      setRenewal(prepared);
      setPassword('');
      setStep('show');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível verificar a senha.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleConfirmed() {
    if (!renewal) return;
    setStep('saving');
    setError('');
    try {
      await renewal.commit();
      setDone({ previousKitId: renewal.previousKitId });
      setRenewal(null);
      setStep('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o kit novo.');
      setStep('confirm');
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Kit de recuperação</p>
      <p className="mt-2 text-sm text-slate-300">
        {hasKitMetadata && envelope?.kitId && envelope.kitCreatedAt ? (
          <>
            Kit atual: id <span className="font-mono font-semibold text-slate-100">{envelope.kitId}</span>, criado em{' '}
            {formatKitDate(envelope.kitCreatedAt)}
          </>
        ) : hasLegacyKit ? (
          'Kit criado no cadastro'
        ) : (
          'Nenhum kit de recuperação configurado'
        )}
      </p>
      {!hasKitMetadata && (
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Gere um kit novo para ter uma folha imprimível com id e data.
        </p>
      )}

      {done && step === 'idle' && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden="true" />
          <p>
            Kit novo ativado.{' '}
            {done.previousKitId ? (
              <>
                O kit anterior (id <span className="font-mono font-semibold">{done.previousKitId}</span>) não abre mais a
                sua conta.
              </>
            ) : (
              'O kit anterior não abre mais a sua conta.'
            )}{' '}
            Backups exportados antes desta data continuam abrindo com a senha do backup.
          </p>
        </div>
      )}

      {step === 'idle' && (
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setStep('reauth');
          }}
          className={`mt-3 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.10] ${FOCUS_RING}`}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Gerar kit novo
        </button>
      )}

      {step === 'reauth' && (
        <form onSubmit={handleReauth} noValidate className="mt-3 space-y-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs leading-relaxed text-slate-400">
            O kit novo substitui o atual: depois de confirmado, o kit anterior deixa de abrir a sua conta.
          </p>
          <div>
            <label htmlFor={passwordId} className="text-xs font-semibold text-slate-300">
              Senha da conta
            </label>
            <div className="relative mt-1.5">
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError('');
                }}
                autoComplete="current-password"
                autoFocus
                disabled={verifying}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 pr-11 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className={`absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm font-semibold text-rose-200">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={verifying}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${FOCUS_RING}`}
              style={{ background: CTA_GRADIENT }}
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              {verifying ? 'Verificando...' : 'Continuar'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={verifying}
              className={`rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {step === 'show' && renewal && (
        <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="mb-3 text-sm leading-6 text-slate-300">
            Imprima ou anote as 12 palavras na ordem. O kit só passa a valer depois que você confirmar 3 delas.
          </p>
          <RecoveryKitSheet
            accountName={getDisplayName()}
            phrase={renewal.phrase}
            kitId={renewal.kitId}
            createdAt={renewal.kitCreatedAt}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${FOCUS_RING}`}
              style={{ background: CTA_GRADIENT }}
            >
              Já guardei, confirmar palavras
            </button>
            <button
              type="button"
              onClick={cancel}
              className={`rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {(step === 'confirm' || step === 'saving') && renewal && (
        <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="mb-3 text-sm leading-6 text-slate-300">
            Digite as palavras destas posições para ativar o kit novo.
          </p>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200">
              {error}
            </p>
          )}
          <KitWordConfirmation
            phrase={renewal.phrase}
            onConfirmed={handleConfirmed}
            onBack={() => {
              setError('');
              setStep('show');
            }}
            confirmLabel="Ativar kit novo"
            busyLabel="Salvando kit..."
            busy={step === 'saving'}
          />
          <button
            type="button"
            onClick={cancel}
            disabled={step === 'saving'}
            className={`mt-1 w-full rounded-xl py-2 text-sm text-slate-400 transition hover:text-rose-200 disabled:opacity-50 ${FOCUS_RING}`}
          >
            Cancelar e manter o kit atual
          </button>
        </div>
      )}
    </div>
  );
}
