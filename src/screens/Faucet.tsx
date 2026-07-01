import { useState, useEffect } from 'react';
import { claimFaucetMock, fetchPublicBalance, SEPOLIA_FAUCET_PAIRS, formatRelayerError, type TokenPair } from '../lib/zama';
import { getActiveNetwork, formatUnitsDisplay } from '../lib/wallet';
import { logActivity, updateActivity } from '../lib/activity';
import ErrorBanner from '../components/ErrorBanner';
import { APP_NAME } from '../lib/brand';

import type { WalletSession } from '../lib/walletSession';
import { openExternalAction, shouldDelegateToCompanion, usesEmbeddedSigning, DEFAULT_BROWSER_WALLET_LABEL } from '../lib/walletSession';
import { runWebAction } from '../lib/webSigning';
import WebPageHeader from '../components/WebPageHeader';

interface Props { session: WalletSession; }

export default function FaucetScreen({ session }: Props) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const isWeb = session.surface === 'web';
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [claimingToken, setClaimingToken] = useState<string | null>(null);
  const [claimedToken, setClaimedToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const network = getActiveNetwork();

  useEffect(() => {
    if (network.id !== 'sepolia') return;
    (async () => {
      const map: Record<string, bigint> = {};
      await Promise.all(SEPOLIA_FAUCET_PAIRS.map(async (p) => {
        try {
          const pub = await fetchPublicBalance(p, userAddress);
          map[p.confidentialAddress.toLowerCase()] = pub;
        } catch { /* ignore */ }
      }));
      setBalances(map);
    })();
  }, [privateKey, userAddress, network.id]);

  const handleClaim = async (p: TokenPair) => {
    if (shouldDelegateToCompanion(session)) {
      void openExternalAction('faucet', { symbol: p.symbol, underlyingAddress: p.underlyingAddress });
      setError('');
      setNotice('Switch to your browser tab and confirm in your wallet…');
      return;
    }
    if (!usesEmbeddedSigning(session) && session.ethereum) {
      setClaimingToken(p.confidentialAddress);
      setClaimedToken(null);
      setError('');
      try {
        await runWebAction(
          'faucet',
          { symbol: p.symbol, underlyingAddress: p.underlyingAddress },
          session.ethereum,
          userAddress,
          session.walletLabel ?? DEFAULT_BROWSER_WALLET_LABEL,
          () => undefined,
        );
        setClaimedToken(p.confidentialAddress);
        const pub = await fetchPublicBalance(p, userAddress);
        setBalances((prev) => ({ ...prev, [p.confidentialAddress.toLowerCase()]: pub }));
        setTimeout(() => setClaimedToken(null), 2000);
      } catch (e: unknown) {
        setError(formatRelayerError(e));
      } finally {
        setClaimingToken(null);
      }
      return;
    }
    setClaimingToken(p.confidentialAddress);
    setClaimedToken(null);
    setError('');
    const activity = await logActivity({
      type: 'faucet',
      status: 'pending',
      tokenSymbol: p.symbol,
      amount: '1000',
      networkId: 'sepolia',
      walletMode: 'embedded',
    });
    if (!activity) throw new Error('Failed to record activity');
    try {
      const txHash = await claimFaucetMock(privateKey, p.underlyingAddress, userAddress);
      await updateActivity(activity.id, { status: 'success', txHash });
      setClaimedToken(p.confidentialAddress);
      const pub = await fetchPublicBalance(p, userAddress);
      setBalances(prev => ({ ...prev, [p.confidentialAddress.toLowerCase()]: pub }));
      setTimeout(() => setClaimedToken(null), 2000);
    } catch (e: unknown) {
      const msg = formatRelayerError(e);
      setError(`Failed to claim ${p.symbol}: ${msg}`);
      await updateActivity(activity.id, { status: 'failed', message: msg });
    } finally {
      setClaimingToken(null);
    }
  };

  const tokenList = (
    <>
      {SEPOLIA_FAUCET_PAIRS.map((p) => {
        const pubBal = balances[p.confidentialAddress.toLowerCase()] || 0n;
        const claiming = claimingToken === p.confidentialAddress;
        const claimed = claimedToken === p.confidentialAddress;
        const ticker = p.symbol.replace(/^c/, '').replace(/Mock$/, '');
        const displayName = p.name.replace(/\s*\(Mock\)$/, '');

        if (isWeb) {
          return (
            <div key={p.confidentialAddress} className="web-faucet-card">
              <div className="web-faucet-card-main">
                <div className="asset-icon">{ticker[0]}</div>
                <div className="web-faucet-card-meta">
                  <span className="web-faucet-card-name">{displayName}</span>
                  <span className="label-caps">{ticker} · Sepolia</span>
                </div>
              </div>
              <div className="web-faucet-card-actions">
                <span className="web-faucet-balance">
                  {formatUnitsDisplay(pubBal, p.decimals)} {ticker}
                </span>
                <button
                  type="button"
                  className={`web-faucet-claim${claimed ? ' claimed' : ''}`}
                  onClick={() => void handleClaim(p)}
                  disabled={claiming}
                >
                  {claiming ? <div className="spinner" style={{ width: 14, height: 14 }} /> :
                    claimed ? <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span> Claimed</> :
                    'Claim 1K'}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={p.confidentialAddress} className="faucet-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="asset-icon">{ticker[0]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</span>
                <span className="label-caps">{ticker} · Sepolia</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--text-muted)' }}>
                {formatUnitsDisplay(pubBal, p.decimals)} {ticker}
              </span>
              <button
                onClick={() => void handleClaim(p)}
                disabled={claiming}
                style={{
                  padding: '8px 16px',
                  background: claimed ? 'var(--accent-green-bg)' : 'var(--text-primary)',
                  color: claimed ? 'var(--accent-green)' : '#fff',
                  border: 'none', borderRadius: 'var(--r-full)',
                  fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', cursor: 'pointer', minWidth: 80,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                {claiming ? <div className="spinner" style={{ width: 14, height: 14 }} /> :
                  claimed ? <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span> Claimed</> :
                  'Claim 1K'}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );

  if (isWeb) {
    return (
      <div className="screen web-page">
        <WebPageHeader
          title="Testnet Faucet"
          subtitle="Mint official Sepolia mock tokens (1,000 each). Need ETH? Visit external faucets."
        />
        <div className="web-page-body">
          <div className="web-page-body-inner">
            {notice && <p className="web-ui-copy-sm" style={{ color: 'var(--accent-green)', marginBottom: 12 }}>{notice}</p>}
            {error && <div style={{ marginBottom: 12 }}><ErrorBanner message={error} onDismiss={() => setError('')} /></div>}
            {network.id !== 'sepolia' ? (
              <div className="card card-padded" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>info</span>
                Switch to Sepolia testnet to use the faucet.
              </div>
            ) : (
              <div className="web-faucet-grid">{tokenList}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="top-bar">
        <div style={{ width: 36 }} />
        <span className="top-bar-brand">{APP_NAME}</span>
        <div style={{ width: 36 }} />
      </div>

      <div className="screen-scroll">
        <div>
          <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Testnet<br />Faucet
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Mint official Sepolia mock tokens (1,000 each). Need ETH?{' '}
            <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Visit external faucets
            </a>.
          </p>
        </div>

        {notice && (
          <p style={{ fontSize: 13, color: 'var(--accent-green)' }}>{notice}</p>
        )}
        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        {network.id !== 'sepolia' ? (
          <div className="card card-padded" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>info</span>
            Switch to Sepolia testnet to use the faucet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tokenList}
          </div>
        )}
      </div>
    </div>
  );
}
