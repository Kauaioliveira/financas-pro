import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { Wallet, Eye, EyeOff, UserPlus, Loader2, ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { migrateLegacyData } from '../../lib/vault';
import { KitWordConfirmation, RecoveryKitSheet } from './RecoveryKit';

const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

export function RegisterScreen({
  onGoToLogin,
  hasExistingUsers,
  hasLegacyData,
}: {
  onGoToLogin: () => void;
  hasExistingUsers: boolean;
  hasLegacyData: boolean;
}) {
  const { provider, register, signIn } = useAuth();
  const [step, setStep] = useState<'form' | 'kit' | 'confirm'>('form');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kit, setKit] = useState<{ phrase: string; kitId: string; createdAt: string } | null>(null);
  const [createdUserId, setCreatedUserId] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [legacyWarning, setLegacyWarning] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Digite seu nome.'); return; }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirmPw) { setError('As senhas não conferem.'); return; }

    setLoading(true);
    try {
      // Creates the account and its recovery kit (does NOT unlock the app yet)
      const { session, kit: createdKit } = await register(name.trim(), password);
      setCreatedUserId(session.userId);
      setKit({ phrase: createdKit.phrase, kitId: createdKit.kitId, createdAt: createdKit.kitCreatedAt });

      // Migrate legacy plaintext data if present. The account already exists here,
      // so a failure must not abort the kit step, and the plaintext stays untouched.
      if (hasLegacyData) {
        try {
          const { kept } = await migrateLegacyData(provider.createVaultStore(session));
          if (kept.length > 0) {
            setLegacyWarning('Parte dos dados antigos estava ilegível e foi mantida neste aparelho, sem alteração.');
          }
        } catch (err) {
          const reason = err instanceof Error ? ` ${err.message}` : '';
          setLegacyWarning(
            `Não foi possível cifrar os dados antigos.${reason} Eles continuam neste aparelho, sem alteração.`,
          );
        }
      }

      setStep('kit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleKitConfirmed() {
    setUnlocking(true);
    try {
      await signIn(createdUserId, password);
    } catch {
      // signIn failed — shouldn't happen since we just created the account
      window.location.reload();
    }
  }

  if ((step === 'kit' || step === 'confirm') && kit) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
        <div className="w-full max-w-lg">
          <div className="dark-surface rounded-[24px] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-400/18">
                {step === 'kit' ? (
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {step === 'kit' ? 'Kit de recuperação' : 'Confirme o seu kit'}
                </h2>
                <p className="text-xs text-slate-400">
                  {step === 'kit' ? 'Guarde antes de continuar' : 'Digite as palavras pedidas'}
                </p>
              </div>
            </div>

            {legacyWarning && (
              <p role="alert" className="mt-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
                {legacyWarning}
              </p>
            )}

            {step === 'kit' ? (
              <>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Se você esquecer sua senha, estas 12 palavras são a <strong className="text-white">única maneira</strong> de
                  recuperar seus dados. Imprima o kit ou anote as palavras na ordem e guarde em local seguro.
                </p>

                <div className="mt-5">
                  <RecoveryKitSheet
                    accountName={name.trim()}
                    phrase={kit.phrase}
                    kitId={kit.kitId}
                    createdAt={kit.createdAt}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] ${FOCUS_RING}`}
                  style={{ background: CTA_GRADIENT }}
                >
                  Já guardei, confirmar palavras
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Para ter certeza de que o kit está guardado, digite as palavras destas posições.
                </p>
                <div className="mt-5">
                  <KitWordConfirmation
                    phrase={kit.phrase}
                    onConfirmed={handleKitConfirmed}
                    onBack={() => setStep('kit')}
                    confirmLabel="Confirmar e entrar"
                    busyLabel="Entrando..."
                    busy={unlocking}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-[0_20px_50px_rgba(14,165,233,0.3)]"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
          >
            <Wallet className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-[color:var(--app-fg-strong)]">
            FinançasPro
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Crie sua conta para proteger seus dados.
          </p>
        </div>

        <form
          onSubmit={handleRegister}
          className="dark-surface rounded-[24px] p-6 sm:p-8"
        >
          <h2 className="text-lg font-semibold text-white">Criar conta</h2>

          {hasLegacyData && (
            <div className="mt-4 rounded-xl bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
              Dados existentes foram detectados. Eles serão criptografados automaticamente ao criar sua conta.
            </div>
          )}

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Seu nome
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Ex: Kauã"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Senha (mínimo 6 caracteres)
            </label>
            <div className="relative mt-2">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Crie uma senha segura"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 pr-12 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Confirmar senha
            </label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setError(''); }}
              placeholder="Repita a senha"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] disabled:opacity-50"
            style={{ background: CTA_GRADIENT }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>

          {hasExistingUsers && (
            <button
              type="button"
              onClick={onGoToLogin}
              className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-slate-400 hover:text-cyan-200 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Já tenho conta
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
