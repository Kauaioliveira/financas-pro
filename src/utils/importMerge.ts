import type { CardPurchase, Transaction } from '../types';

export interface ImportMergeResult<T = Transaction> {
  /** Itens do arquivo que entraram no cofre, na ordem do arquivo. */
  added: T[];
  /** Itens do arquivo que já estavam no cofre. */
  skipped: T[];
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
 * Chave de uma compra de cartão. Não inclui `sourceName` (nome do arquivo) nem
 * `sourceFormat`: a mesma fatura baixada de novo com outro nome, ou reenviada,
 * precisa ser reconhecida como a mesma compra.
 */
export function cardPurchaseKey(
  purchase: Pick<CardPurchase, 'cardId' | 'date' | 'description' | 'amount'>
): string {
  return `${purchase.cardId}|${purchase.date}|${normalizeDescription(purchase.description)}|${purchase.amount}`;
}

/**
 * Decide quais itens de um arquivo importado são novos.
 *
 * Compara como multiconjunto: se o cofre já tem 1 café de R$ 8,00 no dia 10 e
 * o arquivo traz 2, entra 1. Assim compras idênticas no mesmo dia sobrevivem,
 * e reimportar o mesmo arquivo — ou um arquivo com período sobreposto — não
 * duplica nada.
 */
export function mergeImported<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string
): ImportMergeResult<T> {
  const existingIds = new Set(existing.map(item => item.id));
  const remaining = new Map<string, number>();
  for (const item of existing) {
    const key = keyOf(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const added: T[] = [];
  const skipped: T[] = [];
  for (const item of incoming) {
    if (existingIds.has(item.id)) {
      skipped.push(item);
      continue;
    }
    const key = keyOf(item);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      skipped.push(item);
    } else {
      added.push(item);
    }
  }

  return { added, skipped };
}

export function mergeImportedTransactions(
  existing: Transaction[],
  incoming: Transaction[]
): ImportMergeResult {
  return mergeImported(existing, incoming, transactionKey);
}

export function mergeImportedCardPurchases(
  existing: CardPurchase[],
  incoming: CardPurchase[]
): ImportMergeResult<CardPurchase> {
  return mergeImported(existing, incoming, cardPurchaseKey);
}
