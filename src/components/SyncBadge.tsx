import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import type { SyncStatus } from '../lib/auth';

const LABELS: Record<SyncStatus['state'], string> = {
  synced: 'Sincronizado',
  syncing: 'Sincronizando...',
  pending: 'Sem sincronizar',
  offline: 'Sem sincronizar',
  conflict: 'Sem sincronizar',
  blocked: 'Sem sincronizar',
  error: 'Sem sincronizar',
};

function formatTime(iso: string | null): string {
  if (!iso) return 'nunca';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Cloud sync state in the header. The explanation is also available to screen readers. */
export function SyncBadge({ status }: { status: SyncStatus }) {
  const ok = status.state === 'synced';
  const busy = status.state === 'syncing';
  const detail = status.message ?? `Última sincronização: ${formatTime(status.lastSyncedAt)}.`;
  const Icon = busy ? Loader2 : ok ? Cloud : CloudOff;

  return (
    <span
      role="status"
      title={detail}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        ok || busy
          ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100'
          : 'border-amber-300/25 bg-amber-400/[0.10] text-amber-100'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      {LABELS[status.state]}
      <span className="sr-only">. {detail}</span>
    </span>
  );
}
