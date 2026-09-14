export type VaultData = Record<string, unknown>;

/**
 * Who keeps the encrypted vault, separated from who authenticates.
 * Local: localStorage. Cloud (later): local cache + sync.
 */
export interface VaultStore {
  /** Decrypted vault, or {} when there is none yet. */
  load(): Promise<VaultData>;
  save(data: VaultData): Promise<void>;
}
