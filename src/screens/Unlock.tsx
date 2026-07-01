import { useState } from 'react';
import { unlockVault, resetVault, type VaultData } from '../lib/vault';
import { APP_LOGO_MARK } from '../lib/brand';

interface Props {
  onUnlock: (data: VaultData) => void;
  onReset: () => void;
  onExternalWallet?: () => void;
}

export default function UnlockScreen({ onUnlock, onReset, onExternalWallet }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await unlockVault(password);
      onUnlock(data);
    } catch {
      setError('Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Reset wallet? All keys will be permanently deleted.')) {
      await resetVault();
      onReset();
    }
  };

  return (
    <div className="unlock-screen">
      {/* Logo */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <div className="unlock-logo">{APP_LOGO_MARK}</div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <h1 style={{ fontFamily:'var(--font-ui)', fontSize:28, fontWeight:800, color:'var(--text-primary)', textTransform:'uppercase', letterSpacing:'-0.01em' }}>
            Wallet Locked
          </h1>
          <p style={{ fontFamily:'var(--font-ui)', fontSize:14, color:'var(--text-secondary)', textAlign:'center', maxWidth:260 }}>
            Enter your master password to decrypt your secure vault.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ width:'100%', display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label className="label-caps" style={{ textAlign:'center', display:'block' }}>
            Enter Master Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            autoFocus
            style={{
              textAlign:'center',
              fontFamily:'var(--font-data)',
              fontSize:22,
              letterSpacing:'0.3em',
              height:64,
              borderRadius:'var(--r-lg)',
            }}
          />
        </div>

        {error && (
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--error)', fontSize:13, justifyContent:'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <div className="spinner" /> : 'Unlock Wallet'}
        </button>
      </form>

      {/* Reset link */}
      <button
        onClick={handleReset}
        style={{ background:'transparent', border:'none', color:'var(--text-muted)', fontSize:13, cursor:'pointer', textDecoration:'underline', textUnderlineOffset:3 }}
      >
        Forgot password? Reset wallet
      </button>

      {onExternalWallet && (
        <button
          type="button"
          className="btn-secondary"
          style={{ width: '100%', maxWidth: 320 }}
          onClick={onExternalWallet}
        >
          Use external wallet (browser)
        </button>
      )}
    </div>
  );
}
