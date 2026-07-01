import { getActiveNetwork } from '../lib/wallet';

interface Props {
  message: string;
  status?: 'loading' | 'success';
  txHash?: string;
}

export default function ProgressBanner({ message, status = 'loading', txHash }: Props) {
  const network = getActiveNetwork();

  return (
    <div className={`progress-banner progress-banner--${status}`}>
      <div className="progress-banner-icon">
        {status === 'success' ? (
          <span className="material-symbols-outlined success-icon" style={{ fontSize: 18, color: '#136c1e' }}>
            check_circle
          </span>
        ) : (
          <div className="progress-banner-spinner" />
        )}
      </div>
      <div className="progress-banner-content" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span className="progress-banner-text" style={{ color: status === 'success' ? '#136c1e' : '#8a5000' }}>
          {message}
        </span>
        {txHash && (
          <a
            href={`${network.explorer}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="progress-banner-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              color: status === 'success' ? '#136c1e' : '#8a5000',
              textDecoration: 'underline',
              cursor: 'pointer',
              width: 'fit-content',
              marginTop: 2,
            }}
          >
            View on Explorer
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
              open_in_new
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
