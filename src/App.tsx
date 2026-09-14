import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { FinanceProvider } from './context/FinanceContext';
import { ImportDraftProvider } from './context/ImportDraftContext';
import { AuthGate } from './components/auth/AuthGate';
import { Sidebar } from './components/Sidebar';
import type { TabType } from './types';
import { Settings, Trash2, X, AlertTriangle, Menu, LogOut, UserCog } from 'lucide-react';
import { useFinance } from './context/useFinance';
import { SettingsModal } from './components/SettingsModal';
import { VaultLoadErrorScreen } from './components/VaultLoadErrorScreen';
import { SyncBadge } from './components/SyncBadge';
import { SyncConflictDialog } from './components/SyncConflictDialog';
import type { ThemePreference } from './components/SettingsModal';

const THEME_KEY = 'financaspro_theme';

const Dashboard = lazy(async () => ({
  default: (await import('./components/Dashboard')).Dashboard,
}));

const ImportStatement = lazy(async () => ({
  default: (await import('./components/ImportStatement')).ImportStatement,
}));

const TransactionList = lazy(async () => ({
  default: (await import('./components/TransactionList')).TransactionList,
}));

const CreditCardView = lazy(async () => ({
  default: (await import('./components/CreditCardView')).CreditCardView,
}));

const CategoryRules = lazy(async () => ({
  default: (await import('./components/CategoryRules')).CategoryRules,
}));

// Cloud builds only: with __FINANCASPRO_CLOUD__ false this is dead code, so neither the
// cloud screens nor @supabase/supabase-js end up in the local bundle.
const CloudRoot = __FINANCASPRO_CLOUD__ ? lazy(() => import('./components/cloud/CloudRoot')) : null;

function App() {
  if (CloudRoot) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--app-bg)' }}>
            <p role="status" className="text-sm text-slate-400">Carregando...</p>
          </div>
        }
      >
        <CloudRoot>
          <SecureApp />
        </CloudRoot>
      </Suspense>
    );
  }

  return (
    <AuthProvider>
      <AuthGate>
        <SecureApp />
      </AuthGate>
    </AuthProvider>
  );
}

export default App;

function SecureApp() {
  const { vaultStore, getUserId, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isResetOpen, setIsResetOpen] = useState(false);

  const tabTitles: Record<TabType, string> = {
    dashboard: 'Dashboard',
    importar: 'Importar Extrato',
    transacoes: 'Transações',
    credito: 'Cartão de Crédito',
    regras: 'Regras',
  };

  function renderContent() {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'importar':
        return <ImportStatement />;
      case 'transacoes':
        return <TransactionList />;
      case 'credito':
        return <CreditCardView />;
      case 'regras':
        return <CategoryRules />;
    }
  }

  return (
    <FinanceProvider
      key={getUserId()!}
      store={vaultStore!}
      renderLoadError={actions => <VaultLoadErrorScreen {...actions} onSignOut={signOut} />}
    >
      <ImportDraftProvider>
        <AppShell
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tabTitle={tabTitles[activeTab]}
          isResetOpen={isResetOpen}
          setIsResetOpen={setIsResetOpen}
          content={renderContent()}
        />
      </ImportDraftProvider>
    </FinanceProvider>
  );
}

