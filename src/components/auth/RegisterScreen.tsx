import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { Wallet, Eye, EyeOff, UserPlus, Loader2, ArrowLeft, AlertTriangle, Copy, CheckCircle2 } from 'lucide-react';
import { generateRecoveryPhrase } from '../../lib/crypto';
import { addRecoveryWrap } from '../../lib/crypto/crypto';
import { readLegacyData, clearLegacyData, saveVaultData } from '../../utils/secureStorage';

export function RegisterScreen({
  onGoToLogin,
  hasExistingUsers,
  hasLegacyData,
}: {
  onGoToLogin: () => void;
  hasExistingUsers: boolean;
  hasLegacyData: boolean;
}) {
  const { provider, signIn, refreshUsers } = useAuth();
  const [step, setStep] = useState<'form' | 'recovery'>('form');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [createdUserId, setCreatedUserId] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Digite seu nome.'); return; }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirmPw) { setError('As senhas não conferem.'); return; }

    setLoading(true);
    try {
      // Create account via provider directly (does NOT unlock the AuthContext)
      const session = await provider.register(name.trim(), password);
      setCreatedUserId(session.userId);
      refreshUsers();

      // Generate recovery phrase and wrap with the new data key
      const phrase = generateRecoveryPhrase();
      setRecoveryPhrase(phrase);

      const envelope = provider.getEnvelope(session.userId);
      if (envelope) {
        const updated = await addRecoveryWrap(phrase, session.dataKey, envelope);
        provider.updateEnvelope(session.userId, updated);
      }

      // Migrate legacy plaintext data if present
      if (hasLegacyData) {
        const legacyData = readLegacyData();
        await saveVaultData(session.userId, session.dataKey, legacyData);
        clearLegacyData();
      }

      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmRecovery() {
    setUnlocking(true);
    try {
      await signIn(createdUserId, password);
    } catch {
      // signIn failed — shouldn't happen since we just created the account
      window.location.reload();
    }
  }

  if (step === 'recovery') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
        <div className="w-full max-w-md">
          <div className="dark-surface rounded-[28px] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-400/18">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Frase de recuperação</h2>
                <p className="text-xs text-slate-400">Guarde com segurança</p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-300">
              Se você esquecer sua senha, esta frase é a <strong className="text-white">única maneira</strong> de recuperar seus dados.
              Copie, imprima ou anote em local seguro.
            </p>

            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <p className="select-all text-center font-mono text-sm leading-7 text-amber-100 break-words">
                {recoveryPhrase}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(recoveryPhrase).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiada!' : 'Copiar frase'}
            </button>

            <label className="mt-5 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-white/20 bg-white/[0.06] accent-cyan-400"
              />
              <span className="text-sm text-slate-300">
                Eu copiei ou anotei a frase de recuperação em local seguro.
              </span>
            </label>

            <button
              type="button"
              disabled={!confirmed || unlocking}
              onClick={handleConfirmRecovery}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
            >
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {unlocking ? 'Entrando...' : 'Entendi, continuar'}
            </button>
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
          <h1 className="font-display text-3xl font-semibold text-[color:var(--app-fg-strong)]">
            FinançasPro
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Crie sua conta para proteger seus dados.
          </p>
        </div>

        <form
          onSubmit={handleRegister}
          className="dark-surface rounded-[28px] p-6 sm:p-8"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
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
            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
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
