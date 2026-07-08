import ErrorBanner from '@components/ErrorBanner';
import WebWalletButton from './WebWalletButton';
import HeroRegistryIllustration from './HeroRegistryIllustration';
import { APP_NAME, APP_LOGO_MARK, APP_TAGLINE } from '@shared/brand';

const FEATURES = [
  {
    icon: 'shield',
    title: 'Shield tokens',
    desc: 'Wrap public ERC-20 balances into confidential wrappers on Sepolia.',
  },
  {
    icon: 'lock',
    title: 'Private balances',
    desc: 'Decrypt only when you need to — balances stay hidden by default.',
  },
  {
    icon: 'send',
    title: 'Confidential send',
    desc: 'Transfer encrypted amounts without exposing values on-chain.',
  },
] as const;

interface Props {
  bridgeMode: boolean;
  action: string;
  wrongNetwork: boolean;
  sepoliaChainId: number;
  status: string;
  error: string;
  busy: boolean;
  booting: boolean;
  bridgeActionDone?: boolean;
  hasEthereum: boolean;
  onDismissError: () => void;
  onConnect: () => void;
  onOpenWebApp?: () => void;
  onSwitchNetwork: () => void;
}

function actionLabel(action: string): string | null {
  switch (action) {
    case 'wrap': return 'Wrap tokens';
    case 'unwrap': return 'Unwrap tokens';
    case 'send': return 'Send confidentially';
    case 'decrypt': return 'Decrypt private balance';
    case 'faucet': return 'Claim faucet tokens';
    default: return null;
  }
}

