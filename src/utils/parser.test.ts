import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// MANDATORY: importing anything from parser.ts crashes at module-eval time with
// `ReferenceError: DOMMatrix is not defined` because parser.ts imports pdfjs-dist,
// which resolves to its browser bundle in Node. Mock it before importing parser.ts.
// We give getDocument a controllable fake implementation so the PDF-path tests
// (below) can exercise parseBankStatementFile/parseCardStatementFile without a
// real PDF file, by feeding it a scripted list of fake text items.
const pdfState = vi.hoisted(() => ({
  items: [] as Array<{ str: string; transform: number[] }>,
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({ items: pdfState.items }),
      }),
    }),
  })),
  GlobalWorkerOptions: {},
}));

import {
  extractStatementPeriodInfo,
  formatCurrency,
  formatDate,
  getMonthLabel,
  parseBankStatementFile,
  parseCardStatementFile,
  parseCSV,
  parseDateSmart,
  parseOFX,
} from './parser';
import type { CardAccount } from '../types';

function makeFile(content: string, name: string, type = 'text/plain'): File {
  return new File([content], name, { type });
}

function makePdfItem(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

describe('parseDateSmart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses dd/MM/yyyy', () => {
    expect(parseDateSmart('14/07/2026')).toBe('2026-07-14');
  });

  it('parses yyyy-MM-dd', () => {
    expect(parseDateSmart('2026-07-14')).toBe('2026-07-14');
  });

  it('parses dd-MM-yyyy', () => {
    expect(parseDateSmart('14-07-2026')).toBe('2026-07-14');
  });

  it('falls back to MM/dd/yyyy only when dd/MM/yyyy is not a valid date', () => {
    // Day=03, Month=25 is invalid as dd/MM, so it falls through to MM/dd/yyyy: March 25th.
    expect(parseDateSmart('03/25/2026')).toBe('2026-03-25');
  });

  it('parses dot-separated dd.MM.yyyy', () => {
    expect(parseDateSmart('14.07.2026')).toBe('2026-07-14');
  });

  it('resolves 2-digit dot years with a 1970/2069 pivot (>=70 -> 19xx, <70 -> 20xx)', () => {
    expect(parseDateSmart('14.07.70')).toBe('1970-07-14');
    expect(parseDateSmart('14.07.69')).toBe('2069-07-14');
    expect(parseDateSmart('14.07.26')).toBe('2026-07-14');
  });

  it('infers the year for dd/MM using the statement date context default year', () => {
    expect(parseDateSmart('14/07', { defaultYear: 2025 })).toBe('2025-07-14');
  });

  it('infers the year for dd/MM using the current year when no context is given', () => {
    // System time faked to 2026-07-14.
    expect(parseDateSmart('14/07')).toBe('2026-07-14');
  });

  it('prefers a year that keeps the date inside the statement period', () => {
    const ctx = { periodStartIso: '2025-12-20', periodEndIso: '2026-01-10' };
    // "05/01" belongs to January in the 2026 half of the period.
    expect(parseDateSmart('05/01', ctx)).toBe('2026-01-05');
    // "25/12" belongs to December in the 2025 half of the period.
    expect(parseDateSmart('25/12', ctx)).toBe('2025-12-25');
  });

  it('returns null for empty input', () => {
    expect(parseDateSmart('')).toBeNull();
    expect(parseDateSmart('   ')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseDateSmart('not a date')).toBeNull();
    expect(parseDateSmart('99/99/9999')).toBeNull();
  });
});

