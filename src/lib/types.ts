import type { TokenPair } from './zama';

export type AppScreen =
  | 'loading'
  | 'onboarding'
  | 'unlock'
  | 'external-connect'
  | 'dashboard'
  | 'wrap'
  | 'send'
  | 'receive'
  | 'bot'
  | 'faucet'
  | 'settings'
  | 'activity'
  | 'decrypt'
  | 'guide'
  | 'token-details'
  | 'registry-details'
  | 'register-token';

export interface NavigateOptions {
  token?: TokenPair;
  wrapTab?: 'wrap' | 'unwrap';
}

export interface RegistryPairItem {
  tokenAddress?: string;
  confidentialTokenAddress?: string;
  confidential?: { symbol?: string; name?: string; decimals?: number };
  underlying?: { decimals?: number };
}
