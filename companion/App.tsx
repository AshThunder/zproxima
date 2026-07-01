import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserProvider } from 'ethers';
import CompanionApp from './CompanionApp';
import {
  getExtensionId,
  getQueryParams,
  getRequestedAction,
  getSessionId,
  notifyConnect,
  notifyDisconnect,
  sendHeartbeat,
  clearDeepLinkParams,
} from './bridge';
import { runCompanionAction } from './actions';
import type { ActionParams } from './actions';
import { ensureSepoliaNetwork, isSepoliaChain, SEPOLIA_CHAIN_ID } from './chain';
import { buildWebSession, detectBrowserWalletLabel, DEFAULT_BROWSER_WALLET_LABEL } from '@shared/walletSession';
import type { WalletSession } from '@shared/walletSession';
import { APP_NAME } from '@shared/brand';
import { resetExternalZamaSDK } from '@shared/zama';
import ConnectLanding from './ConnectLanding';

import { BRIDGE_ACTION_EVENT, STORAGE_KEYS } from '@shared/storageKeys';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  [SEPOLIA_CHAIN_ID]: 'Sepolia',
};

export default function App() {
  const params = useMemo(() => getQueryParams(), []);
  const initialAction = useMemo(() => getRequestedAction(), []);
  const sessionId = getSessionId();
  const extId = getExtensionId();
  const bridgeMode = !!(extId && sessionId);

  const [session, setSession] = useState<WalletSession | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletLabel, setWalletLabel] = useState(DEFAULT_BROWSER_WALLET_LABEL);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bridgeActionDone, setBridgeActionDone] = useState(false);

  const actionParams = useMemo(
    () => ({
      symbol: params.get('symbol') ?? undefined,
      amount: params.get('amount') ?? undefined,
      recipient: params.get('recipient') ?? undefined,
      confidentialAddress: params.get('confidentialAddress') ?? undefined,
      underlyingAddress: params.get('underlyingAddress') ?? undefined,
      tab: params.get('tab') ?? undefined,
      command: params.get('command') ?? undefined,
    }),
    [params],
  );

  const actionRanRef = useRef(false);
  const userDisconnectedRef = useRef(false);

  const refreshWallet = useCallback(async () => {
    if (!window.ethereum) return null;
    const provider = new BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    const cid = Number(network.chainId);
    const label = detectBrowserWalletLabel(window.ethereum);
    setWalletLabel(label);
    setChainId(cid);
    return { addr, cid, label };
  }, []);

  const enterApp = useCallback((addr: string, label: string) => {
    if (!window.ethereum || userDisconnectedRef.current) return;
    setSession(buildWebSession(addr, window.ethereum, label));
    setError('');
    setStatus('');
    setBridgeActionDone(false);
  }, []);

  const finishBridgeAction = useCallback((addr: string, label: string) => {
    if (bridgeMode && initialAction !== 'connect') {
      setBridgeActionDone(true);
      return;
    }
    enterApp(addr, label);
  }, [initialAction, bridgeMode, enterApp]);

  const runDeepLinkAction = useCallback(async (addr: string, label: string) => {
    if (!window.ethereum || initialAction === 'connect' || initialAction === 'bot' || actionRanRef.current) return;
    if (chainId != null && !isSepoliaChain(chainId)) return;
    actionRanRef.current = true;
    clearDeepLinkParams();
    if (
      (initialAction === 'wrap' || initialAction === 'unwrap') &&
      !actionParams.amount
    ) {
      sessionStorage.setItem(
        STORAGE_KEYS.pendingWrap,
        JSON.stringify({
          tab: initialAction === 'unwrap' || actionParams.tab === 'unwrap' ? 'unwrap' : 'wrap',
          symbol: actionParams.symbol,
          confidentialAddress: actionParams.confidentialAddress,
        }),
      );
      enterApp(addr, label);
      return;
    }
    setBusy(true);
    setError('');
    setBridgeActionDone(false);
    setStatus('Running requested action…');
    try {
      await runCompanionAction(
        initialAction,
        actionParams,
        window.ethereum,
        addr,
        label,
        setStatus,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('');
      setBridgeActionDone(false);
      actionRanRef.current = false;
    } finally {
      setBusy(false);
      if (!userDisconnectedRef.current) finishBridgeAction(addr, label);
    }
  }, [actionParams, chainId, finishBridgeAction, initialAction]);

  const connectWallet = async () => {
    setError('');
    setBusy(true);
    setStatus('Connecting wallet…');
    userDisconnectedRef.current = false;
    try {
      if (!window.ethereum) {
        throw new Error('Install a browser wallet extension to continue.');
      }
      if (bridgeMode && (!sessionId || !extId)) {
        throw new Error(`Open this page from the ${APP_NAME} extension (Settings → Connect external wallet).`);
      }
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureSepoliaNetwork(window.ethereum);
      const info = await refreshWallet();
      if (!info) throw new Error('Could not read wallet address.');
      const { addr, cid, label } = info;

      if (bridgeMode) {
        await notifyConnect(addr, cid, label);
      }

      if (initialAction !== 'connect') {
        await runDeepLinkAction(addr, label);
      } else {
        enterApp(addr, label);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const disconnectWallet = async () => {
    setBusy(true);
    userDisconnectedRef.current = true;
    actionRanRef.current = false;
    resetExternalZamaSDK();
    setSession(null);
    setChainId(null);
    setStatus('');
    setError('');
    setBridgeActionDone(false);
    try {
      if (bridgeMode) {
        await notifyDisconnect().catch(() => undefined);
      }
      if (window.ethereum?.request) {
        await window.ethereum
          .request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          })
          .catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.ethereum) return;
        const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
        if (!accounts.length || userDisconnectedRef.current) return;
        await ensureSepoliaNetwork(window.ethereum).catch(() => undefined);
        const info = await refreshWallet();
        if (!info || cancelled || userDisconnectedRef.current) return;
        const { addr, cid, label } = info;
        if (!isSepoliaChain(cid)) return;

        if (bridgeMode) {
          try {
            await notifyConnect(addr, cid, label);
          } catch {
            return;
          }
        }

        if (initialAction !== 'connect' && initialAction !== 'bot') {
          if (!userDisconnectedRef.current) await runDeepLinkAction(addr, label);
        } else if (!cancelled && !userDisconnectedRef.current) {
          enterApp(addr, label);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    if (!window.ethereum) setBooting(false);
    return () => { cancelled = true; };
  }, [bridgeMode, enterApp, initialAction, refreshWallet, runDeepLinkAction]);

  useEffect(() => {
    if (!session || !bridgeMode) return;
    const id = window.setInterval(() => {
      void sendHeartbeat().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [bridgeMode, session]);

  useEffect(() => {
    if (window.ethereum?.on) {
      const onAccounts = (accounts: string[]) => {
        if (!accounts.length) {
          void disconnectWallet();
          return;
        }
        if (!userDisconnectedRef.current) void refreshWallet();
      };
      const onChain = () => {
        actionRanRef.current = false;
        void refreshWallet();
      };
      window.ethereum.on('accountsChanged', onAccounts);
      window.ethereum.on('chainChanged', onChain);
      return () => {
        window.ethereum?.removeListener?.('accountsChanged', onAccounts);
        window.ethereum?.removeListener?.('chainChanged', onChain);
      };
    }
  }, [refreshWallet]);

  useEffect(() => {
    if (session) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ action?: string; params?: ActionParams }>).detail;
      if (!detail?.action || detail.action === 'bot' || !window.ethereum) return;

      void (async () => {
        const info = await refreshWallet();
        if (!info || userDisconnectedRef.current) return;
        const { addr, label } = info;

        if (detail.action === 'connect') {
          enterApp(addr, label);
          return;
        }

        if (
          (detail.action === 'wrap' || detail.action === 'unwrap') &&
          !detail.params?.amount
        ) {
          sessionStorage.setItem(
            STORAGE_KEYS.pendingWrap,
            JSON.stringify({
              tab: detail.action === 'unwrap' || detail.params?.tab === 'unwrap' ? 'unwrap' : 'wrap',
              symbol: detail.params?.symbol,
              confidentialAddress: detail.params?.confidentialAddress,
            }),
          );
          enterApp(addr, label);
          return;
        }

        setBusy(true);
        setError('');
        setBridgeActionDone(false);
        setStatus('Running action from extension…');
        try {
          await runCompanionAction(
            detail.action,
            detail.params ?? {},
            window.ethereum!,
            addr,
            label,
            setStatus,
          );
          if (bridgeMode) {
            setBridgeActionDone(true);
          } else {
            enterApp(addr, label);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('');
        } finally {
          setBusy(false);
        }
      })();
    };

    window.addEventListener(BRIDGE_ACTION_EVENT, handler);
    return () => window.removeEventListener(BRIDGE_ACTION_EVENT, handler);
  }, [bridgeMode, enterApp, refreshWallet, session]);

  if (session) {
    return (
      <CompanionApp
        session={session}
        onDisconnect={() => void disconnectWallet()}
        disconnectBusy={busy}
      />
    );
  }

  const wrongNetwork = chainId != null && !isSepoliaChain(chainId);

  return (
    <ConnectLanding
      bridgeMode={bridgeMode}
      action={initialAction}
      wrongNetwork={wrongNetwork}
      sepoliaChainId={SEPOLIA_CHAIN_ID}
      status={status}
      error={error}
      busy={busy}
      booting={booting}
      bridgeActionDone={bridgeActionDone}
      hasEthereum={!!window.ethereum}
      onDismissError={() => setError('')}
      onConnect={() => void connectWallet()}
      onOpenWebApp={async () => {
        if (!window.ethereum) return;
        const info = await refreshWallet();
        if (info) enterApp(info.addr, info.label);
      }}
      onSwitchNetwork={async () => {
        if (!window.ethereum) return;
        setBusy(true);
        try {
          await ensureSepoliaNetwork(window.ethereum);
          await refreshWallet();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
