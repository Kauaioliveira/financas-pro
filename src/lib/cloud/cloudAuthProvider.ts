import {
  deriveAccountKeys,
  generateDataKeyAsync,
  generateRecoveryPhrase,
  normalizeEmail,
  wrapKeyWith,
} from '../crypto';
import type { AccountKeys } from '../crypto';
import { VaultLoadError } from '../../utils/secureStorage';
import type {
  AuthProviderV2,
  AuthSession,
  KeyInfo,
  KitRenewal,
  SignInInput,
  SignInResult,
  SyncStatus,
  UserAccount,
} from '../auth/types';
import type { VaultData, VaultStore } from '../vault';
import type { CloudBackend, CloudUser, VaultRow } from './backend';
import { createCloudVaultStore } from './cloudVaultStore';
import { CloudError, isCloudError } from './errors';
import { checkCloudPassword } from './passwordPolicy';
import { createSyncEngine } from './syncEngine';
import type { ConflictChoice, SyncEngine } from './syncEngine';
import {
  findCloudCacheUserId,
  getDeviceId,
  lastCloudEmail,
  preserveCloudCache,
  readCloudCache,
  removeCloudCache,
  updateCloudCache,
  writeCloudCache,
} from './vaultCache';
import type { CloudCache } from './vaultCache';
import {
  accountKdf,
  canDecryptVault,
  createKitWrap,
  decryptVault,
  encryptVault,
  openPasswordWrap,
} from './vaultCrypto';

export interface CloudStart {
  /** E-mail to prefill: the session user, or the last account used on this device. */
  email: string;
  /** A login session exists in this browser (keys still need the password). */
  hasSession: boolean;
}

export interface CloudSignUpInput {
  displayName: string;
  email: string;
  password: string;
}

/** A kit generated for a new vault. Nothing is sent until commit(). */
export interface VaultSetup {
  phrase: string;
  kitId: string;
  kitCreatedAt: string;
  /** Creates the vault with the initial data (empty or from a backup) and opens the session. */
  commit(initialData: VaultData): Promise<AuthSession>;
}

export interface CloudAuthProvider extends Omit<AuthProviderV2, 'mode'> {
  readonly mode: 'cloud';
  resolveSyncConflict(choice: ConflictChoice): Promise<void>;
  syncNow(): Promise<void>;
  start(): Promise<CloudStart>;
  signUp(input: CloudSignUpInput): Promise<SignInResult>;
  /** Requires a previous sign-in (or sign-up) that returned needs-vault-setup. */
  prepareVaultSetup(): Promise<VaultSetup>;
  getSyncStatus(): SyncStatus;
  subscribeSync(listener: (status: SyncStatus) => void): () => void;
}

export interface CloudAuthProviderOptions {
  backend: CloudBackend;
  /** Where e-mail links send the user back (must be in the Supabase redirect list). */
  siteUrl: string;
  now?: () => Date;
}

interface Pending {
  user: CloudUser;
  email: string;
  keys: AccountKeys;
  row: VaultRow | null;
}

interface Current {
  session: AuthSession;
  email: string;
}

const NOT_AVAILABLE = 'Esta ação não existe no modo nuvem.';

/** The browser knows it has no connection: skip calls that would only wait for retries. */
function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function displayNameFor(user: CloudUser | null, cache: CloudCache | null, email: string): string {
  return cache?.displayName || user?.displayName || email.split('@')[0] || 'Você';
}

