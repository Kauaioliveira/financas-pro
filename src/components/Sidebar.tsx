import type { TabType } from '../types';
import {
  LayoutDashboard,
  Upload,
  List,
  CreditCard,
  Wand2,
  Wallet,
  X,
} from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  open?: boolean;
  onClose?: () => void;
}

const tabs: {
  id: TabType;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'visão geral', icon: LayoutDashboard },
  { id: 'importar', label: 'Importar Extrato', hint: 'entrada de dados', icon: Upload },
  { id: 'transacoes', label: 'Transações', hint: 'movimentos', icon: List },
  { id: 'credito', label: 'Cartão de Crédito', hint: 'faturas', icon: CreditCard },
  { id: 'regras', label: 'Regras', hint: 'automação', icon: Wand2 },
];

export function Sidebar({ activeTab, onTabChange, open, onClose }: SidebarProps) {
  function handleTabClick(id: TabType) {
    onTabChange(id);
    onClose?.();
  }

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden overflow-y-auto border-r border-white/6 bg-[#050914]/92
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 lg:transition-none
        `}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,20,0.96),rgba(7,12,24,0.92))]" />
        <div className="absolute -left-16 top-18 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute -right-20 bottom-20 h-56 w-56 rounded-full bg-blue-500/14 blur-3xl" />

        <div className="relative z-10 flex shrink-0 items-start justify-between p-6 pb-8">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_48px_rgba(2,6,23,0.28)] backdrop-blur-md flex-1">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_18px_40px_rgba(14,165,233,0.26)]"
                style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
              >
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold text-[color:var(--app-fg-strong)] tracking-tight">
                  FinançasPro
                </h1>
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
                  Gerenciador Financeiro
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/55">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.75)]" />
              Cockpit financeiro
            </div>
          </div>

          <button
            onClick={onClose}
            className="ml-2 mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="relative z-10 min-h-0 flex-1 shrink-0 px-4 pt-2">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">
            Navegação
          </p>

          <div className="space-y-2">
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`animate-slide-in stagger-${i + 1} group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 ${
                    isActive
                      ? 'border-cyan-300/16 bg-cyan-400/[0.10] text-white shadow-[0_16px_36px_rgba(8,145,178,0.18)]'
                      : 'border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.04] hover:text-slate-100'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                      isActive
                        ? 'bg-cyan-300/12 text-cyan-100'
                        : 'bg-white/[0.04] text-slate-400 group-hover:bg-white/[0.08] group-hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-none">{tab.label}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-slate-500">
                      {tab.hint}
                    </div>
                  </div>

                  {isActive && (
                    <div className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.75)]" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 shrink-0 p-5">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Armazenamento local
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Seus dados ficam salvos no navegador, com acesso rápido para o painel.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
