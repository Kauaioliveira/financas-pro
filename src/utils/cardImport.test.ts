import { describe, expect, it } from 'vitest';
import {
  describeCardImportResult,
  describeCardStatementError,
  getCardFileFormat,
  groupPurchasesByInvoice,
} from './cardImport';
import { buildCardPurchase } from './credit';
import type { CardAccount, CardPurchase } from '../types';

// Fecha dia 3, vence dia 10: compras até 03/09 caem na fatura que vence 10/09;
// compras de 04/09 em diante caem na que vence 10/10.
const CARD: CardAccount = {
  id: 'card-1',
  name: 'Nubank Roxinho',
  bankId: 'nubank',
  bankName: 'Nubank',
  supportedFormats: ['csv', 'pdf'],
  closingDay: 3,
  dueDay: 10,
  active: true,
  color: '#000',
  letter: 'N',
};

let seq = 0;
function purchase(date: string, amount: number, description = 'Compra'): CardPurchase {
  seq += 1;
  return buildCardPurchase(
    {
      id: `p${seq}`,
      cardId: CARD.id,
      cardName: CARD.name,
      bankName: CARD.bankName,
      date,
      description,
      amount,
      category: 'Outros',
      sourceFormat: 'csv',
      sourceName: 'fatura.csv',
    },
    CARD
  );
}

describe('groupPurchasesByInvoice', () => {
  it('groups purchases by invoice with close date, due date, payment month and total', () => {
    const groups = groupPurchasesByInvoice(
      [purchase('2026-09-02', 10), purchase('2026-08-20', 5.5), purchase('2026-09-15', 40)],
      CARD
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: 'card-1:2026-09',
      cycleMonth: '2026-09',
      closeDate: '2026-09-03',
      dueDate: '2026-09-10',
      paymentMonth: '2026-09',
      total: 15.5,
    });
    expect(groups[0].purchases.map(p => p.date)).toEqual(['2026-08-20', '2026-09-02']);
    expect(groups[1]).toMatchObject({ dueDate: '2026-10-10', paymentMonth: '2026-10', total: 40 });
  });

  it('sends a purchase made after the closing day to the next invoice', () => {
    const [onClosingDay] = groupPurchasesByInvoice([purchase('2026-09-03', 1)], CARD);
    const [afterClosing] = groupPurchasesByInvoice([purchase('2026-09-04', 1)], CARD);
    expect(onClosingDay.paymentMonth).toBe('2026-09');
    expect(afterClosing.paymentMonth).toBe('2026-10');
  });

  it('puts the payment month in the following year for a December cycle that is due in January', () => {
    const card = { ...CARD, closingDay: 25, dueDay: 5 };
    const raw = purchase('2026-12-10', 1);
    const rebuilt = buildCardPurchase(raw, card);
    const [group] = groupPurchasesByInvoice([rebuilt], card);
    expect(group.dueDate).toBe('2027-01-05');
    expect(group.paymentMonth).toBe('2027-01');
  });

  it('returns no groups for an empty file', () => {
    expect(groupPurchasesByInvoice([], CARD)).toEqual([]);
  });
});

describe('getCardFileFormat', () => {
  it('detects CSV and PDF regardless of case', () => {
    expect(getCardFileFormat('Fatura.PDF')).toBe('pdf');
    expect(getCardFileFormat('fatura-setembro.csv')).toBe('csv');
  });

  it('rejects other extensions', () => {
    expect(getCardFileFormat('extrato.ofx')).toBeNull();
    expect(getCardFileFormat('fatura')).toBeNull();
  });
});

describe('describeCardStatementError', () => {
  it('never shows the statement sample included by the generic PDF reader', () => {
    const err = new Error('Nao consegui identificar compras nesse PDF. Amostra lida: JOAO DA SILVA | CPF 123');
    const message = describeCardStatementError(err);
    expect(message).not.toContain('JOAO');
    expect(message).not.toContain('Amostra');
    expect(message).toContain('texto selecionável');
  });

  it('explains password-protected PDFs', () => {
    const err = Object.assign(new Error('No password given'), { name: 'PasswordException' });
    expect(describeCardStatementError(err)).toContain('protegido por senha');
  });

  it('falls back to a generic message for unknown errors without echoing them', () => {
    const message = describeCardStatementError(new Error('conteúdo interno qualquer'));
    expect(message).not.toContain('conteúdo interno');
    expect(describeCardStatementError('not an error')).toBe(message);
  });
});

describe('describeCardImportResult', () => {
  it('reports added and skipped purchases', () => {
    const a = purchase('2026-09-01', 1);
    const b = purchase('2026-09-01', 2);
    expect(describeCardImportResult({ added: [a, b], skipped: [] })).toBe('2 compras importadas.');
    expect(describeCardImportResult({ added: [a], skipped: [b] })).toBe(
      '1 compra importada · 1 já existia e foi ignorada.'
    );
    expect(describeCardImportResult({ added: [], skipped: [a, b] })).toBe(
      'Nada novo para importar: as 2 compras deste arquivo já estavam no app.'
    );
  });
});
