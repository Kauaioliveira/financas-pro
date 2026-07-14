import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FolderClock,
  Pencil,
  Plus,
  Receipt,
} from 'lucide-react';
import { useFinance } from '../context/useFinance';
import type { CardAccount, ExpenseBreakdown, ExpenseBreakdownItem } from '../types';
import { formatCurrency, formatDate, getMonthLabel } from '../utils/parser';
import { CardAccountModal } from './CardAccountModal';

export function CreditCardView() {
  const {
    cardAccounts,
    cardInvoices,
    cardPurchases,
    addCardAccount,
    updateCardAccount,
    markInvoicePaid,
    getCardExpenseBreakdown,
  } = useFinance();
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardAccount | null>(null);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const invoice of cardInvoices) months.add(invoice.paymentMonth);
    for (const purchase of cardPurchases) months.add(purchase.paymentMonth);
    return Array.from(months).sort().reverse();
  }, [cardInvoices, cardPurchases]);
  const [selectedMonthState, setSelectedMonth] = useState(monthOptions[0] || '');
  const selectedMonth = monthOptions.includes(selectedMonthState) ? selectedMonthState : monthOptions[0] || '';

  const totalOpen = useMemo(
    () => cardPurchases.filter(purchase => purchase.status !== 'paga').reduce((sum, purchase) => sum + purchase.amount, 0),
    [cardPurchases]
  );
  const totalPendingInvoices = useMemo(
    () => cardInvoices.filter(invoice => !invoice.paid).reduce((sum, invoice) => sum + invoice.total, 0),
    [cardInvoices]
  );
  const nextInvoice = cardInvoices.find(invoice => !invoice.paid);
  const selectedBreakdown = useMemo(
    () => (selectedMonth ? getCardExpenseBreakdown(selectedMonth) : null),
    [getCardExpenseBreakdown, selectedMonth]
  );
  const selectedInvoices = useMemo(
    () => cardInvoices.filter(invoice => invoice.paymentMonth === selectedMonth),
    [cardInvoices, selectedMonth]
  );
  const selectedOpenPurchases = useMemo(
    () => cardPurchases.filter(purchase => purchase.paymentMonth > selectedMonth && purchase.status !== 'paga'),
    [cardPurchases, selectedMonth]
  );

  function openNewCard() {
    setEditingCard(null);
    setEditorOpen(true);
  }

  function openEditCard(card: CardAccount) {
    setEditingCard(card);
    setEditorOpen(true);
  }

  function handleSaveCard(card: CardAccount) {
    if (editingCard) updateCardAccount(card);
    else addCardAccount(card);
  }

  return (
    <div className="page-wrap">
      <section className="panel-grid">
        <div className="dashboard-hero">
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/55">
                Modulo de cartao
              </p>
              <h2 className="font-display mt-2 sm:mt-3 text-2xl sm:text-4xl xl:text-5xl font-semibold text-white">
                Ciclo real da fatura
              </h2>
              <p className="mt-2 sm:mt-4 max-w-2xl text-sm leading-6 sm:leading-7 text-slate-300 sm:text-base">
                Compras ficam separadas do caixa mensal e so entram no painel quando a fatura realmente vence.
              </p>
            </div>
            <button
              onClick={openNewCard}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(34,211,238,0.25)] transition hover:-translate-y-[1px]"
            >
              <Plus className="h-4 w-4" />
              Novo cartao
            </button>
          </div>
        </div>

        <Metric
          icon={<CreditCard className="h-5 w-5" />}
          label="Cartoes ativos"
          value={`${cardAccounts.filter(card => card.active).length}`}
          detail={`${cardAccounts.length} cadastrados`}
        />
        <Metric
          icon={<FolderClock className="h-5 w-5" />}
          label="Compras em aberto"
          value={formatCurrency(totalOpen)}
          detail={`${cardPurchases.length} compras importadas`}
        />
        <Metric
          icon={<Receipt className="h-5 w-5" />}
          label="Faturas pendentes"
          value={formatCurrency(totalPendingInvoices)}
          detail={nextInvoice ? `Proxima: ${formatDate(nextInvoice.dueDate)}` : 'Nenhuma fatura pendente'}
        />
      </section>

      <section className="dark-surface rounded-[20px] sm:rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Analise do cartao
            </p>
            <h3 className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
              Onde a fatura pesa e o que ainda esta aberto
            </h3>
            <p className="mt-2 text-sm leading-6 sm:leading-7 text-slate-400">
              O resumo do cartao olha o mes de pagamento da fatura e separa o que ainda nao entrou no caixa.
            </p>
          </div>

          <div className="w-full lg:w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Mes analisado
            </p>
            <select
              value={selectedMonth}
              onChange={event => setSelectedMonth(event.target.value)}
              className="dashboard-select mt-3 w-full appearance-none rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition"
            >
              {monthOptions.map(month => (
                <option key={month} value={month}>
                  {getMonthLabel(month)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <HighlightMetric
            label="Fatura do mes"
            value={formatCurrency(selectedBreakdown?.invoiceBreakdown.total || 0)}
            detail={`${selectedInvoices.length} fatura${selectedInvoices.length !== 1 ? 's' : ''} neste ciclo`}
          />
          <HighlightMetric
            label="Compras abertas"
            value={formatCurrency(selectedBreakdown?.openBreakdown.total || 0)}
            detail={`${selectedOpenPurchases.length} compra${selectedOpenPurchases.length !== 1 ? 's' : ''} ainda fora do caixa`}
          />
          <HighlightMetric
            label="Apos fechamento"
            value={formatCurrency(selectedBreakdown?.afterClosingTotal || 0)}
            detail={`${selectedBreakdown?.afterClosingCount || 0} compra${selectedBreakdown?.afterClosingCount !== 1 ? 's' : ''} vao para meses futuros`}
          />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <BreakdownBlock
            title="Fatura do mes"
            description="O que ja virou gasto do mes e vai aparecer no seu caixa."
            breakdown={selectedBreakdown?.invoiceBreakdown || emptyBreakdown()}
            tone="invoice"
          />
          <BreakdownBlock
            title="Compras abertas"
            description="O que voce ja comprou, mas ainda nao virou gasto mensal."
            breakdown={selectedBreakdown?.openBreakdown || emptyBreakdown()}
            tone="open"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="dark-surface rounded-[20px] sm:rounded-[28px] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
                Cartoes
              </p>
              <h3 className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
                Cadastro e configuracao
              </h3>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {cardAccounts.length === 0 ? (
              <EmptyBlock message="Nenhum cartao cadastrado ainda. Crie o primeiro para liberar a importacao de faturas." />
            ) : (
              cardAccounts.map(card => (
                <div key={card.id} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-extrabold text-white shadow-md"
                        style={{ backgroundColor: card.color }}
                      >
                        {card.letter}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{card.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {card.bankName} - fecha dia {card.closingDay} - vence dia {card.dueDay}
                        </p>
                        <p className="mt-2 text-xs text-cyan-100">
                          Formatos: {card.supportedFormats.join(' + ').toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => openEditCard(card)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08]"
                      title="Editar cartao"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dark-surface rounded-[20px] sm:rounded-[28px] p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-100">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
                Proxima leitura
              </p>
              <h3 className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
                Faturas do ciclo
              </h3>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {cardInvoices.length === 0 ? (
              <EmptyBlock message="Ainda nao ha faturas calculadas. Importe um CSV ou PDF na aba de importacao." />
            ) : (
              cardInvoices.map(invoice => {
                const expanded = expandedInvoice === invoice.id;
                return (
                  <div key={invoice.id} className="rounded-[24px] border border-white/8 bg-white/[0.03]">
                    <button
                      onClick={() => setExpandedInvoice(expanded ? null : invoice.id)}
                      className="w-full p-4 text-left"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{invoice.cardName}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            Fecha em {formatDate(invoice.closeDate)} - vence em {formatDate(invoice.dueDate)}
                          </p>
                          <p className="mt-2 text-xs text-cyan-100">
                            Fatura de {getMonthLabel(invoice.paymentMonth)}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-lg font-semibold text-white">{formatCurrency(invoice.total)}</p>
                          <p className={`mt-1 text-xs font-semibold ${invoice.paid ? 'text-emerald-200' : invoice.status === 'aberta' ? 'text-amber-100' : 'text-cyan-100'}`}>
                            {invoice.paid ? 'Fatura paga' : invoice.status === 'aberta' ? 'Ciclo ainda aberto' : 'Fatura fechada'}
                          </p>
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-white/8 px-4 pb-4">
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
                          <button
                            onClick={() => markInvoicePaid(invoice.id, !invoice.paid)}
                            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                              invoice.paid
                                ? 'border border-white/10 bg-white/[0.04] text-slate-200'
                                : 'bg-emerald-400 text-slate-950'
                            }`}
                          >
                            {invoice.paid ? 'Marcar como pendente' : 'Marcar como paga'}
                          </button>
                          <div className="text-xs text-slate-400">
                            {invoice.purchases.length} compra{invoice.purchases.length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3">
                          {invoice.purchases.map(purchase => (
                            <div key={purchase.id} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white">{purchase.description}</p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {formatDate(purchase.date)} - {purchase.category}
                                  </p>
                                </div>
                                <p className="text-sm font-semibold text-amber-100">{formatCurrency(purchase.amount)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="dark-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-100">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Compras futuras
            </p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-white">
              O que ainda nao virou gasto do mes
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {cardPurchases.filter(purchase => purchase.status !== 'paga').length === 0 ? (
            <EmptyBlock message="Nao ha compras em aberto no momento." />
          ) : (
            cardPurchases
              .filter(purchase => purchase.status !== 'paga')
              .slice(0, 12)
              .map(purchase => (
                <div key={purchase.id} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{purchase.description}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {purchase.cardName} - {formatDate(purchase.date)} - cai em {getMonthLabel(purchase.paymentMonth)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-amber-100">{formatCurrency(purchase.amount)}</p>
                  </div>
                </div>
              ))
          )}
        </div>
      </section>

      {editorOpen && (
        <CardAccountModal
          key={editingCard?.id || 'new-card'}
          initialCard={editingCard}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveCard}
        />
      )}
    </div>
  );
}

function emptyBreakdown(): ExpenseBreakdown {
  return {
    byCategory: [],
    byType: [],
    topMerchants: [],
    largestCategory: null,
    total: 0,
  };
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            {label}
          </p>
          <p className="mt-4 font-display text-3xl font-semibold text-cyan-100">{value}</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-100">
          {icon}
        </div>
      </div>
    </article>
  );
}

function HighlightMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold text-cyan-100">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}

function BreakdownBlock({
  title,
  description,
  breakdown,
  tone,
}: {
  title: string;
  description: string;
  breakdown: ExpenseBreakdown;
  tone: 'invoice' | 'open';
}) {
  const accentClass = tone === 'invoice' ? 'text-amber-100' : 'text-cyan-100';
  const barClass = tone === 'invoice' ? 'from-amber-300 to-rose-400' : 'from-cyan-300 to-blue-400';

  return (
    <article className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-6 text-slate-400">{description}</p>
        </div>
        <div className={`rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2 text-sm font-semibold ${accentClass}`}>
          {formatCurrency(breakdown.total)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniInsight
          label="Maior categoria"
          value={breakdown.largestCategory?.label || 'Sem destaque'}
          hint={
            breakdown.largestCategory
              ? `${formatCurrency(breakdown.largestCategory.amount)} - ${(breakdown.largestCategory.share * 100).toFixed(0)}%`
              : 'Sem gastos suficientes'
          }
        />
        <MiniInsight
          label="Top comerciante"
          value={breakdown.topMerchants[0]?.label || 'Sem destaque'}
          hint={
            breakdown.topMerchants[0]
              ? `${formatCurrency(breakdown.topMerchants[0].amount)} no periodo`
              : 'Sem dados suficientes'
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownList title="Por categoria" items={breakdown.byCategory} barClass={barClass} />
        <BreakdownList title="Por tipo" items={breakdown.byType} barClass={barClass} />
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Top 3 comerciantes
        </p>
        <div className="mt-3 grid gap-2">
          {breakdown.topMerchants.length ? (
            breakdown.topMerchants.map(item => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/30 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.count} lancamento{item.count !== 1 ? 's' : ''}</p>
                </div>
                <p className={`text-sm font-semibold ${accentClass}`}>{formatCurrency(item.amount)}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/20 px-3 py-4 text-sm text-slate-400">
              Sem dados suficientes para destacar comerciantes.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function BreakdownList({
  title,
  items,
  barClass,
}: {
  title: string;
  items: ExpenseBreakdownItem[];
  barClass: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-slate-950/22 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2.5">
        {items.length ? (
          items.slice(0, 6).map(item => (
            <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.count} lancamento{item.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-100">{formatCurrency(item.amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">{(item.share * 100).toFixed(0)}%</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full bg-gradient-to-r ${barClass}`} style={{ width: `${Math.max(item.share * 100, 6)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-400">
            Sem gastos suficientes neste periodo.
          </div>
        )}
      </div>
    </div>
  );
}

function MiniInsight({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
