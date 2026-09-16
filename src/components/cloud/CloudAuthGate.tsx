import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../context/useAuth';
import type { SignInResult } from '../../lib/auth';
import type { CloudAuthProvider } from '../../lib/cloud/cloudAuthProvider';
import { CloudLoginScreen } from './CloudLoginScreen';
import { CloudRegisterScreen } from './CloudRegisterScreen';
import { ConfirmEmailScreen } from './ConfirmEmailScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { NewPasswordScreen } from './NewPasswordScreen';
import { OpenWithKitScreen } from './OpenWithKitScreen';
import { VaultSetupScreen } from './VaultSetupScreen';
import type { VaultSetupPurpose } from './VaultSetupScreen';

type Screen =
  | { name: 'loading' }
  | { name: 'login'; notice?: ReactNode }
  | { name: 'register' }
  | { name: 'confirm-email' }
  | { name: 'forgot-password' }
  | { name: 'new-password' }
  | { name: 'vault-setup'; purpose: VaultSetupPurpose }
  | { name: 'open-with-kit' };

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
      if (start.passwordRecovery) {
        setScreen({ name: 'new-password' });
        return;
      }
      setScreen({
        name: 'login',
        notice:
          linkError ??
          (start.hasSession ? 'Digite sua senha para abrir seus dados. Ela nunca sai deste aparelho.' : undefined),
      });
    });
    const unsubscribe = provider.subscribeRecovery(() => {
      if (cancelled) return;
      setScreen({ name: 'new-password' });
      void provider.start().then(start => {
        if (!cancelled) setEmail(start.email);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
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
    else if (result.status === 'needs-vault-setup') setScreen({ name: 'vault-setup', purpose: 'setup' });
    else setScreen({ name: 'open-with-kit' });
  }

  function leave() {
    signOut();
    setScreen({ name: 'login' });
  }

  const prepareSetup = useCallback(() => provider.prepareVaultSetup(), [provider]);
  const prepareFreshKeys = useCallback(() => provider.prepareFreshKeys(), [provider]);

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
    case 'forgot-password':
      return <ForgotPasswordScreen provider={provider} initialEmail={email} onBack={() => setScreen({ name: 'login' })} />;
    case 'new-password':
      return <NewPasswordScreen provider={provider} email={email} onResult={handleResult} />;
    case 'vault-setup':
      return (
        <VaultSetupScreen
          key={screen.purpose}
          prepare={screen.purpose === 'setup' ? prepareSetup : prepareFreshKeys}
          purpose={screen.purpose}
          email={email}
          onReady={completeUnlock}
          onCancel={() => (screen.purpose === 'setup' ? leave() : setScreen({ name: 'open-with-kit' }))}
        />
      );
    case 'open-with-kit':
      return (
        <OpenWithKitScreen
          provider={provider}
          email={email}
          onUnlocked={completeUnlock}
          onRestoreBackup={() => setScreen({ name: 'vault-setup', purpose: 'restore-backup' })}
          onStartOver={() => setScreen({ name: 'vault-setup', purpose: 'start-over' })}
          onSignOut={leave}
        />
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
          onForgotPassword={typed => {
            setEmail(typed);
            setScreen({ name: 'forgot-password' });
          }}
        />
      );
  }
}
