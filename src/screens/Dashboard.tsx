import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchRegistryPairs,
  fetchTokenBalances,
  decryptConfidentialBalance,
  decryptConfidentialBalanceExternal,
  addCustomPair,
  checkAndResumeUnshields,
  resetZamaSDK,
  resetExternalZamaSDK,
  formatRelayerError,
  setFheProgressCallback,
  type TokenPair,
} from '../lib/zama';
import { getProvider, formatUnitsDisplay, getActiveNetwork, setActiveNetwork, shortenAddress } from '../lib/wallet';
import { APP_NAME } from '../lib/brand';
import { STORAGE_KEYS } from '../lib/storageKeys';
import { fetchTokenPrices, getPriceForSymbol, formatUsdValue, FALLBACK_PRICES } from '../lib/prices';
import { listPendingUnshields } from '../lib/pendingUnshield';
import type { AppScreen, NavigateOptions } from '../lib/types';
import type { PendingUnshieldItem } from '../lib/pendingUnshield';
import PendingUnshieldBanner from '../components/PendingUnshieldBanner';
import RelayerConfigBanner from '../components/RelayerConfigBanner';
import ErrorBanner from '../components/ErrorBanner';
import WalletModeBanner from '../components/WalletModeBanner';
import { openExternalAction, shouldDelegateToCompanion, usesEmbeddedSigning } from '../lib/walletSession';
import type { WalletSession } from '../lib/walletSession';
import {
  applyDecryptedCache,
  DECRYPTED_BALANCES_KEY,
  getDecryptedBalanceMap,
  setDecryptedBalance,
  clearDecryptedBalance,
  type DecryptedBalanceStore,
} from '../lib/decryptedBalances';
import { getTokenTicker, getTokenDisplayName } from '../lib/tokenDisplay';
import Icon from '../components/Icon';
import RegisterCustomWrapperModal from '../components/RegisterCustomWrapperModal';
import { ethers } from 'ethers';

interface DashboardProps {
  session: WalletSession;
  onNavigate: (screen: AppScreen, options?: NavigateOptions) => void;
  refreshKey?: number;
  onConnectExternal: () => void;
}