export function createCloudAuthProvider({ backend, siteUrl, now = () => new Date() }: CloudAuthProviderOptions): CloudAuthProvider {
  let current: Current | null = null;
  let pending: Pending | null = null;
  let syncStatus: SyncStatus = { state: 'synced', message: null, lastSyncedAt: null };
  const syncListeners = new Set<(status: SyncStatus) => void>();
  const remoteListeners = new Set<() => void>();
  let engine: SyncEngine | null = null;
  let detachTriggers: () => void = () => {};

  function startEngine(userId: string, dataKey: CryptoKey): void {
    stopEngine();
    const started = createSyncEngine({
      backend,
      userId,
      dataKey,
      deviceId: getDeviceId(),
      now,
      initialStatus: syncStatus,
      onStatus: setSync,
      onRemoteApplied: () => {
        for (const listener of remoteListeners) listener();
      },
    });
    engine = started;
    detachTriggers = started.attachBrowserTriggers();
    void started.sync();
  }

  function stopEngine(): void {
    detachTriggers();
    detachTriggers = () => {};
    engine?.stop();
    engine = null;
  }

  /** Tries to send pending edits before the session ends, without blocking for long. */
  async function flushBeforeLeaving(): Promise<void> {
    const running = engine;
    if (!running) return;
    await Promise.race([running.pushNow().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 3_000))]);
  }

  function setSync(next: SyncStatus): void {
    syncStatus = next;
    for (const listener of syncListeners) listener(next);
  }

  function requireCurrent(): Current {
    if (!current) throw new Error('Sessão expirada.');
    return current;
  }

  function requireCache(userId: string): CloudCache {
    const cache = readCloudCache(userId);
    if (!cache) throw new Error('A cópia local dos dados não foi encontrada. Saia e entre de novo.');
    return cache;
  }

  /** Cache for this e-mail, or null. A corrupt cache is kept under a side key and ignored. */
  function cacheForEmail(email: string): CloudCache | null {
    const userId = findCloudCacheUserId(email);
    if (!userId) return null;
    try {
      return readCloudCache(userId);
    } catch (err) {
      if (err instanceof VaultLoadError) {
        preserveCloudCache(userId, now());
        return null;
      }
      throw err;
    }
  }

  function open(cache: CloudCache, dataKey: CryptoKey, status: SyncStatus): AuthSession {
    const session: AuthSession = { userId: cache.userId, displayName: cache.displayName, dataKey };
    current = { session, email: cache.email };
    pending = null;
    setSync(status);
    startEngine(cache.userId, dataKey);
    return session;
  }

  /**
   * The password opened the cache, but the account keys may have changed on another
   * device with the same password (kit renewal rotates the data key). Adopt the new
   * keys only when they open with this password and decrypt the cloud data; unsent
   * local edits are re-encrypted with the new key and stay pending (the sync then
   * asks what to keep). Returns the cache and key to open with.
   */
  async function adoptKeysChangedElsewhere(
    cached: CloudCache,
    cachedKey: CryptoKey,
    keys: AccountKeys,
  ): Promise<{ cache: CloudCache; dataKey: CryptoKey }> {
    const meta = await backend.fetchVaultMeta();
    if (!meta || meta.keysVersion === cached.keysVersion) return { cache: cached, dataKey: cachedKey };
    const row = await backend.fetchVault();
    const remoteKey = row ? await openPasswordWrap(keys.pwWrapKey, row.pwWrap) : null;
    if (!row || !remoteKey || !(await canDecryptVault(remoteKey, row.ciphertext))) {
      return { cache: cached, dataKey: cachedKey };
    }
    const keysFromCloud = { kdf: row.kdf, pwWrap: row.pwWrap, kitWrap: row.kitWrap, keysVersion: row.keysVersion };
    let next: CloudCache;
    if (!cached.dirty) {
      next = { ...cached, ...keysFromCloud, ciphertext: row.ciphertext, version: row.version, lastSyncedAt: now().toISOString() };
    } else if (await canDecryptVault(remoteKey, cached.ciphertext)) {
      next = { ...cached, ...keysFromCloud };
    } else {
      const localData = await decryptVault(cachedKey, cached.ciphertext);
      next = { ...cached, ...keysFromCloud, ciphertext: await encryptVault(remoteKey, localData) };
    }
    writeCloudCache(next);
    return { cache: next, dataKey: remoteKey };
  }

  function statusFor(cache: CloudCache, offline: boolean, message: string | null = null): SyncStatus {
    if (message) return { state: 'blocked', message, lastSyncedAt: cache.lastSyncedAt };
    if (offline) {
      return {
        state: 'offline',
        message: 'Sem conexão com a nuvem. As alterações ficam neste aparelho até a conexão voltar.',
        lastSyncedAt: cache.lastSyncedAt,
      };
    }
    return { state: cache.dirty ? 'pending' : 'synced', message: null, lastSyncedAt: cache.lastSyncedAt };
  }

  /**
   * First sign-in on this device, or the cache did not open with this password.
   * Never replaces a cache whose data this key opens and that has unsent changes.
   */
  async function openFromCloud(email: string, keys: AccountKeys, user: CloudUser, cached: CloudCache | null): Promise<SignInResult> {
    const row = await backend.fetchVault();
    if (!row) {
      pending = { user, email, keys, row: null };
      return { status: 'needs-vault-setup', email };
    }
    const dataKey = await openPasswordWrap(keys.pwWrapKey, row.pwWrap);
    if (!dataKey) {
      pending = { user, email, keys, row };
      return { status: 'needs-kit', email };
    }

    const base: Omit<CloudCache, 'ciphertext' | 'version' | 'dirty' | 'lastSyncedAt'> = {
      v: 1,
      userId: user.id,
      email,
      displayName: displayNameFor(user, cached, email),
      kdf: row.kdf,
      pwWrap: row.pwWrap,
      kitWrap: row.kitWrap,
      keysVersion: row.keysVersion,
    };

    const localOpens = cached !== null && cached.userId === user.id && (await canDecryptVault(dataKey, cached.ciphertext));
    if (cached && localOpens && cached.dirty) {
      // The password changed on another device, but the data key is the same: keep the
      // unsent local edits; the sync compares versions before sending them.
      const next: CloudCache = { ...base, ciphertext: cached.ciphertext, version: cached.version, dirty: true, lastSyncedAt: cached.lastSyncedAt };
      writeCloudCache(next);
      return { status: 'unlocked', session: open(next, dataKey, statusFor(next, false)) };
    }

    if (cached && !localOpens) {
      // Encrypted with keys this password no longer opens (e.g. kit renewed elsewhere).
      // Keep a copy before replacing it: the old password may still open it.
      preserveCloudCache(cached.userId, now());
    }

    const next: CloudCache = {
      ...base,
      ciphertext: row.ciphertext,
      version: row.version,
      dirty: false,
      lastSyncedAt: now().toISOString(),
    };
    writeCloudCache(next);
    return { status: 'unlocked', session: open(next, dataKey, statusFor(next, false)) };
  }

  const provider: CloudAuthProvider = {
    mode: 'cloud',

    validatePassword(password, context) {
      return checkCloudPassword(password, context?.email ?? current?.email ?? '');
    },

    async start() {
      let user: CloudUser | null = null;
      try {
        user = await backend.getSessionUser();
      } catch {
        user = null;
      }
      return { email: user?.email ?? lastCloudEmail(), hasSession: user !== null };
    },

    async signUp({ displayName, email, password }) {
      const emailNorm = normalizeEmail(email);
      if (!displayName.trim()) throw new Error('Digite seu nome.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) throw new Error('Digite um e-mail válido.');
      const rule = checkCloudPassword(password, emailNorm);
      if (rule) throw new Error(rule);

      const keys = await deriveAccountKeys(emailNorm, password);
      const { hasSession, user } = await backend.signUp({
        email: emailNorm,
        authSecret: keys.authSecret,
        displayName: displayName.trim(),
        redirectTo: siteUrl,
      });
      if (!hasSession || !user) {
        // Same answer whether the e-mail is new or already registered (no enumeration).
        return { status: 'needs-email-confirmation', email: emailNorm };
      }
      pending = { user: { ...user, displayName: user.displayName || displayName.trim() }, email: emailNorm, keys, row: null };
      return { status: 'needs-vault-setup', email: emailNorm };
    },

    async signIn(input: SignInInput): Promise<SignInResult> {
      const email = normalizeEmail(input.email ?? '');
      if (!email || !input.password) throw new Error('Digite e-mail e senha.');
      pending = null;

      const keys = await deriveAccountKeys(email, input.password);
      const cached = cacheForEmail(email);
      const cachedKey = cached ? await openPasswordWrap(keys.pwWrapKey, cached.pwWrap) : null;

      let user: CloudUser | null = null;
      let authError: CloudError | null = null;
      try {
        if (cachedKey && browserOffline()) throw new CloudError('network');
        const sessionUser = cachedKey ? await backend.getSessionUser() : null;
        user =
          sessionUser && normalizeEmail(sessionUser.email) === email
            ? sessionUser
            : await backend.signIn(email, keys.authSecret);
      } catch (err) {
        if (!isCloudError(err)) throw err;
        authError = err;
      }

      if (cached && cachedKey) {
        // The password opens the data on this device: open now, even without the cloud.
        if (authError?.kind === 'invalid-credentials') {
          return {
            status: 'unlocked',
            session: open(cached, cachedKey, statusFor(cached, false,
              'A senha desta conta foi trocada em outro aparelho. Seus dados deste aparelho estão abertos, mas não sincronizam: saia e entre com a senha nova.')),
          };
        }
        if (authError?.kind === 'email-not-confirmed') return { status: 'needs-email-confirmation', email };
        let opened = { cache: cached, dataKey: cachedKey };
        if (!authError && browserOffline()) authError = new CloudError('network');
        if (!authError) {
          try {
            opened = await adoptKeysChangedElsewhere(cached, cachedKey, keys);
          } catch (err) {
            if (!isCloudError(err)) throw err;
            authError = err; // offline or server trouble: open from the cache as it is
          }
        }
        return { status: 'unlocked', session: open(opened.cache, opened.dataKey, statusFor(opened.cache, authError !== null)) };
      }

      if (authError) {
        if (authError.kind === 'email-not-confirmed') return { status: 'needs-email-confirmation', email };
        if (authError.kind === 'network') {
          throw new CloudError(
            'network',
            cached
              ? 'Sem conexão com a nuvem, e esta senha não abre os dados guardados neste aparelho.'
              : 'Sem conexão com a nuvem. Para entrar pela primeira vez neste aparelho é preciso internet.',
          );
        }
        throw authError;
      }
      return openFromCloud(email, keys, user!, cached);
    },

    async prepareVaultSetup(): Promise<VaultSetup> {
      const setup = pending;
      if (!setup || setup.row) throw new Error('Entre de novo para configurar o cofre.');
      const phrase = generateRecoveryPhrase();
      const dataKey = await generateDataKeyAsync();
      const kitWrap = await createKitWrap(phrase, dataKey, now());
      let committed = false;

      return {
        phrase,
        kitId: kitWrap.id,
        kitCreatedAt: kitWrap.createdAt,
        async commit(initialData: VaultData): Promise<AuthSession> {
          if (committed) throw new Error('Este cofre já foi criado.');
          const pwWrap = await wrapKeyWith(setup.keys.pwWrapKey, dataKey);
          const ciphertext = await encryptVault(dataKey, initialData);
          const kdf = accountKdf();
          try {
            await backend.insertVault({ userId: setup.user.id, kdf, pwWrap, kitWrap, ciphertext, deviceId: getDeviceId() });
          } catch (err) {
            if (isCloudError(err, 'conflict')) {
              pending = null;
              throw new Error('Este cofre já foi configurado em outro aparelho. Entre de novo com sua senha.');
            }
            throw err;
          }
          committed = true;
          // version and keys_version start at the SQL defaults (0 and 1).
          const cache: CloudCache = {
            v: 1,
            userId: setup.user.id,
            email: setup.email,
            displayName: displayNameFor(setup.user, null, setup.email),
            kdf,
            pwWrap,
            kitWrap,
            keysVersion: 1,
            version: 0,
            ciphertext,
            dirty: false,
            lastSyncedAt: now().toISOString(),
          };
          writeCloudCache(cache);
          return open(cache, dataKey, statusFor(cache, false));
        },
      };
    },

    async lock() {
      await flushBeforeLeaving();
      stopEngine();
      current = null;
      pending = null;
    },

    async signOut() {
      await flushBeforeLeaving();
      stopEngine();
      current = null;
      pending = null;
      try {
        await backend.signOut();
      } catch {
        // Offline: the local login session is removed by the client anyway.
      }
    },

    async changePassword(oldPassword, newPassword) {
      const { session, email } = requireCurrent();
      const rule = checkCloudPassword(newPassword, email);
      if (rule) throw new Error(rule.replace('A senha', 'A nova senha'));
      const cache = requireCache(session.userId);

      const oldKeys = await deriveAccountKeys(email, oldPassword);
      const dataKey = await openPasswordWrap(oldKeys.pwWrapKey, cache.pwWrap);
      if (!dataKey) throw new Error('Senha atual incorreta.');

      const newKeys = await deriveAccountKeys(email, newPassword);
      const pwWrap = await wrapKeyWith(newKeys.pwWrapKey, dataKey);
      const kdf = accountKdf();

      // Login secret first: if the wrap update fails afterwards, the new password still
      // signs in and "Lembrei a senha antiga" re-wraps the key. The reverse order could
      // leave a wrap that no password able to sign in can open.
      await backend.updateAuthSecret(newKeys.authSecret);
      const keysVersion = await backend.setPasswordWrap(cache.keysVersion, kdf, pwWrap);
      if (keysVersion === null) {
        throw new Error(
          'A senha de login foi trocada, mas as chaves da conta mudaram em outro aparelho ao mesmo tempo. Saia e entre com a senha nova; se os dados não abrirem, use "Lembrei a senha antiga".',
        );
      }
      updateCloudCache(session.userId, c => ({ ...c, kdf, pwWrap, keysVersion }));
      current = { session: { ...session }, email };
      return current.session;
    },

    async prepareKitRenewal(password): Promise<KitRenewal> {
      const { session, email } = requireCurrent();
      const cache = requireCache(session.userId);
      const keys = await deriveAccountKeys(email, password);
      if (!(await openPasswordWrap(keys.pwWrapKey, cache.pwWrap))) throw new Error('Senha incorreta.');

      const phrase = generateRecoveryPhrase();
      const dataKey = await generateDataKeyAsync();
      const kitWrap = await createKitWrap(phrase, dataKey, now());
      let committed = false;

      return {
        phrase,
        kitId: kitWrap.id,
        kitCreatedAt: kitWrap.createdAt,
        previousKitId: cache.kitWrap?.id ?? null,

        async commit(): Promise<CryptoKey> {
          if (committed) throw new Error('Este kit já foi salvo.');
          const latest = requireCache(session.userId);
          const oldKey = await openPasswordWrap(keys.pwWrapKey, latest.pwWrap);
          if (!oldKey) throw new Error('As chaves da conta mudaram enquanto o kit era gerado. Nada foi alterado.');

          let data: VaultData;
          try {
            data = await decryptVault(oldKey, latest.ciphertext);
          } catch {
            throw new Error('Não foi possível ler o cofre atual. O kit não foi trocado.');
          }
          const ciphertext = await encryptVault(dataKey, data);
          const pwWrap = await wrapKeyWith(keys.pwWrapKey, dataKey);
          const reopened = await openPasswordWrap(keys.pwWrapKey, pwWrap);
          if (!reopened || JSON.stringify(await decryptVault(reopened, ciphertext)) !== JSON.stringify(data)) {
            throw new Error('Não foi possível verificar o cofre recifrado. O kit não foi trocado.');
          }

          const kdf = accountKdf();
          let version: number | null;
          try {
            // Also sends local edits not synced yet; the expected version protects the cloud copy.
            version = await backend.rotateVaultKeys(latest.version, kdf, pwWrap, kitWrap, ciphertext);
          } catch (err) {
            if (isCloudError(err, 'network')) throw new Error('Gerar um kit novo precisa de internet. Nada foi alterado.');
            throw err;
          }
          if (version === null) {
            throw new Error('Os dados na nuvem mudaram em outro aparelho. Espere sincronizar e gere o kit de novo. Nada foi alterado.');
          }
          committed = true;

          try {
            updateCloudCache(session.userId, c => ({
              ...c,
              kdf,
              pwWrap,
              kitWrap,
              keysVersion: latest.keysVersion + 1,
              version: version!,
              ciphertext,
              dirty: false,
              lastSyncedAt: now().toISOString(),
            }));
          } catch {
            // The cloud already has the new keys. A cache with the old ones would be worse
            // than none: remove it, so the next sign-in downloads the new state.
            removeCloudCache(session.userId);
            throw new Error('O kit novo foi salvo na nuvem, mas não neste aparelho. Saia e entre de novo.');
          }
          if (current?.session.userId === session.userId) {
            current = { ...current, session: { ...current.session, dataKey } };
            startEngine(session.userId, dataKey);
          }
          return dataKey;
        },
      };
    },

    createVaultStore(session: AuthSession): VaultStore {
      return createCloudVaultStore({
        userId: session.userId,
        dataKey: session.dataKey,
        onLocalChange: () => engine?.notifyLocalChange(),
        subscribeRemote: listener => {
          remoteListeners.add(listener);
          return () => {
            remoteListeners.delete(listener);
          };
        },
      });
    },

    describeKeys(session: AuthSession): KeyInfo | null {
      let cache: CloudCache | null;
      try {
        cache = readCloudCache(session.userId);
      } catch {
        return null;
      }
      if (!cache) return null;
      const kit = cache.kitWrap;
      return {
        kitId: kit?.id ?? null,
        kitCreatedAt: kit?.createdAt ?? null,
        hasKit: kit !== null,
        backupWraps: kit ? { kit: { ...kit }, password: null } : null,
      };
    },

    keysFingerprint(userId: string): string | null {
      try {
        const cache = readCloudCache(userId);
        return cache ? `${cache.keysVersion}:${cache.pwWrap.wrapped}` : null;
      } catch {
        return null;
      }
    },

    getSyncStatus: () => syncStatus,

    resolveSyncConflict(choice: ConflictChoice) {
      return engine ? engine.resolveConflict(choice) : Promise.resolve();
    },

    syncNow() {
      return engine ? engine.sync() : Promise.resolve();
    },

    subscribeSync(listener) {
      syncListeners.add(listener);
      return () => {
        syncListeners.delete(listener);
      };
    },

    async listLocalAccounts(): Promise<UserAccount[]> {
      // Cloud accounts are picked by e-mail; the account switcher is local-only.
      return [];
    },

    async register(): Promise<never> {
      throw new Error(NOT_AVAILABLE);
    },

    async recoverWithKit(): Promise<never> {
      throw new Error(NOT_AVAILABLE);
    },

    async deleteLocalAccount(): Promise<never> {
      throw new Error(NOT_AVAILABLE);
    },
  };

  return provider;
}
