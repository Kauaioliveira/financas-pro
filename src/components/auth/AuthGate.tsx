import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { RecoveryScreen } from './RecoveryScreen';
import { hasLegacyData } from '../../utils/secureStorage';

type Screen = 'login' | 'register' | 'recovery';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { usersLoaded } = useAuth();
  // The account list is read asynchronously; pick the first screen only after it arrives.
  if (!usersLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--app-bg)' }}>
        <p role="status" className="text-sm text-slate-400">Carregando...</p>
      </div>
    );
  }
  return <AuthScreens>{children}</AuthScreens>;
}

function AuthScreens({ children }: { children: React.ReactNode }) {
  const { state, users } = useAuth();
  const [screen, setScreen] = useState<Screen>(() => {
    if (users.length === 0) return 'register';
    return 'login';
  });
  const prevStatus = useRef(state.status);

  useEffect(() => {
    if (prevStatus.current === 'unlocked' && state.status === 'locked') {
      setScreen(users.length === 0 ? 'register' : 'login');
    }
    prevStatus.current = state.status;
  }, [state.status, users.length]);

  if (state.status === 'unlocked') {
    return <>{children}</>;
  }

  const hasLegacy = hasLegacyData();

  switch (screen) {
    case 'register':
      return (
        <RegisterScreen
          onGoToLogin={() => setScreen('login')}
          hasExistingUsers={users.length > 0}
          hasLegacyData={hasLegacy}
        />
      );
    case 'recovery':
      return (
        <RecoveryScreen
          onGoToLogin={() => setScreen('login')}
        />
      );
    case 'login':
    default:
      return (
        <LoginScreen
          onGoToRegister={() => setScreen('register')}
          onGoToRecovery={() => setScreen('recovery')}
        />
      );
  }
}
