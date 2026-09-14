import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { AuthPage, ErrorMessage, LinkButton, Notice, PrimaryButton, TextField } from './CloudUi';
import { errorText } from './errorText';

export function ForgotPasswordScreen({
  provider,
  initialEmail,
  onBack,
}: {
  provider: CloudAuthProvider;
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await provider.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorText(err, 'Não foi possível pedir o link agora.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Esqueci a senha"
      subtitle="O link do e-mail devolve o acesso à conta. Seus dados só voltam com o kit de recuperação."
    >
      {sent ? (
        <Notice tone="success">
          Se houver uma conta com este e-mail, enviamos um link para criar uma senha nova. Abra o link{' '}
          <strong>neste mesmo navegador</strong>. Não chegou em alguns minutos? Confira o spam.
        </Notice>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="E-mail da conta"
            type="email"
            value={email}
            onChange={v => { setEmail(v); setError(''); }}
            autoComplete="email"
            autoFocus
            disabled={busy}
          />
          <ErrorMessage message={error} />
          <PrimaryButton busy={busy} busyLabel="Enviando...">
            <Mail className="h-4 w-4" aria-hidden="true" />
            Enviar link
          </PrimaryButton>
        </form>
      )}
      <div className="mt-4 flex justify-center">
        <LinkButton onClick={onBack} disabled={busy}>
          <span className="inline-flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Voltar ao login
          </span>
        </LinkButton>
      </div>
    </AuthPage>
  );
}
