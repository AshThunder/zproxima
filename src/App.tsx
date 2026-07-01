import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  isVaultInitialized,
  getSessionCache,
  cacheSession,
  clearSessionCache,
  getActiveAccountIndex,
  type VaultData,
} from './lib/vault';
import { resetZamaSDK } from './lib/zama';
import { loadSavedNetwork, deriveVaultAccount } from './lib/wallet';
import { useAutoLock } from './hooks/useAutoLock';
import type { AppScreen, NavigateOptions } from './lib/types';
import type { TokenPair } from './lib/zama';
import {
  getExternalBridgeState,
  isBridgeAlive,
  subscribeExternalBridge,
  disconnectExternalBridge,
} from './lib/externalBridge';
import { getWalletMode, setWalletMode } from './lib/walletMode';
import { clearDecryptedBalances } from './lib/decryptedBalances';
import {
  buildEmbeddedSession,
  buildExternalSession,
  type WalletSession,
} from './lib/walletSession';
import Onboarding from './screens/Onboarding';
import UnlockScreen from './screens/Unlock';
import ExternalConnectScreen from './screens/ExternalConnect';
import Dashboard from './screens/Dashboard';
import WrapUnwrap from './screens/WrapUnwrap';
import BotChat from './screens/BotChat';
import FaucetScreen from './screens/Faucet';
import SettingsScreen from './screens/Settings';

const SendScreen = lazy(() => import('./screens/Send'));
const ReceiveScreen = lazy(() => import('./screens/Receive'));
const ActivityScreen = lazy(() => import('./screens/Activity'));
const DecryptTokenScreen = lazy(() => import('./screens/DecryptToken'));
const GuideScreen = lazy(() => import('./screens/Guide'));
const TokenDetailsScreen = lazy(() => import('./screens/TokenDetails'));
const RegistryDetailsScreen = lazy(() => import('./screens/RegistryDetails'));
const RegisterTokenScreen = lazy(() => import('./screens/RegisterToken'));

