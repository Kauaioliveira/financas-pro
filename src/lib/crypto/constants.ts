export const PBKDF2_ITERATIONS = 310_000;
export const SALT_BYTES = 32;
export const IV_BYTES = 12;
export const KEY_BYTES = 32;
export const RECOVERY_WORD_COUNT = 12;
export const VAULT_VERSION = 1;

// Account key derivation v2 (cloud accounts only; local accounts keep PBKDF2_ITERATIONS).
export const ACCOUNT_KDF_ITERATIONS = 600_000;
export const ACCOUNT_AUTH_SALT_PREFIX = 'financaspro/auth-salt/v1|';
export const ACCOUNT_HKDF_INFO_AUTH = 'financaspro/auth/v1';
export const ACCOUNT_HKDF_INFO_WRAP = 'financaspro/wrap/v1';
