import { createContext } from 'react';
import type {
  CardAccount,
  CardExpenseBreakdown,
  CardInvoice,
  CardMonthSnapshot,
  CardPurchase,
  CategoryBudget,
  CategoryRule,
  ExpenseBreakdown,
  ExpenseBreakdownItem,
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
  budgets: CategoryBudget[];
  /** Define o teto mensal de uma categoria; null ou 0 remove. */
  setBudget: (category: string, limit: number | null) => void;
  /** Gastos do mês por categoria: saídas em conta mais faturas que vencem no mês. */
  getMonthCategoryTotals: (month: string) => ExpenseBreakdownItem[];
  addTransactions: (newTransactions: Transaction[]) => ImportMergeResult;
  addCardAccount: (card: CardAccount) => void;
  updateCardAccount: (card: CardAccount) => void;
  removeTransaction: (id: string) => void;
  updateTransaction: (transaction: Transaction) => void;
  addCardPurchases: (purchases: CardPurchase[]) => ImportMergeResult<CardPurchase>;
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
  /** Message of the last failed save, or null. Edits stay in memory and pending until a save succeeds. */
  saveError: string | null;
  retrySave: () => void;
}

export const FinanceContext = createContext<FinanceContextType | null>(null);
