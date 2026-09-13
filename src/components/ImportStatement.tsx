import { useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from '../context/useFinance';
import { useImportDraft } from '../context/useImportDraft';
import { parseBankStatementFile, formatCurrency, formatDate } from '../utils/parser';
import { getTypeLabel, getTypeColor } from '../utils/categorize';
import type { ImportMergeResult } from '../utils/importMerge';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  Plus,
  Building2,
  Loader2,
} from 'lucide-react';
import { BANKS } from '../data/banks';
import { BankPickerModal } from './BankPickerModal';

const LAST_BANK_KEY = 'financaspro_last_bank';
const FAVORITE_BANKS_KEY = 'financaspro_favorite_banks';

type ImportError = { message: string; needsBank?: boolean };

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function describeParseError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'PasswordException') {
    return 'Esse PDF está protegido por senha. Exporte o extrato de novo no app do banco sem senha, ou use OFX/CSV.';
  }
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
    return 'Esse arquivo não abriu como PDF — pode estar corrompido ou incompleto. Baixe o extrato de novo e tente outra vez.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Confira se o arquivo é CSV, OFX, QFX ou PDF com texto selecionável.';
}

function describeImportResult({ added, skipped }: ImportMergeResult): string {
  if (added.length === 0) {
    return skipped.length === 1
      ? 'Nada novo para importar: a transação deste arquivo já estava no app.'
      : `Nada novo para importar: as ${skipped.length} transações deste arquivo já estavam no app.`;
  }
  const addedText = `${added.length} ${plural(added.length, 'transação importada', 'transações importadas')}`;
  if (skipped.length === 0) return `${addedText}.`;
  return `${addedText} · ${skipped.length} ${plural(
    skipped.length,
    'já existia e foi ignorada',
    'já existiam e foram ignoradas'
  )}.`;
}

