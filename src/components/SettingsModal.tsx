import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings, X, Moon, Sun, Laptop, Download, Upload,
  KeyRound, Eye, EyeOff, Loader2, Shield, CheckCircle2, XCircle, Lock,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import {
  exportEncryptedBackup,
  importEncryptedBackup,
  importPlainBackup,
  isEncryptedBackup,
} from '../utils/backup';

export type ThemePreference = 'dark' | 'light' | 'system';

type ExportState = 'idle' | 'password' | 'exporting' | 'success' | 'error';
type ImportState = 'idle' | 'confirm' | 'password' | 'importing' | 'success' | 'error';

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
  const { changePassword } = useAuth();
  const backupInputRef = useRef<HTMLInputElement>(null);

  const [pwSection, setPwSection] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Export sub-flow
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportPw, setExportPw] = useState('');
  const [exportPwConfirm, setExportPwConfirm] = useState('');
  const [exportErr, setExportErr] = useState('');
  const [showExportPw, setShowExportPw] = useState(false);

  // Import sub-flow
  const [importState, setImportState] = useState<ImportState>('idle');
  const [importPw, setImportPw] = useState('');
  const [importErr, setImportErr] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importFileContent, setImportFileContent] = useState('');
  const [importIsEncrypted, setImportIsEncrypted] = useState(false);
  const [showImportPw, setShowImportPw] = useState(false);

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
    setExportState('idle');
    setExportPw('');
    setExportPwConfirm('');
    setExportErr('');
    setImportState('idle');
    setImportPw('');
    setImportErr('');
    setImportMsg('');
    setImportFileContent('');
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
    if (newPw.length < 6) { setPwErr('A nova senha deve ter pelo menos 6 caracteres.'); return; }
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

  async function handleExport() {
    if (!exportData) return;
    setExportErr('');
    if (exportPw.length < 4) { setExportErr('A senha do backup deve ter pelo menos 4 caracteres.'); return; }
    if (exportPw !== exportPwConfirm) { setExportErr('As senhas nao conferem.'); return; }

    setExportState('exporting');
    try {
      const plainJson = exportData();
      const encrypted = await exportEncryptedBackup(plainJson, exportPw);

      const blob = new Blob([encrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financaspro-backup-${new Date().toISOString().slice(0, 10)}.financas.enc`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      setExportState('success');
      setExportPw('');
      setExportPwConfirm('');
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : 'Erro ao exportar o backup.');
      setExportState('error');
    }
  }

  function handleFileSelected(file: File) {
    file.text().then(text => {
      setImportFileContent(text);
      const encrypted = isEncryptedBackup(text);
      setImportIsEncrypted(encrypted);
      if (encrypted) {
        setImportState('password');
      } else {
        setImportState('confirm');
      }
    }).catch(() => {
      setImportErr('Nao foi possivel ler o arquivo.');
      setImportState('error');
    });
  }

  async function executeImport() {
    if (!importData) return;
    setImportErr('');
    setImportState('importing');

    try {
      let data;
      if (importIsEncrypted) {
        if (!importPw) { setImportErr('Digite a senha do backup.'); setImportState('password'); return; }
        data = await importEncryptedBackup(importFileContent, importPw);
      } else {
        data = importPlainBackup(importFileContent);
      }

      importData(JSON.stringify(data));

      const txCount = data.transactions.length;
      const cardCount = data.cards.length;
      const purchaseCount = data.cardPurchases.length;
      const ruleCount = data.rules.length;

      setImportMsg(`${txCount} transacoes, ${cardCount} cartoes, ${purchaseCount} compras, ${ruleCount} regras.`);
      setImportState('success');
      setImportPw('');
      setImportFileContent('');
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : 'Nao foi possivel importar o backup.');
      setImportState('error');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="dark-surface animate-scale-in relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[28px] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => { setNewPw(e.target.value); setPwErr(''); }}
                    placeholder="Nova senha (minimo 6)"
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
            </div>

            {/* Backup */}
            {(exportData || importData) && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-cyan-300/60" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Backup cifrado</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Exporte ou restaure um backup criptografado (.financas.enc) protegido por senha.
                </p>

                {/* Export sub-flow */}
                {exportData && (
                  <div className="mt-3">
                    {exportState === 'idle' && (
                      <button
                        type="button"
                        onClick={() => setExportState('password')}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.10]"
                      >
                        <Download className="h-4 w-4" />
                        Exportar backup
                      </button>
                    )}

                    {exportState === 'password' && (
                      <div className="space-y-2.5 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                        <p className="text-xs font-semibold text-slate-300">Crie uma senha para proteger o arquivo:</p>
                        <div className="relative">
                          <input
                            type={showExportPw ? 'text' : 'password'}
                            value={exportPw}
                            onChange={e => { setExportPw(e.target.value); setExportErr(''); }}
                            placeholder="Senha do backup (minimo 4)"
                            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 pr-10 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowExportPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            tabIndex={-1}
                          >
                            {showExportPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <input
                          type={showExportPw ? 'text' : 'password'}
                          value={exportPwConfirm}
                          onChange={e => { setExportPwConfirm(e.target.value); setExportErr(''); }}
                          placeholder="Confirmar senha"
                          className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
                        />
                        {exportErr && <p className="text-xs font-semibold text-rose-200">{exportErr}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleExport}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
                            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
                          >
                            <Download className="h-4 w-4" />
                            Exportar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setExportState('idle'); setExportPw(''); setExportPwConfirm(''); setExportErr(''); }}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {exportState === 'exporting' && (
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Criptografando backup...
                      </div>
                    )}

                    {exportState === 'success' && (
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-200">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        Backup cifrado exportado com sucesso.
                        <button type="button" onClick={() => setExportState('idle')} className="ml-auto text-xs text-slate-400 hover:text-slate-200">OK</button>
                      </div>
                    )}

                    {exportState === 'error' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200">
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                          {exportErr || 'Erro ao exportar.'}
                        </div>
                        <button type="button" onClick={() => setExportState('idle')} className="text-xs text-slate-400 hover:text-slate-200">Tentar novamente</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Import sub-flow */}
                {importData && (
                  <div className="mt-3">
                    <input
                      ref={backupInputRef}
                      type="file"
                      accept=".json,.enc,.financas.enc,application/json,application/octet-stream"
                      className="hidden"
                      aria-label="Arquivo de backup"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                        e.target.value = '';
                      }}
                    />

                    {importState === 'idle' && (
                      <button
                        type="button"
                        onClick={() => backupInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.10]"
                      >
                        <Upload className="h-4 w-4" />
                        Restaurar backup
                      </button>
                    )}

                    {importState === 'confirm' && (
                      <div className="space-y-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
                        <p className="text-xs font-semibold text-amber-100">
                          Backup em texto aberto detectado. Substituir todos os dados atuais?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={executeImport}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
                            style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
                          >
                            Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setImportState('idle'); setImportFileContent(''); }}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {importState === 'password' && (
                      <div className="space-y-2.5 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                        <p className="text-xs font-semibold text-slate-300">
                          Backup cifrado detectado. Digite a senha:
                        </p>
                        <div className="relative">
                          <input
                            type={showImportPw ? 'text' : 'password'}
                            value={importPw}
                            onChange={e => { setImportPw(e.target.value); setImportErr(''); }}
                            placeholder="Senha do backup"
                            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 pr-10 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowImportPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            tabIndex={-1}
                          >
                            {showImportPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {importErr && <p className="text-xs font-semibold text-rose-200">{importErr}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={executeImport}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
                            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
                          >
                            <Upload className="h-4 w-4" />
                            Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setImportState('idle'); setImportPw(''); setImportFileContent(''); }}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {importState === 'importing' && (
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Restaurando backup...
                      </div>
                    )}

                    {importState === 'success' && (
                      <div className="space-y-1 rounded-xl bg-emerald-500/10 px-3 py-2.5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                          Backup restaurado com sucesso.
                          <button type="button" onClick={() => setImportState('idle')} className="ml-auto text-xs text-slate-400 hover:text-slate-200">OK</button>
                        </div>
                        {importMsg && <p className="text-xs text-emerald-300/70 pl-6">{importMsg}</p>}
                      </div>
                    )}

                    {importState === 'error' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200">
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                          {importErr || 'Erro ao restaurar.'}
                        </div>
                        <button type="button" onClick={() => setImportState('idle')} className="text-xs text-slate-400 hover:text-slate-200">Tentar novamente</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
