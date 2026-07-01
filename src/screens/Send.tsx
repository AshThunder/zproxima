import { useState, useEffect, useCallback } from 'react';
import {
  fetchRegistryPairs,
  fetchTokenBalances,
  getZamaSDK,
  formatRelayerError,
  type TokenPair,
} from '../lib/zama';
import { getActiveNetwork, shortenAddress, formatUnitsDisplay, getSigner } from '../lib/wallet';
import { logActivity, updateActivity } from '../lib/activity';
import { ethers } from 'ethers';
import MainnetWarning from '../components/MainnetWarning';
import ErrorBanner from '../components/ErrorBanner';
import Icon from '../components/Icon';
import TokenPickerBar from '../components/TokenPickerBar';
import { applyDecryptedCache, getDecryptedBalanceMap, setDecryptedBalance } from '../lib/decryptedBalances';
import { useDecryptedBalanceSync } from '../hooks/useDecryptedBalanceSync';
import ProgressBanner from '../components/ProgressBanner';

import type { WalletSession } from '../lib/walletSession';
import { openExternalAction, shouldDelegateToCompanion, usesEmbeddedSigning, DEFAULT_BROWSER_WALLET_LABEL } from '../lib/walletSession';
import { runWebAction } from '../lib/webSigning';
import WebPageHeader from '../components/WebPageHeader';

interface Props {
  session: WalletSession;
  initialToken?: TokenPair;
  onBack: () => void;
  onSuccess?: () => void;
}

