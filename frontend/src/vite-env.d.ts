/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_MOCK?: string | boolean;
  readonly VITE_ENABLE_DEMO?: string | boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

