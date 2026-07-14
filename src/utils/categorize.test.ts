import { describe, expect, it } from 'vitest';
import {
  categorizeTransaction,
  getTypeColor,
  getTypeLabel,
  guessCategory,
  isInvoicePaymentTransaction,
} from './categorize';
import type { CategoryRule } from '../types';

describe('isInvoicePaymentTransaction', () => {
  it('matches by category regardless of casing/whitespace', () => {
    expect(isInvoicePaymentTransaction('anything', '  Pagamento de Fatura  ')).toBe(true);
  });

  it('matches by description phrasing variants', () => {
    expect(isInvoicePaymentTransaction('Pagamento fatura cartao')).toBe(true);
    expect(isInvoicePaymentTransaction('Pagto fatura cartao')).toBe(true);
    expect(isInvoicePaymentTransaction('PGTO FATURA CARTAO')).toBe(true);
    expect(isInvoicePaymentTransaction('Pagamento da fatura')).toBe(true);
  });

  it('returns false for unrelated descriptions', () => {
    expect(isInvoicePaymentTransaction('Compra no mercado')).toBe(false);
  });
});

describe('categorizeTransaction', () => {
  it('is case-insensitive', () => {
    expect(categorizeTransaction('PIX ENVIADO PARA JOAO')).toBe('pix');
    expect(categorizeTransaction('pix enviado para joao')).toBe('pix');
    expect(categorizeTransaction('Pix Enviado Para Joao')).toBe('pix');
  });

  it('classifies invoice payments as transferencia, ahead of everything else', () => {
    // Description matches both "fatura" (credit keyword) and the invoice-payment regex.
    // The real branching order in categorizeTransaction checks isInvoicePaymentTransaction first.
    expect(categorizeTransaction('Pagamento fatura cartao de credito')).toBe('transferencia');
  });

  it('classifies pix ahead of credit/transfer/debit keywords', () => {
    // "pix" also is not a credit/transfer/debit keyword, but verify precedence explicitly
    // against a description that could plausibly hit multiple buckets.
    expect(categorizeTransaction('Pagamento pix cartao')).toBe('pix');
  });

  it('classifies credito ahead of transferencia when both keyword sets match', () => {
    // "parcela" is a CREDIT_KEYWORDS entry, "transf" is a TRANSFER_KEYWORDS entry.
    expect(categorizeTransaction('Compra parcelada transferencia parcela 1/3')).toBe('credito');
  });

  it('classifies transferencia ahead of debito when both keyword sets match', () => {
    // "ted" is a TRANSFER_KEYWORDS entry, "pagamento" is a DEBIT_KEYWORDS entry.
    expect(categorizeTransaction('TED pagamento de boleto')).toBe('transferencia');
  });

  it('falls back to debito for debit keywords', () => {
    expect(categorizeTransaction('Pagamento de boleto')).toBe('debito');
    expect(categorizeTransaction('Saque em caixa eletronico')).toBe('debito');
  });

  it('defaults to debito when nothing matches', () => {
    expect(categorizeTransaction('Loja XPTO 123')).toBe('debito');
  });
});

describe('getTypeLabel / getTypeColor', () => {
  it('returns the expected labels', () => {
    expect(getTypeLabel('debito')).toBe('Debito');
    expect(getTypeLabel('pix')).toBe('PIX');
    expect(getTypeLabel('transferencia')).toBe('Transferencia');
    expect(getTypeLabel('credito')).toBe('Credito');
  });

  it('returns the expected colors', () => {
    expect(getTypeColor('debito')).toBe('#ef4444');
    expect(getTypeColor('pix')).toBe('#8b5cf6');
    expect(getTypeColor('transferencia')).toBe('#3b82f6');
    expect(getTypeColor('credito')).toBe('#f59e0b');
  });
});

describe('guessCategory', () => {
  it('is case-insensitive', () => {
    expect(guessCategory('SUPERMERCADO EXTRA')).toBe('Alimentacao');
    expect(guessCategory('supermercado extra')).toBe('Alimentacao');
  });

  it('prefers dynamic user-defined rules over built-in categories', () => {
    const rules: CategoryRule[] = [
      { id: '1', matchText: 'mercado', category: 'Categoria Customizada', enabled: true },
    ];
    // "mercado" would normally hit the built-in Alimentacao bucket.
    expect(guessCategory('Compra no Mercado Extra', rules)).toBe('Categoria Customizada');
  });

  it('skips disabled rules', () => {
    const rules: CategoryRule[] = [
      { id: '1', matchText: 'mercado', category: 'Categoria Customizada', enabled: false },
    ];
    expect(guessCategory('Compra no Mercado Extra', rules)).toBe('Alimentacao');
  });

  it('skips rules with empty matchText', () => {
    const rules: CategoryRule[] = [
      { id: '1', matchText: '   ', category: 'Categoria Customizada', enabled: true },
    ];
    expect(guessCategory('Compra no Mercado Extra', rules)).toBe('Alimentacao');
  });

  it('applies the first matching dynamic rule in list order', () => {
    const rules: CategoryRule[] = [
      { id: '1', matchText: 'mercado', category: 'Primeira', enabled: true },
      { id: '2', matchText: 'mercado extra', category: 'Segunda', enabled: true },
    ];
    expect(guessCategory('Compra no Mercado Extra', rules)).toBe('Primeira');
  });

  it('recognizes hardcoded merchant overrides that would not match generic patterns', () => {
    expect(guessCategory('LEKA LELEKA COM')).toBe('Mercado');
    expect(guessCategory('VIEZZER E CIA LTDA')).toBe('Mercado');
    expect(guessCategory('ALSOMARTSUPERMERC 123')).toBe('Mercado');
    // "macromix" alone matches none of the generic food-related patterns below it.
    expect(guessCategory('MACROMIX LTDA')).toBe('Mercado');
  });

  it('recognizes the emergency-reserve override as Investimentos', () => {
    expect(guessCategory('Reserva por gastos emergencias')).toBe('Investimentos');
  });

  it('categorizes common merchant/keyword patterns', () => {
    expect(guessCategory('IFOOD DELIVERY')).toBe('Alimentacao');
    expect(guessCategory('DROGARIA SAO PAULO')).toBe('Saude');
    expect(guessCategory('UBER TRIP')).toBe('Transporte');
    expect(guessCategory('NETFLIX.COM')).toBe('Entretenimento');
    expect(guessCategory('ENEL DISTRIBUICAO')).toBe('Conta de Luz');
    expect(guessCategory('SABESP AGUA')).toBe('Conta de Agua');
    expect(guessCategory('CLARO CELULAR')).toBe('Telefone');
    expect(guessCategory('NET WIFI INTERNET')).toBe('Internet');
    expect(guessCategory('ALUGUEL APARTAMENTO')).toBe('Moradia');
    expect(guessCategory('PAGAMENTO DE SALARIO')).toBe('Salario');
    expect(guessCategory('PIX RECEBIDO DE FULANO')).toBe('Entrada');
  });

  it('falls back to the default category when nothing matches', () => {
    expect(guessCategory('Loja XPTO 123')).toBe('Outros');
  });
});
