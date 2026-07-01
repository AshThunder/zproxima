import { useState, useCallback, lazy, Suspense, useEffect } from 'react';
import { loadSavedNetwork } from '@shared/wallet';
import type { AppScreen, NavigateOptions } from '@shared/types';
import type { TokenPair } from '@shared/zama';
import type { WalletSession } from '@shared/walletSession';
import { DEFAULT_BROWSER_WALLET_LABEL } from '@shared/walletSession';
import { APP_NAME } from '@shared/brand';
import Dashboard from '@screens/Dashboard';
import WrapUnwrap from '@screens/WrapUnwrap';
import FaucetScreen from '@screens/Faucet';
import ActivityScreen from '@screens/Activity';
import DecryptTokenScreen from '@screens/DecryptToken';
import GuideScreen from '@screens/Guide';
import TokenDetails from '@screens/TokenDetails';
import RegistryDetails from '@screens/RegistryDetails';
import RegisterToken from '@screens/RegisterToken';
import { runCompanionAction } from './actions';
import type { ActionParams } from './actions';
import WebShell from './WebShell';
import WebPageHeader from '@components/WebPageHeader';

import { BRIDGE_ACTION_EVENT, STORAGE_KEYS } from '@shared/storageKeys';

const SendScreen = lazy(() => import('@screens/Send'));
const ReceiveScreen = lazy(() => import('@screens/Receive'));

interface Props {
  session: WalletSession;
  onDisconnect: () => void;
  disconnectBusy?: boolean;
}

