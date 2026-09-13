import Papa from 'papaparse';
import { format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { CardAccount, CardImportFormat, CardPurchase, Transaction } from '../types';
import { categorizeTransaction, guessCategory } from './categorize';
import { buildCardPurchase } from './credit';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

interface CSVRow {
  [key: string]: string;
}

type ParsedCardPurchaseInput = Pick<
  CardPurchase,
  'id' | 'cardId' | 'cardName' | 'bankName' | 'date' | 'description' | 'amount' | 'category' | 'sourceFormat' | 'sourceName'
>;

type CardParserContext = {
  card: CardAccount;
  fileName: string;
};

/** Contexto de datas inferido do cabeçalho do extrato (período, ano de referência). */
export type StatementDateContext = {
  defaultYear?: number;
  periodStartIso?: string;
  periodEndIso?: string;
};

export type StatementPeriodInfo = {
  dateContext: StatementDateContext;
  /** Trecho legível do período detectado (para exibir na importação). */
  periodLabel?: string;
};

export type BankStatementParseMeta = {
  /** Linhas de texto consideradas (aproximado: útil para comparar com transações importadas). */
  inputLinesApprox: number;
  periodLabel?: string;
};

type BankPdfParser = (pdfText: string, bankName: string, dateCtx: StatementDateContext) => Transaction[];

type CardCsvParser = (csvText: string, context: CardParserContext) => ParsedCardPurchaseInput[];
type CardPdfParser = (pdfText: string, context: CardParserContext) => ParsedCardPurchaseInput[];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(value: string): string {
  return (value || '').toLowerCase().trim();
}

function isIsoDateInRange(iso: string, start?: string, end?: string): boolean {
  if (!start || !end) return true;
  return iso >= start && iso <= end;
}

/** Só datas completas dd/MM/yyyy (para montar intervalo do extrato). */
function parseFullBrDateToIso(br: string): string | null {
  try {
    const p = parse(br.trim(), 'dd/MM/yyyy', new Date());
    if (!isValid(p)) return null;
    return format(p, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

/**
 * Extrai período / ano de referência do texto do extrato (CSV, PDF extraído, etc.)
 * para datas sem ano (dd/MM) ou como fallback.
 */
export function extractStatementPeriodInfo(fullText: string): StatementPeriodInfo {
  const head = fullText.slice(0, 16000);
  const dateContext: StatementDateContext = {};
  let periodLabel: string | undefined;

  const setRange = (startBr: string, endBr: string, label: string) => {
    const s = parseFullBrDateToIso(startBr);
    const e = parseFullBrDateToIso(endBr);
    if (s && e) {
      dateContext.periodStartIso = s;
      dateContext.periodEndIso = e;
      if (s > e) {
        dateContext.periodStartIso = e;
        dateContext.periodEndIso = s;
      }
      const endY = Number(dateContext.periodEndIso.slice(0, 4));
      dateContext.defaultYear = endY;
      periodLabel = label;
    }
  };

  // dd/MM/yyyy a dd/MM/yyyy (várias variantes)
  const mRangeSlash = head.match(
    /\b(\d{2}\/\d{2}\/20\d{2})\s*(?:a|até|ate|to|-\s*|–\s*)\s*(\d{2}\/\d{2}\/20\d{2})\b/i
  );
  if (mRangeSlash) {
    setRange(mRangeSlash[1], mRangeSlash[2], mRangeSlash[0]);
  }

  // dd.MM.yyyy - dd.MM.yyyy
  if (!dateContext.periodEndIso) {
    const mRangeDot = head.match(
      /\b(\d{2})\.(\d{2})\.(20\d{2})\s*[-–a]\s*(\d{2})\.(\d{2})\.(20\d{2})\b/i
    );
    if (mRangeDot) {
      const a = `${mRangeDot[1]}/${mRangeDot[2]}/${mRangeDot[3]}`;
      const b = `${mRangeDot[4]}/${mRangeDot[5]}/${mRangeDot[6]}`;
      setRange(a, b, mRangeDot[0]);
    }
  }

  // Referência / competência MM/AAAA ou MM-AAAA
  if (!dateContext.defaultYear) {
    const mRef = head.match(
      /\b(?:referencia|referência|competencia|competência|periodo|período)\s*[: ]*\s*(\d{1,2})\s*[/\s.-]\s*(20\d{2})\b/i
    );
    if (mRef) {
      dateContext.defaultYear = Number(mRef[2]);
      periodLabel = mRef[0].trim();
    }
  }

  // Primeira data completa no cabeçalho (primeiros 2,5k caracteres)
  if (!dateContext.defaultYear) {
    const mFirst = head.slice(0, 2500).match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
    if (mFirst) {
      dateContext.defaultYear = Number(mFirst[3]);
    }
  }

  return { dateContext, periodLabel };
}

function twoDigitYearToFull(yy: number): number {
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

/**
 * Interpreta datas de extratos (vários formatos). Usa `ctx` para completar ano (dd/MM)
 * e, quando houver `periodStartIso`/`periodEndIso`, escolhe o ano que mantém a data dentro do período.
 */
export function parseDateSmart(dateStr: string, ctx?: StatementDateContext | null): string | null {
  const raw = (dateStr || '').trim().replace(/\s+/g, ' ');
  if (!raw) return null;

  const currentYear = new Date().getFullYear();
  const fallbackYear = ctx?.defaultYear ?? currentYear;

  const tryFormat = (candidate: string, pattern: string, enforcePeriod: boolean): string | null => {
    try {
      const parsed = parse(candidate, pattern, new Date());
      if (!isValid(parsed)) return null;
      const iso = format(parsed, 'yyyy-MM-dd');
      if (
        enforcePeriod &&
        ctx?.periodStartIso &&
        ctx?.periodEndIso &&
        !isIsoDateInRange(iso, ctx.periodStartIso, ctx.periodEndIso)
      ) {
        return null;
      }
      return iso;
    } catch {
      return null;
    }
  };

  // dd.MM.yyyy e dd.MM.yy
  const dotFull = raw.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})$/);
  if (dotFull) {
    const iso = tryFormat(`${dotFull[1].padStart(2, '0')}/${dotFull[2].padStart(2, '0')}/${dotFull[3]}`, 'dd/MM/yyyy', false);
    if (iso) return iso;
  }
  const dotYy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (dotYy) {
    const y = twoDigitYearToFull(Number(dotYy[3]));
    const iso = tryFormat(`${dotYy[1].padStart(2, '0')}/${dotYy[2].padStart(2, '0')}/${y}`, 'dd/MM/yyyy', false);
    if (iso) return iso;
  }

  const formatsFull: Array<{ pattern: string; value: string }> = [
    { pattern: 'dd/MM/yyyy', value: raw },
    { pattern: 'yyyy-MM-dd', value: raw },
    { pattern: 'dd-MM-yyyy', value: raw },
    { pattern: 'MM/dd/yyyy', value: raw },
    { pattern: 'dd/MM/yy', value: raw },
    { pattern: 'yyyy/MM/dd', value: raw },
  ];
  for (const { pattern, value } of formatsFull) {
    const iso = tryFormat(value, pattern, false);
    if (iso) return iso;
  }

  // dd/MM ou dd-MM sem ano — tentar anos: período (início e fim), fallback, atual e anterior
  const startYear = ctx?.periodStartIso ? Number(ctx.periodStartIso.slice(0, 4)) : undefined;
  const endYear = ctx?.periodEndIso ? Number(ctx.periodEndIso.slice(0, 4)) : undefined;
  const yearsToTry = Array.from(
    new Set(
      [fallbackYear, endYear, startYear, ctx?.defaultYear, currentYear, currentYear - 1]
        .filter((y): y is number => typeof y === 'number' && !Number.isNaN(y))
    )
  );

  for (const y of yearsToTry) {
    const isoSlash = tryFormat(`${raw}/${y}`, 'dd/MM/yyyy', true);
    if (isoSlash) return isoSlash;
    const isoDash = tryFormat(`${raw}-${y}`, 'dd-MM-yyyy', true);
    if (isoDash) return isoDash;
  }

  return null;
}

function parseAmount(value: string): number {
  let clean = value.trim();
  clean = clean.replace(/[R$\s]/g, '');

  if (/\d{1,3}(\.\d{3})*,\d{2}$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/,\d{2}$/.test(clean)) {
    clean = clean.replace(',', '.');
  }

  const numeric = parseFloat(clean);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function findColumn(headers: string[], keywords: string[]): string | null {
  const SHORT_KEYWORDS = new Set(['in', 'out', 'dt', 'mov', 'vlr']);

  for (const keyword of keywords) {
    for (const header of headers) {
      const lower = header.toLowerCase().trim();
      if (SHORT_KEYWORDS.has(keyword)) {
        if (lower === keyword || new RegExp(`(?:^|[\\s_\\-./])${keyword}(?:$|[\\s_\\-./])`, 'i').test(lower)) {
          return header;
        }
      } else {
        if (lower.includes(keyword)) return header;
      }
    }
  }
  return null;
}

function looksLikeEntrada(description: string, typeText: string): boolean {
  const desc = normalizeText(description);
  const type = normalizeText(typeText);
  return (
    /receb|entrada|credito em conta|deposito|salario|reembolso|estorno recebido/.test(desc) ||
    /credit|entrada|in|credito/.test(type)
  );
}

function looksLikeSaida(description: string, typeText: string): boolean {
  const desc = normalizeText(description);
  const type = normalizeText(typeText);
  return (
    /pag|compra|deb|saida|tarifa|taxa|boleto|fatura|pix enviado|transferencia enviada|saque/.test(desc) ||
    /debit|debito|saida|out/.test(type)
  );
}

function shouldIgnoreCardRow(description: string): boolean {
  const lower = normalizeText(description);
  return (
    !lower ||
    /pagamento|fatura|limite|saldo anterior|total|encargos|juros|anuidade|estorno de pagamento/.test(lower)
  );
}

function cleanPdfText(value: string): string {
  return value.split('\u0000').join('').replace(/\s+/g, ' ').trim();
}

export function parseCSV(csvText: string, bankName: string, periodInfo?: StatementPeriodInfo): Transaction[] {
  const info = periodInfo ?? extractStatementPeriodInfo(csvText);
  const ctx = info.dateContext;
  const lines = csvText.split(/\r?\n/);
  const headerLineIndex = lines.findIndex(line =>
    normalizeText(line).startsWith('release_date;') || normalizeText(line).startsWith('release date;')
  );
  const csvToParse = headerLineIndex >= 0 ? lines.slice(headerLineIndex).join('\n') : csvText;

  const sample = csvToParse.slice(0, 2000);
  const semiCount = (sample.match(/;/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : undefined;

  const result = Papa.parse<CSVRow>(csvToParse, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter,
  });

  if (!result.data || result.data.length === 0) {
    throw new Error('Arquivo CSV vazio ou formato invalido');
  }

  const headers = result.meta.fields || [];
  const dateCol = findColumn(headers, ['release_date', 'data', 'date', 'dt', 'dia', 'lancamento']);
  const descCol = findColumn(headers, ['transaction_type', 'descri', 'historico', 'detalhe', 'memo', 'lancamento', 'nome']);
  const amountCol = findColumn(headers, ['transaction_net_amount', 'net_amount', 'valor', 'amount', 'quantia', 'vlr', 'montante']);
  const inCol = findColumn(headers, ['entrada', 'credit', 'credito', 'receb', 'in']);
  const outCol = findColumn(headers, ['saida', 'debito', 'debit', 'out']);
  const typeCol = findColumn(headers, ['tipo', 'natureza', 'mov', 'movimento', 'origem']);

  if (!dateCol && !descCol && !amountCol) {
    return parseCSVNoHeader(csvText, bankName, ctx);
  }

  const transactions: Transaction[] = [];
  for (const row of result.data) {
    const dateStr = dateCol ? row[dateCol] : '';
    const description = descCol ? row[descCol] : '';
    const amountStr = amountCol ? row[amountCol] : '';
    const typeStr = typeCol ? row[typeCol] : '';

    if (!dateStr && !description) continue;

    const parsedDate = parseDateSmart(dateStr, ctx);
    if (!parsedDate) continue;
    let amount = 0;

    if (inCol || outCol) {
      const entrada = inCol ? parseAmount(row[inCol] || '') : 0;
      const saida = outCol ? parseAmount(row[outCol] || '') : 0;
      if (Math.abs(entrada) > 0 && Math.abs(saida) === 0) amount = Math.abs(entrada);
      else if (Math.abs(saida) > 0 && Math.abs(entrada) === 0) amount = -Math.abs(saida);
      else amount = Math.abs(entrada) - Math.abs(saida);
    } else {
      amount = parseAmount(amountStr);
      if (amount === 0) continue;
      if (amount > 0) {
        if (looksLikeSaida(description, typeStr)) amount = -Math.abs(amount);
        else if (looksLikeEntrada(description, typeStr)) amount = Math.abs(amount);
        else if (
          /credito|cartao/.test(normalizeText(typeStr)) &&
          !/receb|em conta|deposito/.test(normalizeText(typeStr))
        ) {
          amount = -Math.abs(amount);
        }
      }
    }

    if (amount === 0) continue;

    transactions.push({
      id: generateId(),
      date: parsedDate,
      description: description.trim(),
      amount,
      type: categorizeTransaction(description, amount),
      category: guessCategory(description),
      bank: bankName,
    });
  }

  return transactions;
}

function parseCSVNoHeader(csvText: string, bankName: string, ctx?: StatementDateContext): Transaction[] {
  const dateCtx = ctx ?? extractStatementPeriodInfo(csvText).dateContext;
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const transactions: Transaction[] = [];
  for (const row of result.data) {
    if (row.length < 3) continue;

    let dateStr = '';
    let description = '';
    let amountStr = '';

    for (const cell of row) {
      const trimmed = (cell || '').trim();
      if (!dateStr && parseDateSmart(trimmed, dateCtx)) dateStr = trimmed;
      else if (!amountStr && /^-?[\d.,R$\s]+$/.test(trimmed) && trimmed.length > 0) amountStr = trimmed;
      else if (trimmed.length > 2) description += `${description ? ' ' : ''}${trimmed}`;
    }

    const parsedDate = parseDateSmart(dateStr, dateCtx);
    const amount = parseAmount(amountStr);
    if (!parsedDate || !description || amount === 0) continue;

    transactions.push({
      id: generateId(),
      date: parsedDate,
      description,
      amount,
      type: categorizeTransaction(description, amount),
      category: guessCategory(description),
      bank: bankName,
    });
  }

  return transactions;
}

export function parseOFX(ofxText: string, bankName: string): Transaction[] {
  const transactions: Transaction[] = [];
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(ofxText)) !== null) {
    const block = match[1];
    const getField = (name: string): string => {
      const fieldRegex = new RegExp(`<${name}>([^<\\n]+)`, 'i');
      return block.match(fieldRegex)?.[1]?.trim() || '';
    };

    const dateRaw = getField('DTPOSTED');
    const description = getField('MEMO') || getField('NAME');
    const amountRaw = getField('TRNAMT');
    if (!dateRaw || !description) continue;

    const parsedDate =
      dateRaw.length >= 8
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : '';
    const amount = parseFloat(amountRaw) || 0;
    if (!parsedDate || amount === 0) continue;

    transactions.push({
      id: generateId(),
      date: parsedDate,
      description,
      amount,
      type: categorizeTransaction(description, amount),
      category: guessCategory(description),
      bank: bankName,
    });
  }

  return transactions;
}

function normalizeCardPurchases(
  rows: ParsedCardPurchaseInput[],
  card: CardAccount
): CardPurchase[] {
  return rows
    .filter(row => row.amount > 0)
    .map(row => buildCardPurchase(row, card))
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
}

function parseGenericCardCSV(csvText: string, context: CardParserContext): ParsedCardPurchaseInput[] {
  const cardCsvCtx = extractStatementPeriodInfo(csvText).dateContext;
  const sample = csvText.slice(0, 2000);
  const delimiter = (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ';' : undefined;
  const result = Papa.parse<CSVRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter,
  });

  const headers = result.meta.fields || [];
  if (!headers.length) throw new Error('CSV do cartao sem cabecalho reconhecivel.');

  const dateCol = findColumn(headers, ['data', 'date', 'compra', 'lancamento']);
  const descCol = findColumn(headers, ['descricao', 'descri', 'historico', 'estabelecimento', 'detalhe', 'memo']);
  const amountCol = findColumn(headers, ['valor', 'amount', 'total', 'parcela', 'compra']);

  if (!dateCol || !descCol || !amountCol) {
    throw new Error('Nao encontrei colunas de data, descricao e valor no CSV do cartao.');
  }

  return result.data
    .map((row: CSVRow) => {
      const description = (row[descCol] || '').trim();
      const parsedDate = parseDateSmart(row[dateCol] || '', cardCsvCtx);
      const amount = Math.abs(parseAmount(row[amountCol] || ''));
      if (!parsedDate || !description || amount === 0 || shouldIgnoreCardRow(description)) return null;
      return {
        id: generateId(),
        cardId: context.card.id,
        cardName: context.card.name,
        bankName: context.card.bankName,
        date: parsedDate,
        description,
        amount,
        category: guessCategory(description),
        sourceFormat: 'csv' as CardImportFormat,
        sourceName: context.fileName,
      };
    })
    .filter((row: ParsedCardPurchaseInput | null): row is ParsedCardPurchaseInput => Boolean(row));
}

function extractLinesFromPdfItems(items: TextItem[]): string[] {
  const groups = new Map<number, TextItem[]>();
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    const current = groups.get(y) || [];
    current.push(item);
    groups.set(y, current);
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) =>
      lineItems
        .slice()
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is TextItem => 'str' in item);
    pages.push(extractLinesFromPdfItems(items).join('\n'));
  }

  return pages.join('\n');
}

