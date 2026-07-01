import { useState } from 'react';
import {
  decryptConfidentialBalanceByAddress,
  fetchRegistryPairs,
  formatRelayerError,
  resolveConfidentialToken,
  setFheProgressCallback,
  type TokenPair,
} from '../lib/zama';
import { formatUnitsDisplay, shortenAddress } from '../lib/wallet';
import { getDecryptedBalanceMap, setDecryptedBalance } from '../lib/decryptedBalances';
import ErrorBanner from '../components/ErrorBanner';
import type { WalletSession } from '../lib/walletSession';
import { openExternalAction, shouldDelegateToCompanion, usesEmbeddedSigning, DEFAULT_BROWSER_WALLET_LABEL } from '../lib/walletSession';
import { runWebAction } from '../lib/webSigning';
import WebPageHeader from '../components/WebPageHeader';

interface Props {
  session: WalletSession;
  onBack: () => void;
  onDecrypted?: (pair: TokenPair, balance: bigint) => void;
}

export default function DecryptToken({ session, onBack, onDecrypted }: Props) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const isWeb = session.surface === 'web';
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ pair: TokenPair; balance: bigint } | null>(null);

  const handleDecrypt = async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setError('Paste a confidential wrapper (ERC-7984) contract address.');
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    setPhase('Resolving token…');

    if (shouldDelegateToCompanion(session)) {
      await openExternalAction('decrypt', { confidentialAddress: trimmed });
      setPhase('Complete decrypt in your browser tab…');
      setLoading(false);
      return;
    }

    setFheProgressCallback(setPhase);
    try {
      if (!usesEmbeddedSigning(session) && session.ethereum) {
        await runWebAction(
          'decrypt',
          { confidentialAddress: trimmed },
          session.ethereum,
          userAddress,
          session.walletLabel ?? DEFAULT_BROWSER_WALLET_LABEL,
          setPhase,
        );
        const pairs = await fetchRegistryPairs(undefined, session.ethereum);
        const pair = await resolveConfidentialToken(trimmed, pairs);
        const cache = await getDecryptedBalanceMap(userAddress);
        const entry = cache[pair.confidentialAddress.toLowerCase()];
        const balance = entry ? BigInt(entry.balanceWei) : 0n;
        setResult({ pair, balance });
        onDecrypted?.(pair, balance);
        setPhase('');
        return;
      }

      const pairs = await fetchRegistryPairs(privateKey, session.ethereum);
      const { pair, confidentialBalance } = await decryptConfidentialBalanceByAddress(
        trimmed,
        userAddress,
        { privateKey: privateKey || undefined, ethereum: session.ethereum },
        pairs,
      );
      await setDecryptedBalance(userAddress, pair.confidentialAddress, confidentialBalance);
      setResult({ pair, balance: confidentialBalance });
      onDecrypted?.(pair, confidentialBalance);
    } catch (err: unknown) {
      setError(formatRelayerError(err));
    } finally {
      setFheProgressCallback(null);
      setLoading(false);
      setPhase('');
    }
  };

  const content = (
    <>
      <div className={`card card-padded${isWeb ? ' web-decrypt-card' : ''}`}>
        <label className="label-caps" htmlFor="decrypt-address">
          Confidential wrapper address
        </label>
        <p className="web-ui-copy-sm" style={{ margin: '8px 0 12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Paste any ERC-7984 token contract on {session.surface === 'web' ? 'Sepolia' : 'the active network'}.
          Registry pairs are auto-detected; unlisted tokens are supported via on-chain metadata.
        </p>
        <input
          id="decrypt-address"
          type="text"
          className="input-field"
          placeholder="0x…"
          value={address}
          onChange={(e) => { setAddress(e.target.value); setError(''); }}
          disabled={loading}
          style={{ width: '100%', fontFamily: 'var(--font-data)', fontSize: isWeb ? 17 : 14 }}
        />
      </div>

      {phase && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 0' }}>{phase}</p>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {result && (
        <div className="card card-padded" style={{ marginTop: 16 }}>
          <span className="label-caps">Decrypted balance</span>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: 28, fontWeight: 700, marginTop: 8 }}>
            {formatUnitsDisplay(result.balance, result.pair.decimals)} {result.pair.symbol}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
            {shortenAddress(result.pair.confidentialAddress)}
          </p>
        </div>
      )}

      <button
        type="button"
        className="btn-primary"
        style={{ marginTop: 20, width: isWeb ? 'auto' : '100%', minWidth: isWeb ? 240 : undefined }}
        onClick={() => void handleDecrypt()}
        disabled={loading || !address.trim()}
      >
        {loading ? <div className="spinner" /> : 'Decrypt balance'}
      </button>
    </>
  );

  if (isWeb) {
    return (
      <div className="screen web-page">
        <WebPageHeader
          title="Decrypt balance"
          subtitle="EIP-712 user-decryption for any ERC-7984 token in your wallet."
          onBack={onBack}
        />
        <div className="web-page-body">
          <div className="web-page-body-inner web-decrypt-layout">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="icon-btn" onClick={onBack}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 700 }}>Decrypt balance</h1>
      </div>
      <div className="screen-scroll" style={{ padding: 16 }}>
        {content}
      </div>
    </div>
  );
}
