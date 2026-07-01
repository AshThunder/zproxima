import { useEffect, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  isWeb: boolean;
  underlying: string;
  confidential: string;
  symbol: string;
  name: string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onUnderlyingChange: (value: string) => void;
  onConfidentialChange: (value: string) => void;
  onSymbolChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export default function RegisterCustomWrapperModal({
  open,
  isWeb,
  underlying,
  confidential,
  symbol,
  name,
  error,
  loading,
  onClose,
  onUnderlyingChange,
  onConfidentialChange,
  onSymbolChange,
  onNameChange,
  onSubmit,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    if (isWeb) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      if (isWeb) document.body.style.overflow = prevOverflow;
    };
  }, [open, loading, onClose, isWeb]);

  if (!open) return null;

  const content = (
    <div
      className={`overlay${isWeb ? ' modal-popup-backdrop' : ''}`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className={`modal-sheet${isWeb ? ' modal-popup' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-wrapper-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-popup-header">
          <div>
            <h3 id="register-wrapper-title" className="modal-popup-title">
              Register Custom Wrapper
            </h3>
            <p className="modal-popup-lead">
              Add a dev or local ERC-20 ↔ ERC-7984 pair. It is saved in this browser and merged with
              the on-chain registry on your dashboard — wrap, unwrap, and decrypt work like official pairs.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={loading} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="modal-popup-form">
          <label className="modal-field">
            <span className="label-caps">Underlying ERC-20</span>
            <input
              type="text"
              placeholder="0x…"
              value={underlying}
              onChange={(e) => onUnderlyingChange(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </label>
          <label className="modal-field">
            <span className="label-caps">Confidential wrapper (ERC-7984)</span>
            <input
              type="text"
              placeholder="0x…"
              value={confidential}
              onChange={(e) => onConfidentialChange(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </label>
          <label className="modal-field">
            <span className="label-caps">Symbol</span>
            <input
              type="text"
              placeholder="cUSDC"
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </label>
          <label className="modal-field">
            <span className="label-caps">Name</span>
            <input
              type="text"
              placeholder="Confidential USDC"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </label>

          {error && <p className="modal-popup-error">{error}</p>}

          <div className="modal-popup-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <div className="spinner" /> : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (isWeb && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