function looksLikeNeonBankStatement(pdfText: string): boolean {
  const normalized = cleanPdfText(pdfText).toLowerCase();
  return (
    normalized.includes('conta digital') &&
    normalized.includes('extrato por periodo') &&
    normalized.includes('saldo') &&
    normalized.includes('descricao')
  );
}

function parseNeonBankStatementPdf(pdfText: string, bankName: string, dateCtx: StatementDateContext): Transaction[] {
  const lines = pdfText
    .split(/\r?\n/)
    .map(cleanPdfText)
    .filter(Boolean);

  const transactions: Transaction[] = [];

  const strict =
    /^(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\s?\d{2})\s+([R$ -]?[\d.,]+)\s+[R$ -]?[\d.,]+\s+(-)$/;
  const relaxed =
    /^(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\s?\d{2})\s+([R$ -]?[\d.,]+)\s+[R$ -]?[\d.,]+(?:\s+(-))?$/;

  function pushTx(rawDescription: string, rawDate: string, rawAmount: string) {
    const description = cleanPdfText(rawDescription);
    const parsedDate = parseDateSmart(rawDate, dateCtx);
    let amount = parseAmount(cleanPdfText(rawAmount));
    if (!parsedDate || !description || amount === 0) return;

    const lower = description.toLowerCase();
    if (
      lower.includes('pagamento fatura') ||
      lower.includes('pix enviado') ||
      lower.includes('transferencia enviada') ||
      lower.includes('compra')
    ) {
      amount = -Math.abs(amount);
    } else {
      amount = Math.abs(amount);
    }

    transactions.push({
      id: generateId(),
      date: parsedDate,
      description,
      amount,
      type: categorizeTransaction(description, amount),
      category: guessCategory(description),
      bank: bankName,
    });
  }

  for (const line of lines) {
    let m = strict.exec(line);
    if (m) {
      pushTx(m[1], m[2], m[4]);
      continue;
    }
    m = relaxed.exec(line);
    if (m) {
      pushTx(m[1], m[2], m[4]);
      continue;
    }

    const dateMatch = /\b(\d{2}\/\d{2}\/\d{4})\b/.exec(line);
    if (!dateMatch || dateMatch.index === undefined) continue;
    const rawDate = dateMatch[1];
    const description = cleanPdfText(line.slice(0, dateMatch.index));
    const after = line.slice(dateMatch.index + rawDate.length);
    const amountTok = after.match(/([R$ -]?[\d]{1,3}(?:\.[\d]{3})*,\d{2})/);
    if (!description || !amountTok) continue;
    pushTx(description, rawDate, amountTok[1]);
  }

  if (!transactions.length) {
    throw new Error('Nao consegui ler as movimentacoes desse PDF da Neon.');
  }

  return transactions;
}

