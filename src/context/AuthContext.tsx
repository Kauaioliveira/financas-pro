import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createLocalAuthProvider } from '../lib/auth';
import type { AuthProvider as AuthProviderType, UserAccount } from '../lib/auth';
import type { VaultEnvelope } from '../lib/crypto';
import { AuthCtx } from './AuthContext.shared';
import type { AuthState } from './AuthContext.shared';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [provider] = useState<AuthProviderType>(() => createLocalAuthProvider());
  const [state, setState] = useState<AuthState>({ status: 'locked' });
  const [users, setUsers] = useState<UserAccount[]>(() => provider.listUsers());
  const dataKeyRef = useRef<CryptoKey | null>(null);

  const refreshUsers = useCallback(() => {
    setUsers(provider.listUsers());
  }, [provider]);

  const register = useCallback(async (displayName: string, password: string) => {
    const session = await provider.register(displayName, password);
    dataKeyRef.current = session.dataKey;
    setState({ status: 'unlocked', session });
    refreshUsers();
  }, [provider, refreshUsers]);

  const signIn = useCallback(async (userId: string, password: string) => {
    const session = await provider.signIn(userId, password);
    dataKeyRef.current = session.dataKey;
    setState({ status: 'unlocked', session });
  }, [provider]);

  const signOut = useCallback(() => {
    dataKeyRef.current = null;
    provider.signOut();
    setState({ status: 'locked' });
  }, [provider]);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (state.status !== 'unlocked') throw new Error('Sessão expirada.');
    await provider.changePassword(state.session.userId, oldPassword, newPassword);
    // Re-sign-in to get fresh data key from new envelope
    const session = await provider.signIn(state.session.userId, newPassword);
    dataKeyRef.current = session.dataKey;
    setState({ status: 'unlocked', session });
  }, [provider, state]);

  const deleteAccount = useCallback(async (password: string) => {
    if (state.status !== 'unlocked') throw new Error('Sessão expirada.');
    await provider.deleteAccount(state.session.userId, password);
    dataKeyRef.current = null;
    setState({ status: 'locked' });
    refreshUsers();
  }, [provider, state, refreshUsers]);

  const getDataKey = useCallback(() => dataKeyRef.current, []);

  const getUserId = useCallback(
    () => (state.status === 'unlocked' ? state.session.userId : null),
    [state],
  );

  const getDisplayName = useCallback(
    () => (state.status === 'unlocked' ? state.session.displayName : ''),
    [state],
  );

  const getEnvelope = useCallback(
    () => {
      if (state.status !== 'unlocked') return null;
      return provider.getEnvelope(state.session.userId);
    },
    [provider, state],
  );

  const updateEnvelope = useCallback(
    (envelope: VaultEnvelope) => {
      if (state.status !== 'unlocked') return;
      provider.updateEnvelope(state.session.userId, envelope);
    },
    [provider, state],
  );

  // Auto-lock on page unload
  useEffect(() => {
    const handler = () => { dataKeyRef.current = null; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Auto-lock after 15 minutes of inactivity
  useEffect(() => {
    if (state.status !== 'unlocked') return;

    const IDLE_MS = 15 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        dataKeyRef.current = null;
        provider.signOut();
        setState({ status: 'locked' });
      }, IDLE_MS);
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    for (const evt of events) window.addEventListener(evt, resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timer);
      for (const evt of events) window.removeEventListener(evt, resetTimer);
    };
  }, [state.status, provider]);

  return (
    <AuthCtx.Provider
      value={{
        state,
        users,
        provider,
        register,
        signIn,
        signOut,
        changePassword,
        deleteAccount,
        getDataKey,
        getUserId,
        getDisplayName,
        getEnvelope,
        updateEnvelope,
        refreshUsers,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
