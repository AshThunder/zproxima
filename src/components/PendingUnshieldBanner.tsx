import { useState } from 'react';
import { shortenAddress } from '../lib/wallet';
import { resumePendingUnshield, formatRelayerError } from '../lib/zama';
import type { PendingUnshieldItem } from '../lib/pendingUnshield';
import ErrorBanner from './ErrorBanner';
import Icon from './Icon';

interface Props {
  items: PendingUnshieldItem[];
  privateKey: string;
  onResumed: () => void;
}

export default function PendingUnshieldBanner({ items, privateKey, onResumed }: Props) {
  const [resuming, setResuming] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (items.length === 0) return null;

  const handleResume = async (item: PendingUnshieldItem) => {
    setResuming(item.pair.confidentialAddress);
    setError('');
    try {
      await resumePendingUnshield(privateKey, item.pair);
      onResumed();
    } catch (e: unknown) {
      setError(formatRelayerError(e));
    } finally {
      setResuming(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      {items.map(({ pair, txHash }) => (
        <div
          key={pair.confidentialAddress}
          className="card card-padded"
          style={{ borderLeft: '3px solid var(--accent-amber)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <span className="label-caps" style={{ color: 'var(--accent-amber)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="hourglass_top" size={12} color="var(--accent-amber)" />
                Pending Unwrap
              </span>
              <p style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{pair.symbol}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Phase 1 tx: {shortenAddress(txHash)} — waiting for threshold proof or finalize.
              </p>
            </div>
            <button
              className="btn-secondary"
              style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
              disabled={resuming === pair.confidentialAddress}
              onClick={() => void handleResume({ pair, txHash })}
            >
              {resuming === pair.confidentialAddress ? <div className="spinner" style={{ width: 14, height: 14 }} /> : (
                <>
                  <Icon name="play_arrow" size={14} />
                  Resume
                </>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
