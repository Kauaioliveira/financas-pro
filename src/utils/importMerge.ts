import type { Transaction } from '../types';

export interface ImportMergeResult {
  /** Transações do arquivo que entraram no cofre, na ordem do arquivo. */
  added: Transaction[];
  /** Transações do arquivo que já estavam no cofre. */
  skipped: Transaction[];
}

function normalizeDescription(description: string): string {
  return (description || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function transactionKey(
  transaction: Pick<Transaction, 'date' | 'description' | 'amount' | 'bank'>
): string {
  return `${transaction.date}|${normalizeDescription(transaction.description)}|${transaction.amount}|${transaction.bank}`;
}

/**
 * Decide quais transações de um arquivo importado são novas.
 *
 * Compara como multiconjunto: se o cofre já tem 1 café de R$ 8,00 no dia 10 e
 * o arquivo traz 2, entra 1. Assim compras idênticas no mesmo dia sobrevivem,
 * e reimportar o mesmo arquivo — ou um extrato com período sobreposto — não
 * duplica nada.
 */
export function mergeImportedTransactions(
  existing: Transaction[],
  incoming: Transaction[]
): ImportMergeResult {
  const existingIds = new Set(existing.map(transaction => transaction.id));
  const remaining = new Map<string, number>();
  for (const transaction of existing) {
    const key = transactionKey(transaction);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const added: Transaction[] = [];
  const skipped: Transaction[] = [];
  for (const transaction of incoming) {
    if (existingIds.has(transaction.id)) {
      skipped.push(transaction);
      continue;
    }
    const key = transactionKey(transaction);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      skipped.push(transaction);
    } else {
      added.push(transaction);
    }
  }

  return { added, skipped };
}
