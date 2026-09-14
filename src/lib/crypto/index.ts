export {
  createVaultEnvelope,
  unlockVault,
  changeVaultPassword,
  addRecoveryWrap,
  recoverWithPhrase,
  encryptData,
  decryptData,
  encryptBackup,
  decryptBackup,
} from './crypto';
export type { VaultEnvelope, EncryptedPayload } from './crypto';
export { deriveAccountKeys, wrapKeyWith, unwrapKeyWith } from './accountKeys';
export type { AccountKeys, WrappedKey } from './accountKeys';
export { compress, decompress } from './compression';
export { generateRecoveryPhrase, normalizePhrase } from './wordlist';
export { VAULT_VERSION } from './constants';