function isBanrisulPdfNoiseLine(line: string): boolean {
  const l = line.toLowerCase();
  if (l.length < 12) return true;
  if (/^\s*data\s/i.test(line) && !/\d{2}\/\d{2}\/\d{4}/.test(line.slice(0, 20))) return true;
  if (/hist[oó]rico/i.test(l) && /movimenta/i.test(l)) return true;
  if (/documento.*valor/i.test(l)) return true;
  if (/^total\b/i.test(l)) return true;
  if (/saldo\s+anterior/i.test(l) && l.length < 60) return true;
  if (/extrato\s+de\s+conta/i.test(l) && !/\d{2}\/\d{2}\/\d{4}/.test(line)) return true;
  return false;
}

/** Extrato conta corrente Banrisul em PDF (texto selecionável). */
function parseBanrisulBankStatementPdf(pdfText: string, bankName: string, dateCtx: StatementDateContext): Transaction[] {
  const lines = pdfText
    .split(/\r?\n/)
    .map(cleanPdfText)
    .filter(Boolean);

  const moneyRe = /-?(?:\s*R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const transactions: Transaction[] = [];

  function parseOneLine(line: string): void {
    if (isBanrisulPdfNoiseLine(line)) return;

    let rawDate: string | null = null;
    let afterDate = '';

    const slashHead = /^(\d{2}\/\d{2}\/\d{4})\s+/.exec(line);
    const dotHead = /^(\d{2}\.\d{2}\.(?:20)?\d{2})\s+/.exec(line);
    if (slashHead) {
      rawDate = slashHead[1];
      afterDate = line.slice(slashHead[0].length);
    } else if (dotHead) {
      rawDate = dotHead[1];
      afterDate = line.slice(dotHead[0].length);
    } else {
      const dotAny = line.match(/\b(\d{2}\.\d{2}\.(?:20)?\d{2})\b/);
      const slashAny = line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      const pick = slashAny || dotAny;
      if (!pick || pick.index === undefined) return;
      rawDate = pick[1];
      const before = line.slice(0, pick.index).trim();
      afterDate = line.slice(pick.index + pick[0].length).trim();
      const moneyMatches = [...afterDate.matchAll(moneyRe)];
      if (moneyMatches.length === 0) return;
      const movMatch =
        moneyMatches.length >= 2 ? moneyMatches[moneyMatches.length - 2] : moneyMatches[moneyMatches.length - 1];
      const movStr = movMatch[0];
      const movIndex = movMatch.index ?? 0;
      const descMiddle = afterDate.slice(0, movIndex).trim();
      const description = [before, descMiddle].filter(Boolean).join(' ').trim();
      if (description.length < 3 || /^saldo\b/i.test(description)) return;

      const parsedDate = parseDateSmart(rawDate, dateCtx);
      let amount = parseAmount(cleanPdfText(movStr));
      if (!parsedDate || amount === 0) return;

      const trimmedMov = movStr.trim();
      if (trimmedMov.startsWith('-')) amount = -Math.abs(amount);
      else if (looksLikeSaida(description, '')) amount = -Math.abs(amount);
      else if (looksLikeEntrada(description, '')) amount = Math.abs(amount);

      transactions.push({
        id: generateId(),
        date: parsedDate,
        description,
        amount,
        type: categorizeTransaction(description, amount),
        category: guessCategory(description),
        bank: bankName,
      });
      return;
    }

    if (!rawDate) return;

    const moneyMatches = [...afterDate.matchAll(moneyRe)];
    if (moneyMatches.length === 0) return;

    const movMatch =
      moneyMatches.length >= 2 ? moneyMatches[moneyMatches.length - 2] : moneyMatches[moneyMatches.length - 1];
    const movStr = movMatch[0];
    const movIndex = movMatch.index ?? 0;
    const description = afterDate.slice(0, movIndex).trim();

    if (description.length < 3) return;
    if (/^saldo\b/i.test(description)) return;

    const parsedDate = parseDateSmart(rawDate, dateCtx);
    let amount = parseAmount(cleanPdfText(movStr));
    if (!parsedDate || amount === 0) return;

    const trimmedMov = movStr.trim();
    if (trimmedMov.startsWith('-')) {
      amount = -Math.abs(amount);
    } else if (looksLikeSaida(description, '')) {
      amount = -Math.abs(amount);
    } else if (looksLikeEntrada(description, '')) {
      amount = Math.abs(amount);
    }

    transactions.push({
      id: generateId(),
      date: parsedDate,
      description,
      amount,
      type: categorizeTransaction(description, amount),
      category: guessCategory(description),
      bank: bankName,
    });
  }

  for (const line of lines) parseOneLine(line);

  if (!transactions.length) {
    throw new Error(
      'Nao consegui ler as movimentacoes desse PDF do Banrisul. Confirme se o PDF tem texto selecionavel (nao e imagem). Se o layout mudou, envie um exemplo para ajustarmos o leitor.'
    );
  }

  return transactions;
}

function parseGenericCardPdf(pdfText: string, context: CardParserContext): ParsedCardPurchaseInput[] {
  if (looksLikeNeonBankStatement(pdfText)) {
    throw new Error(
      'Esse PDF parece ser um extrato da conta digital Neon, nao uma fatura do cartao. Importe em "Extrato bancario".'
    );
  }

  const cardPdfCtx = extractStatementPeriodInfo(pdfText).dateContext;

  const lines = pdfText
    .split(/\r?\n/)
    .map(cleanPdfText)
    .filter(Boolean);

  const regexes = [
    /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\d[\d.,]+)$/,
    /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\d[\d.,]+)$/,
    /^(\d{1,2}\/\d{1,2})\s+(.+?)\s+(-?\d[\d.,]+)$/,
  ];

  function buildRow(
    rawDate: string,
    description: string,
    rawAmount: string
  ): ParsedCardPurchaseInput | null {
    const parsedDate = parseDateSmart(rawDate, cardPdfCtx);
    const amount = Math.abs(parseAmount(rawAmount));
    if (!parsedDate || !description || amount === 0 || shouldIgnoreCardRow(description)) return null;

    return {
      id: generateId(),
      cardId: context.card.id,
      cardName: context.card.name,
      bankName: context.card.bankName,
      date: parsedDate,
      description: description.trim(),
      amount,
      category: guessCategory(description),
      sourceFormat: 'pdf',
      sourceName: context.fileName,
    };
  }

  const rows: ParsedCardPurchaseInput[] = [];
  for (const line of lines) {
    let matched: RegExpExecArray | null = null;
    for (const regex of regexes) {
      matched = regex.exec(line);
      if (matched) break;
    }
    if (!matched) continue;

    if (matched.length === 5) {
      const [, rawDate, , description, rawAmount] = matched;
      const row = buildRow(rawDate, description, rawAmount);
      if (row) rows.push(row);
      continue;
    }

    if (matched.length === 4) {
      const [, rawDate, description, rawAmount] = matched;
      const row = buildRow(rawDate, description, rawAmount);
      if (row) rows.push(row);
      continue;
    }

    const dateMatch = line.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    const amountMatches = [...line.matchAll(/-?\d[\d.]*,\d{2}/g)];
    const lastAmount = amountMatches.at(-1)?.[0];
    if (!dateMatch || !lastAmount) continue;

    const description = line
      .replace(dateMatch[0], '')
      .replace(lastAmount, '')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const row = buildRow(dateMatch[0], description, lastAmount);
    if (row) rows.push(row);
  }

  if (!rows.length) {
    const sample = lines.slice(0, 10).join(' | ');
    throw new Error(
      `Nao consegui identificar compras nesse PDF. Amostra lida: ${sample.slice(0, 220)}`
    );
  }

  return rows;
}

