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
export { generateRecoveryPhrase, normalizePhrase } from './wordlist';
export { VAULT_VERSION } from './constants';
