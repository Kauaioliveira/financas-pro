import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { Wallet, Eye, EyeOff, LogIn, UserPlus, Loader2 } from 'lucide-react';

export function LoginScreen({
  onGoToRegister,
  onGoToRecovery,
}: {
  onGoToRegister: () => void;
  onGoToRecovery: () => void;
}) {
  const { users, signIn } = useAuth();
  const [selectedUser, setSelectedUser] = useState(users[0]?.id ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser || !password) return;
    setError('');
    setLoading(true);
    try {
      await signIn(selectedUser, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
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
            Seus dados estão protegidos com criptografia.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="dark-surface rounded-[28px] p-6 sm:p-8"
        >
          <h2 className="text-lg font-semibold text-white">Entrar</h2>

          {users.length > 1 && (
            <div className="mt-4">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Conta
              </label>
              <div className="mt-2 grid gap-2">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setSelectedUser(u.id); setError(''); }}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      selectedUser === u.id
                        ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-extrabold text-white"
                      style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
                    >
                      {u.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    {u.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {users.length === 1 && (
            <p className="mt-3 text-sm text-slate-400">
              Olá, <span className="font-semibold text-slate-200">{users[0].displayName}</span>
            </p>
          )}

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Senha
            </label>
            <div className="relative mt-2">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Digite sua senha"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 pr-12 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
                autoFocus
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

          {error && (
            <p className="mt-3 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {loading ? 'Desbloqueando...' : 'Entrar'}
          </button>

          <div className="mt-5 flex flex-col gap-2 text-center text-sm">
            <button
              type="button"
              onClick={onGoToRecovery}
              className="text-slate-400 hover:text-cyan-200 transition"
            >
              Esqueci minha senha
            </button>
            <button
              type="button"
              onClick={onGoToRegister}
              className="flex items-center justify-center gap-1.5 text-cyan-200/80 hover:text-cyan-100 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Criar nova conta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
