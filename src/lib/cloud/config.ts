export { connectSrcFor, isCloudEnabled, isSecretSupabaseKey, readCloudConfig } from './env';
export type { CloudConfig, CloudEnv } from './env';

/**
 * Decided at build time from the same variables (see vite.config.ts). When false,
 * the bundler drops every cloud module, including @supabase/supabase-js.
 */
export const cloudEnabled: boolean = __FINANCASPRO_CLOUD__;
