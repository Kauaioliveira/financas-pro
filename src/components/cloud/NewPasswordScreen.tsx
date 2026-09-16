import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { SignInResult } from '../../lib/auth';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { CLOUD_PASSWORD_MIN_LENGTH } from '../../lib/cloud/passwordPolicy';
import { AuthPage, ErrorMessage, PasswordField, PrimaryButton } from './CloudUi';
import { errorText } from './errorText';

export function NewPasswordScreen({
  provider,
  email,
  onResult,
}: {
  provider: CloudAuthProvider;
  email: string;
  onResult: (result: SignInResult) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const rule = provider.validatePassword(password, { email });
    if (rule) { setError(rule.replace('A senha', 'A nova senha')); return; }
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try {
      const result = await provider.completePasswordReset(password);
      setPassword('');
      setConfirm('');
      onResult(result);
    } catch (err) {
      setError(errorText(err, 'Não foi possível trocar a senha.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Nova senha" subtitle={email ? <>Conta: <strong className="text-slate-200">{email}</strong></> : undefined}>
      <div role="note" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.08] px-4 py-3 text-sm leading-6 text-amber-100">
        Isto devolve o acesso à sua conta. Para voltar a ver seus dados você vai precisar do{' '}
        <strong className="text-white">kit de recuperação</strong>. A FinançasPro não consegue abrir seus dados sem ele.
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="Nova senha"
          value={password}
          onChange={v => { setPassword(v); setError(''); }}
          autoComplete="new-password"
          autoFocus
          disabled={busy}
          hint={`Pelo menos ${CLOUD_PASSWORD_MIN_LENGTH} caracteres.`}
        />
        <PasswordField
          label="Confirmar nova senha"
          value={confirm}
          onChange={v => { setConfirm(v); setError(''); }}
          autoComplete="new-password"
          disabled={busy}
        />
        <ErrorMessage message={error} />
        <PrimaryButton busy={busy} busyLabel="Salvando a senha...">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Salvar nova senha
        </PrimaryButton>
      </form>
    </AuthPage>
  );
}
