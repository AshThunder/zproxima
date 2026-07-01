import { useState, useEffect, useCallback } from 'react';
import { fetchTokenBalances, fetchRegistryPairs, TokenPair, getZamaSDK, formatRelayerError, ensureWrapAllowance } from '../lib/zama';
import { getActiveNetwork, shortenAddress, formatUnitsDisplay } from '../lib/wallet';
import { getSigner } from '../lib/wallet';
import { savePendingUnshield, clearPendingUnshield, indexedDBStorage } from '@zama-fhe/sdk';
import { logActivity, updateActivity } from '../lib/activity';
import MainnetWarning from '../components/MainnetWarning';
import ErrorBanner from '../components/ErrorBanner';
import ProgressBanner from '../components/ProgressBanner';
import TokenPickerBar from '../components/TokenPickerBar';
import { getTokenTicker } from '../lib/tokenDisplay';
import { applyDecryptedCache, getDecryptedBalanceMap, setDecryptedBalance } from '../lib/decryptedBalances';
import { useDecryptedBalanceSync } from '../hooks/useDecryptedBalanceSync';
import { ethers } from 'ethers';

import type { WalletSession } from '../lib/walletSession';
import { openExternalAction, shouldDelegateToCompanion, usesEmbeddedSigning, DEFAULT_BROWSER_WALLET_LABEL } from '../lib/walletSession';
import { runWebAction } from '../lib/webSigning';
import WebPageHeader from '../components/WebPageHeader';

interface Props {
  session: WalletSession;
  selectedToken: TokenPair;
  initialTab?: 'wrap' | 'unwrap';
  onBack: () => void;
  onSuccess?: () => void;
}

