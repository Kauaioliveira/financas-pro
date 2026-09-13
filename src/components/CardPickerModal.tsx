import { useEffect } from 'react';
import { CreditCard, X } from 'lucide-react';
import type { CardAccount } from '../types';

export function CardPickerModal({
  open,
  onClose,
  cards,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  cards: CardAccount[];
  selectedId: string | null;
  onSelect: (cardId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-slate-950/76 backdrop-blur-sm" onClick={onClose} />
      <div className="dark-surface animate-scale-in relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] p-5 sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl sm:rounded-[24px] sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-inset ring-cyan-400/18">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Importacao
            </p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-[color:var(--app-fg-strong)]">
              Escolher cartao
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Selecione o cartao certo para aplicar fechamento, vencimento e parser do banco.
            </p>
          </div>
          <button onClick={onClose} className="shell-icon-button h-10 w-10 rounded-xl" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {cards.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
              Cadastre um cartao na aba de credito para liberar a importacao.
            </div>
          ) : (
            cards.map(card => {
              const selected = selectedId === card.id;
              return (
                <button
                  key={card.id}
                  onClick={() => onSelect(card.id)}
                  className={`flex items-center gap-4 rounded-[20px] border px-4 py-4 text-left transition ${
                    selected
                      ? 'border-cyan-300/18 bg-cyan-400/[0.10]'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-extrabold text-white shadow-md"
                    style={{ backgroundColor: card.color }}
                  >
                    {card.letter}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100">{card.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {card.bankName} • fecha dia {card.closingDay} • vence dia {card.dueDay}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {card.supportedFormats.join(' + ').toUpperCase()}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
