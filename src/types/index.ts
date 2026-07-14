export type TransactionType = 'debito' | 'pix' | 'transferencia' | 'credito';

export type CardImportFormat = 'csv' | 'pdf';

export type ImportSource = 'bank_statement' | 'credit_card_statement';

export type CardPurchaseStatus = 'aberta' | 'fechada' | 'paga';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  bank: string;
}

export interface CardAccount {
  id: string;
  name: string;
  bankId: string;
  bankName: string;
  supportedFormats: CardImportFormat[];
  closingDay: number;
  dueDay: number;
  active: boolean;
  color: string;
  letter: string;
}

export interface CardPurchase {
  id: string;
  cardId: string;
  cardName: string;
  bankName: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  cycleMonth: string;
  paymentMonth: string;
  status: CardPurchaseStatus;
  sourceFormat: CardImportFormat;
  sourceName: string;
}

export interface CardInvoice {
  id: string;
  cardId: string;
  cardName: string;
  bankName: string;
  cycleMonth: string;
  paymentMonth: string;
  closeDate: string;
  dueDate: string;
  purchases: CardPurchase[];
  total: number;
  paid: boolean;
  status: CardPurchaseStatus;
}

export interface MonthSummary {
  month: string;
  totalDebito: number;
  totalPix: number;
  totalTransferencia: number;
  totalFaturas: number;
  totalGastos: number;
  totalEntradas: number;
  totalCartaoAberto: number;
}

export interface ExpenseBreakdownItem {
  label: string;
  amount: number;
  share: number;
  count: number;
}

export interface ExpenseBreakdown {
  byCategory: ExpenseBreakdownItem[];
  byType: ExpenseBreakdownItem[];
  topMerchants: ExpenseBreakdownItem[];
  largestCategory: ExpenseBreakdownItem | null;
  total: number;
}

export interface CardExpenseBreakdown {
  month: string;
  invoiceBreakdown: ExpenseBreakdown;
  openBreakdown: ExpenseBreakdown;
  afterClosingCount: number;
  afterClosingTotal: number;
}

export interface MonthComparisonSummary {
  currentTotal: number;
  previousTotal: number;
  deltaAmount: number;
  deltaPercent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface CardMonthSnapshot {
  month: string;
  invoicesToPay: CardInvoice[];
  upcomingInvoices: CardInvoice[];
  openPurchases: CardPurchase[];
  currentOpenTotal: number;
  totalInvoicesToPay: number;
}

export interface AppState {
  transactions: Transaction[];
  cards: CardAccount[];
  cardPurchases: CardPurchase[];
  invoices: CardInvoice[];
}

export interface CategoryRule {
  id: string;
  matchText: string;
  category: string;
  enabled: boolean;
}

export type TabType = 'dashboard' | 'transacoes' | 'importar' | 'credito' | 'regras';
