import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AuthProvider } from '../../context/AuthContext';
import { loadCloudProvider } from '../../lib/cloud/loadCloudProvider';
import type { LoadedCloud } from '../../lib/cloud/loadCloudProvider';
import { legalRouteFromHash } from '../../lib/legal/routes';
import type { LegalRoute } from '../../lib/legal/routes';
import { CloudAuthGate } from './CloudAuthGate';
import LegalPage from './LegalPage';

type LoadState = { status: 'loading' } | { status: 'ready'; cloud: LoadedCloud } | { status: 'error'; message: string };

/** Entry of cloud builds: loads the Supabase client, then the auth screens and the app. */
export default function CloudRoot({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  // #/privacidade and #/termos open over whatever is on screen, without a router: the
  // links can be sent in a message and work before and after signing in.
  const [legalRoute, setLegalRoute] = useState<LegalRoute | null>(() => legalRouteFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setLegalRoute(legalRouteFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const closeLegal = useCallback(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setLegalRoute(null);
  }, []);

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

  const legal = legalRoute && <LegalPage route={legalRoute} onClose={closeLegal} />;

  if (load.status === 'loading') {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--app-bg)' }}>
          <p role="status" className="text-sm text-slate-400">Carregando...</p>
        </div>
        {legal}
      </>
    );
  }

  if (load.status === 'error') {
    return (
      <>
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
        {legal}
      </>
    );
  }

  return (
    <AuthProvider provider={load.cloud.provider}>
      <CloudAuthGate provider={load.cloud.provider} linkError={load.cloud.linkError}>
        {children}
      </CloudAuthGate>
      {legal}
    </AuthProvider>
  );
}
