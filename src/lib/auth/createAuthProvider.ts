import { createLocalAuthProviderV2 } from './localAuthProviderV2';
import type { AuthProviderV2 } from './types';

/**
 * Provider of local builds. Cloud builds load their provider asynchronously
 * (src/components/cloud/CloudRoot.tsx) and pass it to AuthProvider.
 */
export function createAuthProvider(): AuthProviderV2 {
  return createLocalAuthProviderV2();
}
