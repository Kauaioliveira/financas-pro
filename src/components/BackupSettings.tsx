import { useId, useRef, useState } from 'react';
import { CheckCircle2, Download, Eye, EyeOff, Loader2, Lock, Upload, XCircle } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import {
  detectBackupFormat,
  exportBackupV2,
  importBackupV2,
  importEncryptedBackup,
  importPlainBackup,
  readBackupV2Info,
} from '../utils/backup';
import type { BackupData, BackupV2Info } from '../utils/backup';

const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';
const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-300/50';
const SECONDARY_BUTTON = `rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`;

type ExportState = 'idle' | 'exporting' | 'success' | 'error';
type ImportState = 'idle' | 'confirm' | 'v2' | 'v1' | 'importing' | 'success' | 'error';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('pt-BR');
}

function summarize(data: BackupData): string {
  return `${data.transactions.length} transações, ${data.cards.length} cartões, ${data.cardPurchases.length} compras, ${data.rules.length} regras.`;
}

export function BackupSettings({
  exportData,
  importData,
}: {
  exportData?: () => string;
  importData?: (json: string) => void;
}) {
  const { getDataKey, getEnvelope } = useAuth();
  const backupInputRef = useRef<HTMLInputElement>(null);
  const ids = { secret: useId(), method: useId() };

  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportErr, setExportErr] = useState('');

  const [importState, setImportState] = useState<ImportState>('idle');
  const [importErr, setImportErr] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [v2Info, setV2Info] = useState<BackupV2Info | null>(null);
  const [method, setMethod] = useState<'kit' | 'password'>('kit');
  const [phrase, setPhrase] = useState('');
  const [secretPw, setSecretPw] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const envelope = getEnvelope();
  const kitLabel = envelope?.kitId
    ? `o kit de recuperação (id ${envelope.kitId})`
    : envelope?.recoveryWrap
      ? 'o kit de recuperação criado no cadastro'
      : null;

  function resetImport() {
    setImportState('idle');
    setImportErr('');
    setFileContent('');
    setV2Info(null);
    setPhrase('');
    setSecretPw('');
    setShowSecret(false);
  }

  async function handleExport() {
    if (!exportData) return;
    const dataKey = getDataKey();
    if (!dataKey || !envelope) {
      setExportErr('Sessão expirada. Entre de novo para exportar.');
      setExportState('error');
      return;
    }
    setExportErr('');
    setExportState('exporting');
    try {
      const file = await exportBackupV2(exportData(), dataKey, envelope);
      const blob = new Blob([file], { type: 'application/octet-stream' });
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
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : 'Erro ao exportar o backup.');
      setExportState('error');
    }
  }

  function handleFileSelected(file: File) {
    file.text().then(text => {
      setImportErr('');
      setFileContent(text);
      const format = detectBackupFormat(text);
      if (format === 'v2') {
        try {
          const info = readBackupV2Info(text);
          setV2Info(info);
          setMethod(info.opensWithKit ? 'kit' : 'password');
          setImportState('v2');
        } catch (err) {
          setImportErr(err instanceof Error ? err.message : 'Arquivo de backup inválido.');
          setImportState('error');
        }
      } else if (format === 'v1') {
        setImportState('v1');
      } else if (format === 'plain') {
        setImportState('confirm');
      } else {
        setImportErr('Este arquivo não é um backup do FinançasPro.');
        setImportState('error');
      }
    }).catch(() => {
      setImportErr('Não foi possível ler o arquivo.');
      setImportState('error');
    });
  }

  async function executeImport(kind: 'v2' | 'v1' | 'plain') {
    if (!importData) return;
    if (kind === 'v2' && method === 'kit' && !phrase.trim()) {
      setImportErr('Digite as 12 palavras do kit.');
      return;
    }
    if ((kind === 'v1' || (kind === 'v2' && method === 'password')) && !secretPw) {
      setImportErr(kind === 'v1' ? 'Digite a senha do backup.' : 'Digite a senha da conta.');
      return;
    }

    const returnState = importState;
    setImportErr('');
    setImportState('importing');
    try {
      let data: BackupData;
      if (kind === 'v2') {
        data = await importBackupV2(
          fileContent,
          method === 'kit' ? { kind: 'kit', phrase } : { kind: 'password', password: secretPw },
        );
      } else if (kind === 'v1') {
        try {
          data = await importEncryptedBackup(fileContent, secretPw);
        } catch {
          throw new Error('Senha do backup incorreta ou arquivo corrompido.');
        }
      } else {
        data = importPlainBackup(fileContent);
      }

      importData(JSON.stringify(data));
      setImportMsg(summarize(data));
      setImportState('success');
      setFileContent('');
      setPhrase('');
      setSecretPw('');
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : 'Não foi possível importar o backup.');
      // Wrong credentials: stay on the same step so the user can try again.
      setImportState(kind === 'plain' ? 'error' : returnState);
    }
  }

  const replaceWarning = (
    <p className="text-xs text-amber-100/90">Restaurar substitui todos os dados atuais desta conta.</p>
  );

  const secretPasswordInput = (label: string) => (
    <div>
      <label htmlFor={ids.secret} className="text-xs font-semibold text-slate-300">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={ids.secret}
          type={showSecret ? 'text' : 'password'}
          value={secretPw}
          onChange={e => { setSecretPw(e.target.value); setImportErr(''); }}
          autoComplete="off"
          autoFocus
          className={`${INPUT_CLASS} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShowSecret(v => !v)}
          aria-label={showSecret ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={showSecret}
          className={`absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}
        >
          {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );

  const importError = importErr && (
    <p role="alert" className="text-xs font-semibold text-rose-200">{importErr}</p>
  );

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-cyan-300/60" aria-hidden="true" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Backup cifrado</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {kitLabel
          ? `O arquivo (.financas.enc) abre com ${kitLabel} ou com a senha atual da conta.`
          : 'O arquivo (.financas.enc) abre com a senha atual da conta.'}{' '}
        Trocar a senha ou gerar um kit novo depois não muda backups já exportados.
      </p>

      {exportData && (
        <div className="mt-3">
          {exportState === 'idle' && (
            <button
              type="button"
              onClick={handleExport}
              className={`inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.10] ${FOCUS_RING}`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar backup
            </button>
          )}

          <div role="status">
            {exportState === 'exporting' && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Criptografando backup...
              </div>
            )}

            {exportState === 'success' && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Backup cifrado exportado com sucesso.
                <button type="button" onClick={() => setExportState('idle')} className={`ml-auto rounded text-xs text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}>OK</button>
              </div>
            )}
          </div>

          {exportState === 'error' && (
            <div className="space-y-2">
              <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200">
                <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {exportErr || 'Erro ao exportar.'}
              </div>
              <button type="button" onClick={() => setExportState('idle')} className={`rounded text-xs text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}>Tentar novamente</button>
            </div>
          )}
        </div>
      )}

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
              className={`inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.10] ${FOCUS_RING}`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
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
                  onClick={() => executeImport('plain')}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${FOCUS_RING}`}
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
                >
                  Restaurar
                </button>
                <button type="button" onClick={resetImport} className={SECONDARY_BUTTON}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {importState === 'v2' && v2Info && (
            <form
              noValidate
              onSubmit={e => { e.preventDefault(); executeImport('v2'); }}
              className="space-y-3 rounded-xl border border-white/8 bg-white/[0.02] p-3"
            >
              <p className="text-xs leading-relaxed text-slate-300">
                Backup de <strong className="text-slate-100">{formatDate(v2Info.createdAt)}</strong>. Abre com{' '}
                {v2Info.opensWithKit
                  ? v2Info.kitId
                    ? <>o kit id <span className="font-mono font-semibold text-slate-100">{v2Info.kitId}</span></>
                    : 'o kit criado no cadastro'
                  : null}
                {v2Info.opensWithKit && v2Info.opensWithPassword ? ' ou com ' : ''}
                {v2Info.opensWithPassword ? 'a senha que a conta tinha nessa data' : ''}.
              </p>

              <fieldset>
                <legend id={ids.method} className="text-xs font-semibold text-slate-300">Abrir com</legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(['kit', 'password'] as const).map(option => {
                    const available = option === 'kit' ? v2Info.opensWithKit : v2Info.opensWithPassword;
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-300 ${
                          method === option
                            ? 'border-cyan-300/22 bg-cyan-400/[0.10] text-slate-100'
                            : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                        } ${available ? '' : 'cursor-not-allowed opacity-40'}`}
                      >
                        <input
                          type="radio"
                          name={ids.method}
                          value={option}
                          checked={method === option}
                          disabled={!available}
                          onChange={() => { setMethod(option); setImportErr(''); }}
                          className="sr-only"
                        />
                        {option === 'kit' ? 'Kit de recuperação' : 'Senha da conta'}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {method === 'kit' ? (
                <div>
                  <label htmlFor={ids.secret} className="text-xs font-semibold text-slate-300">
                    Palavras do kit
                  </label>
                  <textarea
                    id={ids.secret}
                    value={phrase}
                    onChange={e => { setPhrase(e.target.value); setImportErr(''); }}
                    rows={3}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    placeholder="As 12 palavras, na ordem"
                    className={`${INPUT_CLASS} mt-1.5 resize-none font-mono`}
                  />
                </div>
              ) : (
                secretPasswordInput('Senha da conta na data do backup')
              )}

              {replaceWarning}
              {importError}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${FOCUS_RING}`}
                  style={{ background: CTA_GRADIENT }}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Restaurar
                </button>
                <button type="button" onClick={resetImport} className={SECONDARY_BUTTON}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {importState === 'v1' && (
            <form
              noValidate
              onSubmit={e => { e.preventDefault(); executeImport('v1'); }}
              className="space-y-2.5 rounded-xl border border-white/8 bg-white/[0.02] p-3"
            >
              <p className="text-xs font-semibold text-slate-300">
                Backup cifrado no formato antigo. Ele abre com a senha criada na exportação.
              </p>
              {secretPasswordInput('Senha do backup')}
              {replaceWarning}
              {importError}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${FOCUS_RING}`}
                  style={{ background: CTA_GRADIENT }}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Restaurar
                </button>
                <button type="button" onClick={resetImport} className={SECONDARY_BUTTON}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div role="status">
            {importState === 'importing' && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Restaurando backup...
              </div>
            )}

            {importState === 'success' && (
              <div className="space-y-1 rounded-xl bg-emerald-500/10 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  Backup restaurado com sucesso.
                  <button type="button" onClick={() => setImportState('idle')} className={`ml-auto rounded text-xs text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}>OK</button>
                </div>
                {importMsg && <p className="pl-6 text-xs text-emerald-300/70">{importMsg}</p>}
              </div>
            )}
          </div>

          {importState === 'error' && (
            <div className="space-y-2">
              <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200">
                <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {importErr || 'Erro ao restaurar.'}
              </div>
              <button type="button" onClick={resetImport} className={`rounded text-xs text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}>Tentar novamente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
