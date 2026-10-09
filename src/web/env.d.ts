/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_SITE_NAME: string;
  /** Where the source code lives; forks point this at their own repository. */
  readonly VITE_SOURCE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
