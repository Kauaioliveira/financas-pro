import { useState } from 'react';
import type { ReactNode } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import type { SignInResult } from '../../lib/auth';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { LegalLinks } from '../LegalLinks';
import { AuthPage, ErrorMessage, LinkButton, Notice, PasswordField, PrimaryButton, TextField } from './CloudUi';
import { errorText } from './errorText';

export function CloudLoginScreen({
  provider,
  initialEmail,
  notice,
  onResult,
  onGoToRegister,
  onForgotPassword,
}: {
  provider: CloudAuthProvider;
  initialEmail: string;
  notice?: ReactNode;
  onResult: (result: SignInResult) => void;
  onGoToRegister: () => void;
  onForgotPassword?: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Digite e-mail e senha.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await provider.signIn({ email, password });
      setPassword('');
      onResult(result);
    } catch (err) {
      setError(errorText(err, 'Não foi possível entrar.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Entrar">
      {notice && <Notice>{notice}</Notice>}
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={value => { setEmail(value); setError(''); }}
          autoComplete="email"
          autoFocus={!initialEmail}
          disabled={busy}
        />
        <PasswordField
          label="Senha"
          value={password}
          onChange={value => { setPassword(value); setError(''); }}
          autoComplete="current-password"
          autoFocus={Boolean(initialEmail)}
          disabled={busy}
        />
        <ErrorMessage message={error} />
        <PrimaryButton busy={busy} busyLabel="Abrindo seus dados...">
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Entrar
        </PrimaryButton>
      </form>

      <div className="mt-5 flex flex-col items-center gap-1">
        {onForgotPassword && (
          <LinkButton onClick={() => onForgotPassword(email)} disabled={busy}>
            Esqueci a senha
          </LinkButton>
        )}
        <LinkButton onClick={onGoToRegister} disabled={busy}>
          <span className="inline-flex items-center gap-1.5 text-cyan-200/80">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Criar conta
          </span>
        </LinkButton>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4 text-center">
        <LegalLinks />
      </div>
    </AuthPage>
  );
}
