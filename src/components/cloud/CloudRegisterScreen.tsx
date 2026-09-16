import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Globe2, UserPlus } from 'lucide-react';
import type { SignInResult } from '../../lib/auth';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { CLOUD_PASSWORD_MIN_LENGTH } from '../../lib/cloud/passwordPolicy';
import { LEGAL_TITLES, legalHash } from '../../lib/legal/routes';
import { AuthPage, ErrorMessage, FOCUS_RING, LinkButton, PasswordField, PrimaryButton, TextField } from './CloudUi';
import { errorText } from './errorText';

const DOC_LINK = `font-semibold text-cyan-200/90 underline decoration-cyan-200/40 underline-offset-4 hover:text-cyan-100 ${FOCUS_RING}`;

/** One consent, ticked on its own: the law asks for a separate choice for each purpose. */
function ConsentBox({
  checked,
  onChange,
  disabled,
  highlight = false,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  highlight?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`mt-3 flex gap-3 rounded-2xl px-4 py-3 ${highlight ? 'bg-amber-500/10 text-amber-100' : 'bg-white/[0.04] text-slate-300'}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className={`mt-1 h-4 w-4 flex-shrink-0 accent-cyan-400 ${FOCUS_RING}`}
      />
      <label htmlFor={id} className="text-sm leading-6">
        {children}
      </label>
    </div>
  );
}

export function CloudRegisterScreen({
  provider,
  onResult,
  onGoToLogin,
}: {
  provider: CloudAuthProvider;
  onResult: (result: SignInResult) => void;
  onGoToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedTransfer, setAcceptedTransfer] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Digite seu nome.'); return; }
    if (!email.trim()) { setError('Digite seu e-mail.'); return; }
    const rule = provider.validatePassword(password, { email });
    if (rule) { setError(rule); return; }
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    if (!acceptedTerms || !acceptedTransfer) { setError('Marque as duas caixas para criar a conta.'); return; }

    setBusy(true);
    try {
      const result = await provider.signUp({
        displayName: name,
        email,
        password,
        consent: { terms: acceptedTerms, internationalTransfer: acceptedTransfer },
      });
      setPassword('');
      setConfirm('');
      onResult(result);
    } catch (err) {
      setError(errorText(err, 'Não foi possível criar a conta.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Criar conta"
      subtitle="A senha abre seus dados e nunca sai deste aparelho. Ninguém consegue recuperá-la por você."
    >
      <form onSubmit={handleSubmit} noValidate>
        <TextField label="Seu nome" value={name} onChange={v => { setName(v); setError(''); }} autoComplete="nickname" autoFocus disabled={busy} />
        <TextField label="E-mail" type="email" value={email} onChange={v => { setEmail(v); setError(''); }} autoComplete="email" disabled={busy} />
        <PasswordField
          label="Senha"
          value={password}
          onChange={v => { setPassword(v); setError(''); }}
          autoComplete="new-password"
          disabled={busy}
          hint={`Pelo menos ${CLOUD_PASSWORD_MIN_LENGTH} caracteres. Uma frase com palavras que não combinam é fácil de lembrar e difícil de adivinhar.`}
        />
        <PasswordField
          label="Confirmar senha"
          value={confirm}
          onChange={v => { setConfirm(v); setError(''); }}
          autoComplete="new-password"
          disabled={busy}
        />
        <div className="mt-6">
          <ConsentBox checked={acceptedTerms} onChange={value => { setAcceptedTerms(value); setError(''); }} disabled={busy}>
            Li e aceito os{' '}
            <a href={legalHash('termos')} className={DOC_LINK}>
              {LEGAL_TITLES.termos}
            </a>{' '}
            e a{' '}
            <a href={legalHash('privacidade')} className={DOC_LINK}>
              {LEGAL_TITLES.privacidade}
            </a>
            .
          </ConsentBox>
          <ConsentBox
            checked={acceptedTransfer}
            onChange={value => { setAcceptedTransfer(value); setError(''); }}
            disabled={busy}
            highlight
          >
            <span className="flex items-start gap-2">
              <Globe2 className="mt-1 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Transferência internacional:</strong> entendo que os dados da minha
                conta (e-mail, nome e o cofre cifrado) são processados por empresas fora do Brasil — Supabase,
                Cloudflare e Google — e concordo com isso.
              </span>
            </span>
          </ConsentBox>
        </div>

        <ErrorMessage message={error} />
        <PrimaryButton busy={busy} busyLabel="Criando conta..." disabled={!acceptedTerms || !acceptedTransfer}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Criar conta
        </PrimaryButton>
      </form>
      <div className="mt-4 flex justify-center">
        <LinkButton onClick={onGoToLogin} disabled={busy}>
          <span className="inline-flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Já tenho conta
          </span>
        </LinkButton>
      </div>
    </AuthPage>
  );
}