export default function Dashboard({ session, onNavigate, refreshKey = 0, onConnectExternal }: DashboardProps) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const [pairs, setPairs] = useState<TokenPair[]>([]);
  const [balances, setBalances] = useState<Record<string, { public: bigint; confidential: bigint; isLocked: boolean }>>({});
  const [nativeBalance, setNativeBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [copied, setCopied] = useState(false);
  const [network, setNetwork] = useState(getActiveNetwork());
  const [prices, setPrices] = useState<Record<string, number>>(FALLBACK_PRICES);
  const [pendingUnshields, setPendingUnshields] = useState<PendingUnshieldItem[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customUnderlying, setCustomUnderlying] = useState('');
  const [customConfidential, setCustomConfidential] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customName, setCustomName] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [decryptingKey, setDecryptingKey] = useState<string | null>(null);
  const [decryptPhase, setDecryptPhase] = useState('');
  const [decryptError, setDecryptError] = useState('');
  const prevAddressRef = useRef<string | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setLoadError('');
    try {
      const [provider, list, priceMap] = await Promise.all([
        Promise.resolve(getProvider()),
        fetchRegistryPairs(privateKey, session.ethereum),
        fetchTokenPrices(),
      ]);
      setPrices(priceMap);
      const ethBal = await provider.getBalance(userAddress);
      setNativeBalance(ethBal);
      setPairs(list);
      setPendingUnshields(await listPendingUnshields(list));
      if (session.privateKey) {
        checkAndResumeUnshields(privateKey, list).then(() =>
          listPendingUnshields(list).then(setPendingUnshields),
        ).catch(console.warn);
      }
      const balMap: Record<string, { public: bigint; confidential: bigint; isLocked: boolean }> = {};
      await Promise.all(list.map(async (p) => {
        try {
          const bals = await fetchTokenBalances(privateKey, p, userAddress, {
            includePrivate: false,
          });
          balMap[p.confidentialAddress.toLowerCase()] = {
            public: bals.publicBalance,
            confidential: bals.confidentialBalance,
            isLocked: bals.isLocked,
          };
        } catch (e) { console.error('Balance fetch error', p.symbol, e); }
      }));
      const decryptedCache = await getDecryptedBalanceMap(userAddress);
      setBalances(applyDecryptedCache(balMap, decryptedCache));
    } catch (e: unknown) {
      setLoadError(formatRelayerError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [privateKey, userAddress, session.privateKey]);

  useEffect(() => { void loadData(); }, [loadData, network.id, refreshKey]);

  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = userAddress;
    if (!prev || prev === userAddress) return;
    setBalances({});
    setNativeBalance(0n);
    setDecryptError('');
    setDecryptingKey(null);
    if (session.ethereum) {
      resetExternalZamaSDK();
    }
  }, [userAddress, session.mode, session.ethereum]);

  useEffect(() => {
    const owner = userAddress.toLowerCase();

    const mergeCache = (store: DecryptedBalanceStore | undefined) => {
      if (!store || store.ownerAddress !== owner) return;
      setBalances((prev) => applyDecryptedCache(prev, store.balances));
    };

    void getDecryptedBalanceMap(userAddress).then((cache) => {
      if (Object.keys(cache).length > 0) {
        setBalances((prev) => applyDecryptedCache(prev, cache));
      }
    });

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const onChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area !== 'local' || !changes[DECRYPTED_BALANCES_KEY]) return;
        mergeCache(changes[DECRYPTED_BALANCES_KEY].newValue as DecryptedBalanceStore | undefined);
      };
      chrome.storage.onChanged.addListener(onChanged);
      return () => chrome.storage.onChanged.removeListener(onChanged);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DECRYPTED_BALANCES_KEY) return;
      mergeCache(event.newValue ? JSON.parse(event.newValue) : undefined);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userAddress]);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(userAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNetworkChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    resetZamaSDK();
    setActiveNetwork(e.target.value as 'sepolia' | 'mainnet');
    setNetwork(getActiveNetwork());
  };

  const handleDecryptBalance = async (pair: TokenPair, e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const key = pair.confidentialAddress.toLowerCase();
    setDecryptingKey(key);
    setDecryptPhase('Decrypting…');
    setDecryptError('');
    if (shouldDelegateToCompanion(session)) {
      await openExternalAction('decrypt', {
        symbol: pair.symbol,
        confidentialAddress: pair.confidentialAddress,
      });
      setDecryptPhase('Complete decrypt in your browser tab…');
      // Prevent indefinite spinner in extension when decrypt is delegated.
      setDecryptingKey(null);
      window.setTimeout(() => setDecryptPhase(''), 3000);
      return;
    }
    setFheProgressCallback(setDecryptPhase);
    try {
      const result = usesEmbeddedSigning(session)
        ? await decryptConfidentialBalance(privateKey, pair, userAddress)
        : session.ethereum
          ? await decryptConfidentialBalanceExternal(session.ethereum, pair, userAddress)
          : await decryptConfidentialBalance(privateKey, pair, userAddress);
      await setDecryptedBalance(userAddress, pair.confidentialAddress, result.confidentialBalance);
      setBalances((prev) => ({
        ...prev,
        [key]: {
          public: result.publicBalance,
          confidential: result.confidentialBalance,
          isLocked: false,
        },
      }));
    } catch (err: unknown) {
      setDecryptError(formatRelayerError(err));
    } finally {
      setFheProgressCallback(null);
      setDecryptingKey(null);
      setDecryptPhase('');
    }
  };

  const handleMaskBalance = async (pair: TokenPair, e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const key = pair.confidentialAddress.toLowerCase();
    await clearDecryptedBalance(userAddress, pair.confidentialAddress);
    setBalances((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, isLocked: true } };
    });
  };

  const handlePrivateBalanceToggle = (pair: TokenPair, isLocked: boolean, e?: React.SyntheticEvent) => {
    if (isLocked) void handleDecryptBalance(pair, e);
    else void handleMaskBalance(pair, e);
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setModalLoading(true);
    try {
      if (!ethers.isAddress(customUnderlying) || !ethers.isAddress(customConfidential))
        throw new Error('Invalid contract address.');
      if (!customSymbol.trim() || !customName.trim())
        throw new Error('Symbol and name are required.');
      await addCustomPair(network.id, {
        underlyingAddress: customUnderlying.trim() as `0x${string}`,
        confidentialAddress: customConfidential.trim() as `0x${string}`,
        symbol: customSymbol.trim(),
        name: customName.trim(),
        decimals: 6,
      });
      setShowCustomModal(false);
      setCustomUnderlying(''); setCustomConfidential(''); setCustomSymbol(''); setCustomName('');
      await loadData(true);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to add pair.');
    } finally { setModalLoading(false); }
  };

  const privacyMode = localStorage.getItem(STORAGE_KEYS.privacyMode) === 'true';
  const primaryToken = pairs[0];

  const getCalculatedUSDTotal = () => {
    let totalUSD = 0;
    const ethPrice = getPriceForSymbol('eth', prices);
    const ethAmount = Number(ethers.formatUnits(nativeBalance, 18));
    if (Number.isFinite(ethAmount)) totalUSD += ethAmount * ethPrice;
    pairs.forEach((p) => {
      const bal = balances[p.confidentialAddress.toLowerCase()];
      if (!bal) return;
      const price = getPriceForSymbol(p.symbol, prices);
      const decimals = p.decimals || 6;
      const pub = Number(formatUnitsDisplay(bal.public ?? 0n, decimals));
      const conf = Number(formatUnitsDisplay(bal.confidential ?? 0n, decimals));
      if (Number.isFinite(pub)) totalUSD += pub * price;
      if (Number.isFinite(conf)) totalUSD += conf * price;
    });
    return Number.isFinite(totalUSD) ? totalUSD : 0;
  };

  const totalUSDValue = getCalculatedUSDTotal();
  const displayUSD = privacyMode ? '••••' : formatUsdValue(totalUSDValue);
  const isWeb = session.surface === 'web';

  return (
    <div className="screen" style={{ position: 'relative' }}>
      {isWeb ? (
        <div className="top-bar">
          <span className="top-bar-brand">Registry</span>
          <div className="network-badge">
            <div className="network-dot" />
            <select
              value={network.id}
              onChange={handleNetworkChange}
              className={isWeb ? 'web-network-select' : undefined}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'var(--font-data)', fontSize: isWeb ? 13 : 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <option value="sepolia">Sepolia</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="icon-btn" onClick={() => onNavigate('guide')} title="Guide & Docs">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>menu_book</span>
            </button>
            <button className="icon-btn" onClick={() => setShowCustomModal(true)} title="Add token">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add_circle</span>
            </button>
            <button className="icon-btn" onClick={() => void loadData(true)} title="Refresh" disabled={refreshing}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>refresh</span>
            </button>
          </div>
        </div>
      ) : (
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-btn" onClick={() => setShowCustomModal(true)} title="Add token">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add_circle</span>
          </button>
          <span className="top-bar-brand">{APP_NAME}</span>
        </div>
        <div className="network-badge">
          <div className="network-dot" />
          <select
            value={network.id}
            onChange={handleNetworkChange}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <option value="sepolia">Sepolia</option>
            <option value="mainnet">Mainnet</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn" onClick={() => onNavigate('guide')} title="Guide & Docs">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>menu_book</span>
          </button>
          <button className="icon-btn" onClick={() => void loadData(true)} title="Refresh" disabled={refreshing}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>refresh</span>
          </button>
          <button className="icon-btn" onClick={() => onNavigate('settings')} title="Settings">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>settings</span>
          </button>
        </div>
      </div>
      )}

      <RelayerConfigBanner />
        {!shouldDelegateToCompanion(session) && (
          <WalletModeBanner session={session} onConnectExternal={onConnectExternal} />
        )}

      <div className={`screen-scroll${isWeb ? ' screen-scroll-web' : ''}`}>
        {loadError && <ErrorBanner message={loadError} onDismiss={() => setLoadError('')} />}
        {decryptError && <ErrorBanner message={decryptError} onDismiss={() => setDecryptError('')} />}

        {session.privateKey && (
          <PendingUnshieldBanner
            items={pendingUnshields}
            privateKey={privateKey}
            onResumed={() => void loadData(true)}
          />
        )}

        <div className="hero-card">
          <span className="label-caps" style={{ marginBottom: 2 }}>Account Value</span>
          <div className="hero-value">{displayUSD || '$0.00'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div className="address-pill" onClick={handleCopyAddress} title="Copy wallet address">
              <span style={{ fontFamily: 'var(--font-data)', fontSize: isWeb ? 15 : 13, fontWeight: 600 }}>{shortenAddress(userAddress)}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {copied ? 'check' : 'content_copy'}
              </span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.8, letterSpacing: '0.02em', textAlign: 'center', marginTop: 4 }}>
              Balances shown are for public and decrypted confidential assets
            </span>
          </div>
        </div>

        <div className="dashboard-actions">
        <div style={{ display: 'flex', width: '100%', gap: 12 }}>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            disabled={!primaryToken}
            onClick={() => primaryToken && onNavigate('wrap', { token: primaryToken, wrapTab: 'wrap' })}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
            Wrap
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            disabled={!primaryToken}
            onClick={() => primaryToken && onNavigate('wrap', { token: primaryToken, wrapTab: 'unwrap' })}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_downward</span>
            Unwrap
          </button>
        </div>

        <div style={{ display: 'flex', width: '100%', gap: 12 }}>
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={() => onNavigate('receive')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>call_received</span>
            Receive
          </button>
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            disabled={!primaryToken}
            onClick={() => primaryToken && onNavigate('send', { token: primaryToken })}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
            Send
          </button>
        </div>
        </div>

        <div className="dashboard-assets">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className={isWeb ? 'web-section-title' : undefined} style={isWeb ? { margin: 0 } : { fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Registered Assets
            </h2>
            <button
              onClick={() => onNavigate('activity')}
              className={isWeb ? 'web-link-caps' : undefined}
              style={isWeb ? { background: 'none', border: 'none', cursor: 'pointer' } : {
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}
            >
              Activity
            </button>
          </div>

          {loading && pairs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              <div className="spinner spinner-dark" style={{ width: 24, height: 24, margin: '0 auto' }} />
            </div>
          ) : pairs.length === 0 ? (
            <button onClick={() => setShowCustomModal(true)} className="btn-secondary" style={{ width: '100%' }}>
              Register New Asset
            </button>
          ) : (
            <div className={isWeb ? 'asset-list-web' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pairs.map((p) => {
                const key = p.confidentialAddress.toLowerCase();
                const bal = balances[key] || { public: 0n, confidential: 0n, isLocked: false };
                const ticker = getTokenTicker(p.symbol);
                const displayName = getTokenDisplayName(p.name);
                const pubBal = privacyMode ? '••••' : formatUnitsDisplay(bal.public, p.decimals);
                const confBal = privacyMode
                  ? '••••'
                  : formatUnitsDisplay(bal.confidential, p.decimals);
                const isDecrypting = decryptingKey === key;

                return (
                  <div key={p.confidentialAddress} className="asset-row-card">
                    <div
                      className="asset-row-card-main"
                      role="button"
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      title="View token details"
                      onClick={() => onNavigate('token-details', { token: p })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onNavigate('token-details', { token: p });
                        }
                      }}
                    >
                      <div className="asset-icon">{ticker[0]}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: isWeb ? 18 : 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {displayName}
                        </span>
                        <span className="label-caps" style={isWeb ? undefined : { fontSize: 10 }}>{ticker}</span>
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 'auto', opacity: 0.5 }}>chevron_right</span>
                    </div>
                    <div className="asset-split-balances">
                      <div className="asset-balance-cell asset-balance-public">
                        <div className="balance-cell-header">
                          <Icon name="account_balance_wallet" size={11} color="var(--text-muted)" />
                          <span className="balance-label">Public</span>
                        </div>
                        <span className="data-md balance-value">{pubBal}</span>
                      </div>
                      <div
                        className={`asset-balance-cell asset-balance-private${bal.isLocked ? ' asset-balance-private--locked' : ' asset-balance-private--revealed'}`}
                        role={!privacyMode && !isDecrypting ? 'button' : undefined}
                        tabIndex={!privacyMode && !isDecrypting ? 0 : undefined}
                        title={!privacyMode
                          ? bal.isLocked
                            ? 'Decrypt private balance'
                            : 'Hide private balance'
                          : undefined}
                        onClick={!privacyMode && !isDecrypting
                          ? (e) => handlePrivateBalanceToggle(p, bal.isLocked, e)
                          : undefined}
                        onKeyDown={!privacyMode && !isDecrypting
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handlePrivateBalanceToggle(p, bal.isLocked, e);
                              }
                            }
                          : undefined}
                      >
                        <div className="balance-cell-header">
                          <Icon name="lock" size={11} color="rgba(255,255,255,0.6)" />
                          <span className="balance-label">Private</span>
                          {!privacyMode && (
                            <span className="decrypt-btn wrap-unlock-btn decrypt-btn-indicator" aria-hidden>
                              {isDecrypting ? (
                                <div className="spinner" style={{ width: 14, height: 14 }} />
                              ) : bal.isLocked ? (
                                <Icon name="key" size={14} color="var(--accent-amber)" />
                              ) : (
                                <Icon name="visibility_off" size={14} color="rgba(255,255,255,0.85)" />
                              )}
                            </span>
                          )}
                        </div>
                        <span className="data-md balance-value">
                          {isDecrypting && decryptPhase
                            ? decryptPhase
                            : bal.isLocked
                              ? '****'
                              : confBal}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setShowCustomModal(true)} className="btn-secondary" style={{ marginTop: 8, width: '100%' }}>
                Register New Asset
              </button>
              <button
                onClick={() => onNavigate('decrypt')}
                className="btn-secondary"
                style={{ marginTop: 8, width: '100%' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>key</span>
                Decrypt Any ERC-7984
              </button>
            </div>
          )}
        </div>
      </div>

      <RegisterCustomWrapperModal
        open={showCustomModal}
        isWeb={isWeb}
        underlying={customUnderlying}
        confidential={customConfidential}
        symbol={customSymbol}
        name={customName}
        error={modalError}
        loading={modalLoading}
        onClose={() => setShowCustomModal(false)}
        onUnderlyingChange={setCustomUnderlying}
        onConfidentialChange={setCustomConfidential}
        onSymbolChange={setCustomSymbol}
        onNameChange={setCustomName}
        onSubmit={(e) => void handleAddCustom(e)}
      />
    </div>
  );
}
