interface Props {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div
      className="error-banner"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 'var(--r-lg)',
        background: 'var(--error-bg, #ffdad6)',
        color: 'var(--error)',
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0 }}>error</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="icon-btn"
          style={{ width: 24, height: 24, flexShrink: 0 }}
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      )}
    </div>
  );
}
