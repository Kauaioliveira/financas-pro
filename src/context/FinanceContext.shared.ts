import { createContext } from 'react';
import type {
  CardAccount,
  CardExpenseBreakdown,
  CardInvoice,
  CardMonthSnapshot,
  CardPurchase,
  CategoryRule,
  ExpenseBreakdown,
  MonthSummary,
  MonthComparisonSummary,
  Transaction,
} from '../types';
import type { ImportMergeResult } from '../utils/importMerge';

export interface FinanceContextType {
  transactions: Transaction[];
  cardAccounts: CardAccount[];
  cardPurchases: CardPurchase[];
  cardInvoices: CardInvoice[];
  rules: CategoryRule[];
  setRules: (rules: CategoryRule[]) => void;
  addTransactions: (newTransactions: Transaction[]) => ImportMergeResult;
  addCardAccount: (card: CardAccount) => void;
  updateCardAccount: (card: CardAccount) => void;
  removeTransaction: (id: string) => void;
  updateTransaction: (transaction: Transaction) => void;
  addCardPurchases: (purchases: CardPurchase[]) => void;
  markInvoicePaid: (invoiceId: string, paid: boolean) => void;
  replaceTransactions: (transactions: Transaction[]) => void;
  reapplyCategories: () => void;
  clearAll: () => void;
  exportFinanceBackup: () => string;
  importFinanceBackup: (jsonString: string) => void;
  getMonthSummary: (month: string) => MonthSummary;
  getMonthExpenseBreakdown: (month: string) => ExpenseBreakdown;
  getCardExpenseBreakdown: (month: string) => CardExpenseBreakdown;
  getMonthComparison: (month: string) => MonthComparisonSummary;
  getAvailableMonths: () => string[];
  getCardMonthSnapshot: (month: string) => CardMonthSnapshot;
  getCardInvoicesByMonth: (month: string) => CardInvoice[];
}

export const FinanceContext = createContext<FinanceContextType | null>(null);
