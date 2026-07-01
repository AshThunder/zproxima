import { useState } from 'react';
import { createVault } from '../lib/vault';
import { Wallet } from 'ethers';
import { APP_NAME, APP_LOGO_MARK, APP_TAGLINE } from '../lib/brand';

interface Props { onComplete: (address: string) => void; }

type Step = 'welcome' | 'generate' | 'restore' | 'password';

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep]         = useState<Step>('welcome');
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleGenerate = () => {
    const wallet = Wallet.createRandom();
    setMnemonic(wallet.mnemonic?.phrase || '');
    setStep('generate');
  };

  const handleRestoreSubmit = () => {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Please enter a valid 12 or 24-word phrase.');
      return;
    }
    try { Wallet.fromPhrase(mnemonic.trim()); setStep('password'); }
    catch { setError('Invalid recovery phrase.'); }
  };

  const handleSetPassword = async () => {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const wallet = Wallet.fromPhrase(mnemonic.trim());
      await createVault({
        mnemonic: mnemonic.trim(),
        privateKey: wallet.privateKey,
        activeAccountIndex: 0,
      }, password);
      onComplete(wallet.address);
    } catch (e: any) {
      setError(e.message || 'Failed to create vault.');
    } finally { setLoading(false); }
  };

  const shell = (children: React.ReactNode) => (
    <div className="onboarding-screen">{children}</div>
  );

  /* ── Welcome ── */
  if (step === 'welcome') return shell(
    <>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
        <div className="unlock-logo">{APP_LOGO_MARK}</div>
        <h1 style={{ fontFamily:'var(--font-ui)', fontSize:32, fontWeight:800, color:'var(--text-primary)', textTransform:'uppercase', letterSpacing:'-0.02em' }}>
          {APP_NAME}
        </h1>
        <p style={{ fontFamily:'var(--font-ui)', fontSize:14, color:'var(--text-secondary)', maxWidth:280, lineHeight:1.6 }}>
          {APP_TAGLINE}
        </p>
      </div>
      <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:12 }}>
        <button className="btn-primary" onClick={handleGenerate}>Create New Wallet</button>
        <button className="btn-secondary" onClick={() => setStep('restore')}>Import Existing Wallet</button>
      </div>
    </>
  );

  /* ── Backup Mnemonic ── */
  if (step === 'generate') return shell(
    <>
      <div style={{ textAlign:'left', width:'100%' }}>
        <span className="material-symbols-outlined" style={{ fontSize:32, color:'var(--text-primary)' }}>shield</span>
        <h2 style={{ fontFamily:'var(--font-ui)', fontSize:22, fontWeight:700, color:'var(--text-primary)', textTransform:'uppercase', marginTop:8 }}>
          Backup Mnemonic
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:6, lineHeight:1.6 }}>
          Write down this 12-word seed phrase and store it securely. Anyone with access can access your funds.
        </p>
      </div>
      <div className="mnemonic-box" style={{ width:'100%' }}>{mnemonic}</div>
      <button className="btn-primary" onClick={() => setStep('password')}>
        I Have Saved It
        <span className="material-symbols-outlined" style={{ fontSize:18 }}>arrow_forward</span>
      </button>
    </>
  );

  /* ── Restore ── */
  if (step === 'restore') return shell(
    <>
      <div style={{ textAlign:'left', width:'100%' }}>
        <span className="material-symbols-outlined" style={{ fontSize:32, color:'var(--text-primary)' }}>key</span>
        <h2 style={{ fontFamily:'var(--font-ui)', fontSize:22, fontWeight:700, color:'var(--text-primary)', textTransform:'uppercase', marginTop:8 }}>
          Restore Wallet
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:6, lineHeight:1.6 }}>
          Enter your 12 or 24-word secret recovery phrase separated by spaces.
        </p>
      </div>
      <textarea
        rows={4}
        placeholder="word1 word2 word3..."
        value={mnemonic}
        onChange={e => { setMnemonic(e.target.value); setError(''); }}
        style={{ fontFamily:'var(--font-data)', fontSize:14, resize:'none', borderRadius:'var(--r-lg)' }}
      />
      {error && <p style={{ color:'var(--error)', fontSize:13, textAlign:'left' }}>{error}</p>}
      <button className="btn-primary" onClick={handleRestoreSubmit}>Continue</button>
      <button className="btn-secondary" onClick={() => setStep('welcome')}>Back</button>
    </>
  );

  /* ── Set Password ── */
  return shell(
    <>
      <div style={{ textAlign:'left', width:'100%' }}>
        <span className="material-symbols-outlined" style={{ fontSize:32, color:'var(--text-primary)' }}>lock</span>
        <h2 style={{ fontFamily:'var(--font-ui)', fontSize:22, fontWeight:700, color:'var(--text-primary)', textTransform:'uppercase', marginTop:8 }}>
          Set Password
        </h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginTop:6, lineHeight:1.6 }}>
          Create a strong password to encrypt your recovery phrase on this browser.
        </p>
      </div>
      <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ position:'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize:20 }}>{show ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
        <input
          type={show ? 'text' : 'password'}
          placeholder="Confirm password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
      </div>
      {error && <p style={{ color:'var(--error)', fontSize:13 }}>{error}</p>}
      <button className="btn-primary" onClick={handleSetPassword} disabled={loading}>
        {loading ? <div className="spinner" /> : 'Create Wallet'}
      </button>
    </>
  );
}
