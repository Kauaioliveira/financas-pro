import type { CardAccount, CardImportFormat, CardPurchase } from '../types';
import { getInvoiceCloseDate, getInvoiceDueDate } from './credit';
import type { ImportMergeResult } from './importMerge';

export interface InvoicePreviewGroup {
  /** Mesmo formato do id de `CardInvoice`: `cardId:cycleMonth`. */
  id: string;
  cycleMonth: string;
  /** Mês em que o total da fatura entra nos gastos. */
  paymentMonth: string;
  closeDate: string;
  dueDate: string;
  purchases: CardPurchase[];
  total: number;
}

/**
 * Agrupa as compras lidas de um arquivo pela fatura em que cada uma cai, usando
 * o fechamento e o vencimento do cartão. Serve só para a pré-visualização: as
 * faturas de verdade continuam sendo calculadas no FinanceContext.
 */
export function groupPurchasesByInvoice(
  purchases: CardPurchase[],
  card: Pick<CardAccount, 'id' | 'closingDay' | 'dueDay'>
): InvoicePreviewGroup[] {
  const byCycle = new Map<string, CardPurchase[]>();
  for (const purchase of purchases) {
    const current = byCycle.get(purchase.cycleMonth) ?? [];
    current.push(purchase);
    byCycle.set(purchase.cycleMonth, current);
  }

  return Array.from(byCycle.entries())
    .map(([cycleMonth, groupPurchases]) => {
      const dueDate = getInvoiceDueDate(cycleMonth, card.closingDay, card.dueDay);
      return {
        id: `${card.id}:${cycleMonth}`,
        cycleMonth,
        paymentMonth: dueDate.slice(0, 7),
        closeDate: getInvoiceCloseDate(cycleMonth, card.closingDay),
        dueDate,
        purchases: groupPurchases
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)),
        total: groupPurchases.reduce((sum, purchase) => sum + Math.abs(purchase.amount), 0),
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Formato do arquivo da fatura pela extensão; `null` se não for CSV nem PDF. */
export function getCardFileFormat(fileName: string): CardImportFormat | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.csv')) return 'csv';
  return null;
}

/**
 * Traduz erros de leitura da fatura em mensagens com caminho de recuperação.
 *
 * Nunca repassa `err.message` desconhecida: o leitor de PDF genérico inclui um
 * trecho do texto da fatura na mensagem, e esse conteúdo não deve ir para a tela.
 */
export function describeCardStatementError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : '';

  if (name === 'PasswordException') {
    return 'Esse PDF está protegido por senha. Baixe a fatura de novo no app do banco sem senha, ou envie o CSV.';
  }
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
    return 'Esse arquivo não abriu como PDF — pode estar corrompido ou incompleto. Baixe a fatura de novo e tente outra vez.';
  }
  if (message.startsWith('Nao consegui identificar compras')) {
    return 'Não encontramos compras nesse PDF. Confira se é a fatura do cartão (e não o extrato da conta) e se o PDF tem texto selecionável — PDF escaneado ou foto não funciona. Se o banco oferecer, envie o CSV.';
  }
  if (message.includes('extrato da conta digital Neon')) {
    return 'Esse PDF parece ser o extrato da conta Neon, não a fatura do cartão. Importe-o na aba Importar Extrato.';
  }
  if (message.startsWith('CSV do cartao sem cabecalho') || message.startsWith('Nao encontrei colunas')) {
    return 'Não encontramos as colunas de data, descrição e valor nesse CSV. Confira se é o CSV da fatura exportado pelo banco, sem linhas extras antes do cabeçalho.';
  }
  return 'Não foi possível ler esse arquivo. Confira se é a fatura do cartão em CSV ou em PDF com texto selecionável.';
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function describeCardImportResult({ added, skipped }: ImportMergeResult<CardPurchase>): string {
  if (added.length === 0) {
    return skipped.length === 1
      ? 'Nada novo para importar: a compra deste arquivo já estava no app.'
      : `Nada novo para importar: as ${skipped.length} compras deste arquivo já estavam no app.`;
  }
  const addedText = `${added.length} ${plural(added.length, 'compra importada', 'compras importadas')}`;
  if (skipped.length === 0) return `${addedText}.`;
  return `${addedText} · ${skipped.length} ${plural(
    skipped.length,
    'já existia e foi ignorada',
    'já existiam e foram ignoradas'
  )}.`;
}
