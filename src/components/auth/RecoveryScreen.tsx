import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

export function RecoveryScreen({ onGoToLogin }: { onGoToLogin: () => void }) {
  const { users, provider } = useAuth();
  const [selectedUser, setSelectedUser] = useState(users[0]?.id ?? '');
  const [phrase, setPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!phrase.trim()) { setError('Digite a frase de recuperação.'); return; }
    if (newPassword.length < 6) { setError('A nova senha deve ter pelo menos 6 caracteres.'); return; }
    if (newPassword !== confirmPw) { setError('As senhas não conferem.'); return; }

    setLoading(true);
    try {
      await provider.recoverWithKit({ userId: selectedUser, phrase, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na recuperação.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
        <div className="dark-surface w-full max-w-md rounded-[24px] p-6 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-300">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-white">Senha redefinida</h2>
          <p className="mt-3 text-sm text-slate-400">
            Use sua nova senha para entrar.
          </p>
          <button
            type="button"
            onClick={onGoToLogin}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px]"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
          >
            Ir para login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
      <div className="w-full max-w-md">
        <form
          onSubmit={handleRecover}
          className="dark-surface rounded-[24px] p-6 sm:p-8"
        >
          <h2 className="text-lg font-semibold text-white">Recuperar conta</h2>
          <p className="mt-2 text-sm text-slate-400">
            Digite as 12 palavras do seu kit de recuperação, na ordem.
          </p>

          {users.length > 1 && (
            <div className="mt-4">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Conta
              </label>
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none"
                title="Selecionar conta"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Palavras do kit
            </label>
            <textarea
              value={phrase}
              onChange={e => { setPhrase(e.target.value); setError(''); }}
              placeholder="abacate cofre brisa forte ..."
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="mt-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Nova senha (mínimo 6 caracteres)
            </label>
            <div className="relative mt-2">
              <input
                type={showPw ? 'text' : 'password'}
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError(''); }}
                placeholder="Crie uma nova senha"
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
              Confirmar nova senha
            </label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setError(''); }}
              placeholder="Repita a nova senha"
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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {loading ? 'Recuperando...' : 'Redefinir senha'}
          </button>

          <button
            type="button"
            onClick={onGoToLogin}
            className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-slate-400 hover:text-cyan-200 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao login
          </button>
        </form>
      </div>
    </div>
  );
}
