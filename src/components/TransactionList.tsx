import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Filter,
  Hash,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useFinance } from '../context/useFinance';
import { formatCurrency, formatDate, getMonthLabel } from '../utils/parser';
import {
  getTypeColor,
  getTypeLabel,
  isInvoicePaymentTransaction,
} from '../utils/categorize';
import type { TransactionType } from '../types';

export function TransactionList() {
  const { transactions, removeTransaction } = useFinance();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const months = useMemo(() => {
    return Array.from(
      new Set(transactions.map(transaction => transaction.date.slice(0, 7)))
    ).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter(transaction => {
        if (!search) return true;
        const lower = search.toLowerCase();
        return (
          transaction.description.toLowerCase().includes(lower) ||
          transaction.category.toLowerCase().includes(lower) ||
          transaction.bank.toLowerCase().includes(lower)
        );
      })
      .filter(transaction => (filterType === 'all' ? true : transaction.type === filterType))
      .filter(transaction => (filterMonth === 'all' ? true : transaction.date.startsWith(filterMonth)))
      .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
  }, [transactions, search, filterType, filterMonth]);

  const totalEntradas = filtered
    .filter(transaction => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const totalSaidas = filtered
    .filter(
      transaction =>
        transaction.amount < 0 &&
        !isInvoicePaymentTransaction(transaction.description, transaction.category)
    )
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  function handleDelete(id: string) {
    if (confirmDelete === id) {
      removeTransaction(id);
      setConfirmDelete(null);
      return;
    }
    setConfirmDelete(id);
    setTimeout(() => setConfirmDelete(current => (current === id ? null : current)), 3000);
  }

  return (
    <div className="page-wrap">
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-200" />}
          label="Entradas"
          value={formatCurrency(totalEntradas)}
        />
        <SummaryCard
          icon={<TrendingDown className="h-5 w-5 text-rose-200" />}
          label="Saidas"
          value={formatCurrency(totalSaidas)}
        />
        <SummaryCard
          icon={<Hash className="h-5 w-5 text-cyan-100" />}
          label="Movimentos"
          value={`${filtered.length}`}
        />
      </section>

      <section className="dark-surface rounded-[20px] sm:rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar descricao, categoria ou banco"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={filterType}
                onChange={event => setFilterType(event.target.value as TransactionType | 'all')}
                className="bg-transparent text-sm text-slate-100 outline-none"
              >
                <option value="all">Todos os tipos</option>
                <option value="debito">Debito</option>
                <option value="pix">PIX</option>
                <option value="transferencia">Transferencia</option>
                <option value="credito">Credito</option>
              </select>
            </label>
            <select
              value={filterMonth}
              onChange={event => setFilterMonth(event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40"
            >
              <option value="all">Todos os meses</option>
              {months.map(month => (
                <option key={month} value={month}>
                  {getMonthLabel(month)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        {filtered.length === 0 ? (
          <div className="dark-surface rounded-[28px] px-5 py-10 text-center text-sm text-slate-400">
            {transactions.length === 0
              ? 'Nenhuma transação importada ainda. Vá em "Importar Extrato" para começar.'
              : 'Nenhuma transação encontrada com esse filtro. Tente alterar o tipo, mês ou busca.'}
          </div>
        ) : (
          filtered.map(transaction => {
            const isInvoicePayment = isInvoicePaymentTransaction(
              transaction.description,
              transaction.category
            );

            return (
              <div key={transaction.id} className="dark-surface rounded-[20px] sm:rounded-[28px] p-3.5 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <p className="text-sm font-semibold text-white">{transaction.description}</p>
                      <span
                        className="inline-flex rounded-full px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-bold text-white"
                        style={{ backgroundColor: getTypeColor(transaction.type) }}
                      >
                        {getTypeLabel(transaction.type)}
                      </span>
                      {isInvoicePayment && (
                        <span className="inline-flex rounded-full border border-cyan-300/16 bg-cyan-400/[0.10] px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-bold text-cyan-100">
                          Liquidacao da fatura
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 sm:mt-2 text-xs text-slate-400">
                      {formatDate(transaction.date)} • {transaction.category} • {transaction.bank}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-0">
                    <p
                      className={`text-sm font-semibold ${
                        transaction.amount >= 0
                          ? 'text-emerald-200'
                          : isInvoicePayment
                            ? 'text-cyan-100'
                            : 'text-rose-200'
                      }`}
                    >
                      {formatCurrency(transaction.amount)}
                    </p>
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      className={`sm:mt-2 inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold transition ${
                        confirmDelete === transaction.id
                          ? 'bg-rose-500 text-white'
                          : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmDelete === transaction.id ? 'Confirmar' : 'Remover'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="dark-surface rounded-[28px] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05]">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-xl font-semibold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
