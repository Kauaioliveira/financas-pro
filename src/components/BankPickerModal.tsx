import { useEffect, useMemo, useState } from 'react';
import { Building2, Search, Star, X } from 'lucide-react';
import type { BankInfo, BankCategory } from '../data/banks';

function groupByCategory(banks: BankInfo[]): Record<BankCategory, BankInfo[]> {
  return banks.reduce(
    (acc, b) => {
      acc[b.category].push(b);
      return acc;
    },
    {
      Digitais: [],
      Carteiras: [],
      Tradicionais: [],
      Outros: [],
    } as Record<BankCategory, BankInfo[]>
  );
}

export function BankPickerModal({
  open,
  onClose,
  banks,
  selectedId,
  favorites,
  onToggleFavorite,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  banks: BankInfo[];
  selectedId: string | null;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQ('');
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return banks;
    return banks.filter(b => b.name.toLowerCase().includes(query));
  }, [banks, q]);

  const favoriteBanks = useMemo(() => {
    const fav = banks.filter(b => favorites.has(b.id));
    fav.sort((a, b) => a.name.localeCompare(b.name));
    return fav;
  }, [banks, favorites]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div className="dark-surface animate-scale-in relative max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[24px] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-inset ring-cyan-400/18">
            <Building2 className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Importação
            </p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-[color:var(--app-fg-strong)]">
              Escolher banco
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Dica: marque seus favoritos para ficarem sempre no topo.
            </p>

            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Buscar banco..."
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
                  autoFocus
                />
              </div>
            </div>
          </div>

          <button onClick={onClose} className="shell-icon-button h-10 w-10 rounded-xl" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Favoritos
            </p>
            <div className="mt-3 space-y-2">
              {favoriteBanks.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nenhum favorito ainda. Clique na estrela para fixar.
                </p>
              ) : (
                favoriteBanks.map(b => (
                  <BankRow
                    key={b.id}
                    bank={b}
                    selected={selectedId === b.id}
                    isFavorite
                    onToggleFavorite={() => onToggleFavorite(b.id)}
                    onSelect={() => onSelect(b.id)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Todos os bancos
            </p>

            <div className="mt-3 max-h-[420px] space-y-4 overflow-y-auto pr-2">
              {(['Digitais', 'Carteiras', 'Tradicionais', 'Outros'] as BankCategory[]).map(cat => {
                const items = grouped[cat];
                if (!items || items.length === 0) return null;
                const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <div key={cat}>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
                      {cat}
                    </p>
                    <div className="space-y-2">
                      {sorted.map(b => (
                        <BankRow
                          key={b.id}
                          bank={b}
                          selected={selectedId === b.id}
                          isFavorite={favorites.has(b.id)}
                          onToggleFavorite={() => onToggleFavorite(b.id)}
                          onSelect={() => onSelect(b.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function BankRow({
  bank,
  selected,
  isFavorite,
  onToggleFavorite,
  onSelect,
}: {
  bank: BankInfo;
  selected: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
        selected
          ? 'border-cyan-300/22 bg-cyan-400/[0.10]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-extrabold text-white shadow-md"
        style={{ backgroundColor: bank.color }}
      >
        {bank.letter}
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="flex-1 text-left text-sm font-semibold text-slate-200"
        title={`Selecionar ${bank.name}`}
      >
        {bank.name}
      </button>

      <button
        type="button"
        onClick={onToggleFavorite}
        className={`rounded-xl p-2 transition ${
          isFavorite ? 'text-yellow-300 hover:text-yellow-200' : 'text-slate-400 hover:text-slate-200'
        }`}
        title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}

