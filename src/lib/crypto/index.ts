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
  generateDataKeyAsync,
  createRecoveryKitWrap,
  rotateVaultKey,
} from './crypto';
export type { VaultEnvelope, EncryptedPayload, RecoveryKitWrap } from './crypto';
export {
  KIT_CONFIRMATION_COUNT,
  computeKitId,
  findWrongConfirmationWords,
  normalizeKitWord,
  pickConfirmationPositions,
  splitPhrase,
} from './kit';
export { deriveAccountKeys, wrapKeyWith, unwrapKeyWith } from './accountKeys';
export type { AccountKeys, WrappedKey } from './accountKeys';
export { compress, decompress } from './compression';
export { generateRecoveryPhrase, normalizePhrase } from './wordlist';
export { VAULT_VERSION } from './constants';
