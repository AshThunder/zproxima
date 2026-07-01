import { useEffect, useState } from 'react';
import {
  checkCompanionReachable,
  getCompanionBaseUrl,
  openCompanion,
} from '../lib/externalBridge';
import { setWalletMode } from '../lib/walletMode';
import Icon from '../components/Icon';
import ErrorBanner from '../components/ErrorBanner';
import { APP_NAME } from '../lib/brand';

interface Props {
  onConnected: (address: string) => void;
  onUseEmbedded: () => void;
}

export default function ExternalConnectScreen({ onConnected, onUseEmbedded }: Props) {
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [companionUp, setCompanionUp] = useState<boolean | null>(null);
  const companionUrl = getCompanionBaseUrl();

  const probeCompanion = async () => {
    setCompanionUp(await checkCompanionReachable());
  };

  useEffect(() => {
    void probeCompanion();
  }, []);

  const handleOpenBrowser = async () => {
    setError('');
    setOpening(true);
    try {
      const up = await checkCompanionReachable();
      setCompanionUp(up);
      if (!up) {
        setError(
          `Companion not reachable at ${companionUrl}. Run: npm run build && npm run serve:companion`,
        );
        return;
      }
      await setWalletMode('external');
      await openCompanion('connect');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="screen">
      <div className="top-bar">
        <span className="top-bar-title">External Wallet</span>
      </div>
      <div className="screen-scroll" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card card-padded">
          <Icon name="language" size={32} color="var(--text-primary)" style={{ marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Connect in your browser</h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Use a browser wallet in a companion tab. {APP_NAME} keeps your registry view,
            activity history, and balances in the side panel.
          </p>
        </div>

        {companionUp === false && (
          <div className="card card-padded" style={{ borderColor: 'var(--error)' }}>
            <strong style={{ fontSize: 14 }}>Companion server offline</strong>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              In a terminal, from <code>zproxima-ext</code>:
            </p>
            <pre style={{
              margin: '10px 0 0',
              padding: 12,
              borderRadius: 8,
              background: 'var(--bg-container-high)',
              fontSize: 12,
              overflow: 'auto',
            }}>
{`npm run build
npm run serve:companion`}
            </pre>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Expected at {companionUrl}
            </p>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => void probeCompanion()}
            >
              Check again
            </button>
          </div>
        )}

        {companionUp === true && (
          <p style={{ fontSize: 12, color: 'var(--accent-green)', margin: 0 }}>
            Companion ready at {companionUrl}
          </p>
        )}

        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        <button
          className="btn-primary"
          disabled={opening || companionUp === false}
          onClick={() => void handleOpenBrowser()}
        >
          {opening ? 'Opening browser…' : 'Open browser to connect'}
        </button>

        <button className="btn-secondary" onClick={onUseEmbedded}>
          Use built-in wallet instead
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          After connecting in the browser, return here. The dashboard updates automatically.
        </p>

        <button
          type="button"
          className="btn-secondary"
          style={{ marginTop: 'auto' }}
          onClick={() => onConnected('')}
        >
          I connected — refresh
        </button>
      </div>
    </div>
  );
}
