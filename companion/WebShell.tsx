import type { AppScreen } from '@shared/types';
import type { WalletSession } from '@shared/walletSession';
import { APP_NAME } from '@shared/brand';
import WebWalletButton from './WebWalletButton';

const NAV: { id: AppScreen; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'account_balance_wallet', label: 'Registry' },
  { id: 'registry-details', icon: 'list_alt', label: 'Registry Details' },
  { id: 'register-token', icon: 'add_circle', label: 'Deploy Wrapper' },
  { id: 'receive', icon: 'call_received', label: 'Receive' },
  { id: 'send', icon: 'send', label: 'Send' },
  { id: 'wrap', icon: 'swap_vert', label: 'Wrap / Unwrap' },
  { id: 'faucet', icon: 'water_drop', label: 'Faucet' },
  { id: 'decrypt', icon: 'key', label: 'Decrypt' },
];

interface Props {
  session: WalletSession;
  screen: AppScreen;
  activeNav: AppScreen;
  bridgeStatus: string;
  showNav: boolean;
  onNavigate: (target: AppScreen) => void;
  onDisconnect: () => void;
  disconnectBusy?: boolean;
  children: React.ReactNode;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WebShell({
  session,
  screen,
  activeNav,
  bridgeStatus,
  showNav,
  onNavigate,
  onDisconnect,
  disconnectBusy = false,
  children,
}: Props) {
  return (
    <div className="web-shell">
      {bridgeStatus && (
        <div className="web-bridge-status">{bridgeStatus}</div>
      )}

      <header className="web-shell-header">
        <span className="web-shell-header-brand">{APP_NAME}</span>
        <WebWalletButton
          connected
          address={session.address}
          walletLabel={session.walletLabel ?? 'Wallet'}
          busy={disconnectBusy}
          onDisconnect={onDisconnect}
        />
      </header>

      <div className="web-body">
        <aside className="web-sidebar">
          <div className="web-sidebar-brand">{APP_NAME}</div>
          <nav className="web-sidebar-nav">
            {NAV.map(({ id, icon, label }) => (
              <button
                key={id}
                type="button"
                className={`web-sidebar-link ${activeNav === id ? 'active' : ''}`}
                onClick={() => onNavigate(id)}
              >
                <span className="material-symbols-outlined" style={{
                  fontVariationSettings: activeNav === id ? "'FILL' 1" : "'FILL' 0",
                }}>
                  {icon}
                </span>
                {label}
              </button>
            ))}
            <button
              type="button"
              className={`web-sidebar-link ${screen === 'activity' ? 'active' : ''}`}
              onClick={() => onNavigate('activity')}
            >
              <span className="material-symbols-outlined">history</span>
              Activity
            </button>
            <button
              type="button"
              className={`web-sidebar-link ${screen === 'settings' ? 'active' : ''}`}
              onClick={() => onNavigate('settings')}
            >
              <span className="material-symbols-outlined">settings</span>
              Settings
            </button>
            <button
              type="button"
              className={`web-sidebar-link ${screen === 'guide' ? 'active' : ''}`}
              onClick={() => onNavigate('guide')}
            >
              <span className="material-symbols-outlined">menu_book</span>
              Guide & Docs
            </button>
          </nav>
          <div className="web-sidebar-footer">
            <div className="web-wallet-chip">
              {session.walletLabel ?? 'Wallet'} · {shortenAddress(session.address)}
            </div>
          </div>
        </aside>

        <main className="web-main">
          {children}
        </main>
      </div>

      {showNav && (
        <div className="bottom-nav">
          <div className="bottom-nav-pill">
            {NAV.map(({ id, icon, label }) => (
              <button
                key={id}
                className={`nav-item ${activeNav === id ? 'active' : ''}`}
                onClick={() => onNavigate(id)}
                title={label}
              >
                <span className="material-symbols-outlined" style={{
                  fontVariationSettings: activeNav === id ? "'FILL' 1" : "'FILL' 0",
                }}>
                  {icon}
                </span>
              </button>
            ))}
            <button
              className={`nav-item ${screen === 'settings' ? 'active' : ''}`}
              onClick={() => onNavigate('settings')}
              title="Settings"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