export default function CompanionApp({ session, onDisconnect, disconnectBusy = false }: Props) {
  const [screen, setScreen] = useState<AppScreen>('dashboard');
  const [selectedToken, setSelectedToken] = useState<TokenPair | undefined>();
  const [wrapTab, setWrapTab] = useState<'wrap' | 'unwrap'>('wrap');
  const [refreshKey, setRefreshKey] = useState(0);
  const [bridgeStatus, setBridgeStatus] = useState('');

  void loadSavedNetwork();

  const resolveWrapNav = useCallback(async (params: ActionParams, tab: 'wrap' | 'unwrap') => {
    const { fetchRegistryPairs } = await import('@shared/zama');
    const pairs = await fetchRegistryPairs(undefined, session.ethereum);
    const addr = params.confidentialAddress?.toLowerCase();
    const pair =
      pairs.find((p) => p.confidentialAddress.toLowerCase() === addr) ??
      pairs.find((p) => p.symbol.toLowerCase() === params.symbol?.toLowerCase()) ??
      pairs[0];
    if (pair) setSelectedToken(pair);
    setWrapTab(tab);
    setScreen('wrap');
    setBridgeStatus('');
  }, [session.ethereum]);

  const handleNavigate = useCallback((target: AppScreen, options?: NavigateOptions) => {
    if (options?.token) setSelectedToken(options.token);
    if (options?.wrapTab) setWrapTab(options.wrapTab);
    setScreen(target);
    if (target === 'dashboard') setRefreshKey((k) => k + 1);
  }, []);

  const handleNavClick = useCallback((target: AppScreen) => {
    if (target === 'wrap') {
      void (async () => {
        if (!selectedToken) {
          const { fetchRegistryPairs } = await import('@shared/zama');
          const pairs = await fetchRegistryPairs(undefined, session.ethereum);
          if (pairs[0]) setSelectedToken(pairs[0]);
        }
        handleNavigate('wrap', { wrapTab: 'wrap' });
      })();
      return;
    }
    handleNavigate(target);
  }, [handleNavigate, selectedToken, session.ethereum]);

  useEffect(() => {
    if (!session.ethereum) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ action?: string; params?: ActionParams }>).detail;
      if (!detail?.action || detail.action === 'connect' || detail.action === 'bot') {
        if (detail?.action === 'bot') {
          setBridgeStatus(`ZBot is only available in the ${APP_NAME} extension side panel.`);
        }
        return;
      }
      const params = detail.params ?? {};
      if (
        (detail.action === 'wrap' || detail.action === 'unwrap') &&
        !params.amount
      ) {
        const tab = detail.action === 'unwrap' || params.tab === 'unwrap' ? 'unwrap' : 'wrap';
        void resolveWrapNav(params, tab);
        return;
      }
      setBridgeStatus(detail.action === 'decrypt' ? 'Decrypting…' : 'Running action from extension…');
      void runCompanionAction(
        detail.action,
        params,
        session.ethereum!,
        session.address,
        session.walletLabel ?? DEFAULT_BROWSER_WALLET_LABEL,
        setBridgeStatus,
      )
        .then(() => {
          setBridgeStatus('');
          setRefreshKey((k) => k + 1);
        })
        .catch((err) => setBridgeStatus(err instanceof Error ? err.message : String(err)));
    };
    window.addEventListener(BRIDGE_ACTION_EVENT, handler);
    return () => window.removeEventListener(BRIDGE_ACTION_EVENT, handler);
  }, [resolveWrapNav, session]);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEYS.pendingWrap);
    if (!raw) return;
    sessionStorage.removeItem(STORAGE_KEYS.pendingWrap);
    try {
      const pending = JSON.parse(raw) as ActionParams & { tab?: string };
      const tab = pending.tab === 'unwrap' ? 'unwrap' : 'wrap';
      void resolveWrapNav(pending, tab);
    } catch {
      // ignore malformed pending nav
    }
  }, [resolveWrapNav]);

  const showNav = ['dashboard', 'receive', 'send', 'wrap', 'faucet', 'decrypt', 'guide', 'token-details', 'registry-details', 'register-token'].includes(screen);
  const activeNav: AppScreen =
    screen === 'activity' || screen === 'settings' ? screen : screen;

  const lazyFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <WebShell
      session={session}
      screen={screen}
      activeNav={activeNav}
      bridgeStatus={bridgeStatus}
      showNav={showNav}
      onNavigate={handleNavClick}
      onDisconnect={onDisconnect}
      disconnectBusy={disconnectBusy}
    >
      {screen === 'dashboard' && (
        <Dashboard
          session={session}
          onNavigate={handleNavigate}
          refreshKey={refreshKey}
          onConnectExternal={() => undefined}
        />
      )}
      {screen === 'wrap' && selectedToken && (
        <WrapUnwrap
          session={session}
          selectedToken={selectedToken}
          initialTab={wrapTab}
          onBack={() => handleNavigate('dashboard')}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {screen === 'send' && (
        <Suspense fallback={lazyFallback}>
          <SendScreen
            session={session}
            initialToken={selectedToken}
            onBack={() => handleNavigate('dashboard')}
            onSuccess={() => setRefreshKey((k) => k + 1)}
          />
        </Suspense>
      )}
      {screen === 'receive' && (
        <Suspense fallback={lazyFallback}>
          <ReceiveScreen
            session={session}
            onBack={() => handleNavigate('dashboard')}
          />
        </Suspense>
      )}
      {screen === 'faucet' && <FaucetScreen session={session} />}
        {screen === 'activity' && (
          <ActivityScreen onBack={() => handleNavigate('dashboard')} webLayout />
        )}
      {screen === 'decrypt' && (
        <DecryptTokenScreen
          session={session}
          onBack={() => handleNavigate('dashboard')}
          onDecrypted={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {screen === 'settings' && (
        <div className="screen web-page">
          <WebPageHeader
            title="Settings"
            subtitle="Browser wallet preferences and account options."
            onBack={() => handleNavigate('dashboard')}
          />
          <div className="web-page-body">
            <div className="web-page-body-inner web-settings-card">
              <div className="card card-padded">
                <p className="companion-settings-copy" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  You are using {APP_NAME} in the browser with {session.walletLabel ?? DEFAULT_BROWSER_WALLET_LABEL}.
                  Activity is saved in this browser. Install the Chrome extension to use a built-in vault or sync with the side panel.
                </p>
              </div>
              <div className="web-settings-actions">
                <button type="button" className="btn-secondary" onClick={() => handleNavigate('activity')}>
                  View activity history
                </button>
                <button type="button" className="btn-secondary" onClick={onDisconnect}>
                  Disconnect wallet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {screen === 'guide' && (
        <GuideScreen
          session={session}
          onBack={() => handleNavigate('dashboard')}
        />
      )}
      {screen === 'token-details' && selectedToken && (
        <TokenDetails
          session={session}
          token={selectedToken}
          onBack={() => handleNavigate('dashboard')}
        />
      )}
      {screen === 'registry-details' && (
        <RegistryDetails
          session={session}
          onBack={() => handleNavigate('dashboard')}
        />
      )}
      {screen === 'register-token' && (
        <RegisterToken
          session={session}
          onBack={() => handleNavigate('dashboard')}
        />
      )}
    </WebShell>
  );
}