const NAV: { id: AppScreen; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'account_balance_wallet', label: 'Registry' },
  { id: 'receive', icon: 'call_received', label: 'Receive' },
  { id: 'send', icon: 'send', label: 'Send' },
  { id: 'bot', icon: 'smart_toy', label: 'ZBot' },
  { id: 'faucet', icon: 'water_drop', label: 'Faucet' },
];

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenPair | undefined>();
  const [wrapTab, setWrapTab] = useState<'wrap' | 'unwrap'>('wrap');
  const [refreshKey, setRefreshKey] = useState(0);

  const syncExternalSession = useCallback(async () => {
    const mode = await getWalletMode();
    if (mode !== 'external') return false;
    const session = await buildExternalSession();
    if (session) {
      setWalletSession((prev) => {
        if (prev?.address && prev.address.toLowerCase() !== session.address.toLowerCase()) {
          void clearDecryptedBalances();
        }
        return session;
      });
      return true;
    }
    setWalletSession(null);
    return false;
  }, []);

  const handleLock = useCallback(() => {
    resetZamaSDK();
    setVaultData(null);
    setWalletSession(null);
    clearSessionCache();
    void clearDecryptedBalances();
    void getWalletMode().then((mode) => {
      setScreen(mode === 'external' ? 'external-connect' : 'unlock');
    });
  }, []);

  const autoLockEnabled =
    screen !== 'loading' &&
    screen !== 'onboarding' &&
    screen !== 'unlock' &&
    screen !== 'external-connect';
  const { touchActivity } = useAutoLock(handleLock, autoLockEnabled);

  const applyVaultSession = useCallback(async (data: VaultData) => {
    const index = data.activeAccountIndex ?? await getActiveAccountIndex();
    const acc = deriveVaultAccount(data.mnemonic, index);
    const session: VaultData = { ...data, activeAccountIndex: index, privateKey: acc.privateKey };
    setVaultData(session);
    setWalletSession(await buildEmbeddedSession(acc.address, session.privateKey));
    return session;
  }, []);

  const handleUnlock = useCallback(async (data: VaultData) => {
    await setWalletMode('embedded');
    const session = await applyVaultSession(data);
    setScreen('dashboard');
    cacheSession(session);
    touchActivity();
  }, [applyVaultSession, touchActivity]);

  const handleNavigate = useCallback((target: AppScreen, options?: NavigateOptions) => {
    touchActivity();
    if (options?.token) setSelectedToken(options.token);
    if (options?.wrapTab) setWrapTab(options.wrapTab);
    setScreen(target);
    if (target === 'dashboard') setRefreshKey((k) => k + 1);
  }, [touchActivity]);

  const bootstrap = useCallback(async () => {
    await loadSavedNetwork();
    const mode = await getWalletMode();

    if (mode === 'external') {
      const bridge = await getExternalBridgeState();
      if (bridge && isBridgeAlive(bridge)) {
        await syncExternalSession();
        setScreen('dashboard');
        return;
      }
      setScreen('external-connect');
      return;
    }

    const initialized = await isVaultInitialized();
    if (!initialized) {
      setScreen('onboarding');
      return;
    }
    const cached = await getSessionCache();
    if (cached) {
      await applyVaultSession(cached);
      setScreen('dashboard');
    } else {
      setScreen('unlock');
    }
  }, [applyVaultSession, syncExternalSession]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return subscribeExternalBridge(() => {
      void (async () => {
        const mode = await getWalletMode();
        if (mode !== 'external') return;
        const ok = await syncExternalSession();
        if (ok) setScreen((s) => (s === 'external-connect' ? 'dashboard' : s));
      })();
    });
  }, [syncExternalSession]);

  if (screen === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', background: 'var(--bg-base)' }}>
        <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (screen === 'onboarding') {
    return <Onboarding onComplete={() => setScreen('unlock')} />;
  }

  if (screen === 'unlock') {
    return (
      <UnlockScreen
        onUnlock={handleUnlock}
        onReset={() => setScreen('onboarding')}
        onExternalWallet={async () => {
          await setWalletMode('external');
          setScreen('external-connect');
        }}
      />
    );
  }

  if (screen === 'external-connect') {
    return (
      <ExternalConnectScreen
        onConnected={async () => {
          const ok = await syncExternalSession();
          setScreen(ok ? 'dashboard' : 'external-connect');
        }}
        onUseEmbedded={async () => {
          await setWalletMode('embedded');
          const initialized = await isVaultInitialized();
          setScreen(initialized ? 'unlock' : 'onboarding');
        }}
      />
    );
  }

  if (!walletSession) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  const showNav = ['dashboard', 'receive', 'send', 'bot', 'faucet', 'wrap'].includes(screen);
  const activeNav = screen === 'wrap' ? 'dashboard' : screen;

  const lazyFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <div className="app-shell" onMouseDown={touchActivity} onKeyDown={touchActivity}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {screen === 'dashboard' && (
          <Dashboard
            session={walletSession}
            onNavigate={handleNavigate}
            refreshKey={refreshKey}
            onConnectExternal={() => setScreen('external-connect')}
          />
        )}
        {screen === 'wrap' && selectedToken && (
          <WrapUnwrap
            session={walletSession}
            selectedToken={selectedToken}
            initialTab={wrapTab}
            onBack={() => handleNavigate('dashboard')}
            onSuccess={() => setRefreshKey((k) => k + 1)}
          />
        )}
        {screen === 'send' && (
          <Suspense fallback={lazyFallback}>
            <SendScreen
              session={walletSession}
              initialToken={selectedToken}
              onBack={() => handleNavigate('dashboard')}
              onSuccess={() => setRefreshKey((k) => k + 1)}
            />
          </Suspense>
        )}
        {screen === 'receive' && (
          <Suspense fallback={lazyFallback}>
            <ReceiveScreen
              session={walletSession}
              onBack={() => handleNavigate('dashboard')}
            />
          </Suspense>
        )}
        {screen === 'bot' && (
          <BotChat session={walletSession} />
        )}
        {screen === 'faucet' && (
          <FaucetScreen session={walletSession} />
        )}
        {screen === 'activity' && (
          <Suspense fallback={lazyFallback}>
            <ActivityScreen onBack={() => handleNavigate('dashboard')} />
          </Suspense>
        )}
        {screen === 'decrypt' && (
          <Suspense fallback={lazyFallback}>
            <DecryptTokenScreen
              session={walletSession}
              onBack={() => handleNavigate('dashboard')}
              onDecrypted={() => setRefreshKey((k) => k + 1)}
            />
          </Suspense>
        )}
        {screen === 'guide' && (
          <Suspense fallback={lazyFallback}>
            <GuideScreen
              session={walletSession}
              onBack={() => handleNavigate('dashboard')}
            />
          </Suspense>
        )}
        {screen === 'token-details' && selectedToken && (
          <Suspense fallback={lazyFallback}>
            <TokenDetailsScreen
              session={walletSession}
              token={selectedToken}
              onBack={() => handleNavigate('dashboard')}
            />
          </Suspense>
        )}
        {screen === 'registry-details' && (
          <Suspense fallback={lazyFallback}>
            <RegistryDetailsScreen
              session={walletSession}
              onBack={() => handleNavigate('dashboard')}
            />
          </Suspense>
        )}
        {screen === 'register-token' && (
          <Suspense fallback={lazyFallback}>
            <RegisterTokenScreen
              session={walletSession}
              onBack={() => handleNavigate('dashboard')}
            />
          </Suspense>
        )}
        {screen === 'settings' && (
          <SettingsScreen
            session={walletSession}
            vaultData={vaultData}
            onBack={() => handleNavigate('dashboard')}
            onLock={handleLock}
            onReset={() => setScreen('onboarding')}
            onSwitchAccount={async (data) => {
              resetZamaSDK();
              await clearDecryptedBalances();
              const session = await applyVaultSession(data);
              cacheSession(session);
              setRefreshKey((k) => k + 1);
            }}
            onNavigateActivity={() => handleNavigate('activity')}
            onModeChange={async (mode) => {
              await setWalletMode(mode);
              await clearDecryptedBalances();
              setRefreshKey((k) => k + 1);
              if (mode === 'external') {
                resetZamaSDK();
                const ok = await syncExternalSession();
                setScreen(ok ? 'dashboard' : 'external-connect');
              } else {
                await disconnectExternalBridge();
                resetZamaSDK();
                const cached = vaultData ?? (await getSessionCache());
                if (cached) {
                  await applyVaultSession(cached);
                  setScreen('dashboard');
                } else if (await isVaultInitialized()) {
                  setScreen('unlock');
                } else {
                  setScreen('onboarding');
                }
              }
            }}
            onConnectExternal={() => setScreen('external-connect')}
          />
        )}
      </div>

      {showNav && (
        <div className="bottom-nav">
          <div className="bottom-nav-pill">
            {NAV.map(({ id, icon, label }) => (
              <button
                key={id}
                className={`nav-item ${activeNav === id ? 'active' : ''}`}
                onClick={() => handleNavigate(id)}
                title={label}
              >
                <span className="material-symbols-outlined" style={{
                  fontVariationSettings: activeNav === id ? "'FILL' 1" : "'FILL' 0",
                }}>
                  {icon}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
