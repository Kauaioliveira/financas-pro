import { useEffect, useMemo, useState } from 'react';
import {
  Settings, X, Moon, Sun, Laptop,
  KeyRound, Eye, EyeOff, Loader2, Shield,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { RecoveryKitSettings } from './RecoveryKitSettings';
import { BackupSettings } from './BackupSettings';

export type ThemePreference = 'dark' | 'light' | 'system';

export function SettingsModal({
  open,
  onClose,
  theme,
  onThemeChange,
  exportData,
  importData,
}: {
  open: boolean;
  onClose: () => void;
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
  exportData?: () => string;
  importData?: (json: string) => void;
}) {
  const { changePassword, provider, mode } = useAuth();

  const [pwSection, setPwSection] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const effectiveLabel = useMemo(() => {
    if (theme === 'system') return 'Automatico (segue o sistema)';
    if (theme === 'light') return 'Claro';
    return 'Escuro';
  }, [theme]);

  function handleClose() {
    setPwSection(false);
    setOldPw('');
    setNewPw('');
    setConfirmPw('');
    setPwMsg('');
    setPwErr('');
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  async function handleChangePassword() {
    setPwErr('');
    setPwMsg('');
    if (!oldPw) { setPwErr('Digite a senha atual.'); return; }
    const rule = provider.validatePassword(newPw);
    if (rule) { setPwErr(rule.replace('A senha', 'A nova senha')); return; }
    if (newPw !== confirmPw) { setPwErr('As senhas nao conferem.'); return; }

    setPwLoading(true);
    try {
      await changePassword(oldPw, newPw);
      setPwMsg('Senha alterada com sucesso.');
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => setPwMsg(''), 3000);
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setPwLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="dark-surface animate-scale-in relative max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-[24px] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-inset ring-cyan-400/18">
            <Settings className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Preferencias
            </p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-[color:var(--app-fg-strong)]">
              Configuracoes
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Tema atual: <span className="font-semibold text-slate-200">{effectiveLabel}</span>
            </p>

            {/* Theme */}
            <div className="mt-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Tema</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(['dark', 'light', 'system'] as const).map(t => {
                  const Icon = t === 'dark' ? Moon : t === 'light' ? Sun : Laptop;
                  const label = t === 'dark' ? 'Escuro' : t === 'light' ? 'Claro' : 'Auto';
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onThemeChange(t)}
                      className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        theme === t
                          ? 'border-cyan-300/22 bg-cyan-400/[0.10] text-slate-100'
                          : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Security */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-cyan-300/60" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Seguranca</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Seus dados sao criptografados com AES-256. Ninguem acessa sem sua senha.
              </p>

              {!pwSection ? (
                <button
                  type="button"
                  onClick={() => setPwSection(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.10]"
                >
                  <KeyRound className="h-4 w-4" />
                  Alterar senha
                </button>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={oldPw}
                      onChange={e => { setOldPw(e.target.value); setPwErr(''); }}
                      placeholder="Senha atual"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 pr-10 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => { setNewPw(e.target.value); setPwErr(''); }}
                    placeholder={mode === 'cloud' ? 'Nova senha (mínimo 12)' : 'Nova senha (minimo 6)'}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
                  />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={e => { setConfirmPw(e.target.value); setPwErr(''); }}
                    placeholder="Confirmar nova senha"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
                  />
                  {pwErr && <p className="text-sm font-semibold text-rose-200">{pwErr}</p>}
                  {pwMsg && <p className="text-sm font-semibold text-emerald-200">{pwMsg}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={pwLoading}
                      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
                    >
                      {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Alterar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPwSection(false); setPwErr(''); setPwMsg(''); }}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08]"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <RecoveryKitSettings />
            </div>

            {(exportData || importData) && (
              <BackupSettings exportData={exportData} importData={importData} />
            )}
          </div>

          <button
            onClick={handleClose}
            className="shell-icon-button h-10 w-10 rounded-xl"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleClose}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
