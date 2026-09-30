import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/useFinance';
import { formatCurrency, getMonthLabel } from '../utils/parser';
import {
  buildCategoryHistory,
  MAX_HISTORY_MONTHS,
  mergeCategoryItems,
  monthOf,
  OTHER_CATEGORY,
  projectSpending,
} from '../utils/projection';
import type { MonthSpend } from '../utils/projection';

// Paleta categórica validada para a superfície escura do painel (#0c111f):
// ordem fixa, a cor segue a categoria e não a posição no mês.
const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const OTHER_COLOR = '#64748b';
const SURFACE = '#0c111f';
const REAL_COLOR = '#3987e5';
const PROJECTION_COLOR = '#d95926';
const PROJECTION_HORIZON = 3;

const axisStyle = { fontSize: 12, fill: '#94a3b8' } as const;
const tooltipStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(6, 10, 19, 0.94)',
  boxShadow: '0 22px 50px rgba(0,0,0,0.35)',
  padding: '12px 14px',
} as const;
const legendStyle = { fontSize: 12, color: '#cbd5e1', paddingTop: 8 } as const;

function shortMonth(month: string, withYear: boolean): string {
  const label = getMonthLabel(month).slice(0, 3);
  return withYear ? `${label}/${month.slice(2, 4)}` : label;
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

// Texto da legenda na cor do texto, não da série: a bolinha já identifica a cor.
function legendText(value: string) {
  return <span style={{ color: '#cbd5e1' }}>{value}</span>;
}

function colorFor(key: string, keys: string[]): string {
  if (key === OTHER_CATEGORY) return OTHER_COLOR;
  return SERIES_COLORS[keys.indexOf(key)] ?? OTHER_COLOR;
}

export function SpendingCharts({ selectedMonth, months }: { selectedMonth: string; months: string[] }) {
  const { getMonthSummary, getMonthExpenseBreakdown, getCardExpenseBreakdown, getCardInvoicesByMonth } = useFinance();

  const categoriesOf = useMemo(
    () => (month: string) =>
      mergeCategoryItems([
        getMonthExpenseBreakdown(month).byCategory,
        getCardExpenseBreakdown(month).invoiceBreakdown.byCategory,
      ]),
    [getMonthExpenseBreakdown, getCardExpenseBreakdown]
  );

  // Janela de até 6 meses terminando no mês escolhido, do mais antigo ao mais novo.
  const windowMonths = useMemo(
    () => months.filter(month => month <= selectedMonth).slice(0, MAX_HISTORY_MONTHS).reverse(),
    [months, selectedMonth]
  );
  const crossYear = new Set(windowMonths.map(month => month.slice(0, 4))).size > 1;

  const history = useMemo(() => buildCategoryHistory(windowMonths, categoriesOf), [windowMonths, categoriesOf]);
  const historyRows = history.rows.map(row => ({ ...row, label: shortMonth(row.month, crossYear) }));

  const donutData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of categoriesOf(selectedMonth)) {
      const key = history.keys.includes(item.label) ? item.label : OTHER_CATEGORY;
      totals.set(key, (totals.get(key) || 0) + item.amount);
    }
    const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
    return history.keys
      .filter(key => (totals.get(key) || 0) > 0)
      .map(key => ({ name: key, value: totals.get(key) || 0, share: total > 0 ? (totals.get(key) || 0) / total : 0 }));
  }, [categoriesOf, selectedMonth, history.keys]);
  const donutTotal = donutData.reduce((sum, item) => sum + item.value, 0);

  const projection = useMemo(() => {
    // Meses fechados: tudo antes do mês corrente do calendário.
    const currentMonth = monthOf(new Date());
    const closed: MonthSpend[] = months
      .filter(month => month < currentMonth)
      .slice(0, MAX_HISTORY_MONTHS)
      .map(month => {
        const summary = getMonthSummary(month);
        return {
          month,
          bank: summary.totalDebito + summary.totalPix + summary.totalTransferencia,
          card: summary.totalFaturas,
        };
      });
    const result = projectSpending(closed, {
      startMonth: currentMonth,
      horizon: PROJECTION_HORIZON,
      knownCardByMonth: month => getCardInvoicesByMonth(month).reduce((sum, invoice) => sum + invoice.total, 0),
    });
    const closedAsc = closed.slice().reverse();
    const allMonths = [...closedAsc.map(item => item.month), ...result.points.map(point => point.month)];
    const withYear = new Set(allMonths.map(month => month.slice(0, 4))).size > 1;
    const currentSoFar = getMonthSummary(currentMonth).totalGastos;

    const rows = [
      ...closedAsc.map((item, index) => {
        const isLast = index === closedAsc.length - 1;
        const total = item.bank + item.card;
        // O último mês real também recebe a linha, para ela sair da barra.
        return {
          label: shortMonth(item.month, withYear),
          real: total,
          projetado: isLast ? total : undefined,
          faixa: isLast ? ([total, total] as [number, number]) : undefined,
        };
      }),
      ...result.points.map(point => ({
        label: shortMonth(point.month, withYear),
        real: point.month === currentMonth && currentSoFar > 0 ? currentSoFar : undefined,
        projetado: point.projected,
        faixa: [point.low, point.high] as [number, number],
      })),
    ];

    return { ...result, rows, currentMonth, currentSoFar, lastClosed: closedAsc[closedAsc.length - 1]?.month };
  }, [months, getMonthSummary, getCardInvoicesByMonth]);

  const nextPoint = projection.points[0];
  const committed = projection.points.reduce((sum, point) => sum + point.knownCard, 0);

  return (
    <>
      <section className="grid gap-6 xl:grid-cols-2">
        <ChartShell
          eyebrow="Gastos por categoria"
          title={`Para onde foi em ${selectedMonth ? getMonthLabel(selectedMonth).split(' ')[0] : '—'}`}
          description="Conta e faturas do mês somadas. Compras abertas ficam de fora."
        >
          {donutData.length ? (
            <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
              <div className="relative mx-auto h-[180px] w-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      stroke={SURFACE}
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {donutData.map(entry => (
                        <Cell key={entry.name} fill={colorFor(entry.name, history.keys)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={value => formatCurrency(Number(value || 0))}
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: '#cbd5e1' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Total</span>
                  <span className="mt-1 text-sm font-semibold text-slate-100">{compactCurrency(donutTotal)}</span>
                </div>
              </div>
              <ul className="grid gap-2" aria-label="Gastos por categoria no mês">
                {donutData.map(entry => (
                  <li key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: colorFor(entry.name, history.keys) }}
                      />
                      <span className="truncate text-slate-200">{entry.name}</span>
                    </span>
                    <span className="shrink-0 text-slate-300">
                      {formatCurrency(entry.value)}{' '}
                      <span className="text-xs text-slate-500">{(entry.share * 100).toFixed(0)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyChart text="Sem gastos neste mês." />
          )}
        </ChartShell>

        <ChartShell
          eyebrow="Últimos meses"
          title="Gastos por categoria, mês a mês"
          description="As 5 maiores categorias do período, cada uma sempre com a mesma cor. O resto vira Outros."
        >
          {history.keys.length ? (
            <div className="h-[260px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {/* Remonta quando as categorias mudam: o Recharts empilha na ordem em que as barras entraram. */}
                <BarChart key={history.keys.join('|')} data={historyRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={compactCurrency} width={72} />
                  <Tooltip
                    formatter={value => formatCurrency(Number(value || 0))}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
                    itemStyle={{ color: '#cbd5e1' }}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} itemSorter={null} formatter={legendText} />
                  {history.keys.map((key, index) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="categorias"
                      fill={colorFor(key, history.keys)}
                      stroke={SURFACE}
                      strokeWidth={2}
                      maxBarSize={44}
                      radius={index === history.keys.length - 1 ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart text="Importe extratos ou faturas para ver a evolução." />
          )}
        </ChartShell>
      </section>

      <section className="dark-surface rounded-[16px] sm:rounded-[24px] p-4 sm:p-6" aria-labelledby="projecao-titulo">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">Projeção de gastos</p>
        <h3 id="projecao-titulo" className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">
          Quanto deve sair nos próximos meses
        </h3>
        <p className="mt-2 text-sm leading-7 text-slate-400">
          {projection.basedOn
            ? `Baseada nos ${projection.basedOn} últimos meses fechados, com mais peso para os recentes, e nunca abaixo das faturas que você já tem para pagar. É uma estimativa para planejar, não uma promessa.`
            : 'A projeção precisa de pelo menos um mês fechado (anterior ao mês atual) com gastos importados.'}
        </p>

        {projection.basedOn > 0 && nextPoint ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StatTile
                label={`Previsto para ${getMonthLabel(nextPoint.month).split(' ')[0]}`}
                value={formatCurrency(nextPoint.projected)}
                detail={`entre ${formatCurrency(nextPoint.low)} e ${formatCurrency(nextPoint.high)}`}
              />
              <StatTile
                label="Média mensal"
                value={formatCurrency(projection.average)}
                detail={
                  Math.abs(projection.trendPerMonth) < 1
                    ? 'ritmo estável'
                    : `${projection.trendPerMonth > 0 ? 'subindo' : 'caindo'} ${formatCurrency(Math.abs(projection.trendPerMonth))} por mês`
                }
              />
              <StatTile
                label="Já comprometido no cartão"
                value={formatCurrency(committed)}
                detail={`faturas dos próximos ${PROJECTION_HORIZON} meses`}
              />
            </div>

            <div className="mt-6 h-[260px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={projection.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={compactCurrency} width={72} />
                  <Tooltip
                    formatter={(value, name) =>
                      Array.isArray(value)
                        ? [`${formatCurrency(Number(value[0]))} a ${formatCurrency(Number(value[1]))}`, name]
                        : [formatCurrency(Number(value || 0)), name]
                    }
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
                    itemStyle={{ color: '#cbd5e1' }}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  />
                  <Legend wrapperStyle={legendStyle} iconSize={10} itemSorter={null} formatter={legendText} />
                  <Area
                    dataKey="faixa"
                    name="Faixa provável"
                    fill={PROJECTION_COLOR}
                    fillOpacity={0.14}
                    stroke="none"
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Bar dataKey="real" name="Gasto real" fill={REAL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Line
                    dataKey="projetado"
                    name="Projeção"
                    stroke={PROJECTION_COLOR}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 4, fill: PROJECTION_COLOR, stroke: SURFACE, strokeWidth: 2 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {projection.currentSoFar > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                A barra de {getMonthLabel(projection.currentMonth).split(' ')[0]} mostra o que já saiu até hoje; o mês
                ainda não fechou.
              </p>
            )}
          </>
        ) : null}
      </section>
    </>
  );
}

function ChartShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="dark-surface rounded-[24px] p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">{eyebrow}</p>
      <h3 className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-400">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