export default function SendScreen({ session, initialToken, onBack, onSuccess }: Props) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const isWeb = session.surface === 'web';
  const [pairs, setPairs] = useState<TokenPair[]>([]);
  const [selected, setSelected] = useState<TokenPair | undefined>(initialToken);
  const [pairBalances, setPairBalances] = useState<Record<string, { public: bigint; confidential: bigint; isLocked: boolean }>>({});
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [confBalance, setConfBalance] = useState(0n);
  const [isLocked, setIsLocked] = useState(false);
  const [showMainnetWarn, setShowMainnetWarn] = useState(false);
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);
  const network = getActiveNetwork();

  useEffect(() => {
    if (initialToken) setSelected(initialToken);
  }, [initialToken]);

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
    const key = selected?.confidentialAddress.toLowerCase();
    if (key && merged[key]) {
      setConfBalance(merged[key].confidential);
      setIsLocked(merged[key].isLocked);
    }
  }, [privateKey, selected?.confidentialAddress, userAddress]);

  useDecryptedBalanceSync(userAddress, setPairBalances);

  useEffect(() => {
    void (async () => {
      const list = await fetchRegistryPairs(privateKey, session.ethereum);
      setPairs(list);
      setSelected((prev) => prev ?? initialToken ?? list[0]);
      if (list.length > 0) await loadPairBalances(list);
    })();
  }, [initialToken, loadPairBalances, privateKey, session.ethereum]);

  useEffect(() => {
    if (!selected) return;
    const cached = pairBalances[selected.confidentialAddress.toLowerCase()];
    if (cached) {
      setConfBalance(cached.confidential);
      setIsLocked(cached.isLocked);
    }
  }, [pairBalances, selected?.confidentialAddress]);

  const selectToken = (pair: TokenPair) => {
    setSelected(pair);
    setAmount('');
    setError('');
    const cached = pairBalances[pair.confidentialAddress.toLowerCase()];
    if (cached) {
      setConfBalance(cached.confidential);
      setIsLocked(cached.isLocked);
    }
  };

  const handleBalanceDecrypted = (addr: string, entry: { public: bigint; confidential: bigint; isLocked: boolean }) => {
    setPairBalances((prev) => ({ ...prev, [addr]: entry }));
    if (addr === selected?.confidentialAddress.toLowerCase()) {
      setConfBalance(entry.confidential);
      setIsLocked(entry.isLocked);
    }
  };

  const handleBalanceMasked = (addr: string) => {
    setPairBalances((prev) => {
      const cur = prev[addr];
      if (!cur) return prev;
      return { ...prev, [addr]: { ...cur, isLocked: true } };
    });
    if (addr === selected?.confidentialAddress.toLowerCase()) {
      setIsLocked(true);
    }
  };

  const handleMax = () => {
    if (!selected || isLocked) return;
    setAmount(formatUnitsDisplay(confBalance, selected.decimals));
    setError('');
  };

  const executeSend = async () => {
    if (!selected) return;
    setError('');
    setProgressMsg('');
    setLoading(true);
    try {
      if (!usesEmbeddedSigning(session) && session.ethereum) {
        setSuccessTxHash(null);
        const res = await runWebAction(
          'send',
          {
            symbol: selected.symbol,
            amount,
            recipient,
            confidentialAddress: selected.confidentialAddress,
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
        setRecipient('');
        const b = await fetchTokenBalances('', selected, userAddress);
        setConfBalance(b.confidentialBalance);
        setIsLocked(b.isLocked);
        setPairBalances((prev) => ({
          ...prev,
          [selected.confidentialAddress.toLowerCase()]: {
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
        type: 'send',
        status: 'pending',
        tokenSymbol: selected.symbol,
        amount,
        recipient,
        networkId: network.id,
        walletMode: 'embedded',
      });
      if (!activity) throw new Error('Failed to record activity');
      try {
        const parsed = ethers.parseUnits(amount, selected.decimals);
        if (selected.isCustom) {
          setProgressMsg('Submitting transfer...');
          const signer = getSigner(privateKey);
          const wrapperContract = new ethers.Contract(
            selected.confidentialAddress,
            ['function transfer(address to, uint256 value) public returns (bool)'],
            signer
          );
          const tx = await wrapperContract.transfer(recipient, parsed);
          setProgressMsg(`Tx submitted: ${shortenAddress(tx.hash)}. Confirming...`);
          await tx.wait();
          await updateActivity(activity.id, { status: 'success', txHash: tx.hash });
          setSuccessTxHash(tx.hash);
          setAmount('');
          setRecipient('');
          setProgressMsg(`Sent! Tx ${shortenAddress(tx.hash)}`);
        } else {
          const sdk = await getZamaSDK(privateKey);
          const token = sdk.createToken(selected.confidentialAddress);
          setProgressMsg('Encrypting transfer...');
          const { txHash } = await token.confidentialTransfer(recipient as `0x${string}`, parsed, {
            onEncryptComplete: () => setProgressMsg('Submitting confidential transfer...'),
            onTransferSubmitted: (hash) => setProgressMsg(`Tx: ${shortenAddress(hash)}`),
          });
          await updateActivity(activity.id, { status: 'success', txHash });
          setSuccessTxHash(txHash);
          setAmount('');
          setRecipient('');
          setProgressMsg(`Sent! Tx ${shortenAddress(txHash)}`);
        }
        const b = await fetchTokenBalances(privateKey, selected, userAddress);
        setConfBalance(b.confidentialBalance);
        setIsLocked(b.isLocked);
        setPairBalances((prev) => ({
          ...prev,
          [selected.confidentialAddress.toLowerCase()]: {
            public: b.publicBalance,
            confidential: b.confidentialBalance,
            isLocked: b.isLocked,
          },
        }));
        await setDecryptedBalance(userAddress, selected.confidentialAddress, b.confidentialBalance);
        onSuccess?.();
      } catch (e: unknown) {
        const msg = formatRelayerError(e);
        setError(msg);
        await updateActivity(activity.id, { status: 'failed', message: msg });
      }
    } catch (e: unknown) {
      setError(formatRelayerError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    setError('');
    if (shouldDelegateToCompanion(session)) {
      void openExternalAction('send', {
        symbol: selected?.symbol,
        amount,
        recipient,
        confidentialAddress: selected?.confidentialAddress,
      });
      setError('');
      setProgressMsg('Switch to your browser tab and confirm in your wallet…');
      return;
    }
    if (!selected) { setError('Select a token.'); return; }
    if (!recipient.match(/^0x[a-fA-F0-9]{40}$/)) { setError('Enter a valid recipient address.'); return; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { setError('Enter a valid amount.'); return; }
    if (network.id === 'mainnet') {
      setShowMainnetWarn(true);
      return;
    }
    void executeSend();
  };

  const sendFields = (
    <>
      <div className={isWeb ? 'web-send-field' : `card card-padded send-section${isWeb ? ' web-send-recipient' : ''}`}>
        <div className="send-section-header">
          <Icon name="account_balance_wallet" size={16} color="var(--text-secondary)" />
          <span className="label-caps">Recipient</span>
        </div>
        <div className={`input-with-icon${isWeb ? ' web-send-input' : ''}`}>
          <Icon name="person" size={18} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            disabled={loading}
          />
        </div>
      </div>

      <div className={isWeb ? 'web-send-amount-field' : 'swap-container'}>
        <div className="swap-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="send-section-header" style={{ marginBottom: 0 }}>
              <Icon name="payments" size={16} color="var(--text-secondary)" />
              <span className="label-caps">Amount</span>
            </div>
            <button
              type="button"
              onClick={handleMax}
              disabled={loading || isLocked || !selected}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: isWeb ? 13 : 11,
                fontWeight: 700,
                color: 'var(--accent-amber)',
                background: 'none',
                border: 'none',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              MAX
            </button>
          </div>
          <input
            type="text"
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }}
            disabled={loading}
            className={isWeb ? 'web-wrap-amount-input' : 'amount-input'}
          />
          {selected && (
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8, display: 'block' }}>
              {selected.symbol}
            </span>
          )}
        </div>
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

      <button className={`btn-primary${isWeb ? ' web-wrap-submit' : ''}`} onClick={handleSubmit} disabled={loading || !amount || !recipient}>
        {loading ? (
          <div className="spinner" />
        ) : (
          <>
            <Icon name="send" size={18} fill />
            Send Confidentially
          </>
        )}
      </button>
    </>
  );

  const webMainPanel = (
    <div className="web-wrap-main web-wrap-main--single">
      <TokenPickerBar
        session={session}
        pairs={pairs}
        selected={selected}
        balances={pairBalances}
        onSelect={selectToken}
        onBalanceDecrypted={handleBalanceDecrypted}
        onBalanceMasked={handleBalanceMasked}
        disabled={loading}
        variant="send"
      />
      <div className="web-wrap-panel card card-padded">
        <div className="web-wrap-panel-head">
          <div>
            <h2 className="web-wrap-panel-title">Send confidentially</h2>
            <p className="web-wrap-panel-subtitle">
              Transfer encrypted {selected?.symbol ?? 'tokens'} to another wallet on Sepolia.
            </p>
          </div>
          {selected && (
            <div className="web-wrap-panel-pair">
              <span className="asset-icon">{selected.symbol[0]}</span>
              <span>{selected.symbol}</span>
            </div>
          )}
        </div>

        {sendFields}
      </div>
    </div>
  );

  if (isWeb) {
    return (
      <div className="screen web-page">
        <WebPageHeader
          title="Send"
          subtitle="Transfer confidential tokens to another address on Sepolia."
          onBack={onBack}
        />
        <div className="web-page-body">
          <div className="web-page-body-inner web-send-layout web-wrap-layout--single">
            {webMainPanel}
          </div>
        </div>
        {showMainnetWarn && (
          <MainnetWarning
            action="send confidential tokens"
            onCancel={() => setShowMainnetWarn(false)}
            onConfirm={() => { setShowMainnetWarn(false); void executeSend(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="screen" style={{ background: 'var(--bg-base)' }}>
      <div className="top-bar">
        <button className="icon-btn" onClick={onBack} title="Back">
          <Icon name="arrow_back_ios_new" size={22} />
        </button>
        <span className="top-bar-title" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 16 }}>
          Send
        </span>
        <div style={{ width: 36 }} />
      </div>

      <div className="screen-scroll">
        <TokenPickerBar
          session={session}
          pairs={pairs}
          selected={selected}
          balances={pairBalances}
          onSelect={selectToken}
          onBalanceDecrypted={handleBalanceDecrypted}
          onBalanceMasked={handleBalanceMasked}
          disabled={loading}
          variant="send"
        />
        {sendFields}
      </div>

      {showMainnetWarn && (
        <MainnetWarning
          action="send confidential tokens"
          onCancel={() => setShowMainnetWarn(false)}
          onConfirm={() => { setShowMainnetWarn(false); void executeSend(); }}
        />
      )}
    </div>
  );
}
