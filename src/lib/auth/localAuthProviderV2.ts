import { addRecoveryWrap, generateRecoveryPhrase, normalizeKitPhrase, recoverWithPhrase } from '../crypto';
import { createLocalVaultStore } from '../vault';
import { backupWrapsFromEnvelope } from '../../utils/backup';
import { createLocalAuthProvider } from './localAuthProvider';
import type {
  AuthProvider,
  AuthProviderV2,
  AuthSession,
  KeyInfo,
  KitRenewal,
  RecoverWithKitInput,
  RegisterInput,
  RegisterResult,
  SignInInput,
  SignInResult,
  UserAccount,
} from './types';

export const LOCAL_PASSWORD_MIN_LENGTH = 6;

/** Local sign-in always unlocks or throws. */
export type LocalAuthProviderV2 = Omit<AuthProviderV2, 'mode' | 'signIn'> & {
  readonly mode: 'local';
  signIn(input: SignInInput): Promise<Extract<SignInResult, { status: 'unlocked' }>>;
};

/**
 * AuthProviderV2 for accounts stored in this browser. Delegates to the
 * synchronous local provider, so storage format and messages stay the same.
 */
export function createLocalAuthProviderV2(
  base: AuthProvider = createLocalAuthProvider(),
): LocalAuthProviderV2 {
  let current: AuthSession | null = null;

  function requireSession(): AuthSession {
    if (!current) throw new Error('Sessão expirada.');
    return current;
  }

  function requireUserId(input: { userId?: string }): string {
    if (!input.userId) throw new Error('Conta não encontrada.');
    return input.userId;
  }

  return {
    mode: 'local',

    validatePassword(password: string): string | null {
      return password.length < LOCAL_PASSWORD_MIN_LENGTH
        ? `A senha deve ter pelo menos ${LOCAL_PASSWORD_MIN_LENGTH} caracteres.`
        : null;
    },

    async lock(): Promise<void> {
      current = null;
      base.signOut();
    },

    describeKeys(session: AuthSession): KeyInfo | null {
      const envelope = base.getEnvelope(session.userId);
      if (!envelope) return null;
      return {
        kitId: envelope.kitId ?? null,
        kitCreatedAt: envelope.kitCreatedAt ?? null,
        hasKit: Boolean(envelope.recoveryWrap),
        backupWraps: backupWrapsFromEnvelope(envelope),
      };
    },

    keysFingerprint(userId: string): string | null {
      const envelope = base.getEnvelope(userId);
      return envelope ? JSON.stringify(envelope) : null;
    },

    async listLocalAccounts(): Promise<UserAccount[]> {
      return base.listUsers();
    },

    async register(input: RegisterInput): Promise<RegisterResult> {
      const session = await base.register(input.displayName, input.password);

      const phrase = generateRecoveryPhrase();
      const envelope = base.getEnvelope(session.userId);
      if (!envelope) throw new Error('Conta não encontrada.');
      const withKit = await addRecoveryWrap(phrase, session.dataKey, envelope);
      base.updateEnvelope(session.userId, withKit);

      return {
        session,
        kit: {
          phrase,
          kitId: withKit.kitId ?? '',
          kitCreatedAt: withKit.kitCreatedAt ?? '',
        },
      };
    },

    async signIn(input: SignInInput) {
      const session = await base.signIn(requireUserId(input), input.password);
      current = session;
      return { status: 'unlocked' as const, session };
    },

    async signOut(): Promise<void> {
      current = null;
      base.signOut();
    },

    async changePassword(oldPassword: string, newPassword: string): Promise<AuthSession> {
      const { userId } = requireSession();
      await base.changePassword(userId, oldPassword, newPassword);
      // Fresh key from the new envelope, as the app always did after a password change.
      const session = await base.signIn(userId, newPassword);
      current = session;
      return session;
    },

    async recoverWithKit(input: RecoverWithKitInput): Promise<void> {
      const userId = requireUserId(input);
      if (input.newPassword.length < 6) {
        throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
      }
      const envelope = base.getEnvelope(userId);
      if (!envelope) throw new Error('Conta não encontrada.');
      // normalizeKitPhrase, e não normalizePhrase: a lista de palavras não tem acento,
      // então quem digitar "leão" deve abrir igual, como já acontece no kit e no backup.
      const recovered = await recoverWithPhrase(normalizeKitPhrase(input.phrase), input.newPassword, envelope);
      base.updateEnvelope(userId, recovered);
    },

    async prepareKitRenewal(password: string): Promise<KitRenewal> {
      const session = requireSession();
      const renewal = await base.prepareKitRenewal(session.userId, password);
      return {
        ...renewal,
        async commit(): Promise<CryptoKey> {
          const dataKey = await renewal.commit();
          if (current?.userId === session.userId) current = { ...current, dataKey };
          return dataKey;
        },
      };
    },

    async deleteLocalAccount(userId: string, password: string): Promise<void> {
      await base.deleteAccount(userId, password);
      if (current?.userId === userId) current = null;
    },

    createVaultStore(session: AuthSession) {
      // The wrapped key changes whenever the account keys change (kit renewal rotates
      // the data key; password change re-wraps it), in this tab or another one. A store
      // created before that refuses to write, so the vault is never saved with an old key.
      const wrappedAtCreation = base.getEnvelope(session.userId)?.wrappedDataKey ?? null;
      return createLocalVaultStore(session.userId, session.dataKey, {
        isKeyCurrent: () =>
          wrappedAtCreation !== null &&
          base.getEnvelope(session.userId)?.wrappedDataKey === wrappedAtCreation,
      });
    },
  };
}
