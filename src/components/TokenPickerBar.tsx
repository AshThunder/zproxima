import { useState } from 'react';
import type { TokenPair } from '../lib/zama';
import {
  decryptConfidentialBalance,
  decryptConfidentialBalanceExternal,
  formatRelayerError,
  setFheProgressCallback,
} from '../lib/zama';
import { formatUnitsDisplay } from '../lib/wallet';
import { getTokenTicker, getTokenDisplayName } from '../lib/tokenDisplay';
import { clearDecryptedBalance, setDecryptedBalance } from '../lib/decryptedBalances';
import type { WalletSession } from '../lib/walletSession';
import { openExternalAction, shouldDelegateToCompanion, usesEmbeddedSigning } from '../lib/walletSession';
import Icon from './Icon';

export interface TokenBalanceEntry {
  public: bigint;
  confidential: bigint;
  isLocked: boolean;
}

interface Props {
  session: WalletSession;
  pairs: TokenPair[];
  selected?: TokenPair;
  balances: Record<string, TokenBalanceEntry>;
  onSelect: (pair: TokenPair) => void;
  onBalanceDecrypted: (confidentialAddress: string, entry: TokenBalanceEntry) => void;
  onBalanceMasked?: (confidentialAddress: string) => void;
  disabled?: boolean;
  variant?: 'wrap' | 'send';
  flow?: 'wrap' | 'unwrap';
}

