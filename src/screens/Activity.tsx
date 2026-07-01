import { useState, useEffect } from 'react';
import { getActivities, clearActivities, type ActivityItem } from '../lib/activity';
import { getActiveNetwork, shortenAddress } from '../lib/wallet';
import Icon from '../components/Icon';
import WebPageHeader from '../components/WebPageHeader';

interface Props {
  onBack: () => void;
  webLayout?: boolean;
}

const TYPE_LABELS: Record<ActivityItem['type'], string> = {
  wrap: 'Wrap',
  unwrap: 'Unwrap',
  send: 'Send',
  faucet: 'Faucet',
  approve: 'Approve',
  decrypt: 'Decrypt',
  other: 'Other',
};

const TYPE_ICONS: Record<ActivityItem['type'], string> = {
  wrap: 'arrow_upward',
  unwrap: 'arrow_downward',
  send: 'send',
  faucet: 'water_drop',
  approve: 'verified',
  decrypt: 'key',
  other: 'receipt_long',
};

const STATUS_ICONS: Record<ActivityItem['status'], string> = {
  pending: 'schedule',
  success: 'check_circle',
  failed: 'error',
};

export default function ActivityScreen({ onBack, webLayout }: Props) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const network = getActiveNetwork();

  const load = async () => {
    setLoading(true);
    setItems(await getActivities());
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleClear = async () => {
    if (!confirm('Clear all activity history?')) return;
    await clearActivities();
    setItems([]);
  };

  const fs = webLayout
    ? { title: 17, body: 15, meta: 14, sm: 13 }
    : { title: 14, body: 13, meta: 12, sm: 11 };

  const listContent = loading ? (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div className="spinner spinner-dark" style={{ width: 24, height: 24, margin: '0 auto' }} />
    </div>
  ) : items.length === 0 ? (
    <div className="card card-padded" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
      <Icon name="history" size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
      <p style={{ fontSize: webLayout ? 16 : undefined }}>No on-chain activity yet. Wrap, unwrap, send, or claim faucet tokens to see transactions here.</p>
    </div>
  ) : (
    <div className={webLayout ? 'web-activity-list' : ''} style={webLayout ? undefined : { display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} className="card card-padded" style={{ display: 'flex', gap: 12 }}>
          <div className="activity-type-icon">
            <Icon name={TYPE_ICONS[item.type]} size={18} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: fs.title }}>{TYPE_LABELS[item.type]} · {item.tokenSymbol}</span>
              <span
                className="label-caps"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  color: item.status === 'success' ? 'var(--accent-green)' : item.status === 'failed' ? 'var(--error)' : 'var(--text-muted)',
                }}
              >
                <Icon name={STATUS_ICONS[item.status]} size={12} />
                {item.status}
              </span>
            </div>
            {item.amount && <span style={{ fontSize: fs.body }}>Amount: {item.amount}</span>}
            {item.recipient && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: fs.meta, color: 'var(--text-secondary)' }}>
                <Icon name="person" size={12} color="var(--text-muted)" />
                {shortenAddress(item.recipient)}
              </span>
            )}
            {item.message && <span style={{ fontSize: fs.meta, color: 'var(--error)' }}>{item.message}</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: fs.sm, color: 'var(--text-muted)' }}>
                {new Date(item.timestamp).toLocaleString()}
                {item.walletMode === 'external' && item.walletLabel
                  ? ` · ${item.walletLabel}`
                  : item.walletMode === 'embedded'
                    ? ' · Built-in'
                    : ''}
              </span>
              {item.txHash && (
                <a
                  href={`${network.explorer}/tx/${item.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-link"
                  style={{ fontSize: fs.sm, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  View tx
                  <Icon name="open_in_new" size={11} />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={() => void handleClear()} style={webLayout ? { flex: 'none', width: 'auto', maxWidth: 240 } : undefined}>
        <Icon name="delete" size={16} />
        Clear History
      </button>
    </div>
  );

  if (webLayout) {
    return (
      <div className="screen web-page">
        <WebPageHeader
          title="Activity"
          subtitle="Transaction history for wraps, sends, faucet claims, and more."
          onBack={onBack}
          actions={(
            <button type="button" className="icon-btn" onClick={() => void load()} title="Refresh">
              <Icon name="refresh" size={20} />
            </button>
          )}
        />
        <div className="web-page-body">
          <div className="web-page-body-inner">{listContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="top-bar">
        <button className="icon-btn" onClick={onBack} title="Back">
          <Icon name="arrow_back_ios_new" size={22} />
        </button>
        <span className="top-bar-title" style={{ textTransform: 'uppercase', fontSize: 16 }}>Activity</span>
        <button className="icon-btn" onClick={() => void load()} title="Refresh">
          <Icon name="refresh" size={20} />
        </button>
      </div>

      <div className="screen-scroll">
        {listContent}
      </div>
    </div>
  );
}