const cardCsvParsers: Record<string, CardCsvParser> = {
  neon: parseGenericCardCSV,
  banrisul: parseGenericCardCSV,
  mercado_pago: parseGenericCardCSV,
  nubank: parseGenericCardCSV,
  sicredi: parseGenericCardCSV,
};

const cardPdfParsers: Record<string, CardPdfParser> = {
  neon: parseGenericCardPdf,
  banrisul: parseGenericCardPdf,
  mercado_pago: parseGenericCardPdf,
  nubank: parseGenericCardPdf,
  sicredi: parseGenericCardPdf,
};

const bankPdfParsers: Record<string, BankPdfParser> = {
  Neon: parseNeonBankStatementPdf,
  Banrisul: parseBanrisulBankStatementPdf,
};

function resolveBankPdfParser(bankName: string): BankPdfParser | undefined {
  const key = Object.keys(bankPdfParsers).find(k => k.toLowerCase() === bankName.trim().toLowerCase());
  return key ? bankPdfParsers[key] : undefined;
}

export async function parseCardStatementFile(file: File, card: CardAccount): Promise<CardPurchase[]> {
  const extension = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv';
  const context: CardParserContext = { card, fileName: file.name };

  if (extension === 'pdf') {
    const parser = cardPdfParsers[card.bankId] || parseGenericCardPdf;
    const pdfText = await extractPdfText(file);
    return normalizeCardPurchases(parser(pdfText, context), card);
  }

  const parser = cardCsvParsers[card.bankId] || parseGenericCardCSV;
  const text = await file.text();
  return normalizeCardPurchases(parser(text, context), card);
}