export default function TokenPickerBar({
  session,
  pairs,
  selected,
  balances,
  onSelect,
  onBalanceDecrypted,
  onBalanceMasked,
  disabled = false,
  variant = 'wrap',
  flow = 'wrap',
}: Props) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const [decrypting, setDecrypting] = useState(false);
  const [decryptPhase, setDecryptPhase] = useState('');
  const [decryptError, setDecryptError] = useState('');
  const isSend = variant === 'send';

  const key = selected?.confidentialAddress.toLowerCase() ?? '';
  const bal = key ? balances[key] : undefined;
  const ticker = selected ? getTokenTicker(selected.symbol) : '';

  const flowLabel = selected && !isSend
    ? flow === 'unwrap'
      ? `${selected.symbol} → ${ticker}`
      : `${ticker} → ${selected.symbol}`
    : '';

  const handleDecrypt = async (e?: React.SyntheticEvent) => {
    if (!selected || !bal?.isLocked || decrypting) return;
    e?.preventDefault();
    e?.stopPropagation();
    setDecrypting(true);
    setDecryptPhase('Decrypting…');
    setDecryptError('');
    if (shouldDelegateToCompanion(session)) {
      await openExternalAction('decrypt', {
        symbol: selected.symbol,
        confidentialAddress: selected.confidentialAddress,
      });
      setDecryptPhase('Complete decrypt in your browser tab…');
      setDecrypting(false);
      window.setTimeout(() => setDecryptPhase(''), 3000);
      return;
    }
    setFheProgressCallback(setDecryptPhase);
    try {
      const result = usesEmbeddedSigning(session)
        ? await decryptConfidentialBalance(privateKey, selected, userAddress)
        : session.ethereum
          ? await decryptConfidentialBalanceExternal(session.ethereum, selected, userAddress)
          : await decryptConfidentialBalance(privateKey, selected, userAddress);
      await setDecryptedBalance(userAddress, selected.confidentialAddress, result.confidentialBalance);
      onBalanceDecrypted(selected.confidentialAddress.toLowerCase(), {
        public: result.publicBalance,
        confidential: result.confidentialBalance,
        isLocked: false,
      });
    } catch (err: unknown) {
      setDecryptError(formatRelayerError(err));
    } finally {
      setFheProgressCallback(null);
      setDecrypting(false);
      setDecryptPhase('');
    }
  };

  const handleMask = async (e?: React.SyntheticEvent) => {
    if (!selected || !bal || bal.isLocked || decrypting) return;
    e?.preventDefault();
    e?.stopPropagation();
    await clearDecryptedBalance(userAddress, selected.confidentialAddress);
    onBalanceMasked?.(selected.confidentialAddress.toLowerCase());
  };

  const handlePrivateToggle = (e?: React.SyntheticEvent) => {
    if (!bal || decrypting) return;
    if (bal.isLocked) void handleDecrypt(e);
    else void handleMask(e);
  };

  const confLabel = bal
    ? decrypting && decryptPhase
      ? decryptPhase
      : bal.isLocked
        ? '****'
        : formatUnitsDisplay(bal.confidential, selected!.decimals)
    : '—';

  const optionLabel = (p: TokenPair) => (isSend ? p.symbol : getTokenDisplayName(p.name));

  return (
    <div className="token-picker-bar card card-padded">
      <div className="token-picker-field">
        <label className="label-caps token-picker-label" htmlFor="token-picker-select">
          Select token
        </label>
        <div className="token-picker-select-row">
          <div className="asset-icon asset-icon-sm token-picker-icon" aria-hidden>
            {selected ? (isSend ? selected.symbol[0] : ticker[0]) : '?'}
          </div>
          <div className="select-wrap token-picker-select-wrap">
            <select
              id="token-picker-select"
              className="select-field token-picker-select"
              value={selected?.confidentialAddress ?? ''}
              onChange={(e) => {
                const pair = pairs.find((p) => p.confidentialAddress === e.target.value);
                if (pair) onSelect(pair);
              }}
              disabled={disabled || pairs.length === 0}
            >
              {!selected && (
                <option value="" disabled>
                  Select token
                </option>
              )}
              {pairs.map((p) => (
                <option key={p.confidentialAddress} value={p.confidentialAddress}>
                  {optionLabel(p)}
                </option>
              ))}
            </select>
            <Icon name="expand_more" size={20} color="var(--text-muted)" className="select-chevron" />
          </div>
        </div>
      </div>

      {selected && bal && (
        <>
          {!isSend && flowLabel && (
            <p className="token-picker-pair-hint">{flowLabel}</p>
          )}
          {isSend && (
            <p className="token-picker-pair-hint">Confidential {selected.symbol}</p>
          )}
          <div className={`asset-split-balances token-picker-balances${isSend ? ' token-picker-balances--send' : ''}`}>
            {!isSend && (
              <div className="asset-balance-cell asset-balance-public">
                <div className="balance-cell-header">
                  <Icon name="account_balance_wallet" size={11} color="var(--text-muted)" />
                  <span className="balance-label">Public</span>
                </div>
                <span className="data-md balance-value">
                  {formatUnitsDisplay(bal.public, selected.decimals)}
                </span>
              </div>
            )}
            <div
              className={`asset-balance-cell asset-balance-private${bal.isLocked ? ' asset-balance-private--locked' : ' asset-balance-private--revealed'}${isSend ? ' asset-balance-private--full' : ''}`}
              role={!decrypting ? 'button' : undefined}
              tabIndex={!decrypting ? 0 : undefined}
              title={bal.isLocked ? 'Tap to decrypt private balance' : 'Tap to hide balance'}
              onClick={!decrypting ? (e) => handlePrivateToggle(e) : undefined}
              onKeyDown={!decrypting
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePrivateToggle(e);
                    }
                  }
                : undefined}
            >
              <div className="balance-cell-header">
                <Icon name="lock" size={11} color="rgba(255,255,255,0.6)" />
                <span className="balance-label">Private</span>
                <span className="decrypt-btn wrap-unlock-btn decrypt-btn-indicator" aria-hidden>
                  {decrypting ? (
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                  ) : bal.isLocked ? (
                    <Icon name="key" size={14} color="var(--accent-amber)" />
                  ) : (
                    <Icon name="visibility_off" size={14} color="rgba(255,255,255,0.85)" />
                  )}
                </span>
              </div>
              <span className="data-md balance-value">{confLabel}</span>
            </div>
          </div>
          {!decrypting && (
            <p className="token-picker-decrypt-hint">
              {bal.isLocked
                ? 'Private balance is encrypted — tap to decrypt'
                : 'Tap the black area to hide balance (****)'}
            </p>
          )}
        </>
      )}

      {decryptError && (
        <p className="token-picker-decrypt-error" role="alert">{decryptError}</p>
      )}
    </div>
  );
}
