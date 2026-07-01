interface Props {
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MainnetWarning({ action, onConfirm, onCancel }: Props) {
  return (
    <div className="overlay">
      <div className="modal-sheet">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--accent-amber)' }}>
            warning
          </span>
          <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 800, textTransform: 'uppercase' }}>
            Mainnet Warning
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            You are about to <strong>{action}</strong> on Ethereum Mainnet using real funds.
            Transactions are irreversible. Confirm only if you intend to proceed.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={onConfirm} style={{ flex: 1 }}>
              I Understand, Proceed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
