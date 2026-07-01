import { useState, useEffect, useMemo } from 'react';
import WebPageHeader from '../components/WebPageHeader';
import { fetchRegistryPairs, type TokenPair } from '../lib/zama';
import { getActiveNetwork, NETWORKS } from '../lib/wallet';
import { getTokenTicker, getTokenDisplayName } from '../lib/tokenDisplay';
import type { WalletSession } from '../lib/walletSession';

interface Props {
  session: WalletSession;
  onBack: () => void;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

export default function RegistryDetails({ session, onBack }: Props) {
  const isWeb = session.surface === 'web';
  const network = getActiveNetwork();
  const explorer = NETWORKS[network.id]?.explorer ?? 'https://sepolia.etherscan.io';

  const [pairs, setPairs] = useState<TokenPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'official' | 'custom'>('all');
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void fetchRegistryPairs(session.privateKey, session.ethereum).then((list) => {
      setPairs(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [session.privateKey, session.ethereum]);

  const handleCopy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedAddr(addr);
      setTimeout(() => setCopiedAddr(null), 1500);
    } catch { /* fallback */ }
  };

  const filteredPairs = useMemo(() => {
    return pairs.filter(p => {
      if (activeTab === 'official' && p.isCustom) return false;
      if (activeTab === 'custom' && !p.isCustom) return false;

      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const ticker = getTokenTicker(p.symbol).toLowerCase();
      const name = getTokenDisplayName(p.name).toLowerCase();
      const sym = p.symbol.toLowerCase();
      const rawName = p.name.toLowerCase();
      const conf = p.confidentialAddress.toLowerCase();
      const under = p.underlyingAddress.toLowerCase();

      return ticker.includes(query) ||
             name.includes(query) ||
             sym.includes(query) ||
             rawName.includes(query) ||
             conf.includes(query) ||
             under.includes(query);
    });
  }, [pairs, activeTab, searchQuery]);

  const officialCount = useMemo(() => pairs.filter(p => !p.isCustom).length, [pairs]);
  const customCount = useMemo(() => pairs.filter(p => p.isCustom).length, [pairs]);

  return (
    <div className={`screen-container ${isWeb ? 'screen-container-web' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {isWeb ? (
        <WebPageHeader
          title="Registry Details"
          subtitle={`Inspect all ERC-20 ↔ ERC-7984 wrapper pairs configured on ${network.name}.`}
          onBack={onBack}
        />
      ) : (
        <div className="top-bar" style={{ flexShrink: 0 }}>
          <button className="icon-btn" onClick={onBack} title="Back">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <span className="top-bar-brand" style={{ flex: 1, textAlign: 'center', marginRight: 32 }}>Registry Details</span>
        </div>
      )}

      {/* Main Content Scroll container */}
      <div className="screen-scroll" style={{ flex: 1, padding: isWeb ? 32 : 16, overflowY: 'auto' }}>
        
        {/* Controls Card: Search + Tabs */}
        <div className="card" style={{
          padding: isWeb ? 24 : 16,
          marginBottom: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.04)',
        }}>
          
          {/* Taller Search Input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{
              position: 'absolute', left: 16, color: 'var(--text-muted)', fontSize: 24, pointerEvents: 'none'
            }}>search</span>
            <input
              type="text"
              placeholder="Search by symbol, name, or contract address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '16px 16px 16px 52px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-app)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: 16,
                fontWeight: 500,
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent-amber)';
                e.target.style.boxShadow = '0 0 0 3px rgba(254, 152, 0, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-strong)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: 16, background: 'none', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            )}
          </div>

          {/* Tab Filter buttons with larger text */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div className="tab-buttons" style={{ display: 'flex', gap: 8, background: 'var(--bg-app)', padding: 6, borderRadius: 'var(--r-md)' }}>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'all' ? 'var(--bg-card)' : 'transparent',
                  color: activeTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'all' ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                All Pairs ({pairs.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'official' ? 'active' : ''}`}
                onClick={() => setActiveTab('official')}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'official' ? 'var(--bg-card)' : 'transparent',
                  color: activeTab === 'official' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'official' ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                Official ({officialCount})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                onClick={() => setActiveTab('custom')}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'custom' ? 'var(--bg-card)' : 'transparent',
                  color: activeTab === 'custom' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'custom' ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                Custom ({customCount})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent-amber)' }}>hub</span>
              <span>Sepolia Wrappers Registry</span>
            </div>
          </div>

        </div>

        {/* Results grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div className="spinner spinner-dark" style={{ width: 32, height: 32, margin: '0 auto' }} />
          </div>
        ) : filteredPairs.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-muted)', marginBottom: 16, display: 'block' }}>search_off</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>No matching wrapper pairs found.</span>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isWeb ? 'repeat(2, 1fr)' : '1fr',
            gap: isWeb ? 24 : 16
          }}>
            {filteredPairs.map((p) => {
              const ticker = getTokenTicker(p.symbol);
              const displayName = getTokenDisplayName(p.name);

              return (
                <div
                  key={p.confidentialAddress}
                  className="card"
                  style={{
                    padding: isWeb ? 24 : 18,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 20,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-strong)',
                    borderLeft: p.isCustom ? '6px solid var(--accent-amber)' : '6px solid var(--text-muted)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.02)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08)';
                    e.currentTarget.style.borderColor = 'var(--accent-amber)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.02)';
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                  }}
                >
                  
                  {/* Card Header details */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div className="asset-icon" style={{
                          width: 52, height: 52, fontSize: 20, fontWeight: 700,
                          background: p.isCustom ? 'rgba(254, 152, 0, 0.1)' : 'var(--bg-container-low)',
                          color: p.isCustom ? 'var(--accent-amber)' : 'var(--text-primary)',
                        }}>
                          {ticker[0]}
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                            {displayName}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            <span className="label-caps" style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>{ticker}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>• Decimals: {p.decimals}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Bolder Badge */}
                      {p.isCustom ? (
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: 'var(--accent-amber)',
                          background: 'rgba(254, 152, 0, 0.1)', padding: '5px 12px',
                          borderRadius: 'var(--r-sm)', letterSpacing: '0.06em',
                        }}>CUSTOM PAIR</span>
                      ) : (
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
                          background: 'var(--bg-app)', padding: '5px 12px',
                          borderRadius: 'var(--r-sm)', letterSpacing: '0.06em',
                        }}>OFFICIAL</span>
                      )}
                    </div>

                    {/* Address sections */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      
                      {/* Confidential Wrapper address */}
                      <div style={{
                        padding: '12px 16px',
                        background: 'var(--bg-app)',
                        borderRadius: 'var(--r-md)',
                        border: '1px solid var(--border-strong)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent-amber)' }}>lock</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-amber)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              Confidential Wrapper (ERC-7984)
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)', fontWeight: 700 }}>{p.symbol}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            wordBreak: 'break-all',
                            letterSpacing: '0.02em',
                          }}>
                            {isWeb ? p.confidentialAddress : shortenAddr(p.confidentialAddress)}
                          </span>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => void handleCopy(p.confidentialAddress)}
                              title="Copy Address"
                              style={{ width: 28, height: 28, background: 'var(--bg-card)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                                {copiedAddr === p.confidentialAddress ? 'check' : 'content_copy'}
                              </span>
                            </button>
                            <a
                              href={`${explorer}/address/${p.confidentialAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="icon-btn"
                              title="View on Explorer"
                              style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Underlying address */}
                      <div style={{
                        padding: '12px 16px',
                        background: 'var(--bg-app)',
                        borderRadius: 'var(--r-md)',
                        border: '1px solid var(--border-strong)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-secondary)' }}>account_balance_wallet</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              Underlying Asset (ERC-20)
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-data)', fontWeight: 700 }}>{ticker}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            wordBreak: 'break-all',
                            letterSpacing: '0.02em',
                          }}>
                            {isWeb ? p.underlyingAddress : shortenAddr(p.underlyingAddress)}
                          </span>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => void handleCopy(p.underlyingAddress)}
                              title="Copy Address"
                              style={{ width: 28, height: 28, background: 'var(--bg-card)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                                {copiedAddr === p.underlyingAddress ? 'check' : 'content_copy'}
                              </span>
                            </button>
                            <a
                              href={`${explorer}/address/${p.underlyingAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="icon-btn"
                              title="View on Explorer"
                              style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                            </a>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Verify Contract CTA Button */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <a
                      href={`${explorer}/address/${p.confidentialAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                      style={{
                        textDecoration: 'none', flex: 1, display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '10px 16px',
                        background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-app)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified_user</span>
                      Verify on Block Explorer
                    </a>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
