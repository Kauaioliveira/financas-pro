import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  Info,
  Loader2,
  Pencil,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useFinance } from '../context/useFinance';
import { useImportDraft } from '../context/useImportDraft';
import type { CardAccount, CardPurchase } from '../types';
import {
  describeCardImportResult,
  describeCardStatementError,
  getCardFileFormat,
  groupPurchasesByInvoice,
} from '../utils/cardImport';
import { buildCardPurchase, getInvoiceStatus } from '../utils/credit';
import type { ImportMergeResult } from '../utils/importMerge';
import { formatCurrency, formatDate, getMonthLabel, parseCardStatementFile } from '../utils/parser';
import { CardAccountModal } from './CardAccountModal';
import { CardPickerModal } from './CardPickerModal';

type ImportErrorAction = 'file' | 'card' | 'new-card' | 'edit-card';
type ImportError = { message: string; action: ImportErrorAction };

const PREVIEW_ROWS_PER_INVOICE = 50;
const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

function formatList(formats: string[]): string {
  return formats.map(format => format.toUpperCase()).join(' ou ');
}

export function CardStatementImport({
  onClose,
  autoFocus = false,
}: {
  onClose: () => void;
  autoFocus?: boolean;
}) {
  const { cardAccounts, addCardAccount, updateCardAccount, addCardPurchases } = useFinance();
  const { cardDraft, setCardDraft } = useImportDraft();
  const inputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(() => cardDraft?.cardId ?? null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [cardEditor, setCardEditor] = useState<{ card: CardAccount | null } | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  const [importResult, setImportResult] = useState<ImportMergeResult<CardPurchase> | null>(null);
  const [fileName, setFileName] = useState(() => cardDraft?.fileName ?? '');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Com um único cartão cadastrado, ele já vem escolhido.
  const selectedCard =
    cardAccounts.find(card => card.id === selectedCardId) ??
    (cardAccounts.length === 1 ? cardAccounts[0] : null);

  // Recalcula a fatura de cada compra com a configuração atual do cartão, para
  // que editar fechamento/vencimento com a pré-visualização aberta não a deixe
  // desatualizada.
  const previewCard = cardDraft ? cardAccounts.find(card => card.id === cardDraft.cardId) ?? null : null;
  const previewPurchases = useMemo(
    () =>
      cardDraft && previewCard
        ? cardDraft.preview.map(purchase =>
            buildCardPurchase(
              { ...purchase, cardName: previewCard.name, bankName: previewCard.bankName },
              previewCard
            )
          )
        : [],
    [cardDraft, previewCard]
  );
  const previewGroups = useMemo(
    () => (previewCard ? groupPurchasesByInvoice(previewPurchases, previewCard) : []),
    [previewPurchases, previewCard]
  );
  const previewTotal = previewGroups.reduce((sum, group) => sum + group.total, 0);

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus]);

  async function handleFile(file: File, card: CardAccount | null = selectedCard) {
    if (isLoading) return;
    setError(null);
    setImportResult(null);
    setFileName(file.name);

    const format = getCardFileFormat(file.name);
    if (!format) {
      setError({
        message:
          'Envie a fatura em CSV ou PDF. Arquivos OFX e QFX são de extrato bancário — importe-os na aba Importar Extrato.',
        action: 'file',
      });
      return;
    }

    if (!card) {
      pendingFileRef.current = file;
      setError(
        cardAccounts.length === 0
          ? { message: 'Cadastre o cartão desta fatura para continuar. O arquivo é lido logo depois.', action: 'new-card' }
          : { message: 'Escolha o cartão desta fatura para continuar. O arquivo é lido logo depois.', action: 'card' }
      );
      return;
    }

    if (!card.supportedFormats.includes(format)) {
      pendingFileRef.current = file;
      setError({
        message: `O cartão ${card.name} está configurado para aceitar só ${formatList(card.supportedFormats)}. Envie a fatura nesse formato ou edite o cartão para aceitar ${format.toUpperCase()}.`,
        action: 'edit-card',
      });
      return;
    }

    pendingFileRef.current = null;
    setIsLoading(true);
    try {
      const purchases = await parseCardStatementFile(file, card);
      if (purchases.length === 0) {
        setCardDraft(null);
        setError({
          message:
            'Nenhuma compra encontrada nesse arquivo. Confira se é a fatura do cartão — linhas de pagamento, juros, anuidade e totais são ignoradas.',
          action: 'file',
        });
        return;
      }
      setCardDraft({ cardId: card.id, preview: purchases, fileName: file.name, file });
    } catch (err) {
      setCardDraft(null);
      setError({ message: describeCardStatementError(err), action: 'file' });
    } finally {
      setIsLoading(false);
    }
  }

  /** Arquivo à espera de um cartão, ou o da pré-visualização atual. */
  function takeFileToReread(): File | null {
    const file = pendingFileRef.current ?? cardDraft?.file ?? null;
    pendingFileRef.current = null;
    return file;
  }

  function handleSelectCard(cardId: string) {
    setIsPickerOpen(false);
    setSelectedCardId(cardId);
    setError(null);
    setImportResult(null);

    const card = cardAccounts.find(item => item.id === cardId) ?? null;
    if (cardDraft?.cardId === cardId && !pendingFileRef.current) return;
    const file = takeFileToReread();
    if (!file || !card) return;
    // A pré-visualização era do outro cartão: não pode ser confirmada.
    setCardDraft(null);
    void handleFile(file, card);
  }

  function handleSaveCard(card: CardAccount) {
    if (cardEditor?.card) updateCardAccount(card);
    else addCardAccount(card);
    setSelectedCardId(card.id);
    setError(null);

    const file = pendingFileRef.current;
    pendingFileRef.current = null;
    if (file) void handleFile(file, card);
  }

  function openFilePicker() {
    if (!isLoading) fileInputRef.current?.click();
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Limpa já, para que escolher o mesmo arquivo de novo dispare onChange.
    event.target.value = '';
    if (file) void handleFile(file);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function confirmImport() {
    if (previewPurchases.length === 0) return;
    setImportResult(addCardPurchases(previewPurchases));
    setCardDraft(null);
    setFileName('');
  }

  function cancelPreview() {
    setCardDraft(null);
    setFileName('');
  }

  function runErrorAction(action: ImportErrorAction) {
    if (action === 'file') openFilePicker();
    else if (action === 'card') setIsPickerOpen(true);
    else if (action === 'new-card') setCardEditor({ card: null });
    else if (selectedCard) setCardEditor({ card: selectedCard });
  }

  const errorActionLabel: Record<ImportErrorAction, string> = {
    file: 'Escolher outro arquivo',
    card: 'Escolher cartão',
    'new-card': 'Cadastrar cartão',
    'edit-card': 'Editar cartão',
  };

  const accept = selectedCard
    ? selectedCard.supportedFormats.map(format => `.${format}`).join(',')
    : '.csv,.pdf';
  const invoiceMonthsAdded = importResult
    ? Array.from(new Set(importResult.added.map(purchase => purchase.paymentMonth))).sort()
    : [];

  return (
    <section className="dark-surface animate-fade-in rounded-[16px] sm:rounded-[24px] p-4 sm:p-6" aria-labelledby={`${inputId}-title`}>
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-inset ring-cyan-400/18">
          <Upload className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">Importação</p>
          <h3
            id={`${inputId}-title`}
            ref={headingRef}
            tabIndex={-1}
            className="font-display mt-2 text-xl sm:text-2xl font-semibold text-white outline-none"
          >
            Importar fatura do cartão
          </h3>
          <p className="mt-2 text-sm leading-6 sm:leading-7 text-slate-400">
            Compras no cartão não contam no dia da compra: entram nos gastos pelo total da fatura, no mês do
            vencimento. Compras feitas depois do fechamento vão para a fatura seguinte.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`shell-icon-button h-10 w-10 flex-shrink-0 rounded-xl ${FOCUS_RING}`}
          title="Fechar importação"
          aria-label="Fechar importação"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {/* Passo 1: cartão */}
        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
          <StepTitle number={1} title="Cartão da fatura" />
          {cardAccounts.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/25 px-4 py-5">
              <p className="text-sm font-semibold text-slate-100">Nenhum cartão cadastrado.</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Cadastre o cartão com os dias de fechamento e vencimento para o app saber em qual fatura cada compra
                cai.
              </p>
              <button
                type="button"
                onClick={() => setCardEditor({ card: null })}
                className={`mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(34,211,238,0.18)] transition hover:-translate-y-[1px] ${FOCUS_RING}`}
                style={{ background: CTA_GRADIENT }}
              >
                <Plus className="h-4 w-4" />
                Cadastrar cartão
              </button>
            </div>
          ) : selectedCard ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/35 p-3">
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold text-white shadow-md"
                style={{ backgroundColor: selectedCard.color }}
              >
                {selectedCard.letter}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{selectedCard.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedCard.bankName} · fecha dia {selectedCard.closingDay} · vence dia {selectedCard.dueDay}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setCardEditor({ card: selectedCard })}
                  disabled={isLoading}
                  className={`rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}
                  title="Editar cartão"
                  aria-label={`Editar cartão ${selectedCard.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {cardAccounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(true)}
                    disabled={isLoading}
                    className={`rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    Trocar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/25 px-4 py-5">
              <p className="text-sm text-slate-400">Escolha de qual cartão é a fatura que você vai enviar.</p>
              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className={`mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(34,211,238,0.18)] transition hover:-translate-y-[1px] ${FOCUS_RING}`}
                style={{ background: CTA_GRADIENT }}
              >
                <CreditCard className="h-4 w-4" />
                Escolher cartão
              </button>
            </div>
          )}
        </div>

        {/* Passo 2: arquivo */}
        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
          <StepTitle
            number={2}
            title="Arquivo da fatura"
            hint={selectedCard ? formatList(selectedCard.supportedFormats) : 'CSV ou PDF'}
          />
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={accept}
            onChange={handleFileInput}
            disabled={isLoading}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            onDragOver={event => {
              if (isLoading) return;
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-300 ${
              isLoading
                ? 'cursor-wait border-white/10 bg-slate-950/25 opacity-70'
                : isDragging
                  ? 'cursor-pointer border-cyan-300/60 bg-cyan-400/[0.08]'
                  : 'cursor-pointer border-white/12 bg-slate-950/25 hover:border-cyan-300/40 hover:bg-cyan-400/[0.05]'
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-7 w-7 animate-spin text-cyan-200" aria-hidden="true" />
            ) : (
              <Upload className={`h-7 w-7 ${isDragging ? 'text-cyan-200' : 'text-slate-400'}`} aria-hidden="true" />
            )}
            <span className="mt-3 block text-sm font-semibold text-slate-100 [overflow-wrap:anywhere]">
              {isLoading ? `Lendo ${fileName}…` : fileName ? fileName : 'Arraste o arquivo da fatura aqui'}
            </span>
            <span className="mt-1 block text-xs text-slate-400">
              {isLoading ? 'Aguarde enquanto as compras são lidas.' : 'ou clique para escolher no computador'}
            </span>
          </label>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            O arquivo é lido só neste navegador. PDF precisa ter texto selecionável — foto ou digitalização não
            funciona.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="animate-scale-in mt-4 flex items-start gap-3 rounded-[20px] border border-rose-400/20 bg-rose-500/10 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-300" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-100 [overflow-wrap:anywhere]">
              {fileName ? `Não foi possível importar ${fileName}` : 'Não foi possível importar'}
            </p>
            <p className="mt-1 text-sm leading-6 text-rose-100/85 [overflow-wrap:anywhere]">{error.message}</p>
            <button
              type="button"
              onClick={() => runErrorAction(error.action)}
              className={`mt-3 inline-flex items-center gap-1.5 rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/20 ${FOCUS_RING}`}
            >
              {errorActionLabel[error.action]}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            title="Fechar mensagem de erro"
            aria-label="Fechar mensagem de erro"
            className={`rounded-lg p-1 text-rose-200/70 transition hover:text-rose-100 ${FOCUS_RING}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div role="status">
        {importResult && (
          <div
            className={`animate-scale-in mt-4 flex items-start gap-3 rounded-[20px] border p-4 ${
              importResult.added.length > 0
                ? 'border-emerald-400/20 bg-emerald-500/10'
                : 'border-white/10 bg-white/[0.04]'
            }`}
          >
            {importResult.added.length > 0 ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-300" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-200" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold ${
                  importResult.added.length > 0 ? 'text-emerald-100' : 'text-slate-100'
                }`}
              >
                {describeCardImportResult(importResult)}
              </p>
              {invoiceMonthsAdded.length > 0 && (
                <p className="mt-1 text-sm text-slate-300">
                  Entram nos gastos de {invoiceMonthsAdded.map(getMonthLabel).join(', ')}, pelo total de cada
                  fatura.
                </p>
              )}
              {importResult.skipped.length > 0 && (
                <details className="mt-2">
                  <summary
                    className={`cursor-pointer rounded text-xs font-semibold text-slate-300 hover:text-white ${FOCUS_RING}`}
                  >
                    {importResult.skipped.length === 1
                      ? 'Ver a compra ignorada'
                      : `Ver as ${importResult.skipped.length} compras ignoradas`}
                  </summary>
                  <p className="mt-2 text-xs text-slate-400">
                    Já havia no app uma compra com o mesmo cartão, data, descrição e valor.
                  </p>
                  <ul className="mt-2 max-h-60 divide-y divide-white/8 overflow-y-auto rounded-xl border border-white/8 bg-slate-950/35 text-xs">
                    {importResult.skipped.map(purchase => (
                      <li key={purchase.id} className="flex items-baseline gap-3 px-3 py-2">
                        <span className="shrink-0 tabular-nums text-slate-400">{formatDate(purchase.date)}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-200">{purchase.description}</span>
                        <span className="shrink-0 font-mono tabular-nums text-amber-100">
                          {formatCurrency(purchase.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              title="Fechar mensagem"
              aria-label="Fechar mensagem"
              className={`rounded-lg p-1 text-slate-400 transition hover:text-slate-200 ${FOCUS_RING}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {previewCard && previewGroups.length > 0 && (
        <div className="animate-scale-in mt-6 rounded-[20px] border border-white/8 bg-white/[0.03]">
          <div className="flex flex-col gap-4 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-100">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Pré-visualização</p>
                <p className="mt-1 text-xs leading-5 text-slate-400 [overflow-wrap:anywhere]">
                  {cardDraft?.fileName} · {previewCard.name} · {previewPurchases.length}{' '}
                  {previewPurchases.length === 1 ? 'compra' : 'compras'} em {previewGroups.length}{' '}
                  {previewGroups.length === 1 ? 'fatura' : 'faturas'} · {formatCurrency(previewTotal)}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Nada foi salvo ainda. Confira em qual fatura cada compra cai antes de confirmar.
                </p>
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                onClick={cancelPreview}
                className={`flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] sm:flex-initial ${FOCUS_RING}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(34,211,238,0.18)] transition hover:-translate-y-[1px] sm:flex-initial ${FOCUS_RING}`}
                style={{ background: CTA_GRADIENT }}
              >
                <Plus className="h-4 w-4" />
                Confirmar importação
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-4">
            {previewGroups.map(group => {
              const isClosed = getInvoiceStatus({ paid: false, closeDate: group.closeDate }) !== 'aberta';
              const hiddenRows = group.purchases.length - PREVIEW_ROWS_PER_INVOICE;
              return (
                <article key={group.id} className="rounded-2xl border border-white/8 bg-slate-950/35">
                  <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Fatura com vencimento em {formatDate(group.dueDate)}
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Fecha em {formatDate(group.closeDate)} · entra nos gastos de{' '}
                        <span className="font-semibold text-cyan-100">{getMonthLabel(group.paymentMonth)}</span>
                      </p>
                      <p className={`mt-1 text-xs font-semibold ${isClosed ? 'text-cyan-100' : 'text-amber-100'}`}>
                        {isClosed
                          ? 'Fatura fechada'
                          : 'Ciclo ainda aberto: até vencer, aparece em Compras abertas'}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-lg font-semibold text-white">{formatCurrency(group.total)}</p>
                      <p className="text-xs text-slate-400">
                        {group.purchases.length} {group.purchases.length === 1 ? 'compra' : 'compras'}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto border-t border-white/8">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Compras da fatura com vencimento em {formatDate(group.dueDate)}
                      </caption>
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-slate-400">
                          <th scope="col" className="px-4 py-2.5 font-semibold">Data</th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">Descrição</th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">Categoria</th>
                          <th scope="col" className="px-4 py-2.5 text-right font-semibold">Valor</th>
                          <th scope="col" className="px-4 py-2.5 font-semibold">Entra nos gastos de</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.purchases.slice(0, PREVIEW_ROWS_PER_INVOICE).map(purchase => (
                          <tr key={purchase.id} className="border-t border-white/[0.06]">
                            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-300">
                              {formatDate(purchase.date)}
                            </td>
                            <td className="max-w-xs truncate px-4 py-2.5 font-medium text-slate-100">
                              {purchase.description}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{purchase.category}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-amber-100">
                              {formatCurrency(purchase.amount)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-cyan-100">
                              {getMonthLabel(purchase.paymentMonth)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {hiddenRows > 0 && (
                      <p className="border-t border-white/[0.06] px-4 py-3 text-center text-xs text-slate-400">
                        Mostrando {PREVIEW_ROWS_PER_INVOICE} de {group.purchases.length} compras desta fatura. Todas
                        entram ao confirmar.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <CardPickerModal
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        cards={cardAccounts}
        selectedId={selectedCard?.id ?? null}
        onSelect={handleSelectCard}
      />

      {cardEditor && (
        <CardAccountModal
          key={cardEditor.card?.id || 'new-card'}
          initialCard={cardEditor.card}
          onClose={() => setCardEditor(null)}
          onSave={handleSaveCard}
        />
      )}
    </section>
  );
}

function StepTitle({ number, title, hint }: { number: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
        style={{ background: CTA_GRADIENT }}
        aria-hidden="true"
      >
        {number}
      </span>
      <p className="text-sm font-semibold text-white">
        <span className="sr-only">Passo {number}: </span>
        {title}
      </p>
      {hint && <span className="ml-auto text-xs font-medium text-slate-400">{hint}</span>}
    </div>
  );
}
