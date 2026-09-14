import { useState } from 'react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import type { SignInResult } from '../../lib/auth';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { CLOUD_PASSWORD_MIN_LENGTH } from '../../lib/cloud/passwordPolicy';
import { AuthPage, ErrorMessage, LinkButton, PasswordField, PrimaryButton, TextField } from './CloudUi';
import { errorText } from './errorText';

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

    setBusy(true);
    try {
      const result = await provider.signUp({ displayName: name, email, password });
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
        <ErrorMessage message={error} />
        <PrimaryButton busy={busy} busyLabel="Criando conta...">
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