function AppShell({
  activeTab,
  setActiveTab,
  tabTitle,
  isResetOpen,
  setIsResetOpen,
  content,
}: {
  activeTab: TabType;
  setActiveTab: (t: TabType) => void;
  tabTitle: string;
  isResetOpen: boolean;
  setIsResetOpen: (v: boolean) => void;
  content: ReactNode;
}) {
  const { clearAll, exportFinanceBackup, importFinanceBackup, saveError, retrySave } = useFinance();
  const { signOut, getDisplayName, users, syncStatus, resolveSyncConflict, syncNow } = useAuth();
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const inConflict = syncStatus?.state === 'conflict';
  const [lastConflictState, setLastConflictState] = useState(inConflict);
  if (inConflict !== lastConflictState) {
    // A new conflict always shows the choice again.
    setLastConflictState(inConflict);
    if (inConflict) setConflictDismissed(false);
  }
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const raw = (localStorage.getItem(THEME_KEY) || '').trim();
      if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    } catch {
      // ignore
    }
    return 'system';
  });

  const userName = getDisplayName();

  const userInitials = useMemo(() => {
    const parts = userName
      .split(' ')
      .map(p => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return 'U';
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase().slice(0, 2) || 'U';
  }, [userName]);

  useEffect(() => {
    function getEffectiveTheme(pref: ThemePreference): 'light' | 'dark' {
      if (pref === 'light' || pref === 'dark') return pref;
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
      return prefersDark ? 'dark' : 'light';
    }

    const effective = getEffectiveTheme(themePreference);
    document.documentElement.dataset.theme = effective;

    if (themePreference !== 'system') return;

    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mql) return;

    const onChange = () => {
      const updated = getEffectiveTheme('system');
      document.documentElement.dataset.theme = updated;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMql = mql as any;
    if (typeof anyMql.addEventListener === 'function') anyMql.addEventListener('change', onChange);
    else if (typeof anyMql.addListener === 'function') anyMql.addListener(onChange);

    return () => {
      if (typeof anyMql.removeEventListener === 'function') anyMql.removeEventListener('change', onChange);
      else if (typeof anyMql.removeListener === 'function') anyMql.removeListener(onChange);
    };
  }, [themePreference]);

  function handleThemeChange(t: ThemePreference) {
    setThemePreference(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // ignore
    }
  }

  function handleReset() {
    clearAll();
    setIsResetOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[40rem] bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.10),transparent_62%)] lg:block" />
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} open={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="app-main">
        <header className="app-header px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/55 light:text-cyan-700/70">
                Central Financeira
              </p>
              <h1 className="font-display text-xl font-semibold text-[color:var(--app-fg-strong)] sm:text-2xl">
                {tabTitle}
              </h1>
              <p className="mt-1 text-sm text-slate-400 light:text-slate-500">
                <span className="hidden sm:inline">
                  {new Date().toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <span className="sm:hidden">
                  {new Date().toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {__FINANCASPRO_CLOUD__ && syncStatus && (
                <SyncBadge
                  status={syncStatus}
                  onAction={() => (syncStatus.state === 'conflict' ? setConflictDismissed(false) : syncNow())}
                />
              )}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="shell-icon-button hover:text-cyan-100 lg:hidden"
                title="Abrir menu"
                aria-label="Abrir menu de navegação"
              >
                <Menu className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={() => setIsResetOpen(true)}
                className="shell-icon-button hover:text-rose-200"
                title="Resetar dados"
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                title="Configurações"
                className="shell-icon-button hover:text-cyan-100"
              >
                <Settings className="h-[18px] w-[18px]" />
              </button>
              {users.length > 1 && (
                <button
                  type="button"
                  onClick={signOut}
                  title="Trocar conta"
                  className="shell-icon-button hover:text-cyan-100"
                >
                  <UserCog className="h-[18px] w-[18px]" />
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                title="Sair"
                className="shell-icon-button hover:text-rose-200"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
              <div className="ml-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 light:border-slate-900/10 light:bg-slate-900/[0.04]">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-2xl text-xs font-extrabold text-white shadow-[0_20px_40px_rgba(14,165,233,0.28)]"
                  style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
                >
                  {userInitials}
                </div>
                <span className="hidden text-sm font-semibold text-slate-200 light:text-slate-700 sm:inline">{userName}</span>
              </div>
            </div>
          </div>
        </header>

        {saveError && (
          <div
            role="alert"
            className="mx-4 mt-3 flex flex-col gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 sm:mx-6 sm:flex-row sm:items-center"
          >
            <AlertTriangle className="hidden h-4 w-4 flex-shrink-0 text-rose-300 sm:block" aria-hidden="true" />
            <p className="flex-1">
              <strong className="font-semibold">Alterações não salvas.</strong> {saveError} Não feche o app até
              salvar ou exportar.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={retrySave}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.10] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                Tentar salvar de novo
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.10] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                Exportar backup
              </button>
            </div>
          </div>
        )}

        <div className="relative flex-1 overflow-y-auto">
          <Suspense fallback={<ContentLoader label={tabTitle} />}>{content}</Suspense>
        </div>
      </main>

      <SettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={themePreference}
        onThemeChange={handleThemeChange}
        exportData={exportFinanceBackup}
        importData={importFinanceBackup}
      />

      {__FINANCASPRO_CLOUD__ && inConflict && !conflictDismissed && (
        <SyncConflictDialog
          message={syncStatus?.message ?? null}
          onResolve={resolveSyncConflict}
          onClose={() => setConflictDismissed(true)}
        />
      )}

      {isResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={() => setIsResetOpen(false)}
          />
          <div className="dark-surface animate-scale-in relative max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-[24px] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-300 ring-1 ring-inset ring-rose-400/18">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-200/55">
                  Limpeza local
                </p>
                <h3 className="font-display mt-2 text-2xl font-semibold text-white">
                  Resetar dados do FinançasPro?
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Isso apaga todas as transações, cartões, compras, faturas e regras de categoria salvas neste computador.
                  Depois disso, você poderá importar tudo novamente do zero.
                </p>
              </div>
              <button
                onClick={() => setIsResetOpen(false)}
                className="shell-icon-button h-10 w-10 rounded-xl"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setIsResetOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                className="rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(239,68,68,0.22)] transition hover:-translate-y-[1px]"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                Resetar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContentLoader({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-8">
      <div className="dark-surface rounded-[24px] px-6 py-6 text-center shadow-[0_26px_60px_rgba(0,0,0,0.32)]">
        <div
          className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
        />
        <p className="font-display text-lg font-semibold text-white">
          Carregando {label.toLowerCase()}...
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Preparando a interface no modo noturno.
        </p>
      </div>
    </div>
  );
}
