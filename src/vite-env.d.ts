/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" forces local mode even when the cloud variables are set. */
  readonly VITE_FORCE_LOCAL?: string;
  /** Older switch: "local" forces local mode. */
  readonly VITE_APP_MODE?: string;
  /** Public project URL of the cloud provider. Empty = 100% local. */
  readonly VITE_SUPABASE_URL?: string;
  /** Public (publishable or anon) key of the cloud provider. Never a secret key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Alias of VITE_SUPABASE_ANON_KEY. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Set by vite.config.ts: true only when the build has cloud variables. */
declare const __FINANCASPRO_CLOUD__: boolean;

/** Set by vite.config.ts: version of package.json plus the build date. */
declare const __FINANCASPRO_VERSION__: string;