describe('extractStatementPeriodInfo', () => {
  it('extracts a dd/MM/yyyy "a" range', () => {
    const info = extractStatementPeriodInfo('Extrato do periodo 01/07/2026 a 31/07/2026 Saldo...');
    expect(info.dateContext.periodStartIso).toBe('2026-07-01');
    expect(info.dateContext.periodEndIso).toBe('2026-07-31');
    expect(info.dateContext.defaultYear).toBe(2026);
    expect(info.periodLabel).toBeDefined();
  });

  it('normalizes a reversed range (start after end)', () => {
    const info = extractStatementPeriodInfo('Periodo: 31/07/2026 a 01/07/2026');
    expect(info.dateContext.periodStartIso).toBe('2026-07-01');
    expect(info.dateContext.periodEndIso).toBe('2026-07-31');
  });

  it('extracts a dot-separated range', () => {
    const info = extractStatementPeriodInfo('Periodo 01.07.2026 - 31.07.2026');
    expect(info.dateContext.periodStartIso).toBe('2026-07-01');
    expect(info.dateContext.periodEndIso).toBe('2026-07-31');
  });

  it('extracts a "referencia MM/AAAA" competence label', () => {
    const info = extractStatementPeriodInfo('Fatura referencia 07/2026 valor total...');
    expect(info.dateContext.defaultYear).toBe(2026);
    expect(info.dateContext.periodStartIso).toBeUndefined();
    expect(info.periodLabel).toBeDefined();
  });

  it('falls back to the first full date found near the top of the document', () => {
    const info = extractStatementPeriodInfo('Extrato gerado em 05/07/2026 as 10:00');
    expect(info.dateContext.defaultYear).toBe(2026);
  });

  it('returns an empty date context when nothing is found', () => {
    const info = extractStatementPeriodInfo('Nenhuma data por aqui.');
    expect(info.dateContext).toEqual({});
    expect(info.periodLabel).toBeUndefined();
  });
});

describe('parseCSV', () => {
  it('auto-detects a semicolon delimiter and parses a single signed amount column', () => {
    const csv = [
      'data;descricao;valor',
      '01/07/2026;Salario Empresa;5000,00',
      '02/07/2026;Compra Mercado;-150,50',
    ].join('\n');

    const txs = parseCSV(csv, 'TestBank');
    expect(txs).toHaveLength(2);

    expect(txs[0].date).toBe('2026-07-01');
    expect(txs[0].description).toBe('Salario Empresa');
    expect(txs[0].amount).toBe(5000);
    expect(txs[0].bank).toBe('TestBank');

    expect(txs[1].date).toBe('2026-07-02');
    expect(txs[1].amount).toBe(-150.5);
  });

  it('auto-detects a comma delimiter and signs amounts from entrada/saida columns', () => {
    const csv = [
      'data,descricao,entrada,saida',
      '03/07/2026,Deposito Salario,1000.00,',
      '04/07/2026,Pagamento Boleto,,200.00',
    ].join('\n');

    const txs = parseCSV(csv, 'TestBank');
    expect(txs).toHaveLength(2);
    expect(txs[0].amount).toBe(1000);
    expect(txs[1].amount).toBe(-200);
  });

  it('throws a descriptive error for an empty CSV', () => {
    expect(() => parseCSV('', 'TestBank')).toThrow('Arquivo CSV vazio ou formato invalido');
  });

  it('falls back to header-less positional parsing when no known columns are found', () => {
    const csv = ['01/07/2026,Compra Teste,100.00', '02/07/2026,Outra Compra,50.00'].join('\n');

    const txs = parseCSV(csv, 'TestBank');
    expect(txs).toHaveLength(2);
    expect(txs[0].date).toBe('2026-07-01');
    expect(txs[0].description).toBe('Compra Teste');
    expect(txs[0].amount).toBe(100);
    expect(txs[1].date).toBe('2026-07-02');
    expect(txs[1].description).toBe('Outra Compra');
    expect(txs[1].amount).toBe(50);
  });
});

describe('parseOFX', () => {
  const ofx = `
OFXHEADER:100
<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260701120000
<TRNAMT>-150.50
<MEMO>Compra Mercado
<NAME>POS COMPRA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260702000000
<TRNAMT>0.00
<MEMO>Estorno Zerado
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260703000000
<TRNAMT>200.00
<NAME>Only Name No Memo
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<TRNAMT>50.00
<MEMO>Missing Date Field
</STMTTRN>
</BANKTRANLIST>
</OFX>
`;

  it('extracts STMTTRN blocks, skipping zero-amount and missing-date rows', () => {
    const txs = parseOFX(ofx, 'TestBank');
    expect(txs).toHaveLength(2);
  });

  it('prefers MEMO over NAME when both are present', () => {
    const txs = parseOFX(ofx, 'TestBank');
    const first = txs.find(t => t.date === '2026-07-01');
    expect(first?.description).toBe('Compra Mercado');
    expect(first?.amount).toBe(-150.5);
  });

  it('falls back to NAME when MEMO is absent', () => {
    const txs = parseOFX(ofx, 'TestBank');
    const third = txs.find(t => t.date === '2026-07-03');
    expect(third?.description).toBe('Only Name No Memo');
    expect(third?.amount).toBe(200);
  });

  it('returns an empty array when there are no STMTTRN blocks', () => {
    expect(parseOFX('<OFX>no transactions here</OFX>', 'TestBank')).toEqual([]);
  });
});

