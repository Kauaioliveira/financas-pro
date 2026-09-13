import type { TransactionType, CategoryRule } from '../types';

const PIX_KEYWORDS = [
  'pix', 'pixenviado', 'pixrecebido', 'pix enviado', 'pix recebido',
  'pix transf', 'pagamento pix',
];

const TRANSFER_KEYWORDS = [
  'transferencia', 'ted', 'doc', 'transf',
  'transferencia enviada', 'transferencia recebida',
];

// Sem "/0": casava com qualquer data ("01/08") e virava boleto em compra de cartão.
const CREDIT_KEYWORDS = [
  'cartao', 'credito', 'fatura',
  'compra cartao', 'parcela', 'parc ',
];

// "COMPRA CARTAO DEBITO" é gasto em conta, não fatura: débito explícito vence cartão.
const EXPLICIT_DEBIT_KEYWORDS = ['debito', 'compra debito'];

const DEBIT_KEYWORDS = [
  ...EXPLICIT_DEBIT_KEYWORDS,
  'pgto', 'pagamento', 'boleto', 'tarifa', 'taxa', 'anuidade',
  'saque', 'iof',
];

export function isInvoicePaymentTransaction(description: string, category?: string): boolean {
  const lowerDescription = (description || '').toLowerCase().trim();
  const lowerCategory = (category || '').toLowerCase().trim();
  return (
    lowerCategory === 'pagamento de fatura' ||
    /pagamento\s+fatura|pagto\s+fatura|pgto\s+fatura|pagamento\s+da\s+fatura/.test(lowerDescription)
  );
}

export function categorizeTransaction(description: string, amount?: number): TransactionType {
  const lower = description.toLowerCase().trim();
  // Dinheiro entrando ("CREDITO SALARIO", "credito em conta") nunca é compra no cartão.
  const isIncoming = amount !== undefined && amount > 0;
  const isExplicitDebit = EXPLICIT_DEBIT_KEYWORDS.some(keyword => lower.includes(keyword));

  if (isInvoicePaymentTransaction(description)) return 'transferencia';
  if (PIX_KEYWORDS.some(keyword => lower.includes(keyword))) return 'pix';
  if (!isIncoming && !isExplicitDebit && CREDIT_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'credito';
  }
  if (TRANSFER_KEYWORDS.some(keyword => lower.includes(keyword))) return 'transferencia';
  if (DEBIT_KEYWORDS.some(keyword => lower.includes(keyword))) return 'debito';

  return 'debito';
}

export function getTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    debito: 'Debito',
    pix: 'PIX',
    transferencia: 'Transferencia',
    credito: 'Credito',
  };
  return labels[type];
}

export function getTypeColor(type: TransactionType): string {
  const colors: Record<TransactionType, string> = {
    debito: '#ef4444',
    pix: '#8b5cf6',
    transferencia: '#3b82f6',
    credito: '#f59e0b',
  };
  return colors[type];
}

function applyDynamicRules(lower: string, rules: CategoryRule[]): string | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const match = (rule.matchText || '').toLowerCase().trim();
    if (!match) continue;
    if (lower.includes(match)) return rule.category;
  }
  return null;
}

export function guessCategory(description: string, rules?: CategoryRule[]): string {
  const lower = description.toLowerCase();
  const dynamicRules = rules ?? [];
  const dynamicCategory = applyDynamicRules(lower, dynamicRules);
  if (dynamicCategory) return dynamicCategory;

  if (isInvoicePaymentTransaction(description)) return 'Pagamento de Fatura';
  if (/reserva\s+por\s+gastos\s+emergencias/.test(lower)) return 'Investimentos';
  if (/leka\s+leleka/.test(lower)) return 'Mercado';
  if (/viezzer\s+e\s+cia/.test(lower)) return 'Mercado';
  if (/alsomartsupermerc/.test(lower)) return 'Mercado';
  if (/macromix/.test(lower)) return 'Mercado';

  if (/mercado|supermercado|atacad|hortifruti|padaria|acougue/.test(lower)) return 'Alimentacao';
  if (/restaurante|lanchonete|ifood|rappi|uber\s?eats|mcdonald|burger/.test(lower)) return 'Alimentacao';
  if (/farmacia|drogaria|droga/.test(lower)) return 'Saude';
  if (/uber|99|taxi|cabify|estacionamento|combustivel|gasolina|etanol|posto/.test(lower)) return 'Transporte';
  if (/netflix|spotify|disney|hbo|amazon|prime|youtube|streaming/.test(lower)) return 'Entretenimento';
  if (/luz|energia|enel|cemig|copel|cpfl|celesc/.test(lower)) return 'Conta de Luz';
  if (/agua|sabesp|copasa|sanepar/.test(lower)) return 'Conta de Agua';
  if (/telefone|celular|claro|vivo|tim|oi\s/.test(lower)) return 'Telefone';
  if (/internet|net\s|wifi/.test(lower)) return 'Internet';
  if (/aluguel|condominio|iptu/.test(lower)) return 'Moradia';
  if (/salario|pagamento\s+de\s+salario|holerite/.test(lower)) return 'Salario';
  if (/pix\s*recebido|transferencia\s*recebida|ted\s*recebida|credito\s*em\s*conta/.test(lower)) return 'Entrada';

  return 'Outros';
}