export default function ConnectLanding({
  bridgeMode,
  action,
  wrongNetwork,
  sepoliaChainId,
  status,
  error,
  busy,
  booting,
  bridgeActionDone = false,
  hasEthereum,
  onDismissError,
  onConnect,
  onOpenWebApp,
  onSwitchNetwork,
}: Props) {
  const pendingAction = bridgeMode && action !== 'connect' && action !== 'bot'
    ? actionLabel(action)
    : null;

  return (
    <div className="web-connect-landing">
      <div className="web-connect-landing-bg" aria-hidden>
        <div className="web-connect-landing-grid" />
        <div className="web-connect-landing-orb web-connect-landing-orb-a" />
        <div className="web-connect-landing-orb web-connect-landing-orb-b" />
      </div>

      <header className="web-connect-landing-header">
        <div className="web-connect-landing-brand">
          <span className="web-connect-landing-mark" aria-hidden>{APP_LOGO_MARK}</span>
          <span className="web-connect-landing-logo">{APP_NAME}</span>
        </div>
        <WebWalletButton
          connected={false}
          busy={busy || booting}
          onConnect={onConnect}
        />
      </header>

      <main className="web-connect-landing-main">
        <section className="web-connect-landing-hero">
          <div className="web-connect-landing-copy">
            <span className="label-caps web-connect-landing-eyebrow">Confidential registry</span>
            <h1 className="web-connect-landing-title">
              Always by your side,
              <span> one click away.</span>
            </h1>
            <p className="web-connect-landing-lead">
              {APP_TAGLINE} Wrap, send, and decrypt confidential tokens on Sepolia with your browser wallet.
            </p>

            <ul className="web-connect-feature-list">
              {FEATURES.map(({ icon, title, desc }) => (
                <li key={title} className="web-connect-feature-item">
                  <span className="web-connect-feature-icon" aria-hidden>
                    <span className="material-symbols-outlined">{icon}</span>
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="web-connect-trust-row">
              <span className="web-connect-trust-pill">
                <span className="material-symbols-outlined" aria-hidden>hub</span>
                Sepolia testnet
              </span>
              <span className="web-connect-trust-pill">
                <span className="material-symbols-outlined" aria-hidden>account_balance_wallet</span>
                Browser wallet
              </span>
              {bridgeMode && (
                <span className="web-connect-trust-pill web-connect-trust-pill-accent">
                  <span className="material-symbols-outlined" aria-hidden>extension</span>
                  Extension linked
                </span>
              )}
            </div>
          </div>

          <div className="web-connect-landing-visual">
            <HeroRegistryIllustration />
          </div>
        </section>

        <aside className="web-connect-panel" aria-label="Connect wallet">
          <div className="web-connect-panel-inner">
            <div className="web-connect-panel-header">
              <span className="material-symbols-outlined web-connect-panel-icon" aria-hidden>
                account_balance_wallet
              </span>
              <div>
                <h2 className="web-connect-panel-title">Connect wallet</h2>
                <p className="web-connect-panel-subtitle">
                  Authorize your wallet on Sepolia to open your registry.
                </p>
              </div>
            </div>

            {bridgeMode && (
              <div className="web-connect-panel-note">
                <span className="material-symbols-outlined" aria-hidden>sync</span>
                <p>Linked to the {APP_NAME} extension. Activity syncs to the side panel after you connect.</p>
              </div>
            )}

            {pendingAction && (
              <div className="web-connect-panel-pending">
                <span className="label-caps">Pending action</span>
                <strong>{pendingAction}</strong>
              </div>
            )}

            {wrongNetwork && (
              <div className="web-connect-panel-alert">
                <strong>Wrong network</strong>
                <p>{APP_NAME} uses Ethereum Sepolia (chain {sepoliaChainId}). Switch your wallet before continuing.</p>
                <button type="button" className="btn-primary web-connect-panel-cta" disabled={busy} onClick={onSwitchNetwork}>
                  Switch to Sepolia
                </button>
              </div>
            )}

            {status && (
              <div className="web-connect-panel-status">{status}</div>
            )}

            {bridgeActionDone && (
              <div className="web-connect-panel-success">
                <span className="material-symbols-outlined" aria-hidden>check_circle</span>
                <div>
                  <strong>Action complete</strong>
                  <p>Return to the {APP_NAME} extension side panel to see your updated balances.</p>
                </div>
              </div>
            )}

            {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

            {bridgeActionDone && onOpenWebApp ? (
              <button
                type="button"
                className="btn-secondary web-connect-panel-cta web-connect-panel-cta-main"
                onClick={onOpenWebApp}
              >
                Open web dashboard
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary web-connect-panel-cta web-connect-panel-cta-main"
                disabled={busy || booting}
                onClick={onConnect}
              >
                <span className="material-symbols-outlined" aria-hidden>account_balance_wallet</span>
                {booting ? 'Checking wallet…' : busy ? 'Connecting…' : 'Connect wallet'}
              </button>
            )}

            {!bridgeActionDone && (
              <>
                {!hasEthereum && (
                  <p className="web-connect-panel-footnote">
                    Install a browser wallet extension, then reload this page.
                  </p>
                )}

                <p className="web-connect-panel-footnote web-connect-panel-footnote-muted">
                  Keys stay in your wallet. {APP_NAME} never stores your seed phrase.
                </p>
              </>
            )}
          </div>

          {/* OR divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '20px 0',
            gap: 12
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-strong)' }} />
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-strong)' }} />
          </div>

          {/* Identical card style for extension */}
          <div className="web-connect-panel-inner">
            <div className="web-connect-panel-header">
              <span className="material-symbols-outlined web-connect-panel-icon" aria-hidden style={{ background: 'rgba(254, 152, 0, 0.1)', color: 'var(--accent-amber)' }}>
                extension
              </span>
              <div>
                <h2 className="web-connect-panel-title">Use Zproxima Extension</h2>
                <p className="web-connect-panel-subtitle">
                  Access the registry securely via our privacy-first browser extension.
                </p>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              The extension supports both a secure built-in vault or external wallets like MetaMask, etc.
            </p>

            <a
              href="https://chromewebstore.google.com/detail/zproxima/clfdehbcopecdjfomjdngopogmdhodcc"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary web-connect-panel-cta web-connect-panel-cta-main"
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
              Get Chrome Extension
            </a>
          </div>
        </aside>
      </main>
    </div>
  );
}
