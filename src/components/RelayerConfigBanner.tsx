import { shouldShowRelayerSetupBanner } from '../lib/relayerAuth';

export default function RelayerConfigBanner() {
  if (!shouldShowRelayerSetupBanner()) return null;

  return (
    <div
      style={{
        margin: '0 16px 12px',
        padding: '10px 12px',
        borderRadius: 'var(--r-lg)',
        background: 'var(--bg-container-high)',
        border: '1px solid var(--border-strong)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: 'var(--text-primary)' }}>Mainnet relayer not configured.</strong>{' '}
      Set <code>VITE_RELAYER_API_KEY</code> or a mainnet proxy URL in <code>.env</code>, then rebuild.
    </div>
  );
}
