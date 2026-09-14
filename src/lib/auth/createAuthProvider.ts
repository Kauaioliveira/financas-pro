import { cloudEnabled } from '../cloud/config';
import { createLocalAuthProviderV2 } from './localAuthProviderV2';
import type { AuthProviderV2 } from './types';

/**
 * Picks the auth provider for this build. Only the local provider exists for now;
 * the cloud provider will be loaded with import() here when it is implemented.
 */
export function createAuthProvider(): AuthProviderV2 {
  if (cloudEnabled && !import.meta.env.PROD) {
    console.warn('[auth] Variáveis de nuvem definidas, mas o modo nuvem ainda não existe. Usando modo local.');
  }
  return createLocalAuthProviderV2();
}
