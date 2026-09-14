import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AuthProvider } from '../../context/AuthContext';
import { loadCloudProvider } from '../../lib/cloud/loadCloudProvider';
import type { LoadedCloud } from '../../lib/cloud/loadCloudProvider';
import { CloudAuthGate } from './CloudAuthGate';

type LoadState = { status: 'loading' } | { status: 'ready'; cloud: LoadedCloud } | { status: 'error'; message: string };

/** Entry of cloud builds: loads the Supabase client, then the auth screens and the app. */
export default function CloudRoot({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadCloudProvider().then(
      cloud => { if (!cancelled) setLoad({ status: 'ready', cloud }); },
      err => {
        if (cancelled) return;
        setLoad({
          status: 'error',
          message: err instanceof Error ? err.message : 'Não foi possível carregar o FinançasPro.',
        });
      },
    );
    return () => { cancelled = true; };
  }, []);

  if (load.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--app-bg)' }}>
        <p role="status" className="text-sm text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
        <div role="alert" className="dark-surface flex max-w-md items-start gap-3 rounded-[24px] p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-white">Não foi possível carregar o FinançasPro</h1>
            <p className="mt-2 text-sm text-slate-400">{load.message}</p>
            <p className="mt-2 text-sm text-slate-400">Verifique a internet e recarregue a página.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider provider={load.cloud.provider}>
      <CloudAuthGate provider={load.cloud.provider} linkError={load.cloud.linkError}>
        {children}
      </CloudAuthGate>
    </AuthProvider>
  );
}
