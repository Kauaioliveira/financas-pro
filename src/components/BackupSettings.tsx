import { useState } from 'react';
import { CheckCircle2, Download, Loader2, Lock, XCircle } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { exportBackupV2 } from '../utils/backup';
import { BackupImport } from './BackupImport';

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

type ExportState = 'idle' | 'exporting' | 'success' | 'error';

export function BackupSettings({
  exportData,
  importData,
}: {
  exportData?: () => string;
  /** May be async; the success message only appears after it resolves. */
  importData?: (json: string) => void | Promise<void>;
}) {
  const { getDataKey, getKeyInfo } = useAuth();

  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportErr, setExportErr] = useState('');

  const keyInfo = getKeyInfo();
  const wraps = keyInfo?.backupWraps ?? null;
  const kitLabel = keyInfo?.kitId
    ? `o kit de recuperação (id ${keyInfo.kitId})`
    : keyInfo?.hasKit
      ? 'o kit de recuperação criado no cadastro'
      : null;
  const opensWith = [kitLabel, wraps?.password ? 'a senha atual da conta' : null].filter(Boolean).join(' ou com ');

  async function handleExport() {
    if (!exportData) return;
    const dataKey = getDataKey();
    if (!dataKey || !wraps) {
      setExportErr('Sessão expirada. Entre de novo para exportar.');
      setExportState('error');
      return;
    }
    setExportErr('');
    setExportState('exporting');
    try {
      const file = await exportBackupV2(exportData(), dataKey, wraps);
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

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-cyan-300/60" aria-hidden="true" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Backup cifrado</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {opensWith ? `O arquivo (.financas.enc) abre com ${opensWith}.` : 'Backup cifrado com a chave da conta.'}{' '}
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

      {importData && <BackupImport onImport={importData} />}
    </div>
  );
}
