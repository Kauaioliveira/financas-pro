import { addMonths, endOfMonth, format, getDate, isAfter, parse } from 'date-fns';
import type { CardAccount, CardInvoice, CardPurchase, CardPurchaseStatus } from '../types';

function clampDay(yearMonth: string, day: number): string {
  const base = parse(`${yearMonth}-01`, 'yyyy-MM-dd', new Date());
  const lastDay = getDate(endOfMonth(base));
  const finalDay = Math.min(Math.max(day, 1), lastDay);
  return `${yearMonth}-${String(finalDay).padStart(2, '0')}`;
}

export function getCardCycleMonth(date: string, closingDay: number): string {
  const parsed = parse(date, 'yyyy-MM-dd', new Date());
  const cycleBase = getDate(parsed) <= closingDay ? parsed : addMonths(parsed, 1);
  return format(cycleBase, 'yyyy-MM');
}

export function getInvoiceCloseDate(cycleMonth: string, closingDay: number): string {
  return clampDay(cycleMonth, closingDay);
}

export function getInvoiceDueDate(
  cycleMonth: string,
  closingDay: number,
  dueDay: number
): string {
  const dueBase = dueDay > closingDay
    ? parse(`${cycleMonth}-01`, 'yyyy-MM-dd', new Date())
    : addMonths(parse(`${cycleMonth}-01`, 'yyyy-MM-dd', new Date()), 1);
  return clampDay(format(dueBase, 'yyyy-MM'), dueDay);
}

export function getInvoicePaymentMonth(
  cycleMonth: string,
  closingDay: number,
  dueDay: number
): string {
  return getInvoiceDueDate(cycleMonth, closingDay, dueDay).slice(0, 7);
}

export function getInvoiceStatus(invoice: Pick<CardInvoice, 'paid' | 'closeDate'>): CardPurchaseStatus {
  if (invoice.paid) return 'paga';
  const today = new Date();
  const closeDate = parse(invoice.closeDate, 'yyyy-MM-dd', new Date());
  return isAfter(today, closeDate) ? 'fechada' : 'aberta';
}

export function buildCardPurchase(
  raw: Omit<CardPurchase, 'cycleMonth' | 'paymentMonth' | 'status'>,
  card: CardAccount
): CardPurchase {
  const cycleMonth = getCardCycleMonth(raw.date, card.closingDay);
  const paymentMonth = getInvoicePaymentMonth(cycleMonth, card.closingDay, card.dueDay);
  return {
    ...raw,
    cycleMonth,
    paymentMonth,
    status: 'aberta',
  };
}
