import { useMemo, useState } from 'react';
import { CreditCard, X } from 'lucide-react';
import type { CardAccount, CardImportFormat } from '../types';
import { BANKS } from '../data/banks';

const FORMATS: { value: CardImportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
];

function makeId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CardAccountModal({
  initialCard,
  onClose,
  onSave,
}: {
  initialCard?: CardAccount | null;
  onClose: () => void;
  onSave: (card: CardAccount) => void;
}) {
  const [name, setName] = useState(initialCard?.name || '');
  const [bankId, setBankId] = useState(initialCard?.bankId || BANKS[0]?.id || 'neon');
  const [closingDay, setClosingDay] = useState(String(initialCard?.closingDay || 10));
  const [dueDay, setDueDay] = useState(String(initialCard?.dueDay || 17));
  const [supportedFormats, setSupportedFormats] = useState<CardImportFormat[]>(
    initialCard?.supportedFormats || ['csv', 'pdf']
  );
  const [error, setError] = useState('');

  const selectedBank = useMemo(
    () => BANKS.find(bank => bank.id === bankId) || BANKS[0],
    [bankId]
  );

  if (!selectedBank) return null;

  function toggleFormat(format: CardImportFormat) {
    setSupportedFormats(prev =>
      prev.includes(format) ? prev.filter(item => item !== format) : [...prev, format]
    );
  }

  function handleSave() {
    const normalizedName = name.trim();
    const closing = Number(closingDay);
    const due = Number(dueDay);

    if (!normalizedName) {
      setError('Dê um nome para o cartão.');
      return;
    }
    if (!Number.isInteger(closing) || closing < 1 || closing > 31) {
      setError('O fechamento precisa estar entre 1 e 31.');
      return;
    }
    if (!Number.isInteger(due) || due < 1 || due > 31) {
      setError('O vencimento precisa estar entre 1 e 31.');
      return;
    }
    if (!supportedFormats.length) {
      setError('Selecione pelo menos um formato de importação.');
      return;
    }

    onSave({
      id: initialCard?.id || makeId(),
      name: normalizedName,
      bankId: selectedBank.id,
      bankName: selectedBank.name,
      supportedFormats,
      closingDay: closing,
      dueDay: due,
      active: initialCard?.active ?? true,
      color: selectedBank.color,
      letter: selectedBank.letter,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-slate-950/76 backdrop-blur-sm" onClick={onClose} />
      <div className="dark-surface animate-scale-in relative w-full rounded-t-[28px] p-5 sm:max-w-xl sm:rounded-[28px] sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-inset ring-cyan-400/18">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              Cartao
            </p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-[color:var(--app-fg-strong)]">
              {initialCard ? 'Editar cartao' : 'Novo cartao'}
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              Configure o ciclo real da fatura para o app jogar os gastos no mes certo.
            </p>
          </div>
          <button onClick={onClose} className="shell-icon-button h-10 w-10 rounded-xl" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Nome do cartao
            </span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              placeholder="Ex: Neon principal"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Banco emissor
              </span>
              <select
                value={bankId}
                onChange={event => setBankId(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              >
                {BANKS.map(bank => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Status
              </span>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
                Ativo
              </div>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Dia de fechamento
              </span>
              <input
                value={closingDay}
                onChange={event => setClosingDay(event.target.value)}
                inputMode="numeric"
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Dia de vencimento
              </span>
              <input
                value={dueDay}
                onChange={event => setDueDay(event.target.value)}
                inputMode="numeric"
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08]"
              />
            </label>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Formatos aceitos
            </span>
            <div className="flex flex-wrap gap-3">
              {FORMATS.map(format => {
                const selected = supportedFormats.includes(format.value);
                return (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => toggleFormat(format.value)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      selected
                        ? 'border-cyan-300/16 bg-cyan-400/[0.10] text-cyan-100'
                        : 'border-white/10 bg-white/[0.04] text-slate-300'
                    }`}
                  >
                    {format.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-rose-200">{error}</p>}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(34,211,238,0.18)] transition hover:-translate-y-[1px]"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)' }}
          >
            Salvar cartao
          </button>
        </div>
      </div>
    </div>
  );
}