export default function WrapUnwrap({
  session,
  selectedToken: p,
  initialTab = 'wrap',
  onBack,
  onSuccess,
}: Props) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const isWeb = session.surface === 'web';
  const [activePair, setActivePair] = useState<TokenPair>(p);
  const [pairs, setPairs] = useState<TokenPair[]>([p]);
  const [pairBalances, setPairBalances] = useState<Record<string, { public: bigint; confidential: bigint; isLocked: boolean }>>({});
  const [tab, setTab] = useState<'wrap' | 'unwrap'>(initialTab);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [balances, setBalances] = useState({ public: 0n, confidential: 0n, isLocked: false });
  const [showMainnetWarn, setShowMainnetWarn] = useState(false);
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);
  const network = getActiveNetwork();

  const ticker = getTokenTicker(activePair.symbol);

  useEffect(() => { setActivePair(p); }, [p]);
  useEffect(() => { setTab(initialTab); }, [initialTab, activePair.confidentialAddress]);

  const loadPairBalances = useCallback(async (list: TokenPair[]) => {
    const map: Record<string, { public: bigint; confidential: bigint; isLocked: boolean }> = {};
    await Promise.all(list.map(async (pair) => {
      try {
        const b = await fetchTokenBalances(privateKey, pair, userAddress, { includePrivate: false });
        map[pair.confidentialAddress.toLowerCase()] = {
          public: b.publicBalance,
          confidential: b.confidentialBalance,
          isLocked: b.isLocked,
        };
      } catch (e) {
        console.error('Balance fetch error', pair.symbol, e);
      }
    }));
    const decryptedCache = await getDecryptedBalanceMap(userAddress);
    const merged = applyDecryptedCache(map, decryptedCache);
    setPairBalances(merged);
    const key = activePair.confidentialAddress.toLowerCase();
    if (merged[key]) {
      setBalances(merged[key]);
    }
  }, [activePair.confidentialAddress, privateKey, userAddress]);

  useDecryptedBalanceSync(userAddress, setPairBalances);

  useEffect(() => {
    void (async () => {
      const list = await fetchRegistryPairs(privateKey, session.ethereum);
      setPairs(list.length > 0 ? list : [p]);
      await loadPairBalances(list.length > 0 ? list : [p]);
    })();
  }, [loadPairBalances, p, privateKey, session.ethereum]);

  useEffect(() => {
    const cached = pairBalances[activePair.confidentialAddress.toLowerCase()];
    if (cached) setBalances(cached);
  }, [activePair.confidentialAddress, pairBalances]);

  const selectPair = (pair: TokenPair) => {
    setActivePair(pair);
    setAmount('');
    setError('');
    setProgressMsg('');
    const cached = pairBalances[pair.confidentialAddress.toLowerCase()];
    if (cached) setBalances(cached);
  };

  const handleBalanceDecrypted = (addr: string, entry: { public: bigint; confidential: bigint; isLocked: boolean }) => {
    setPairBalances((prev) => ({ ...prev, [addr]: entry }));
    if (addr === activePair.confidentialAddress.toLowerCase()) {
      setBalances(entry);
    }
  };

  const handleBalanceMasked = (addr: string) => {
    setPairBalances((prev) => {
      const cur = prev[addr];
      if (!cur) return prev;
      return { ...prev, [addr]: { ...cur, isLocked: true } };
    });
    if (addr === activePair.confidentialAddress.toLowerCase()) {
      setBalances((prev) => ({ ...prev, isLocked: true }));
    }
  };

  const tokenPicker = (
    <TokenPickerBar
      session={session}
      pairs={pairs}
      selected={activePair}
      balances={pairBalances}
      onSelect={selectPair}
      onBalanceDecrypted={handleBalanceDecrypted}
      onBalanceMasked={handleBalanceMasked}
      disabled={loading}
      flow={tab}
    />
  );

  const switchTab = (next: 'wrap' | 'unwrap') => {
    setTab(next);
    setAmount('');
    setError('');
  };

  const availableBalance = tab === 'wrap' ? balances.public : balances.confidential;
  const availableTicker = tab === 'wrap' ? ticker : activePair.symbol;
  const sourceLabel = tab === 'wrap' ? `Public ${ticker}` : `Private ${activePair.symbol}`;
  const targetLabel = tab === 'wrap' ? `Private ${activePair.symbol}` : `Public ${ticker}`;

  const handleMax = () => setAmount(formatUnitsDisplay(availableBalance, activePair.decimals));

  const executeSubmit = async () => {
    setError('');
    setProgressMsg('');
    setLoading(true);
    try {
      if (!usesEmbeddedSigning(session) && session.ethereum) {
        setSuccessTxHash(null);
        const res = await runWebAction(
          tab === 'wrap' ? 'wrap' : 'unwrap',
          {
            symbol: activePair.symbol,
            amount,
            tab,
            confidentialAddress: activePair.confidentialAddress,
          },
          session.ethereum,
          userAddress,
          session.walletLabel ?? DEFAULT_BROWSER_WALLET_LABEL,
          setProgressMsg,
        );
        if (res?.txHash) {
          setSuccessTxHash(res.txHash);
        }
        setAmount('');
        const b = await fetchTokenBalances('', activePair, userAddress);
        setBalances({ public: b.publicBalance, confidential: b.confidentialBalance, isLocked: b.isLocked });
        setPairBalances((prev) => ({
          ...prev,
          [activePair.confidentialAddress.toLowerCase()]: {
            public: b.publicBalance,
            confidential: b.confidentialBalance,
            isLocked: b.isLocked,
          },
        }));
        onSuccess?.();
        return;
      }

      setSuccessTxHash(null);

      const activity = await logActivity({
        type: tab,
        status: 'pending',
        tokenSymbol: activePair.symbol,
        amount,
        networkId: network.id,
        walletMode: 'embedded',
      });
      if (!activity) throw new Error('Failed to record activity');
      try {
        const amtWei = ethers.parseUnits(amount, activePair.decimals);
        const signer = getSigner(privateKey);

        if (activePair.isCustom) {
          const wrapperContract = new ethers.Contract(
            activePair.confidentialAddress,
            [
              'function wrap(address to, uint256 amount) public returns (uint256)',
              'function unwrap(address to, uint256 amount) public returns (uint256)'
            ],
            signer
          );

          if (tab === 'wrap') {
            setProgressMsg('Checking token approval…');
            await ensureWrapAllowance(signer, activePair, amtWei, setProgressMsg);
            setProgressMsg('Wrapping custom token…');
            const tx = await wrapperContract.wrap(userAddress, amtWei);
            setProgressMsg(`Wrap tx submitted: ${shortenAddress(tx.hash)}. Waiting for block confirmation...`);
            await tx.wait();
            await updateActivity(activity.id, { status: 'success', txHash: tx.hash });
            setSuccessTxHash(tx.hash);
            setProgressMsg(`Success! Wrapped in tx ${shortenAddress(tx.hash)}`);
          } else {
            setProgressMsg('Unwrapping custom token…');
            const tx = await wrapperContract.unwrap(userAddress, amtWei);
            setProgressMsg(`Unwrap tx submitted: ${shortenAddress(tx.hash)}. Waiting for block confirmation...`);
            await tx.wait();
            await updateActivity(activity.id, { status: 'success', txHash: tx.hash });
            setSuccessTxHash(tx.hash);
            setProgressMsg(`Success! Unwrapped in tx ${shortenAddress(tx.hash)}`);
          }
        } else {
          const sdk = await getZamaSDK(privateKey);
          const token = sdk.createWrappedToken(activePair.confidentialAddress);

          if (tab === 'wrap') {
            setProgressMsg('Checking token approval…');
            await ensureWrapAllowance(signer, activePair, amtWei, setProgressMsg);
            setProgressMsg('Shielding token…');
            const { txHash } = await token.shield(amtWei, {
              approvalStrategy: 'skip',
              onShieldSubmitted: (hash) => setProgressMsg(`Shield tx: ${shortenAddress(hash)}`),
            });
            await updateActivity(activity.id, { status: 'success', txHash });
            setSuccessTxHash(txHash);
            setProgressMsg(`Success! Wrapped in tx ${shortenAddress(txHash)}`);
          } else {
            setProgressMsg('Initiating unshield (Phase 1)...');
            const { txHash } = await token.unshield(amtWei, {
              onUnwrapSubmitted: async (hash) => {
                setProgressMsg(`Unwrap submitted: ${shortenAddress(hash)}. Waiting for threshold proof...`);
                await savePendingUnshield(indexedDBStorage, activePair.confidentialAddress, hash);
              },
              onFinalizing: () => setProgressMsg('Proof received! Finalizing unwrap...'),
              onFinalizeSubmitted: async (hash) => {
                setProgressMsg(`Finalized in tx: ${shortenAddress(hash)}`);
                await clearPendingUnshield(indexedDBStorage, activePair.confidentialAddress);
              },
            });
            await updateActivity(activity.id, { status: 'success', txHash });
            setSuccessTxHash(txHash);
            setProgressMsg(`Success! Unwrapped in tx ${shortenAddress(txHash)}`);
          }
        }
        setAmount('');
        const b = await fetchTokenBalances(privateKey, activePair, userAddress);
        const next = { public: b.publicBalance, confidential: b.confidentialBalance, isLocked: b.isLocked };
        setBalances(next);
        setPairBalances((prev) => ({
          ...prev,
          [activePair.confidentialAddress.toLowerCase()]: next,
        }));
        await setDecryptedBalance(userAddress, activePair.confidentialAddress, b.confidentialBalance);
        onSuccess?.();
      } catch (e: unknown) {
        const msg = formatRelayerError(e);
        setError(msg);
        await updateActivity(activity.id, { status: 'failed', message: msg });
        setProgressMsg('');
      }
    } catch (e: unknown) {
      setError(formatRelayerError(e));
      setProgressMsg('');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { setError('Enter a valid amount.'); return; }
    try {
      const amountWei = ethers.parseUnits(amount, activePair.decimals);
      if (tab === 'wrap' && amountWei > balances.public) {
        setError(
          `Insufficient ${ticker} balance. You have ${formatUnitsDisplay(balances.public, activePair.decimals)} ${ticker}.`,
        );
        return;
      }
      if (tab === 'unwrap' && !balances.isLocked && amountWei > balances.confidential) {
        setError(
          `Insufficient confidential balance. Decrypt your balance first or enter a lower amount.`,
        );
        return;
      }
    } catch {
      setError('Enter a valid amount.');
      return;
    }
    if (shouldDelegateToCompanion(session)) {
      void openExternalAction(tab === 'wrap' ? 'wrap' : 'unwrap', {
        symbol: activePair.symbol,
        amount,
        tab,
        confidentialAddress: activePair.confidentialAddress,
      });
      setError('');
      setProgressMsg('Switch to your browser tab and confirm in your wallet…');
      return;
    }
    if (network.id === 'mainnet') {
      setShowMainnetWarn(true);
      return;
    }
    void executeSubmit();
  };

  const swapForm = (
    <>
      <div className="swap-container">
        <div className="swap-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="label-caps">{isWeb ? sourceLabel : 'Source Asset'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: isWeb ? 13 : 11, color: 'var(--text-secondary)' }}>
                Balance: {tab === 'unwrap' && balances.isLocked
                  ? '****'
                  : `${formatUnitsDisplay(availableBalance, activePair.decimals)} ${availableTicker}`}
              </span>
              <button type="button" onClick={handleMax} disabled={tab === 'unwrap' && balances.isLocked} style={{ fontFamily: 'var(--font-data)', fontSize: isWeb ? 13 : 11, fontWeight: 700, color: 'var(--accent-amber)', background: 'none', border: 'none', cursor: 'pointer', opacity: tab === 'unwrap' && balances.isLocked ? 0.5 : 1 }}>
                MAX
              </button>
            </div>
          </div>
          <input
            type="text"
            placeholder="0.00"
            value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            disabled={loading}
            className={isWeb ? 'web-wrap-amount-input' : undefined}
            style={isWeb ? undefined : { width: '100%', fontFamily: 'var(--font-data)', fontSize: 32, fontWeight: 700, background: 'transparent', border: 'none', padding: 0 }}
          />
        </div>

        {!isWeb && (
          <>
            <div className="swap-divider">
              <button type="button" className="swap-btn" onClick={() => { switchTab(tab === 'wrap' ? 'unwrap' : 'wrap'); }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>swap_vert</span>
              </button>
            </div>

            <div className="swap-panel" style={{ marginTop: 2 }}>
              <span className="label-caps">Target Asset</span>
              <div style={{ fontFamily: 'var(--font-data)', fontSize: 32, fontWeight: 700, color: 'var(--text-muted)', marginTop: 8 }}>
                {amount || '0.00'} {tab === 'wrap' ? activePair.symbol : ticker}
              </div>
            </div>
          </>
        )}

        {isWeb && (
          <div className="swap-panel web-wrap-target-panel">
            <span className="label-caps">{targetLabel}</span>
            <div className="web-wrap-target-value">
              {amount || '0.00'} <span>{tab === 'wrap' ? activePair.symbol : ticker}</span>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      {progressMsg && !error && (
        isWeb ? (
          <div className={`web-wrap-status${successTxHash ? ' web-wrap-status--success' : ''}`}>
            {successTxHash ? (
              <span className="material-symbols-outlined success-icon" style={{ fontSize: 18, color: '#136c1e', flexShrink: 0 }}>
                check_circle
              </span>
            ) : (
              <div className="progress-banner-spinner" style={{ flexShrink: 0 }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span className="web-wrap-status-text">{progressMsg}</span>
              {successTxHash && (
                <a
                  href={`${network.explorer}/tx/${successTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="web-wrap-status-link"
                  style={{ color: '#136c1e' }}
                >
                  View on Explorer
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <ProgressBanner
            message={progressMsg}
            status={successTxHash ? 'success' : 'loading'}
            txHash={successTxHash ?? undefined}
          />
        )
      )}

      <button className={`btn-primary${isWeb ? ' web-wrap-submit' : ''}`} onClick={handleSubmit} disabled={loading || !amount} style={isWeb ? undefined : undefined}>
        {loading ? <div className="spinner" /> : (tab === 'wrap' ? 'Confirm Wrap' : 'Confirm Unwrap')}
      </button>
    </>
  );

  const webMainPanel = (
    <div className="web-wrap-main web-wrap-main--single">
      {tokenPicker}
      <div className="web-wrap-tabs" role="tablist" aria-label="Wrap or unwrap">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'wrap'}
          className={`web-wrap-tab${tab === 'wrap' ? ' active' : ''}`}
          onClick={() => switchTab('wrap')}
        >
          <span className="material-symbols-outlined">arrow_upward</span>
          Wrap
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'unwrap'}
          className={`web-wrap-tab${tab === 'unwrap' ? ' active' : ''}`}
          onClick={() => switchTab('unwrap')}
        >
          <span className="material-symbols-outlined">arrow_downward</span>
          Unwrap
        </button>
      </div>

      <div className="web-wrap-panel card card-padded">
        <div className="web-wrap-panel-head">
          <div>
            <h2 className="web-wrap-panel-title">
              {tab === 'wrap' ? 'Shield public tokens' : 'Reveal private tokens'}
            </h2>
            <p className="web-wrap-panel-subtitle">
              {tab === 'wrap'
                ? `Move ${ticker} into confidential ${activePair.symbol} on Sepolia.`
                : `Convert ${activePair.symbol} back to public ${ticker}.`}
            </p>
          </div>
          <div className="web-wrap-panel-pair">
            <span className="asset-icon">
              {tab === 'unwrap' ? activePair.symbol[0] : ticker[0]}
            </span>
            <span>
              {tab === 'unwrap' ? `${activePair.symbol} → ${ticker}` : `${ticker} → ${activePair.symbol}`}
            </span>
          </div>
        </div>
        {swapForm}
      </div>
    </div>
  );

  if (isWeb) {
    return (
      <div className="screen web-page" style={{ background: 'var(--bg-base)' }}>
        <WebPageHeader
          title="Wrap & Unwrap"
          subtitle="Shield public ERC-20 balances into confidential wrappers, or unwrap back to public."
          onBack={onBack}
        />
        <div className="web-page-body">
          <div className="web-page-body-inner web-wrap-layout web-wrap-layout--single">
            {webMainPanel}
          </div>
        </div>
        {showMainnetWarn && (
          <MainnetWarning
            action={tab === 'wrap' ? 'wrap tokens' : 'unwrap tokens'}
            onCancel={() => setShowMainnetWarn(false)}
            onConfirm={() => { setShowMainnetWarn(false); void executeSubmit(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="screen" style={{ background: 'var(--bg-base)' }}>
      <div className="top-bar">
        <button className="icon-btn" onClick={onBack}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back_ios_new</span>
        </button>
        <span className="top-bar-title" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 16 }}>
          {tab === 'wrap' ? 'Wrap Assets' : 'Unwrap Assets'}
        </span>
        <div style={{ width: 36 }} />
      </div>

      <div className="screen-scroll ext-wrap-scroll">
        <div className="ext-wrap-layout ext-wrap-layout--compact">
          {tokenPicker}
          <div className="ext-wrap-main">
            <div className="web-wrap-tabs" role="tablist" aria-label="Wrap or unwrap">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'wrap'}
                className={`web-wrap-tab${tab === 'wrap' ? ' active' : ''}`}
                onClick={() => switchTab('wrap')}
              >
                <span className="material-symbols-outlined">arrow_upward</span>
                Wrap
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'unwrap'}
                className={`web-wrap-tab${tab === 'unwrap' ? ' active' : ''}`}
                onClick={() => switchTab('unwrap')}
              >
                <span className="material-symbols-outlined">arrow_downward</span>
                Unwrap
              </button>
            </div>
            <div className="card card-padded ext-wrap-panel">
              {swapForm}
            </div>
          </div>
        </div>
      </div>

      {showMainnetWarn && (
        <MainnetWarning
          action={tab === 'wrap' ? 'wrap tokens' : 'unwrap tokens'}
          onCancel={() => setShowMainnetWarn(false)}
          onConfirm={() => { setShowMainnetWarn(false); void executeSubmit(); }}
        />
      )}
    </div>
  );
}
