/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_SOCKET_URL: string;
  /** Optional; base URL for QR / share links when dev host uses localhost but phones use LAN. */
  readonly VITE_PUBLIC_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
