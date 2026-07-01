import WebPageHeader from '../components/WebPageHeader';
import type { WalletSession } from '../lib/walletSession';
import type { TokenPair } from '../lib/zama';
import { getActiveNetwork, NETWORKS } from '../lib/wallet';
import { getTokenTicker, getTokenDisplayName } from '../lib/tokenDisplay';

interface Props {
  session: WalletSession;
  token: TokenPair;
  onBack: () => void;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function TokenDetails({ session, token, onBack }: Props) {
  const isWeb = session.surface === 'web';
  const network = getActiveNetwork();
  const explorer = NETWORKS[network.id]?.explorer ?? 'https://sepolia.etherscan.io';
  const ticker = getTokenTicker(token.symbol);
  const displayName = getTokenDisplayName(token.name);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
  };

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: isWeb ? '16px 20px' : '12px 14px',
    background: 'var(--bg-app)',
    borderRadius: 'var(--r-md)',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-data)',
    fontSize: isWeb ? 11 : 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-data)',
    fontSize: isWeb ? 14 : 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
    lineHeight: 1.4,
  };

  const addressRow = (label: string, address: string) => (
    <div style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={valueStyle}>
          {isWeb ? address : shortenAddress(address)}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            className="icon-btn"
            onClick={() => void handleCopy(address)}
            title="Copy address"
            style={{ width: 28, height: 28 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>
          </button>
          <a
            href={`${explorer}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            title="View on Explorer"
            style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`screen-container ${isWeb ? 'screen-container-web' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {isWeb ? (
        <WebPageHeader
          title="Token Details"
          subtitle={`${token.name} (${token.symbol})`}
          onBack={onBack}
        />
      ) : (
        <div className="top-bar" style={{ flexShrink: 0 }}>
          <button className="icon-btn" onClick={onBack} title="Back">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <span className="top-bar-brand" style={{ flex: 1, textAlign: 'center', marginRight: 32 }}>Token Details</span>
        </div>
      )}

      <div className="screen-scroll" style={{ flex: 1, padding: isWeb ? 24 : 16, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isWeb ? 'repeat(2, 1fr)' : '1fr', gap: isWeb ? 20 : 14, maxWidth: isWeb ? 800 : undefined }}>

          {/* Hero Identity Card */}
          <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 16, gridColumn: isWeb ? '1 / -1' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="asset-icon" style={{ width: isWeb ? 52 : 44, height: isWeb ? 52 : 44, fontSize: isWeb ? 22 : 18 }}>
                {ticker[0]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: isWeb ? 22 : 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {displayName}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="label-caps" style={{ fontSize: isWeb ? 12 : 10 }}>{ticker}</span>
                  {token.isCustom && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--accent-amber)',
                      background: 'rgba(254, 152, 0, 0.1)', padding: '2px 8px',
                      borderRadius: 'var(--r-sm)', letterSpacing: '0.04em',
                    }}>CUSTOM</span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    background: 'var(--bg-app)', padding: '2px 8px',
                    borderRadius: 'var(--r-sm)', letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>{network.name}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Confidential Wrapper */}
          <div className="card" style={{ padding: isWeb ? 20 : 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 20 }}>lock</span>
              <h3 style={{ margin: 0, fontSize: isWeb ? 16 : 14, fontWeight: 700 }}>Confidential Wrapper (ERC-7984)</h3>
            </div>
            {addressRow('Contract Address', token.confidentialAddress)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={fieldStyle}>
                <span style={labelStyle}>Symbol</span>
                <span style={valueStyle}>{token.symbol}</span>
              </div>
              <div style={fieldStyle}>
                <span style={labelStyle}>Decimals</span>
                <span style={valueStyle}>{token.decimals}</span>
              </div>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Full Name</span>
              <span style={valueStyle}>{token.name}</span>
            </div>
          </div>

          {/* Underlying ERC-20 */}
          <div className="card" style={{ padding: isWeb ? 20 : 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)', fontSize: 20 }}>account_balance_wallet</span>
              <h3 style={{ margin: 0, fontSize: isWeb ? 16 : 14, fontWeight: 700 }}>Underlying Token (ERC-20)</h3>
            </div>
            {addressRow('Contract Address', token.underlyingAddress)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={fieldStyle}>
                <span style={labelStyle}>Ticker</span>
                <span style={valueStyle}>{ticker}</span>
              </div>
              <div style={fieldStyle}>
                <span style={labelStyle}>Decimals</span>
                <span style={valueStyle}>{token.decimals}</span>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="card" style={{ padding: isWeb ? 20 : 16, display: 'flex', flexDirection: 'column', gap: 12, gridColumn: isWeb ? '1 / -1' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 20 }}>info</span>
              <h3 style={{ margin: 0, fontSize: isWeb ? 16 : 14, fontWeight: 700 }}>Technical Information</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isWeb ? 'repeat(3, 1fr)' : '1fr', gap: 8 }}>
              <div style={fieldStyle}>
                <span style={labelStyle}>Standard</span>
                <span style={valueStyle}>ERC-7984 (fhERC-20)</span>
              </div>
              <div style={fieldStyle}>
                <span style={labelStyle}>Encryption</span>
                <span style={valueStyle}>Zama FHEVM</span>
              </div>
              <div style={fieldStyle}>
                <span style={labelStyle}>Decryption</span>
                <span style={valueStyle}>EIP-712 Permit</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isWeb ? '1fr 1fr' : '1fr', gap: 8 }}>
              <a
                href={`${explorer}/address/${token.confidentialAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                View Wrapper on Explorer
              </a>
              <a
                href={`${explorer}/address/${token.underlyingAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                View Underlying on Explorer
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