export async function parseBankStatementFile(
  file: File,
  bankName: string
): Promise<{ transactions: Transaction[]; meta: BankStatementParseMeta }> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) {
    const text = await file.text();
    const { periodLabel } = extractStatementPeriodInfo(text);
    const transactions = parseOFX(text, bankName);
    const stmtTrnCount = (text.match(/<STMTTRN>/gi) || []).length;
    return {
      transactions,
      meta: { inputLinesApprox: stmtTrnCount, periodLabel },
    };
  }

  if (lower.endsWith('.pdf')) {
    const pdfText = await extractPdfText(file);
    const periodInfo = extractStatementPeriodInfo(pdfText);
    const parser = resolveBankPdfParser(bankName);
    if (!parser) {
      throw new Error(`PDF bancario ainda nao suportado para ${bankName}. Use CSV, OFX ou QFX.`);
    }
    const transactions = parser(pdfText, bankName, periodInfo.dateContext);
    const inputLinesApprox = pdfText.split(/\r?\n/).filter(l => l.trim().length > 0).length;
    return {
      transactions,
      meta: { inputLinesApprox, periodLabel: periodInfo.periodLabel },
    };
  }

  const text = await file.text();
  const periodInfo = extractStatementPeriodInfo(text);
  const transactions = parseCSV(text, bankName, periodInfo);
  const inputLinesApprox = text.split(/\r?\n/).filter(l => l.trim().length > 0).length - 1;
  return {
    transactions,
    meta: { inputLinesApprox: Math.max(inputLinesApprox, 0), periodLabel: periodInfo.periodLabel },
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(dateStr: string): string {
  try {
    const date = parse(dateStr, 'yyyy-MM-dd', new Date());
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function getMonthLabel(monthStr: string): string {
  try {
    const date = parse(`${monthStr}-01`, 'yyyy-MM-dd', new Date());
    return format(date, "MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return monthStr;
  }
}
