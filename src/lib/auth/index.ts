export { createLocalAuthProvider } from './localAuthProvider';
export { createLocalAuthProviderV2, LOCAL_PASSWORD_MIN_LENGTH } from './localAuthProviderV2';
export type { LocalAuthProviderV2 } from './localAuthProviderV2';
export { createAuthProvider } from './createAuthProvider';
export type {
  AuthMode,
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
  SyncState,
  SyncStatus,
  UserAccount,
} from './types';
