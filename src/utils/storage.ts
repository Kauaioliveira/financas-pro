import type {
  CardAccount,
  CardInvoice,
  CardPurchase,
  CategoryRule,
  Transaction,
} from '../types';

const TRANSACTIONS_KEY = 'financaspro_transactions';
const CARDS_KEY = 'financaspro_cards';
const CARD_PURCHASES_KEY = 'financaspro_card_purchases';
const INVOICES_KEY = 'financaspro_invoices';
const RULES_KEY = 'financaspro_rules';

function readArray<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadTransactions(): Transaction[] {
  return readArray<Transaction>(TRANSACTIONS_KEY);
}

function safeSave(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.code === 22 || err.code === 1014 || err.name === 'QuotaExceededError');
    if (!import.meta.env.PROD) {
      console.error(
        isQuota
          ? `[storage] localStorage cheio ao salvar ${key}. Considere limpar dados ou exportar um backup.`
          : `[storage] Erro ao salvar ${key}.`,
        err
      );
    }
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  safeSave(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

export function loadCards(): CardAccount[] {
  return readArray<CardAccount>(CARDS_KEY);
}

export function saveCards(cards: CardAccount[]): void {
  safeSave(CARDS_KEY, JSON.stringify(cards));
}

export function loadCardPurchases(): CardPurchase[] {
  return readArray<CardPurchase>(CARD_PURCHASES_KEY);
}

export function saveCardPurchases(purchases: CardPurchase[]): void {
  safeSave(CARD_PURCHASES_KEY, JSON.stringify(purchases));
}

export function loadInvoices(): CardInvoice[] {
  return readArray<CardInvoice>(INVOICES_KEY);
}

export function saveInvoices(invoices: CardInvoice[]): void {
  safeSave(INVOICES_KEY, JSON.stringify(invoices));
}

export function loadRules(): CategoryRule[] {
  return readArray<CategoryRule>(RULES_KEY);
}

export function saveRules(rules: CategoryRule[]): void {
  safeSave(RULES_KEY, JSON.stringify(rules));
}

export function clearStoredFinanceData(): void {
  localStorage.removeItem(TRANSACTIONS_KEY);
  localStorage.removeItem(CARDS_KEY);
  localStorage.removeItem(CARD_PURCHASES_KEY);
  localStorage.removeItem(INVOICES_KEY);
  localStorage.removeItem(RULES_KEY);
}

export function exportData(): string {
  const data = {
    transactions: loadTransactions(),
    cards: loadCards(),
    cardPurchases: loadCardPurchases(),
    invoices: loadInvoices(),
    rules: loadRules(),
    exportDate: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

export function importData(jsonString: string): {
  transactions: Transaction[];
  cards: CardAccount[];
  cardPurchases: CardPurchase[];
  invoices: CardInvoice[];
  rules?: CategoryRule[];
} {
  const data = JSON.parse(jsonString);
  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    cards: Array.isArray(data.cards) ? data.cards : [],
    cardPurchases: Array.isArray(data.cardPurchases) ? data.cardPurchases : [],
    invoices: Array.isArray(data.invoices) ? data.invoices : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
  };
}
