import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, PiggyBank, Sparkles, Trash2 } from 'lucide-react';
import { useFinance } from '../context/useFinance';
import { formatCurrency, getMonthLabel } from '../utils/parser';
import { monthOf } from '../utils/projection';
import { budgetId, buildBudgetReport, suggestBudgets } from '../utils/budget';
import type { BudgetRow, BudgetStatus } from '../utils/budget';

const STATUS_STYLE: Record<BudgetStatus, { label: string; bar: string; text: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: 'Dentro do teto', bar: 'bg-emerald-400', text: 'text-emerald-200', Icon: CheckCircle2 },
  atencao: { label: 'Atenção', bar: 'bg-amber-400', text: 'text-amber-200', Icon: AlertTriangle },
  estourou: { label: 'Estourou', bar: 'bg-rose-400', text: 'text-rose-200', Icon: CircleAlert },
};

/** Lê "1.500,50", "1500.5" ou "1500" como número; null se não for um valor. */
function parseAmount(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function BudgetView() {
  const { budgets, setBudget, getMonthCategoryTotals, getAvailableMonths } = useFinance();
  const currentMonth = monthOf(new Date());
  const months = useMemo(() => {
    const all = new Set([currentMonth, ...getAvailableMonths()]);
    return Array.from(all).sort().reverse();
  }, [currentMonth, getAvailableMonths]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const report = useMemo(
    () => buildBudgetReport(budgets, getMonthCategoryTotals(selectedMonth)),
    [budgets, getMonthCategoryTotals, selectedMonth]
  );

  const suggestions = useMemo(() => {
    const closed = getAvailableMonths().filter(month => month < currentMonth);
    return new Map(suggestBudgets(closed, getMonthCategoryTotals).map(item => [item.category, item.suggested]));
  }, [getAvailableMonths, getMonthCategoryTotals, currentMonth]);

  const budgetedIds = new Set(budgets.map(budget => budget.id));
  const hasBudget = (category: string) => budgetedIds.has(budgetId(category));
  const pendingSuggestions = Array.from(suggestions.entries()).filter(([category]) => !hasBudget(category));
  // Categorias sem teto: as que tiveram gasto no mês e as que têm sugestão.
  const withoutBudget = Array.from(
    new Set([...report.unbudgeted.map(item => item.label), ...pendingSuggestions.map(([category]) => category)])
  )
    .filter(category => !hasBudget(category))
    .map(category => ({
      category,
      spent: report.unbudgeted.find(item => item.label === category)?.amount || 0,
      suggested: suggestions.get(category) || 0,
    }))
    .sort((a, b) => b.suggested - a.suggested || b.spent - a.spent || a.category.localeCompare(b.category));

  function applyAllSuggestions() {
    for (const [category, suggested] of pendingSuggestions) setBudget(category, suggested);
  }

  const remaining = report.totalLimit - report.totalBudgetedSpent;

  return (
    <div className="dashboard-shell p-4 sm:p-6">
      <section className="dashboard-hero animate-fade-in">
        <div className="relative z-10 grid gap-4 sm:gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/55">Orçamento</p>
            <h2 className="font-display mt-2 sm:mt-3 text-xl sm:text-3xl xl:text-4xl font-semibold text-white">
              Um teto por categoria
            </h2>
            <p className="mt-2 sm:mt-4 max-w-2xl text-sm leading-6 sm:leading-7 text-slate-300 sm:text-base">
              Defina quanto quer gastar por mês em cada categoria. O gasto conta do mesmo jeito que o painel: saídas em
              conta mais as faturas que vencem no mês.
            </p>
          </div>

          <div className="dark-surface-soft rounded-[16px] sm:rounded-[24px] p-4 sm:p-5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400" htmlFor="budget-month">
              Mês
            </label>
            <select
              id="budget-month"
              value={selectedMonth}
              onChange={event => setSelectedMonth(event.target.value)}
              className="dashboard-select mt-4 w-full appearance-none rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition"
            >
              {months.map(month => (
                <option key={month} value={month}>
                  {getMonthLabel(month)}
                  {month === currentMonth ? ' (atual)' : ''}
                </option>
              ))}
            </select>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <Tile label="Orçado" value={formatCurrency(report.totalLimit)} detail={`${report.rows.length} categorias com teto`} />
              <Tile
                label="Gasto nas categorias com teto"
                value={formatCurrency(report.totalBudgetedSpent)}
                detail={
                  report.totalLimit > 0
                    ? `${((report.totalBudgetedSpent / report.totalLimit) * 100).toFixed(0)}% do orçado`
                    : 'nenhum teto definido'
                }
              />
              <Tile
                label={remaining >= 0 ? 'Ainda cabe' : 'Passou do orçado'}
                value={formatCurrency(Math.abs(remaining))}
                detail={`gasto total do mês: ${formatCurrency(report.totalSpent)}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="dark-surface rounded-[16px] sm:rounded-[24px] p-4 sm:p-6" aria-labelledby="budget-rows-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              {getMonthLabel(selectedMonth)}
            </p>
            <h3 id="budget-rows-title" className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
              Categorias com teto
            </h3>
          </div>
          {pendingSuggestions.length > 0 && (
            <button
              type="button"
              onClick={applyAllSuggestions}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_14px_28px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200"
            >
              <Sparkles className="h-4 w-4" />
              Usar as {pendingSuggestions.length} sugestões
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3">
          {report.rows.length ? (
            report.rows.map(row => (
              <BudgetRowCard
                key={row.category}
                row={row}
                suggested={suggestions.get(row.category)}
                onChange={limit => setBudget(row.category, limit)}
              />
            ))
          ) : (
            <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
              <PiggyBank className="mx-auto mb-3 h-6 w-6 text-cyan-200" />
              Nenhuma categoria com teto ainda.{' '}
              {pendingSuggestions.length
                ? 'Use as sugestões acima ou defina um valor em cada categoria abaixo.'
                : 'Importe extratos ou faturas de meses anteriores para receber sugestões, ou defina um valor abaixo.'}
            </div>
          )}
        </div>
      </section>

      {withoutBudget.length > 0 && (
        <section className="dark-surface rounded-[16px] sm:rounded-[24px] p-4 sm:p-6" aria-labelledby="budget-free-title">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">Sem teto</p>
          <h3 id="budget-free-title" className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
            Categorias sem orçamento
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            A sugestão é a média dos últimos meses fechados, com mais peso para os recentes, arredondada para cima.
          </p>
          <div className="mt-5 grid gap-2">
            {withoutBudget.map(item => (
              <FreeCategoryRow
                key={item.category}
                category={item.category}
                spent={item.spent}
                suggested={item.suggested}
                onSet={limit => setBudget(item.category, limit)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function AmountInput({
  value,
  label,
  onCommit,
}: {
  value: number | null;
  label: string;
  onCommit: (value: number | null) => void;
}) {
  const shown = value ? value.toFixed(2).replace('.', ',') : '';
  const [draft, setDraft] = useState(shown);
  const [base, setBase] = useState(shown);
  if (base !== shown) {
    // O valor mudou fora deste campo (sugestão aplicada, outro aparelho).
    setBase(shown);
    setDraft(shown);
  }

  function commit() {
    const parsed = parseAmount(draft);
    // Texto que não é valor volta ao que estava; só o campo vazio remove o teto.
    if (parsed === null && draft.trim() !== '') {
      setDraft(shown);
      return;
    }
    if (parsed === value || (parsed === null && value === null)) return;
    onCommit(parsed !== null && parsed > 0 ? Math.round(parsed * 100) / 100 : null);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') setDraft(shown);
  }

  return (
    <div className="flex items-center rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 focus-within:border-cyan-300/60">
      <span className="text-xs text-slate-500">R$</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft}
        placeholder="0,00"
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="ml-2 w-24 bg-transparent text-right text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-600"
      />
    </div>
  );
}

function BudgetRowCard({
  row,
  suggested,
  onChange,
}: {
  row: BudgetRow;
  suggested: number | undefined;
  onChange: (limit: number | null) => void;
}) {
  const style = STATUS_STYLE[row.status];
  const left = row.limit - row.spent;

  return (
    <article className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4" aria-label={`Teto de ${row.category}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{row.category}</p>
          <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${style.text}`}>
            <style.Icon className="h-3.5 w-3.5" aria-hidden />
            {style.label} · {(row.ratio * 100).toFixed(0)}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AmountInput value={row.limit} label={`Teto mensal de ${row.category}`} onCommit={onChange} />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shell-icon-button h-9 w-9 rounded-xl"
            title={`Remover o teto de ${row.category}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label={`Uso do teto de ${row.category}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(row.ratio * 100))}
      >
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.min(row.ratio * 100, 100)}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
        <span>
          Gasto {formatCurrency(row.spent)} de {formatCurrency(row.limit)}
        </span>
        <span>
          {left >= 0 ? `Faltam ${formatCurrency(left)}` : `Passou ${formatCurrency(-left)}`}
          {suggested !== undefined && suggested !== row.limit && (
            <span className="text-slate-500"> · sugestão {formatCurrency(suggested)}</span>
          )}
        </span>
      </div>
    </article>
  );
}

function FreeCategoryRow({
  category,
  spent,
  suggested,
  onSet,
}: {
  category: string;
  spent: number;
  suggested: number;
  onSet: (limit: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/30 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100">{category}</p>
        <p className="mt-1 text-xs text-slate-500">
          Gasto no mês {formatCurrency(spent)}
          {suggested > 0 ? ` · sugestão ${formatCurrency(suggested)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {suggested > 0 && (
          <button
            type="button"
            onClick={() => onSet(suggested)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            Usar sugestão
          </button>
        )}
        <AmountInput value={null} label={`Teto mensal de ${category}`} onCommit={onSet} />
      </div>
    </div>
  );
}
