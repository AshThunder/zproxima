/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional relayer API key for prototyping (see Zama SDK quick start). */
  readonly VITE_RELAYER_API_KEY?: string;
  /** Optional backend relayer proxy for Sepolia (recommended for production). */
  readonly VITE_RELAYER_PROXY_URL_SEPOLIA?: string;
  /** Optional backend relayer proxy for Mainnet (recommended for production). */
  readonly VITE_RELAYER_PROXY_URL_MAINNET?: string;
  /** Override Sepolia RPC URL. */
  readonly VITE_SEPOLIA_RPC_URL?: string;
  /** Override Mainnet RPC URL. */
  readonly VITE_MAINNET_RPC_URL?: string;
  /** Companion web app URL for external wallet mode. */
  readonly VITE_COMPANION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
