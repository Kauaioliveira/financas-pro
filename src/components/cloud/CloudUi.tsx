import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, EyeOff, Loader2, Wallet } from 'lucide-react';

export const CTA_GRADIENT = 'linear-gradient(135deg, #22d3ee, #3b82f6)';
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';
const INPUT_CLASS =
  'mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-300/50 disabled:opacity-60';

/** Page frame of the cloud auth screens, in the same visual language as the local ones. */
export function AuthPage({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-[0_20px_50px_rgba(14,165,233,0.3)]"
            style={{ background: CTA_GRADIENT }}
          >
            <Wallet className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-semibold text-[color:var(--app-fg-strong)]">FinançasPro</p>
          <p className="mt-2 text-sm text-slate-400">Seus dados são cifrados antes de sair deste aparelho.</p>
        </div>
        <div className="dark-surface rounded-[24px] p-6 sm:p-8">
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {subtitle && <div className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  autoFocus,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        spellCheck={type === 'email' ? false : undefined}
        className={INPUT_CLASS}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`${INPUT_CLASS} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className={`absolute right-1.5 top-[calc(50%+4px)] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 ${FOCUS_RING}`}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PrimaryButton({
  children,
  busy = false,
  busyLabel,
  type = 'submit',
  onClick,
  disabled,
}: {
  children: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  type?: 'submit' | 'button';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(34,211,238,0.2)] transition hover:-translate-y-[1px] disabled:opacity-50 ${FOCUS_RING}`}
      style={{ background: CTA_GRADIENT }}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:text-cyan-200 disabled:opacity-50 ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200">
      {message}
    </p>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const classes = {
    info: 'bg-cyan-500/10 text-cyan-100',
    warning: 'bg-amber-500/10 text-amber-100',
    success: 'bg-emerald-500/10 text-emerald-100',
  }[tone];
  return (
    <div role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${classes}`}>
      {children}
    </div>
  );
}
