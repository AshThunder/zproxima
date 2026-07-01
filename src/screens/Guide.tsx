import { useState } from 'react';
import WebPageHeader from '../components/WebPageHeader';
import type { WalletSession } from '../lib/walletSession';

interface Props {
  session: WalletSession;
  onBack: () => void;
}

export default function GuideScreen({ session, onBack }: Props) {
  const isWeb = session.surface === 'web';
  const [activeTab, setActiveTab] = useState<'user' | 'developer'>('user');

  return (
    <div className={`screen-container ${isWeb ? 'screen-container-web' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {isWeb ? (
        <WebPageHeader
          title="Guide & Documentation"
          subtitle="Learn how to use the Zama Wrappers Registry and integrate FHE confidential wrappers."
          onBack={onBack}
        />
      ) : (
        <div className="top-bar" style={{ flexShrink: 0 }}>
          <button className="icon-btn" onClick={onBack} title="Back">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <span className="top-bar-brand" style={{ flex: 1, textAlign: 'center', marginRight: 32 }}>Guide & Docs</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '0 16px', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('user')}
          style={{
            flex: 1, padding: '14px 0', background: 'none', border: 'none',
            borderBottom: activeTab === 'user' ? '2.5px solid var(--accent-amber)' : '2.5px solid transparent',
            color: activeTab === 'user' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 15, cursor: 'pointer', textAlign: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          User Guide
        </button>
        <button
          onClick={() => setActiveTab('developer')}
          style={{
            flex: 1, padding: '14px 0', background: 'none', border: 'none',
            borderBottom: activeTab === 'developer' ? '2.5px solid var(--accent-amber)' : '2.5px solid transparent',
            color: activeTab === 'developer' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 15, cursor: 'pointer', textAlign: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          Developer Guide
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="screen-scroll" style={{ flex: 1, padding: isWeb ? 24 : 16, overflowY: 'auto' }}>

        {/* Zama Docs Banner — always at top regardless of tab */}
        <a
          href="https://docs.zama.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="card"
          style={{
            padding: isWeb ? '20px 24px' : '16px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            textDecoration: 'none', marginBottom: 16,
            borderColor: 'var(--accent-amber)',
            background: 'rgba(254, 152, 0, 0.05)',
            transition: 'all 0.2s ease', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 32 }}>menu_book</span>
            <div>
              <h3 style={{ margin: 0, fontSize: isWeb ? 17 : 15, fontWeight: 700, color: 'var(--text-primary)' }}>Official Zama Documentation</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: isWeb ? 14 : 13, color: 'var(--text-muted)' }}>FHEVM protocol, relayer SDK, EIP-712 decryption, and Wrappers Registry reference.</p>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 22 }}>open_in_new</span>
        </a>

        {/* Zproxima Extension Card */}
        <div
          className="card"
          style={{
            padding: isWeb ? '20px 24px' : '16px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: isWeb ? 24 : 16,
            background: 'var(--bg-card)',
            borderLeft: '4px solid var(--accent-amber)',
          }}
        >
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 32 }}>extension</span>
          <div>
            <h3 style={{ margin: 0, fontSize: isWeb ? 17 : 15, fontWeight: 700, color: 'var(--text-primary)' }}>Local Privacy-First Extension</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: isWeb ? 14 : 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Use the wrappers registry directly from your browser's side panel. The extension operates completely client-side to ensure maximum privacy, supporting both a secure local built-in vault and external wallets like MetaMask.
            </p>
          </div>
        </div>

        {activeTab === 'user' ? (
          <div style={{ display: 'grid', gridTemplateColumns: isWeb ? 'repeat(2, 1fr)' : '1fr', gap: isWeb ? 20 : 14 }}>

            {/* What is a Wrapper */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>info</span>
                <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>What is a Confidential Wrapper?</h3>
              </div>
              <p style={{ margin: 0, fontSize: isWeb ? 15 : 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                A wrapper converts standard public ERC-20 tokens (like USDC, WETH) into ERC-7984 confidential equivalents. Once wrapped, your balance and transfers are fully encrypted on-chain using FHE. Only you can view your balance by signing a decryption permit.
              </p>
            </div>

            {/* Decrypt arbitrary tokens */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>visibility</span>
                <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>Decrypt Any ERC-7984 Token</h3>
              </div>
              <p style={{ margin: 0, fontSize: isWeb ? 15 : 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Have a confidential token that isn't in the registry? Navigate to the <strong>Decrypt</strong> tab (or use the key icon on the dashboard), paste any ERC-7984 contract address, and sign the EIP-712 permit to reveal your private balance instantly.
              </p>
            </div>

            {/* Step-by-Step Flow — spans full width on grid */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 14, gridColumn: isWeb ? '1 / -1' : undefined }}>
              <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>Getting Started — Wrap / Unwrap Flow</h3>

              <div style={{ display: 'grid', gridTemplateColumns: isWeb ? 'repeat(2, 1fr)' : '1fr', gap: isWeb ? 16 : 12 }}>
                {([
                  {
                    num: '1',
                    title: 'Claim Test Tokens',
                    desc: 'Navigate to the Faucet tab, select any mock token (e.g. cUSDCMock), and click "Claim Tokens" to receive Sepolia test tokens in your wallet.',
                  },
                  {
                    num: '2',
                    title: 'Wrap to Confidential',
                    desc: 'Open a token card on the Registry, enter an amount, and click "Confirm Wrap". This approves the ERC-20 spend and shields your tokens into their confidential ERC-7984 wrapper.',
                  },
                  {
                    num: '3',
                    title: 'Decrypt Your Balance',
                    desc: 'Private balances are hidden by default. Click the key icon on the token card, confirm the EIP-712 signature in your wallet, and your decrypted balance appears.',
                  },
                  {
                    num: '4',
                    title: 'Unwrap Back to ERC-20',
                    desc: 'Switch to the "Unwrap" tab on the token card to convert your confidential wrappers back into standard public ERC-20 tokens via a two-phase unshield.',
                  },
                ] as const).map((step) => (
                  <div key={step.num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'rgba(254, 152, 0, 0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, color: 'var(--accent-amber)', flexShrink: 0,
                    }}>{step.num}</div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: isWeb ? 15 : 14, fontWeight: 700 }}>{step.title}</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: isWeb ? 14 : 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isWeb ? 'repeat(2, 1fr)' : '1fr', gap: isWeb ? 20 : 14 }}>

            {/* SDK Section */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 10, gridColumn: isWeb ? '1 / -1' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>code</span>
                <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>Integrating the FHEVM Relayer SDK</h3>
              </div>
              <p style={{ margin: 0, fontSize: isWeb ? 15 : 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Proxima uses Zama's official <code style={{ background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em' }}>@zama-fhe/sdk</code> to handle all on-chain encryption, relayer communication, and decryption signature permits.
              </p>
              <div style={{ background: 'var(--bg-app)', padding: isWeb ? 16 : 12, borderRadius: 'var(--r-md)', marginTop: 4, overflowX: 'auto' }}>
                <pre style={{ margin: 0, fontFamily: 'var(--font-data)', fontSize: isWeb ? 13 : 12, color: 'var(--text-primary)', lineHeight: 1.6 }}>
{`// Create a wrapped token instance
import { ZamaSDK } from '@zama-fhe/sdk';

const sdk = await ZamaSDK.create({ provider });
const token = sdk.createWrappedToken(wrapperAddress);

// Shield (Wrap ERC-20 → ERC-7984)
await token.shield(amountWei);

// Unshield (Unwrap ERC-7984 → ERC-20)
await token.unshield(amountWei);

// Decrypt balance (EIP-712 permit)
const balance = await token.balanceOf(ownerAddress);`}
                </pre>
              </div>
            </div>

            {/* Registry Architecture */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>hub</span>
                <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>Registry Architecture</h3>
              </div>
              <p style={{ margin: 0, fontSize: isWeb ? 15 : 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Wrapper pairs are resolved dynamically via a three-layer hybrid merge:
              </p>
              <ol style={{ margin: '6px 0 0 0', paddingLeft: 22, fontSize: isWeb ? 14 : 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.55 }}>
                <li><strong>Static fallbacks</strong> — hardcoded official pairs for instant UI rendering.</li>
                <li><strong>On-chain registry</strong> — fetched from the canonical <code style={{ background: 'var(--bg-app)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>WrappersRegistry</code> contract.</li>
                <li><strong>Local config + browser storage</strong> — custom developer pairs from <code style={{ background: 'var(--bg-app)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>src/config/localConfig.ts</code> and the in-app UI.</li>
              </ol>
            </div>

            {/* Adding New Pairs */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>add_circle</span>
                <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>Adding New Wrapper Pairs</h3>
              </div>
              <p style={{ margin: 0, fontSize: isWeb ? 15 : 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Register a new ERC-20 ↔ ERC-7984 pair using either method:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div style={{ padding: isWeb ? 14 : 10, background: 'var(--bg-app)', borderRadius: 'var(--r-md)', fontSize: isWeb ? 14 : 13, lineHeight: 1.5 }}>
                  <strong>In-App UI:</strong> Click the <strong>+</strong> icon on the Registry dashboard and fill in the underlying and wrapper contract addresses.
                </div>
                <div style={{ padding: isWeb ? 14 : 10, background: 'var(--bg-app)', borderRadius: 'var(--r-md)', fontSize: isWeb ? 14 : 13, lineHeight: 1.5 }}>
                  <strong>Code Config:</strong> Edit <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>src/config/localConfig.ts</code> and add a pair object to the target network array. Rebuild to deploy.
                </div>
              </div>
            </div>

            {/* Error Handling */}
            <div className="card" style={{ padding: isWeb ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 10, gridColumn: isWeb ? '1 / -1' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>shield</span>
                <h3 style={{ margin: 0, fontSize: isWeb ? 18 : 16, fontWeight: 700 }}>Error Handling & Edge Cases</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isWeb ? 'repeat(3, 1fr)' : '1fr', gap: isWeb ? 14 : 10 }}>
                {([
                  { icon: 'account_balance_wallet', title: 'Insufficient Balance', desc: 'Pre-checked client-side before submitting any on-chain transaction.' },
                  { icon: 'swap_horiz', title: 'Network Mismatch', desc: 'Automatically prompts the user to switch to Sepolia when required.' },
                  { icon: 'verified_user', title: 'Missing Approval', desc: 'ERC-20 allowance is checked and requested before the wrap call.' },
                ] as const).map((item) => (
                  <div key={item.title} style={{ padding: isWeb ? 14 : 10, background: 'var(--bg-app)', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>{item.icon}</span>
                      <strong style={{ fontSize: isWeb ? 14 : 13 }}>{item.title}</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: isWeb ? 13 : 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
