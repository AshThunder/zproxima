import {
  getExternalBridgeState,
  isBridgeAlive,
  openCompanion,
  type CompanionAction,
  type CompanionActionParams,
  type ExternalBridgeState,
} from './externalBridge';
import { getWalletMode, type WalletMode } from './walletMode';
import type { Eip1193Provider } from './zama';

export type AppSurface = 'extension' | 'web';

/** Generic label when the connected browser wallet name is unknown. */
export const DEFAULT_BROWSER_WALLET_LABEL = 'Browser wallet';

export interface WalletSession {
  mode: WalletMode;
  /** extension = side panel; web = companion browser app */
  surface: AppSurface;
  address: string;
  /** Present only in embedded mode after unlock. */
  privateKey?: string;
  /** EIP-1193 provider — web app inline signing. */
  ethereum?: Eip1193Provider;
  externalBridge?: ExternalBridgeState | null;
  walletLabel?: string;
  /** @deprecated use canSignLocally() */
  canSignInExtension: boolean;
}

export function canSignLocally(session: WalletSession): boolean {
  return !!(session.privateKey || session.ethereum);
}

/** Prefer built-in vault signing when unlocked in embedded mode. */
export function usesEmbeddedSigning(session: WalletSession): boolean {
  return session.mode === 'embedded' && !!session.privateKey;
}

/** Extension side panel in external mode — open companion tab to sign. */
export function shouldDelegateToCompanion(session: WalletSession): boolean {
  if (session.surface !== 'extension' || session.mode !== 'external') return false;
  return !usesEmbeddedSigning(session) && !session.ethereum;
}

export async function buildEmbeddedSession(
  address: string,
  privateKey: string,
): Promise<WalletSession> {
  return {
    mode: 'embedded',
    surface: 'extension',
    address,
    privateKey,
    canSignInExtension: true,
  };
}

export async function buildExternalSession(): Promise<WalletSession | null> {
  const mode = await getWalletMode();
  if (mode !== 'external') return null;
  const bridge = await getExternalBridgeState();
  if (!bridge || !isBridgeAlive(bridge)) return null;
  return {
    mode: 'external',
    surface: 'extension',
    address: bridge.address,
    externalBridge: bridge,
    walletLabel: bridge.walletLabel,
    canSignInExtension: false,
  };
}

export function detectBrowserWalletLabel(ethereum?: Eip1193Provider): string {
  if (!ethereum) return DEFAULT_BROWSER_WALLET_LABEL;
  const flags = ethereum as {
    isRabby?: boolean;
    isCoinbaseWallet?: boolean;
    isBraveWallet?: boolean;
  };
  if (flags.isRabby) return 'Rabby';
  if (flags.isCoinbaseWallet) return 'Coinbase Wallet';
  if (flags.isBraveWallet) return 'Brave Wallet';
  return DEFAULT_BROWSER_WALLET_LABEL;
}

export function buildWebSession(
  address: string,
  ethereum: Eip1193Provider,
  walletLabel = DEFAULT_BROWSER_WALLET_LABEL,
): WalletSession {
  return {
    mode: 'external',
    surface: 'web',
    address,
    ethereum,
    walletLabel,
    canSignInExtension: true,
  };
}

export async function getActiveWalletSession(
  embedded?: { address: string; privateKey: string },
): Promise<WalletSession | null> {
  const mode = await getWalletMode();
  if (mode === 'external') {
    return buildExternalSession();
  }
  if (embedded?.address && embedded.privateKey) {
    return buildEmbeddedSession(embedded.address, embedded.privateKey);
  }
  return null;
}

export async function openExternalAction(
  action: CompanionAction,
  params: CompanionActionParams = {},
): Promise<void> {
  await openCompanion(action, params);
}
