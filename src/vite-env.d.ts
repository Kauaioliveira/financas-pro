/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "local" forces local mode even when the cloud variables are set. */
  readonly VITE_APP_MODE?: string;
  /** Public project URL of the cloud provider. Empty = 100% local. */
  readonly VITE_SUPABASE_URL?: string;
  /** Public (publishable) key of the cloud provider. Never a secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