export function ImportStatement() {
  const { addTransactions } = useFinance();
  const { draft, setDraft } = useImportDraft();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [bankId, setBankId] = useState<string | null>(() => {
    try {
      return (localStorage.getItem(LAST_BANK_KEY) || '').trim() || null;
    } catch {
      return null;
    }
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(FAVORITE_BANKS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.filter(x => typeof x === 'string'));
      return new Set();
    } catch {
      return new Set();
    }
  });
  const [error, setError] = useState<ImportError | null>(null);
  const [importResult, setImportResult] = useState<ImportMergeResult | null>(null);
  const [fileName, setFileName] = useState(() => draft?.fileName ?? '');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const preview = draft?.preview ?? [];
  const importMeta = draft?.meta ?? null;

  const selectedBank = useMemo(() => {
    if (!bankId) return null;
    return BANKS.find(b => b.id === bankId) || null;
  }, [bankId]);

  const bankName = selectedBank?.name || '';

  useEffect(() => {
    if (!bankId) return;
    try {
      localStorage.setItem(LAST_BANK_KEY, bankId);
    } catch {
      // ignore
    }
  }, [bankId]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_BANKS_KEY, JSON.stringify(Array.from(favorites)));
    } catch {
      // ignore
    }
  }, [favorites]);

  function toggleFavorite(id: string) {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectBank(id: string) {
    setBankId(id);
    setIsBankOpen(false);
    setError(null);
    setImportResult(null);

    // O arquivo que esperava pelo banco é lido agora, sem pedir de novo.
    const pendingFile = pendingFileRef.current;
    pendingFileRef.current = null;
    const pickedBankName = BANKS.find(b => b.id === id)?.name;
    if (pendingFile && pickedBankName) void handleFile(pendingFile, pickedBankName);
  }

  async function handleFile(file: File, bank = bankName) {
    if (isLoading) return;
    setError(null);
    setImportResult(null);
    setFileName(file.name);

    if (!bank) {
      pendingFileRef.current = file;
      setError({ message: 'Selecione o banco antes de importar o arquivo.', needsBank: true });
      return;
    }

    setIsLoading(true);
    try {
      const { transactions, meta } = await parseBankStatementFile(file, bank);

      if (transactions.length === 0) {
        setError({
          message:
            'Nenhuma transação encontrada. Verifique se o arquivo está no formato correto (CSV, OFX, QFX ou PDF com texto selecionável).',
        });
        return;
      }

      setDraft({ preview: transactions, meta, fileName: file.name });
    } catch (err) {
      setError({ message: describeParseError(err) });
    } finally {
      setIsLoading(false);
    }
  }

  function openFilePicker() {
    if (!isLoading) fileInputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Limpa já, para que escolher o mesmo arquivo de novo dispare onChange.
    e.target.value = '';
    if (file) void handleFile(file);
  }

  function confirmImport() {
    setImportResult(addTransactions(preview));
    setDraft(null);
    setFileName('');
  }

  function cancelPreview() {
    setDraft(null);
    setFileName('');
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      {/* Step 1: Bank selection */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-3 mb-4 sm:mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            1
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-700">Selecione o Banco</h3>
          <button
            type="button"
            onClick={() => setIsBankOpen(true)}
            className="ml-auto px-3 sm:px-4 py-2 rounded-xl glass font-semibold cursor-pointer flex items-center gap-2 hover:bg-white/80 transition text-sm"
            title="Escolher banco"
          >
            <Building2 className="w-4 h-4 text-slate-500" />
            {selectedBank ? 'Trocar' : 'Escolher'}
          </button>
        </div>
        {selectedBank ? (
          <div className="flex items-center gap-3 sm:gap-4 rounded-2xl border border-white/30 bg-white/40 px-3 sm:px-5 py-3 sm:py-4">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow-md"
              style={{ backgroundColor: selectedBank.color }}
            >
              {selectedBank.letter}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Banco selecionado</p>
              <p className="text-sm sm:text-base font-extrabold text-slate-800 truncate">{selectedBank.name}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsBankOpen(true)}
              className="flex-shrink-0 px-3 sm:px-4 py-2 rounded-xl glass font-semibold cursor-pointer hover:bg-white/80 transition text-sm"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/50 p-6 text-slate-600">
            <p className="font-semibold">Nenhum banco selecionado.</p>
            <p className="text-sm text-slate-500 mt-1">
              Clique em <strong>Escolher</strong> para selecionar o banco antes de importar.
            </p>
          </div>
        )}
      </div>

      {/* Step 2: File upload */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 animate-fade-in stagger-2">
        <div className="flex flex-wrap items-center gap-3 mb-4 sm:mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            2
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-700">Envie o Arquivo</h3>
          <span className="text-xs font-medium text-slate-400 ml-auto">CSV, OFX, QFX, PDF</span>
        </div>

        <div
          onDragOver={e => { if (!isLoading) { e.preventDefault(); setIsDragging(true); } }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={isLoading ? undefined : handleDrop}
          onClick={openFilePicker}
          className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-16 text-center transition-all duration-300 ${
            isLoading
              ? 'border-slate-200 bg-slate-50/30 cursor-wait opacity-70'
              : isDragging
                ? 'border-primary-500 bg-primary-50/50 scale-[1.01] cursor-pointer'
                : 'border-slate-200 hover:border-primary-400 hover:bg-primary-50/20 cursor-pointer'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.ofx,.qfx,.txt,.pdf"
            onChange={handleFileInput}
            disabled={isLoading}
            aria-label="Selecionar arquivo para importar"
            className="hidden"
          />
          {isLoading ? (
            <>
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-primary-100">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              </div>
              <p className="text-slate-600 font-semibold text-lg mb-1 [overflow-wrap:anywhere]">Processando {fileName}...</p>
              <p className="text-sm text-slate-400">Aguarde enquanto o arquivo é lido.</p>
            </>
          ) : (
            <>
              <div className={`w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center transition-all ${
                isDragging ? 'bg-primary-100 scale-110' : 'bg-slate-100'
              }`}>
                <Upload className={`w-8 h-8 ${isDragging ? 'text-primary-500' : 'text-slate-400'}`} />
              </div>
              <p className="text-slate-600 font-semibold text-lg mb-1 [overflow-wrap:anywhere]">
                {fileName ? `📄 ${fileName}` : 'Arraste o arquivo aqui'}
              </p>
              <p className="text-sm text-slate-400">
                ou clique para selecionar do seu computador
              </p>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="animate-scale-in rounded-2xl p-4 mb-6 flex items-start gap-3"
          style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)' }}
        >
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800 [overflow-wrap:anywhere]">
              {fileName ? `Não foi possível importar ${fileName}` : 'Não foi possível importar'}
            </p>
            <p className="mt-1 text-sm text-red-700 [overflow-wrap:anywhere]">{error.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {error.needsBank ? (
                <button
                  type="button"
                  onClick={() => setIsBankOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-white"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Escolher banco
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-white"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Escolher outro arquivo
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            title="Fechar mensagem de erro"
            aria-label="Fechar mensagem de erro"
            className="cursor-pointer hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      {importResult && (
        <div
          role="status"
          className="animate-scale-in rounded-2xl p-4 mb-6 flex items-start gap-3"
          style={{
            background:
              importResult.added.length > 0
                ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                : 'linear-gradient(135deg, #f8fafc, #eef2ff)',
          }}
        >
          {importResult.added.length > 0 ? (
            <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                importResult.added.length > 0 ? 'text-emerald-700' : 'text-slate-700'
              }`}
            >
              {describeImportResult(importResult)}
            </p>
            {importResult.skipped.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                  {importResult.skipped.length === 1
                    ? 'Ver a transação ignorada'
                    : `Ver as ${importResult.skipped.length} transações ignoradas`}
                </summary>
                <p className="mt-2 text-xs text-slate-600">
                  Já havia no app um lançamento com a mesma data, descrição, valor e banco.
                </p>
                <ul className="mt-2 max-h-60 divide-y divide-slate-200/70 overflow-y-auto rounded-xl bg-white/60 text-xs">
                  {importResult.skipped.map(tx => (
                    <li key={tx.id} className="flex items-baseline gap-3 px-3 py-2">
                      <span className="shrink-0 tabular-nums text-slate-500">{formatDate(tx.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{tx.description}</span>
                      <span
                        className={`shrink-0 font-mono tabular-nums ${
                          tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {formatCurrency(tx.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <button
            onClick={() => setImportResult(null)}
            title="Fechar mensagem"
            aria-label="Fechar mensagem"
            className="cursor-pointer hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      <BankPickerModal
        open={isBankOpen}
        onClose={() => setIsBankOpen(false)}
        banks={BANKS}
        selectedId={bankId}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onSelect={handleSelectBank}
      />

      {/* Preview */}
      {preview.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden animate-scale-in">
          <div className="p-4 sm:p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-primary-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-700">
                  Pré-visualização
                </h3>
                <p className="text-xs text-slate-400">{preview.length} transações encontradas</p>
                {importMeta && (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-600">Leitura do arquivo:</span>{' '}
                    período detectado: {importMeta.periodLabel ?? 'não identificado no texto'} · ~{importMeta.inputLinesApprox}{' '}
                    linha(s) · {preview.length} lançamento(s).
                    {importMeta.inputLinesApprox > preview.length + 25 && (
                      <span className="text-amber-700 font-medium">
                        {' '}
                        Atenção: muitas linhas do arquivo não viraram lançamentos (layout diferente ou cabeçalhos).
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                onClick={cancelPreview}
                className="flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 text-sm font-semibold text-slate-600 glass rounded-xl hover:bg-white/80 cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmImport}
                className="flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                <Plus className="w-4 h-4" />
                Importar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Data</th>
                  <th className="text-left py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Descrição</th>
                  <th className="text-left py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Tipo</th>
                  <th className="text-left py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Categoria</th>
                  <th className="text-right py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Valor</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map(tx => (
                  <tr key={tx.id} className="border-t border-slate-100/50 hover:bg-white/40 transition-colors">
                    <td className="py-3 px-5 text-slate-600 whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="py-3 px-5 text-slate-800 max-w-xs truncate font-medium">{tx.description}</td>
                    <td className="py-3 px-5">
                      <span
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white"
                        style={{ backgroundColor: getTypeColor(tx.type) }}
                      >
                        {getTypeLabel(tx.type)}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-slate-500">{tx.category}</td>
                    <td className={`py-3 px-5 text-right font-mono font-bold ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="text-center text-sm text-slate-400 py-4 border-t border-slate-100/50">
                Mostrando 50 de {preview.length} transações
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 sm:mt-6 rounded-2xl p-4 sm:p-6 animate-fade-in stagger-3"
        style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
        <h3 className="text-sm font-bold text-primary-700 mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Dicas para exportar o extrato
        </h3>
        <ul className="text-sm text-primary-600/80 space-y-2">
          <li className="flex items-start gap-2">
            <span className="font-bold text-primary-500">Armazenamento:</span>
            os dados ficam criptografados no cofre da sua conta. Use Backup nas Configurações para exportar ou restaurar.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-primary-500">Neon:</span>
            App → Extrato → PDF (ou Compartilhar → CSV). PDF precisa ter texto selecionável, não foto.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-primary-500">Mercado Pago:</span>
            App → Atividade → Exportar relatório
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-primary-500">Banrisul:</span>
            Internet Banking → Extrato → PDF ou OFX. Se o PDF for só imagem, use OFX ou CSV.
          </li>
        </ul>
      </div>
    </div>
  );
}
