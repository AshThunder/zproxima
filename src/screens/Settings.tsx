import { useState, useEffect } from 'react';
import {
  resetVault,
  changePassword,
  cacheSession,
  setActiveAccountIndex,
  type VaultData,
} from '../lib/vault';
import { shortenAddress, deriveVaultAccount, getActiveNetwork } from '../lib/wallet';
import { getAutoLockMinutes, setAutoLockMinutes } from '../lib/autoLock';
import { relayerStatusLabel } from '../lib/relayerAuth';
import { getWalletMode, walletModeLabel, type WalletMode } from '../lib/walletMode';
import { disconnectExternalBridge } from '../lib/externalBridge';
import type { WalletSession } from '../lib/walletSession';
import { STORAGE_KEYS } from '../lib/storageKeys';
import ErrorBanner from '../components/ErrorBanner';
import { APP_NAME } from '../lib/brand';

interface Props {
  session: WalletSession;
  vaultData: VaultData | null;
  onBack: () => void;
  onLock: () => void;
  onReset: () => void;
  onSwitchAccount: (data: VaultData) => void;
  onNavigateActivity: () => void;
  onModeChange: (mode: WalletMode) => void | Promise<void>;
  onConnectExternal: () => void;
}

export default function SettingsScreen({
  session,
  vaultData,
  onBack,
  onLock,
  onReset,
  onSwitchAccount,
  onNavigateActivity,
  onModeChange,
  onConnectExternal,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [autoLockMin, setAutoLockMin] = useState(15);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [walletMode, setWalletModeState] = useState<WalletMode>(session.mode);

  useEffect(() => {
    setPrivacyMode(localStorage.getItem(STORAGE_KEYS.privacyMode) === 'true');
    void getAutoLockMinutes().then(setAutoLockMin);
    void getWalletMode().then(setWalletModeState);
  }, [session.mode]);

  const handleTogglePrivacy = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setPrivacyMode(val);
    localStorage.setItem(STORAGE_KEYS.privacyMode, val ? 'true' : 'false');
  };

  const handleAutoLockChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value);
    setAutoLockMin(val);
    await setAutoLockMinutes(val);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(session.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await changePassword(currentPw, newPw);
      setPwSuccess('Password updated successfully.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setShowPasswordForm(false);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSwitchAccount = async (index: number) => {
    if (!vaultData) return;
    const acc = deriveVaultAccount(vaultData.mnemonic, index);
    await setActiveAccountIndex(index);
    const updated: VaultData = {
      ...vaultData,
      activeAccountIndex: index,
      privateKey: acc.privateKey,
    };
    await cacheSession(updated);
    onSwitchAccount(updated);
  };

  const handleReset = async () => {
    if (confirm('Reset wallet? All keys will be permanently deleted.')) {
      await resetVault();
      onReset();
    }
  };

  const accountIndices = [0, 1, 2, 3, 4];
  const activeIndex = vaultData?.activeAccountIndex ?? 0;

  const handleModeSelect = async (mode: WalletMode) => {
    if (mode === walletMode) return;
    setWalletModeState(mode);
    await onModeChange(mode);
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="top-bar">
        <button className="icon-btn" onClick={onBack} title="Back">
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back_ios_new</span>
        </button>
        <span className="top-bar-title" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 16 }}>Settings</span>
        <div style={{ width: 36 }} />
      </div>

      <div className="screen-scroll settings-scroll">
        <section className="settings-block">
          <h2 className="settings-section-title">Wallet mode</h2>
          <div className="settings-group settings-mode-list">
            <button
              type="button"
              className={`settings-row settings-mode-row${walletMode === 'embedded' ? ' settings-row-active' : ''}`}
              onClick={() => void handleModeSelect('embedded')}
            >
              <span className="material-symbols-outlined settings-mode-row-icon">shield</span>
              <div className="settings-row-copy">
                <span className="settings-row-title">Built-in wallet</span>
                <span className="settings-row-sub">Keys stay in {APP_NAME}</span>
              </div>
              {walletMode === 'embedded' && <span className="settings-mode-badge">Active</span>}
            </button>
            <button
              type="button"
              className={`settings-row settings-mode-row${walletMode === 'external' ? ' settings-row-active' : ''}`}
              onClick={() => void handleModeSelect('external')}
            >
              <span className="material-symbols-outlined settings-mode-row-icon">account_balance_wallet</span>
              <div className="settings-row-copy">
                <span className="settings-row-title">External wallet</span>
                <span className="settings-row-sub">Browser wallet in a companion tab</span>
              </div>
              {walletMode === 'external' && <span className="settings-mode-badge">Active</span>}
            </button>
            {walletMode === 'external' && (
              <>
                <button type="button" className="settings-row" onClick={onConnectExternal}>
                  <div className="settings-row-copy">
                    <span className="settings-row-title">Connect in browser</span>
                    <span className="settings-row-sub">Open companion tab to link your wallet</span>
                  </div>
                  <span className="material-symbols-outlined settings-row-chevron">open_in_new</span>
                </button>
                <button
                  type="button"
                  className="settings-row"
                  onClick={() => void disconnectExternalBridge().then(onConnectExternal)}
                >
                  <div className="settings-row-copy">
                    <span className="settings-row-title">Disconnect</span>
                    <span className="settings-row-sub">Unlink browser wallet from extension</span>
                  </div>
                  <span className="material-symbols-outlined settings-row-chevron">link_off</span>
                </button>
              </>
            )}
          </div>
          <p className="settings-footnote">
            Using {walletModeLabel(walletMode)}. Activity from both modes appears in History.
          </p>
        </section>

        <section className="settings-block">
          <h2 className="settings-section-title">Profile</h2>
          <div className="settings-group">
            <div className="settings-row settings-row-static">
              <div className="settings-row-copy">
                <span className="settings-row-sub">Connected address</span>
                <span className="settings-row-mono">{shortenAddress(session.address)}</span>
              </div>
              <button className="icon-btn" onClick={handleCopy} title="Copy address" type="button">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{copied ? 'check_circle' : 'content_copy'}</span>
              </button>
            </div>
          </div>
        </section>

        {walletMode === 'embedded' && vaultData && (
        <section className="settings-block">
          <h2 className="settings-section-title">Accounts (HD)</h2>
          <div className="settings-group">
            {accountIndices.map((index) => {
              const acc = deriveVaultAccount(vaultData.mnemonic, index);
              const isActive = index === activeIndex;
              return (
                <button
                  key={index}
                  type="button"
                  className={`settings-row${isActive ? ' settings-row-active' : ''}`}
                  onClick={() => void handleSwitchAccount(index)}
                >
                  <div className="settings-row-copy">
                    <span className="settings-row-title">Account {index + 1}</span>
                    <span className="settings-row-mono">{shortenAddress(acc.address)}</span>
                  </div>
                  {isActive && <span className="settings-mode-badge">Active</span>}
                </button>
              );
            })}
          </div>
        </section>
        )}

        <section className="settings-block">
          <h2 className="settings-section-title">Preferences</h2>
          <div className="settings-group">
            <div className="settings-row settings-row-static">
              <div className="settings-row-copy">
                <span className="settings-row-title">Privacy mode</span>
                <span className="settings-row-sub">Hide balances on registry</span>
              </div>
              <label className="switch">
                <input type="checkbox" checked={privacyMode} onChange={handleTogglePrivacy} />
                <span className="slider" />
              </label>
            </div>
            <div className="settings-row settings-row-static">
              <div className="settings-row-copy">
                <span className="settings-row-title">Auto-lock</span>
                <span className="settings-row-sub">Lock after inactivity</span>
              </div>
              <select className="settings-select" value={autoLockMin} onChange={(e) => void handleAutoLockChange(e)}>
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
          </div>
        </section>

        {walletMode === 'embedded' && vaultData && (
        <section className="settings-block">
          <h2 className="settings-section-title">Security</h2>
          <div className="settings-group">
            <button type="button" className="settings-row" onClick={onLock}>
              <span className="settings-row-title">Lock wallet</span>
              <span className="material-symbols-outlined settings-row-chevron">lock</span>
            </button>
            <button type="button" className="settings-row" onClick={() => setShowPasswordForm(v => !v)}>
              <span className="settings-row-title">Change password</span>
              <span className="material-symbols-outlined settings-row-chevron">chevron_right</span>
            </button>
            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="settings-inline-form">
                <input type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                <input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} />
                <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                {pwError && <ErrorBanner message={pwError} />}
                {pwSuccess && <p className="settings-success">{pwSuccess}</p>}
                <button type="submit" className="btn-primary" disabled={pwLoading}>
                  {pwLoading ? <div className="spinner" /> : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </section>
        )}

        <section className="settings-block">
          <h2 className="settings-section-title">Support</h2>
          <div className="settings-group">
            <button type="button" className="settings-row" onClick={onNavigateActivity}>
              <span className="settings-row-title">Activity history</span>
              <span className="material-symbols-outlined settings-row-chevron">chevron_right</span>
            </button>
            <a href="https://docs.zama.org/protocol/sdk/getting-started/quick-start" target="_blank" rel="noreferrer" className="settings-row settings-row-link">
              <span className="settings-row-title">Zama SDK docs</span>
              <span className="material-symbols-outlined settings-row-chevron">open_in_new</span>
            </a>
            <div className="settings-row settings-row-static">
              <span className="settings-row-title">Relayer</span>
              <span className={`settings-row-pill${getActiveNetwork().id === 'sepolia' || relayerStatusLabel() !== 'API key required' ? ' ok' : ''}`}>
                {relayerStatusLabel()}
              </span>
            </div>
            <div className="settings-row settings-row-static">
              <span className="settings-row-title">Version</span>
              <span className="settings-row-mono">v1.0.0</span>
            </div>
          </div>
        </section>

        {walletMode === 'embedded' && vaultData && (
        <section className="settings-block">
          <h2 className="settings-section-title settings-section-title-danger">Danger zone</h2>
          <div className="settings-group settings-group-danger">
            <button type="button" className="settings-row settings-row-danger" onClick={() => void handleReset()}>
              <div className="settings-row-copy">
                <span className="settings-row-title">Reset wallet</span>
                <span className="settings-row-sub">Delete keys and restart onboarding</span>
              </div>
              <span className="material-symbols-outlined settings-row-chevron">warning</span>
            </button>
          </div>
        </section>
        )}
      </div>
    </div>
  );
}
