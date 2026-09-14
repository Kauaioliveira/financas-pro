import { useState } from 'react';
import { AlertTriangle, LogOut, RefreshCw, Upload } from 'lucide-react';
import type { VaultLoadErrorActions } from '../context/FinanceContext';
import { BackupImport } from './BackupImport';

const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';
const SECONDARY_BUTTON = `flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] ${FOCUS_RING}`;

/**
 * Shown when the vault exists but does not open. The app saves nothing while
 * this screen is up; restoring a backup keeps a copy of the unreadable data first.
 */
export function VaultLoadErrorScreen({
  error,
  retry,
  restoreBackup,
  onSignOut,
}: VaultLoadErrorActions & { onSignOut: () => void }) {
  const [restoring, setRestoring] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
      <div className="dark-surface w-full max-w-lg rounded-[24px] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-400/18">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div role="alert">
            <h2 className="text-lg font-semibold text-white">
              Não foi possível abrir seus dados neste aparelho. Nada foi apagado.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{error.message}</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          Enquanto esta tela estiver aberta, o FinançasPro não grava nada por cima dos seus dados.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={retry}
            className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] ${FOCUS_RING}`}
            style={{ background: CTA_GRADIENT }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar de novo
          </button>
          <button type="button" onClick={onSignOut} className={SECONDARY_BUTTON}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair da conta
          </button>
        </div>

        {!restoring ? (
          <button
            type="button"
            onClick={() => setRestoring(true)}
            className={`mt-3 w-full ${SECONDARY_BUTTON}`}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Restaurar backup
          </button>
        ) : (
          <div className="mt-4">
            <p className="text-xs leading-relaxed text-slate-400">
              Antes de restaurar, uma cópia dos dados que não abrem fica guardada neste navegador. Se não houver
              espaço para a cópia, nada é alterado.
            </p>
            <BackupImport onImport={restoreBackup} />
          </div>
        )}
      </div>
    </div>
  );
}
