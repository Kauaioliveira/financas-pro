import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createAuthProvider } from '../lib/auth';
import type { AuthProviderV2, KitRenewal, RegisterResult, UserAccount } from '../lib/auth';
import { AuthCtx } from './AuthContext.shared';
import type { AuthState } from './AuthContext.shared';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [provider] = useState<AuthProviderV2>(() => createAuthProvider());
  const [state, setState] = useState<AuthState>({ status: 'locked' });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const dataKeyRef = useRef<CryptoKey | null>(null);

  const refreshUsers = useCallback(async () => {
    setUsers(await provider.listLocalAccounts());
    setUsersLoaded(true);
  }, [provider]);

  useEffect(() => {
    let cancelled = false;
    provider.listLocalAccounts().then(
      list => {
        if (cancelled) return;
        setUsers(list);
        setUsersLoaded(true);
      },
      () => {
        if (cancelled) return;
        setUsers([]);
        setUsersLoaded(true);
      },
    );
    return () => { cancelled = true; };
  }, [provider]);

  const lock = useCallback(() => {
    dataKeyRef.current = null;
    void provider.signOut();
    setState({ status: 'locked' });
  }, [provider]);

  const register = useCallback(async (displayName: string, password: string): Promise<RegisterResult> => {
    const result = await provider.register({ displayName, password });
    await refreshUsers();
    return result;
  }, [provider, refreshUsers]);

  const signIn = useCallback(async (userId: string, password: string) => {
    const { session } = await provider.signIn({ userId, password });
    dataKeyRef.current = session.dataKey;
    setState({ status: 'unlocked', session });
  }, [provider]);

  const signOut = useCallback(() => {
    lock();
  }, [lock]);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (state.status !== 'unlocked') throw new Error('Sessão expirada.');
    const session = await provider.changePassword(oldPassword, newPassword);
    dataKeyRef.current = session.dataKey;
    setState({ status: 'unlocked', session });
    await refreshUsers();
  }, [provider, state, refreshUsers]);

  const deleteAccount = useCallback(async (password: string) => {
    if (state.status !== 'unlocked') throw new Error('Sessão expirada.');
    await provider.deleteLocalAccount(state.session.userId, password);
    dataKeyRef.current = null;
    setState({ status: 'locked' });
    await refreshUsers();
  }, [provider, state, refreshUsers]);

  const prepareKitRenewal = useCallback(async (password: string): Promise<KitRenewal> => {
    if (state.status !== 'unlocked') throw new Error('Sessão expirada.');
    const session = state.session;
    const renewal = await provider.prepareKitRenewal(password);
    return {
      ...renewal,
      commit: async () => {
        const dataKey = await renewal.commit();
        // The vault is now encrypted with the new key: switch the session to it,
        // or the app would keep saving with the old one. Skip if the app locked meanwhile.
        if (dataKeyRef.current !== null) {
          dataKeyRef.current = dataKey;
          setState({ status: 'unlocked', session: { ...session, dataKey } });
        }
        await refreshUsers();
        return dataKey;
      },
    };
  }, [provider, state, refreshUsers]);

  const vaultStore = useMemo(
    () => (state.status === 'unlocked' ? provider.createVaultStore(state.session) : null),
    [provider, state],
  );

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
      return users.find(user => user.id === state.session.userId)?.envelope ?? null;
    },
    [state, users],
  );

  // Auto-lock on page unload
  useEffect(() => {
    const handler = () => { dataKeyRef.current = null; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Another tab changed this account's keys (kit renewal rotates the dataKey, or a
  // password change): lock here, so this tab never saves the vault with a key the
  // account no longer uses. Writes made by this tab do not fire "storage" events.
  useEffect(() => {
    if (state.status !== 'unlocked') return;
    const { userId } = state.session;
    let snapshot: string | null = null;
    let active = true;

    const envelopeOf = async () =>
      JSON.stringify((await provider.listLocalAccounts()).find(user => user.id === userId)?.envelope ?? null);

    envelopeOf().then(value => { snapshot = value; });

    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== localStorage) return;
      envelopeOf().then(current => {
        if (!active || snapshot === null || current === snapshot) return;
        lock();
        void refreshUsers();
      });
    }

    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, [state, provider, lock, refreshUsers]);

  // Auto-lock after 15 minutes of inactivity
  useEffect(() => {
    if (state.status !== 'unlocked') return;

    const IDLE_MS = 15 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_MS);
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    for (const evt of events) window.addEventListener(evt, resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timer);
      for (const evt of events) window.removeEventListener(evt, resetTimer);
    };
  }, [state.status, lock]);

  return (
    <AuthCtx.Provider
      value={{
        state,
        mode: provider.mode,
        users,
        usersLoaded,
        provider,
        vaultStore,
        register,
        signIn,
        signOut,
        changePassword,
        deleteAccount,
        prepareKitRenewal,
        getDataKey,
        getUserId,
        getDisplayName,
        getEnvelope,
        refreshUsers,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
