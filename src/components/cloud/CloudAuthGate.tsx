import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import type { SignInResult } from '../../lib/auth';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { CloudLoginScreen } from './CloudLoginScreen';
import { CloudRegisterScreen } from './CloudRegisterScreen';
import { ConfirmEmailScreen } from './ConfirmEmailScreen';
import { VaultSetupScreen } from './VaultSetupScreen';
import { AuthPage, SecondaryButton } from './CloudUi';

type Screen =
  | { name: 'loading' }
  | { name: 'login'; notice?: ReactNode }
  | { name: 'register' }
  | { name: 'confirm-email' }
  | { name: 'vault-setup' }
  | { name: 'needs-kit' };

export function CloudAuthGate({
  provider,
  linkError,
  children,
}: {
  provider: CloudAuthProvider;
  linkError: string | null;
  children: ReactNode;
}) {
  const { state, completeUnlock, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [email, setEmail] = useState('');
  const prevStatus = useRef(state.status);

  useEffect(() => {
    let cancelled = false;
    provider.start().then(start => {
      if (cancelled) return;
      setEmail(start.email);
      setScreen({
        name: 'login',
        notice:
          linkError ??
          (start.hasSession ? 'Digite sua senha para abrir seus dados. Ela nunca sai deste aparelho.' : undefined),
      });
    });
    return () => { cancelled = true; };
  }, [provider, linkError]);

  // Back to the login after sign out or idle lock, keeping the e-mail.
  useEffect(() => {
    if (prevStatus.current === 'unlocked' && state.status === 'locked') {
      setScreen({ name: 'login' });
    }
    prevStatus.current = state.status;
  }, [state.status]);

  function handleResult(result: SignInResult) {
    if (result.status === 'unlocked') {
      completeUnlock(result.session);
      return;
    }
    setEmail(result.email);
    if (result.status === 'needs-email-confirmation') setScreen({ name: 'confirm-email' });
    else if (result.status === 'needs-vault-setup') setScreen({ name: 'vault-setup' });
    else setScreen({ name: 'needs-kit' });
  }

  async function leave() {
    signOut();
    setScreen({ name: 'login' });
  }

  if (state.status === 'unlocked') return <>{children}</>;

  switch (screen.name) {
    case 'loading':
      return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--app-bg)' }}>
          <p role="status" className="text-sm text-slate-400">Carregando...</p>
        </div>
      );
    case 'register':
      return <CloudRegisterScreen provider={provider} onResult={handleResult} onGoToLogin={() => setScreen({ name: 'login' })} />;
    case 'confirm-email':
      return <ConfirmEmailScreen email={email} onContinue={() => setScreen({ name: 'login' })} />;
    case 'vault-setup':
      return (
        <VaultSetupScreen
          provider={provider}
          email={email}
          onReady={completeUnlock}
          onCancel={() => void leave()}
        />
      );
    case 'needs-kit':
      return (
        <AuthPage title="Seus dados não abrem com esta senha">
          <p role="alert" className="mt-4 text-sm leading-6 text-slate-300">
            A senha desta conta foi redefinida por e-mail. Ela devolve o acesso à conta, mas os dados continuam
            cifrados com a senha anterior. Para abri-los você vai precisar do kit de recuperação.
          </p>
          <SecondaryButton onClick={() => void leave()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </SecondaryButton>
        </AuthPage>
      );
    case 'login':
    default:
      return (
        <CloudLoginScreen
          key={email}
          provider={provider}
          initialEmail={email}
          notice={screen.name === 'login' ? screen.notice : undefined}
          onResult={handleResult}
          onGoToRegister={() => setScreen({ name: 'register' })}
        />
      );
  }
}