describe('formatCurrency', () => {
  it('formats positive values as pt-BR BRL currency', () => {
    expect(formatCurrency(1234.5)).toMatch(/^R\$\s1\.234,50$/);
  });

  it('formats negative values with a leading minus sign', () => {
    expect(formatCurrency(-50)).toMatch(/^-R\$\s50,00$/);
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toMatch(/^R\$\s0,00$/);
  });
});

describe('formatDate', () => {
  it('converts yyyy-MM-dd to dd/MM/yyyy', () => {
    expect(formatDate('2026-07-14')).toBe('14/07/2026');
  });

  it('returns the original string when the date cannot be formatted', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('getMonthLabel', () => {
  it('formats yyyy-MM as a Portuguese "month de year" label', () => {
    expect(getMonthLabel('2026-07')).toBe('julho de 2026');
  });

  it('returns the original string when the month cannot be formatted', () => {
    expect(getMonthLabel('not-a-month')).toBe('not-a-month');
  });
});

describe('PDF parsing (via mocked pdfjs-dist)', () => {
  beforeEach(() => {
    pdfState.items = [];
  });

  it('throws when the bank has no registered PDF parser', async () => {
    const file = makeFile('%PDF-1.4 fake', 'extrato.pdf', 'application/pdf');
    await expect(parseBankStatementFile(file, 'Banco Desconhecido')).rejects.toThrow(
      'PDF bancario ainda nao suportado para Banco Desconhecido. Use CSV, OFX ou QFX.',
    );
  });

  it('throws a descriptive error instead of returning [] when the Neon PDF parser finds zero transactions', async () => {
    pdfState.items = []; // No extractable text at all.
    const file = makeFile('%PDF-1.4 fake', 'extrato.pdf', 'application/pdf');
    await expect(parseBankStatementFile(file, 'Neon')).rejects.toThrow(
      'Nao consegui ler as movimentacoes desse PDF da Neon.',
    );
  });

  it('throws a descriptive error instead of returning [] when the Banrisul PDF parser finds zero transactions', async () => {
    pdfState.items = [];
    const file = makeFile('%PDF-1.4 fake', 'extrato.pdf', 'application/pdf');
    await expect(parseBankStatementFile(file, 'Banrisul')).rejects.toThrow(
      /Nao consegui ler as movimentacoes desse PDF do Banrisul/,
    );
  });

  it('throws a descriptive error instead of returning [] when the generic card PDF parser finds zero purchases', async () => {
    pdfState.items = [];
    const card: CardAccount = {
      id: 'c1',
      name: 'Cartao',
      bankId: 'outro_banco',
      bankName: 'Outro Banco',
      supportedFormats: ['pdf'],
      closingDay: 10,
      dueDay: 17,
      active: true,
      color: '#000',
      letter: 'C',
    };
    const file = makeFile('%PDF-1.4 fake', 'fatura.pdf', 'application/pdf');
    await expect(parseCardStatementFile(file, card)).rejects.toThrow(
      /Nao consegui identificar compras nesse PDF/,
    );
  });

  it('extracts a purchase from a well-formed generic card PDF text line', async () => {
    // Simulate a single PDF text line "05/07/2026 Loja Teste 150,00" by placing three
    // text items on the same y-coordinate, left-to-right by x-coordinate.
    pdfState.items = [
      makePdfItem('05/07/2026', 0, 700),
      makePdfItem('Loja Teste', 100, 700),
      makePdfItem('150,00', 200, 700),
    ];
    const card: CardAccount = {
      id: 'c1',
      name: 'Cartao',
      bankId: 'outro_banco',
      bankName: 'Outro Banco',
      supportedFormats: ['pdf'],
      closingDay: 10,
      dueDay: 17,
      active: true,
      color: '#000',
      letter: 'C',
    };
    const file = makeFile('%PDF-1.4 fake', 'fatura.pdf', 'application/pdf');
    const purchases = await parseCardStatementFile(file, card);

    expect(purchases).toHaveLength(1);
    expect(purchases[0].description).toBe('Loja Teste');
    expect(purchases[0].amount).toBe(150);
    expect(purchases[0].date).toBe('2026-07-05');
    expect(purchases[0].cardId).toBe('c1');
  });
});
