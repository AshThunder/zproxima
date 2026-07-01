import { useEffect, useState } from 'react';
import { APP_NAME } from '../lib/brand';
import type { WalletSession } from '../lib/walletSession';
import { openExternalAction, DEFAULT_BROWSER_WALLET_LABEL } from '../lib/walletSession';
import { isBridgeAlive } from '../lib/externalBridge';
import Icon from './Icon';

interface Props {
  session: WalletSession;
  onConnectExternal: () => void;
}

export default function WalletModeBanner({ session, onConnectExternal }: Props) {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    if (session.mode !== 'external' || session.surface === 'web') return;
    setAlive(isBridgeAlive(session.externalBridge ?? null));
  }, [session]);

  if (session.surface === 'web') {
    return (
      <div className="card card-padded" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="language" size={18} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {session.walletLabel ?? DEFAULT_BROWSER_WALLET_LABEL}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Web wallet · sign in this browser
          </div>
        </div>
      </div>
    );
  }

  if (session.mode === 'embedded') {
    return (
      <div className="card card-padded" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="account_balance_wallet" size={18} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Built-in wallet</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sign inside {APP_NAME}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-padded" style={{ marginBottom: 12, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="language" size={18} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {session.externalBridge?.walletLabel ?? 'External wallet'}
          </div>
          <div style={{ fontSize: 11, color: alive ? 'var(--text-secondary)' : 'var(--error)' }}>
            {alive
              ? 'Sign in browser · activity syncs here'
              : 'Browser session expired — reconnect'}
          </div>
        </div>
        {!alive && (
          <button type="button" className="btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={onConnectExternal}>
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}

export function useExternalActionGuard(session: WalletSession) {
  return (action: Parameters<typeof openExternalAction>[0], params?: Parameters<typeof openExternalAction>[1]) => {
    if (session.surface === 'web' || session.privateKey) return false;
    void openExternalAction(action, params);
    return true;
  };
}
