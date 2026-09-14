export type VaultData = Record<string, unknown>;

/**
 * Who keeps the encrypted vault, separated from who authenticates.
 * Local: localStorage. Cloud: encrypted local cache + sync.
 */
export interface VaultStore {
  /**
   * Decrypted vault, or {} when there is none yet.
   * Throws VaultLoadError when a vault exists but does not open: callers must
   * never save over it as if it were empty.
   */
  load(): Promise<VaultData>;
  /**
   * Throws VaultSaveError on failure. reason "stale-key" means the account keys
   * changed since this store was created: nothing was written, retry with the
   * store of the current session.
   */
  save(data: VaultData): Promise<void>;
  /**
   * Keeps a copy of a vault that does not open before the user replaces it
   * (e.g. restoring a backup). Throws when the copy cannot be kept.
   */
  preserveUnreadable(): Promise<void>;
}
