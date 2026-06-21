/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Must match server API_TOKEN when auth is enabled */
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}