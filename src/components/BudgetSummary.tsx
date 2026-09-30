import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, PiggyBank } from 'lucide-react';
import { useFinance } from '../context/useFinance';
import { formatCurrency, getMonthLabel } from '../utils/parser';
import { buildBudgetReport } from '../utils/budget';

/** Resumo do orçamento do mês no painel: total orçado contra gasto e o que passou do teto. */
export function BudgetSummary({ month, onOpenBudget }: { month: string; onOpenBudget?: () => void }) {
  const { budgets, getMonthCategoryTotals } = useFinance();
  const report = useMemo(
    () => buildBudgetReport(budgets, getMonthCategoryTotals(month)),
    [budgets, getMonthCategoryTotals, month]
  );
  const flagged = report.rows.filter(row => row.status !== 'ok');
  const usage = report.totalLimit > 0 ? report.totalBudgetedSpent / report.totalLimit : 0;

  return (
    <section className="dark-surface rounded-[16px] sm:rounded-[24px] p-4 sm:p-6" aria-labelledby="budget-summary-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
            Orçamento de {getMonthLabel(month).split(' ')[0]}
          </p>
          <h3 id="budget-summary-title" className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
            {report.rows.length
              ? `${formatCurrency(report.totalBudgetedSpent)} de ${formatCurrency(report.totalLimit)}`
              : 'Nenhum teto definido'}
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            {report.rows.length
              ? flagged.length
                ? `${flagged.length} ${flagged.length === 1 ? 'categoria pede' : 'categorias pedem'} atenção neste mês.`
                : 'Todas as categorias estão dentro do teto.'
              : 'Defina quanto quer gastar por categoria e acompanhe aqui. O app sugere os valores pela sua média.'}
          </p>
        </div>
        {onOpenBudget && (
          <button
            type="button"
            onClick={onOpenBudget}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            <PiggyBank className="h-4 w-4" />
            {report.rows.length ? 'Ver orçamento' : 'Criar orçamento'}
          </button>
        )}
      </div>

      {report.rows.length > 0 && (
        <>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-label="Uso do orçamento do mês"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(usage * 100))}
          >
            <div
              className={`h-full rounded-full ${usage >= 1 ? 'bg-rose-400' : usage >= 0.8 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(usage * 100, 100)}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {(flagged.length ? flagged : report.rows).slice(0, 4).map(row => {
              const Icon = row.status === 'estourou' ? CircleAlert : row.status === 'atencao' ? AlertTriangle : CheckCircle2;
              const tone =
                row.status === 'estourou' ? 'text-rose-200' : row.status === 'atencao' ? 'text-amber-200' : 'text-emerald-200';
              return (
                <li key={row.category} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden />
                    <span className="truncate text-slate-100">{row.category}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatCurrency(row.spent)} / {formatCurrency(row.limit)}{' '}
                    <span className={`font-semibold ${tone}`}>{(row.ratio * 100).toFixed(0)}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
