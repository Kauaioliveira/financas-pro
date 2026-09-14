import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type {
  CardAccount,
  CardExpenseBreakdown,
  CardInvoice,
  CardMonthSnapshot,
  CardPurchase,
  CategoryRule,
  ExpenseBreakdown,
  ExpenseBreakdownItem,
  MonthSummary,
  MonthComparisonSummary,
  Transaction,
} from '../types';
import { createVaultSaver } from '../lib/vault';
import type { VaultSaverStatus, VaultStore } from '../lib/vault';
import { categorizeTransaction, guessCategory, isInvoicePaymentTransaction } from '../utils/categorize';
import { mergeImportedCardPurchases, mergeImportedTransactions } from '../utils/importMerge';
import type { ImportMergeResult } from '../utils/importMerge';
import { getInvoiceCloseDate, getInvoiceDueDate, getInvoiceStatus } from '../utils/credit';
import { FinanceContext } from './FinanceContext.shared';

function getPreviousMonth(month: string): string {
  const [year, monthValue] = month.split('-').map(Number);
  const date = new Date(year, monthValue - 2, 1);
  const previousYear = date.getFullYear();
  const previousMonth = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${previousYear}-${previousMonth}`;
}

function buildBreakdownItems(
  entries: Array<{ label: string; amount: number }>
): { items: ExpenseBreakdownItem[]; total: number } {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const entry of entries) {
    const label = (entry.label || 'Outros').trim() || 'Outros';
    const amount = Math.abs(entry.amount);
    const current = totals.get(label) || { amount: 0, count: 0 };
    current.amount += amount;
    current.count += 1;
    totals.set(label, current);
  }

  const total = Array.from(totals.values()).reduce((sum, item) => sum + item.amount, 0);
  const items = Array.from(totals.entries())
    .map(([label, item]) => ({
      label,
      amount: item.amount,
      count: item.count,
      share: total > 0 ? item.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

  return { items, total };
}

function createExpenseBreakdown(
  entries: Array<{ category: string; type: string; description: string; amount: number }>
): ExpenseBreakdown {
  const byCategoryResult = buildBreakdownItems(
    entries.map(entry => ({ label: entry.category || 'Outros', amount: entry.amount }))
  );
  const byTypeResult = buildBreakdownItems(
    entries.map(entry => ({ label: entry.type || 'Outros', amount: entry.amount }))
  );
  const merchantResult = buildBreakdownItems(
    entries.map(entry => ({ label: entry.description || 'Sem descricao', amount: entry.amount }))
  );

  return {
    byCategory: byCategoryResult.items,
    byType: byTypeResult.items,
    topMerchants: merchantResult.items.slice(0, 3),
    largestCategory: byCategoryResult.items[0] || null,
    total: byCategoryResult.total,
  };
}

function recalculateInvoices(
  cards: CardAccount[],
  purchases: CardPurchase[],
  existingInvoices: CardInvoice[]
): CardInvoice[] {
  const cardMap = new Map(cards.map(card => [card.id, card]));
  const paidStatus = new Map(existingInvoices.map(invoice => [invoice.id, invoice.paid]));
  const invoiceMap = new Map<string, CardPurchase[]>();

  for (const purchase of purchases) {
    const key = `${purchase.cardId}:${purchase.cycleMonth}`;
    const current = invoiceMap.get(key) || [];
    current.push(purchase);
    invoiceMap.set(key, current);
  }

  return Array.from(invoiceMap.entries())
    .map(([key, invoicePurchases]) => {
      const [cardId, cycleMonth] = key.split(':');
      const card = cardMap.get(cardId);
      if (!card) return null;

      const closeDate = getInvoiceCloseDate(cycleMonth, card.closingDay);
      const dueDate = getInvoiceDueDate(cycleMonth, card.closingDay, card.dueDay);
      const invoiceId = `${card.id}:${cycleMonth}`;
      const paid = paidStatus.get(invoiceId) || false;

      const invoice: CardInvoice = {
        id: invoiceId,
        cardId: card.id,
        cardName: card.name,
        bankName: card.bankName,
        cycleMonth,
        paymentMonth: dueDate.slice(0, 7),
        closeDate,
        dueDate,
        purchases: invoicePurchases
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description)),
        total: invoicePurchases.reduce((sum, purchase) => sum + Math.abs(purchase.amount), 0),
        paid,
        status: 'aberta',
      };

      invoice.status = getInvoiceStatus(invoice);
      return invoice;
    })
    .filter((invoice): invoice is CardInvoice => Boolean(invoice))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function applyPurchaseStatuses(
  purchases: CardPurchase[],
  invoices: CardInvoice[]
): CardPurchase[] {
  const statusMap = new Map(invoices.map(invoice => [invoice.id, invoice.status]));
  return purchases.map(purchase => ({
    ...purchase,
    status: statusMap.get(`${purchase.cardId}:${purchase.cycleMonth}`) || 'aberta',
  }));
}

function safeArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? val : [];
}

export interface VaultLoadErrorActions {
  error: Error;
  /** Reads the vault again with the same session. */
  retry: () => void;
  /**
   * Keeps a copy of the vault that does not open, then replaces the data with a
   * backup (JSON produced by the backup importer). Throws if the copy fails.
   */
  restoreBackup: (json: string) => Promise<void>;
}

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: Error };

function saveErrorMessage(status: VaultSaverStatus): string | null {
  return status.state === 'error' ? status.error.message : null;
}

export function FinanceProvider({
  children,
  store,
  renderLoadError,
}: {
  children: ReactNode;
  /** Vault storage of the session. Mount one FinanceProvider per user (key by user id). */
  store: VaultStore;
  /** Screen shown when the vault exists but does not open. Nothing is ever saved in that state. */
  renderLoadError?: (actions: VaultLoadErrorActions) => ReactNode;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cardAccounts, setCardAccounts] = useState<CardAccount[]>([]);
  const [storedCardPurchases, setStoredCardPurchases] = useState<CardPurchase[]>([]);
  const [storedInvoices, setStoredInvoices] = useState<CardInvoice[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saver] = useState(() => createVaultSaver(store));
  const [saveError, setSaveError] = useState<string | null>(null);
  const storeRef = useRef(store);
  const loaded = loadState.status === 'ready';

  const applyData = useCallback((data: Record<string, unknown>, backupShape = false) => {
    setTransactions(safeArray(data.transactions));
    setCardAccounts(safeArray(data.cards));
    setStoredCardPurchases(safeArray(backupShape ? data.cardPurchases : data.card_purchases));
    setStoredInvoices(safeArray(data.invoices));
    if (!backupShape || data.rules !== undefined) setRules(safeArray(data.rules));
  }, []);

  // Load the vault once per mount (or per explicit retry). A new store for the same
  // user (recovery kit renewal re-encrypts the vault with a new key) must not reload:
  // the in-memory state is current and the saver writes it through the new store.
  useEffect(() => {
    let cancelled = false;
    storeRef.current.load().then(
      data => {
        if (cancelled) return;
        applyData(data);
        setLoadState({ status: 'ready' });
      },
      (err: unknown) => {
        if (cancelled) return;
        // Never mark as loaded: the persist effect below only saves when loaded.
        setLoadState({
          status: 'error',
          error: err instanceof Error ? err : new Error('Não foi possível abrir os dados.'),
        });
      },
    );
    return () => { cancelled = true; };
  }, [loadAttempt, applyData]);

  useEffect(() => {
    storeRef.current = store;
    saver.setStore(store);
  }, [saver, store]);

  useEffect(() => saver.subscribe(status => setSaveError(saveErrorMessage(status))), [saver]);

  // Persist vault data on changes (debounced). Only after a successful load.
  useEffect(() => {
    if (!loaded) return;
    saver.schedule({
      transactions,
      cards: cardAccounts,
      card_purchases: storedCardPurchases,
      invoices: storedInvoices,
      rules,
    });
  }, [loaded, saver, store, transactions, cardAccounts, storedCardPurchases, storedInvoices, rules]);

  // Pending edits are written, not dropped: when the page is hidden and when the
  // provider unmounts (sign out, lock). The saver uses the latest store, and a
  // store whose key is no longer the account's refuses to write.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') void saver.flush();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void saver.flush();
    };
  }, [saver]);

  const retrySave = useCallback(() => {
    void saver.retry();
  }, [saver]);

  const retryLoad = useCallback(() => {
    setLoadState({ status: 'loading' });
    setLoadAttempt(n => n + 1);
  }, []);

  const restoreBackupOverUnreadable = useCallback(async (json: string) => {
    const data = JSON.parse(json) as Record<string, unknown>;
    await store.preserveUnreadable();
    applyData(data, true);
    setLoadState({ status: 'ready' });
  }, [store, applyData]);

  const cardInvoices = recalculateInvoices(cardAccounts, storedCardPurchases, storedInvoices);
  const cardPurchases = applyPurchaseStatuses(storedCardPurchases, cardInvoices);

  const addTransactions = useCallback(
    (newTransactions: Transaction[]): ImportMergeResult => {
      const result = mergeImportedTransactions(transactions, newTransactions);
      if (result.added.length > 0) {
        setTransactions(prev => {
          const ids = new Set(prev.map(transaction => transaction.id));
          return [...prev, ...result.added.filter(transaction => !ids.has(transaction.id))];
        });
      }
      return result;
    },
    [transactions]
  );

  const addCardAccount = useCallback((card: CardAccount) => {
    setCardAccounts(prev => {
      const withoutSameId = prev.filter(existing => existing.id !== card.id);
      return [...withoutSameId, card].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const updateCardAccount = useCallback((card: CardAccount) => {
    setCardAccounts(prev =>
      prev
        .map(existing => (existing.id === card.id ? card : existing))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }, []);

  const addCardPurchases = useCallback(
    (incomingPurchases: CardPurchase[]): ImportMergeResult<CardPurchase> => {
      const result = mergeImportedCardPurchases(storedCardPurchases, incomingPurchases);
      if (result.added.length > 0) {
        setStoredCardPurchases(prev => {
          const ids = new Set(prev.map(purchase => purchase.id));
          return [...prev, ...result.added.filter(purchase => !ids.has(purchase.id))];
        });
      }
      return result;
    },
    [storedCardPurchases]
  );

  const markInvoicePaid = useCallback((invoiceId: string, paid: boolean) => {
    setStoredInvoices(prev => {
      const sourceInvoice = cardInvoices.find(invoice => invoice.id === invoiceId);
      if (!sourceInvoice) return prev;
      const nextInvoice = { ...sourceInvoice, paid };
      nextInvoice.status = getInvoiceStatus(nextInvoice);
      return [...prev.filter(invoice => invoice.id !== invoiceId), nextInvoice];
    });
  }, [cardInvoices]);

  const removeTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(transaction => transaction.id !== id));
  }, []);

  const updateTransaction = useCallback((transaction: Transaction) => {
    setTransactions(prev => prev.map(item => (item.id === transaction.id ? transaction : item)));
  }, []);

  const replaceTransactions = useCallback((newList: Transaction[]) => {
    setTransactions(newList);
  }, []);

  const reapplyCategories = useCallback(() => {
    setTransactions(prev =>
      prev.map(transaction => ({
        ...transaction,
        type: categorizeTransaction(transaction.description, transaction.amount),
        category: guessCategory(transaction.description, rules),
      }))
    );
    setStoredCardPurchases(prev =>
      prev.map(purchase => ({
        ...purchase,
        category: guessCategory(purchase.description, rules),
      }))
    );
  }, [rules]);

  const clearAll = useCallback(() => {
    setTransactions([]);
    setCardAccounts([]);
    setStoredCardPurchases([]);
    setStoredInvoices([]);
    setRules([]);
  }, []);

  const exportFinanceBackup = useCallback((): string => {
    return JSON.stringify({
      transactions,
      cards: cardAccounts,
      cardPurchases: storedCardPurchases,
      invoices: storedInvoices,
      rules,
      exportDate: new Date().toISOString(),
    }, null, 2);
  }, [transactions, cardAccounts, storedCardPurchases, storedInvoices, rules]);

  const importFinanceBackup = useCallback((jsonString: string) => {
    applyData(JSON.parse(jsonString), true);
  }, [applyData]);

  const getCardInvoicesByMonth = useCallback(
    (month: string) => cardInvoices.filter(invoice => invoice.paymentMonth === month),
    [cardInvoices]
  );

  const getMonthExpenseTransactions = useCallback(
    (month: string) =>
      transactions.filter(
        transaction =>
          transaction.date.startsWith(month) &&
          transaction.type !== 'credito' &&
          transaction.amount < 0 &&
          !isInvoicePaymentTransaction(transaction.description, transaction.category)
      ),
    [transactions]
  );

  const getMonthInvoicePurchases = useCallback(
    (month: string) =>
      getCardInvoicesByMonth(month).flatMap(invoice =>
        invoice.purchases.map(purchase => ({
          category: purchase.category,
          description: purchase.description,
          amount: purchase.amount,
          type: 'Cartao' as const,
        }))
      ),
    [getCardInvoicesByMonth]
  );

  const getOpenPurchasesForMonth = useCallback(
    (month: string) => cardPurchases.filter(purchase => purchase.paymentMonth > month && purchase.status !== 'paga'),
    [cardPurchases]
  );

  const getCardMonthSnapshot = useCallback(
    (month: string): CardMonthSnapshot => {
      const invoicesToPay = cardInvoices.filter(invoice => invoice.paymentMonth === month);
      const upcomingInvoices = cardInvoices.filter(invoice => invoice.paymentMonth > month && !invoice.paid);
      const openPurchases = getOpenPurchasesForMonth(month);

      return {
        month,
        invoicesToPay,
        upcomingInvoices,
        openPurchases,
        currentOpenTotal: openPurchases.reduce((sum, purchase) => sum + Math.abs(purchase.amount), 0),
        totalInvoicesToPay: invoicesToPay.reduce((sum, invoice) => sum + invoice.total, 0),
      };
    },
    [cardInvoices, getOpenPurchasesForMonth]
  );

  const getMonthSummary = useCallback(
    (month: string): MonthSummary => {
      const monthTransactions = transactions.filter(
        transaction => transaction.date.startsWith(month) && transaction.type !== 'credito'
      );
      const expenseTransactions = getMonthExpenseTransactions(month);
      const invoicesToPay = getCardInvoicesByMonth(month);
      const snapshot = getCardMonthSnapshot(month);

      const totalDebito = expenseTransactions
        .filter(transaction => transaction.type === 'debito')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
      const totalPix = expenseTransactions
        .filter(transaction => transaction.type === 'pix')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
      const totalTransferencia = expenseTransactions
        .filter(transaction => transaction.type === 'transferencia')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
      const totalFaturas = invoicesToPay.reduce((sum, invoice) => sum + invoice.total, 0);
      const totalGastos = totalDebito + totalPix + totalTransferencia + totalFaturas;
      const totalEntradas = monthTransactions
        .filter(transaction => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      return {
        month,
        totalDebito,
        totalPix,
        totalTransferencia,
        totalFaturas,
        totalGastos,
        totalEntradas,
        totalCartaoAberto: snapshot.currentOpenTotal,
      };
    },
    [transactions, getCardInvoicesByMonth, getCardMonthSnapshot, getMonthExpenseTransactions]
  );

  const getMonthExpenseBreakdown = useCallback(
    (month: string): ExpenseBreakdown => {
      const entries = getMonthExpenseTransactions(month).map(transaction => ({
        category: transaction.category,
        description: transaction.description,
        amount: transaction.amount,
        type:
          transaction.type === 'debito'
            ? 'Debito'
            : transaction.type === 'pix'
              ? 'PIX'
              : transaction.type === 'transferencia'
                ? 'Transferencia'
                : 'Credito',
      }));
      return createExpenseBreakdown(entries);
    },
    [getMonthExpenseTransactions]
  );

  const getCardExpenseBreakdown = useCallback(
    (month: string): CardExpenseBreakdown => {
      const invoiceEntries = getMonthInvoicePurchases(month);
      const openPurchases = getOpenPurchasesForMonth(month);
      const openEntries = openPurchases.map(purchase => ({
        category: purchase.category,
        description: purchase.description,
        amount: purchase.amount,
        type: 'Cartao aberto',
      }));

      return {
        month,
        invoiceBreakdown: createExpenseBreakdown(invoiceEntries),
        openBreakdown: createExpenseBreakdown(openEntries),
        afterClosingCount: openPurchases.length,
        afterClosingTotal: openPurchases.reduce((sum, purchase) => sum + Math.abs(purchase.amount), 0),
      };
    },
    [getMonthInvoicePurchases, getOpenPurchasesForMonth]
  );

  const getMonthComparison = useCallback(
    (month: string): MonthComparisonSummary => {
      const currentTotal = getMonthSummary(month).totalGastos;
      const previousTotal = getMonthSummary(getPreviousMonth(month)).totalGastos;
      const deltaAmount = currentTotal - previousTotal;
      const deltaPercent =
        previousTotal > 0 ? (deltaAmount / previousTotal) * 100 : currentTotal > 0 ? 100 : 0;
      const direction = deltaAmount === 0 ? 'flat' : deltaAmount > 0 ? 'up' : 'down';

      return { currentTotal, previousTotal, deltaAmount, deltaPercent, direction };
    },
    [getMonthSummary]
  );

  const getAvailableMonths = useCallback((): string[] => {
    const months = new Set<string>();
    for (const transaction of transactions) {
      if (transaction.type === 'credito') continue;
      months.add(transaction.date.slice(0, 7));
    }
    for (const invoice of cardInvoices) {
      months.add(invoice.paymentMonth);
    }
    return Array.from(months).sort().reverse();
  }, [transactions, cardInvoices]);

  if (loadState.status === 'error') {
    const actions = { error: loadState.error, retry: retryLoad, restoreBackup: restoreBackupOverUnreadable };
    return renderLoadError ? (
      <>{renderLoadError(actions)}</>
    ) : (
      <div className="flex h-screen items-center justify-center p-6">
        <p role="alert" className="text-sm text-rose-200">
          Não foi possível abrir seus dados neste aparelho. Nada foi apagado.
        </p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p role="status" className="text-sm text-slate-400">Desbloqueando cofre...</p>
      </div>
    );
  }

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        cardAccounts,
        cardPurchases,
        cardInvoices,
        rules,
        setRules,
        addTransactions,
        addCardAccount,
        updateCardAccount,
        removeTransaction,
        updateTransaction,
        addCardPurchases,
        markInvoicePaid,
        replaceTransactions,
        reapplyCategories,
        clearAll,
        exportFinanceBackup,
        importFinanceBackup,
        getMonthSummary,
        getMonthExpenseBreakdown,
        getCardExpenseBreakdown,
        getMonthComparison,
        getAvailableMonths,
        getCardMonthSnapshot,
        getCardInvoicesByMonth,
        saveError,
        retrySave,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}
