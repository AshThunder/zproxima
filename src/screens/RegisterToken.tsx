import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import WebPageHeader from '../components/WebPageHeader';
import { addCustomPair, removeCustomPair, fetchRegistryPairs, type TokenPair } from '../lib/zama';
import { getActiveNetwork, getProvider, getSigner } from '../lib/wallet';
import type { WalletSession } from '../lib/walletSession';
import ErrorBanner from '../components/ErrorBanner';

// Import compiled ConfidentialWrapper artifact
import ConfidentialWrapperArtifact from '../config/contracts/ConfidentialWrapper.json';

interface Props {
  session: WalletSession;
  onBack: () => void;
}

export default function RegisterToken({ session, onBack }: Props) {
  const isWeb = session.surface === 'web';
  const network = getActiveNetwork();

  const [underlying, setUnderlying] = useState('');
  
  // All existing registered pairs
  const [allPairs, setAllPairs] = useState<TokenPair[]>([]);
  const [existingPair, setExistingPair] = useState<TokenPair | null>(null);

  // Auto-fetched metadata
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [decimals, setDecimals] = useState(18);
  const [fetchingMeta, setFetchingMeta] = useState(false);

  const [deploying, setDeploying] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [successPair, setSuccessPair] = useState<TokenPair | null>(null);

  // Load all registered pairs on mount to validate duplicates
  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchRegistryPairs('', session.ethereum);
        setAllPairs(list);
      } catch (e) {
        console.error('Failed to load registered token pairs:', e);
      }
    })();
  }, [session.ethereum]);

  // Auto-resolve underlying token metadata on address input change
  const handleUnderlyingChange = async (val: string) => {
    setUnderlying(val);
    setError('');
    setSuccessPair(null);
    setExistingPair(null);
    const trimmed = val.trim();
    if (!ethers.isAddress(trimmed)) return;

    // Check if a wrapper is already registered for this underlying token
    const duplicate = allPairs.find(
      (p) => p.underlyingAddress.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setExistingPair(duplicate);
      setSymbol(duplicate.symbol);
      setName(duplicate.name);
      setDecimals(duplicate.decimals);
      return;
    }

    setFetchingMeta(true);
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(
        trimmed,
        [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ],
        provider
      );
      const [s, n, d] = await Promise.all([
        contract.symbol().catch(() => ''),
        contract.name().catch(() => ''),
        contract.decimals().catch(() => 18)
      ]);
      if (s) setSymbol(s);
      if (n) setName(n);
      setDecimals(Number(d));
    } catch {
      // ignore auto-fetch errors
    } finally {
      setFetchingMeta(false);
    }
  };

  const handleRemoveCustomPair = async (confidentialAddr: string) => {
    try {
      await removeCustomPair(network.id, confidentialAddr);
      setAllPairs((prev) => prev.filter((p) => p.confidentialAddress.toLowerCase() !== confidentialAddr.toLowerCase()));
      if (existingPair && existingPair.confidentialAddress.toLowerCase() === confidentialAddr.toLowerCase()) {
        setExistingPair(null);
      }
    } catch (e) {
      console.error('Failed to remove custom pair:', e);
      setError('Failed to remove custom pair.');
    }
  };

  // Compile, deploy and register wrapper locally
  const handleDeployAndSave = async () => {
    setError('');
    setSuccessPair(null);
    const uAddr = underlying.trim();

    if (!ethers.isAddress(uAddr)) {
      setError('Please enter a valid Underlying ERC-20 Address.');
      return;
    }
    if (existingPair) {
      setError(`A wrapper is already deployed for this token at ${existingPair.confidentialAddress}.`);
      return;
    }
    if (!symbol.trim() || !name.trim()) {
      setError('Please specify a Token Symbol and Name.');
      return;
    }

    setDeploying(true);
    setStatusMsg('Preparing deployment transaction for wrapper...');

    try {
      let signer: ethers.Signer;
      if (session.privateKey) {
        signer = getSigner(session.privateKey);
      } else if (session.ethereum) {
        const webProvider = new ethers.BrowserProvider(session.ethereum);
        signer = await webProvider.getSigner();
      } else {
        throw new Error('Wallet not connected. Connect a wallet to deploy the wrapper.');
      }

      const factory = new ethers.ContractFactory(
        ConfidentialWrapperArtifact.abi,
        ConfidentialWrapperArtifact.bytecode,
        signer
      );

      setStatusMsg('Deploying Mock ConfidentialWrapper contract to Sepolia...');
      const wrapperContract = await factory.deploy(
        `Confidential ${symbol}`, // Name
        `c${symbol}`,             // Symbol
        uAddr                     // Underlying Address
      );

      setStatusMsg('Waiting for block confirmation...');
      await wrapperContract.waitForDeployment();

      const deployedAddr = await wrapperContract.getAddress();
      
      // Save custom pair locally for immediate UI wrapping/unwrapping
      const newPair: TokenPair = {
        symbol: `c${symbol}`,
        name: `Confidential ${name}`,
        underlyingAddress: ethers.getAddress(uAddr) as any,
        confidentialAddress: ethers.getAddress(deployedAddr) as any,
        decimals,
        isCustom: true
      };

      await addCustomPair(network.id, newPair);
      setSuccessPair(newPair);
      
      // Refresh pairs list
      setAllPairs((prev) => [...prev, newPair]);
      setStatusMsg('');
    } catch (err: any) {
      console.error(err);
      setError(err.reason || err.message || 'Wrapper deployment failed.');
      setStatusMsg('');
    } finally {
      setDeploying(false);
    }
  };

  const content = (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* Form Fields Card */}
      <div className="card" style={{ padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)', lineHeight: '1.5',
          background: 'rgba(255, 255, 255, 0.02)', padding: 14, borderRadius: 'var(--r-md)',
          border: '1px dashed var(--border-color)', display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 20 }}>info</span>
          <div>
            <strong>Concept Clarification:</strong> The deployed contract implements the <strong>ERC-7984 (Confidential Token Wrapper)</strong> specification. This wrapper contract itself acts as the <strong>ERC-7984 confidential token</strong>. Users wrap their public ERC-20 tokens here to receive private, shielded balances.
          </div>
        </div>

        <div>
          <label className="label-caps" htmlFor="underlying-address">Underlying ERC-20 Address</label>
          <input
            id="underlying-address"
            type="text"
            className="input-field"
            value={underlying}
            onChange={(e) => handleUnderlyingChange(e.target.value)}
            placeholder="0x..."
            style={{ width: '100%', fontFamily: 'var(--font-data)', marginTop: 6 }}
          />
        </div>

        {existingPair && (
          <div className="card" style={{
            padding: 16, background: 'rgba(254, 152, 0, 0.08)',
            border: '1px solid rgba(254, 152, 0, 0.25)', borderRadius: 'var(--r-md)',
            display: 'flex', alignItems: 'flex-start', gap: 12
          }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-amber)', fontSize: 24 }}>warning</span>
            <div>
              <strong style={{ color: 'var(--accent-amber)', fontSize: 14 }}>Wrapper Already Deployed</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                An ERC-7984 confidential wrapper token is already registered for this underlying token.
              </p>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <strong>ERC-7984 Token Address:</strong> <code style={{ fontFamily: 'var(--font-data)' }}>{existingPair.confidentialAddress}</code>
              </div>
            </div>
          </div>
        )}

        {/* Resolved Metadata Section */}
        <div style={{
          background: 'var(--bg-app)', padding: 16, borderRadius: 'var(--r-md)',
          border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12
        }}>
          <span className="label-caps" style={{ color: 'var(--text-secondary)' }}>Resolved Token Details</span>
          {fetchingMeta ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <div className="spinner spinner-dark" style={{ width: 14, height: 14 }} />
              <span>Querying blockchain for contract details...</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label className="label-caps" style={{ fontSize: 10, color: 'var(--text-muted)' }}>Symbol</label>
                <input
                  type="text"
                  className="input-field"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. mUSDC"
                  disabled={!!existingPair}
                  style={{ width: '100%', height: 36, marginTop: 4 }}
                />
              </div>
              <div>
                <label className="label-caps" style={{ fontSize: 10, color: 'var(--text-muted)' }}>Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Mock Token"
                  disabled={!!existingPair}
                  style={{ width: '100%', height: 36, marginTop: 4 }}
                />
              </div>
              <div>
                <label className="label-caps" style={{ fontSize: 10, color: 'var(--text-muted)' }}>Decimals</label>
                <input
                  type="number"
                  className="input-field"
                  value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}
                  placeholder="18"
                  disabled={!!existingPair}
                  style={{ width: '100%', height: 36, marginTop: 4 }}
                />
              </div>
            </div>
          )}
        </div>

        {statusMsg && (
          <div style={{ fontSize: 13, color: 'var(--accent-amber)', fontWeight: 600 }}>
            {statusMsg}
          </div>
        )}

        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        {successPair && (
          <div className="card" style={{
            padding: 16, background: 'rgba(76, 175, 80, 0.08)',
            border: '1px solid rgba(76, 175, 80, 0.25)', borderRadius: 'var(--r-md)',
            display: 'flex', alignItems: 'center', gap: 12
          }}>
            <span className="material-symbols-outlined" style={{ color: '#4caf50', fontSize: 24 }}>check_circle</span>
            <div>
              <strong style={{ color: '#4caf50', fontSize: 14 }}>Success! Wrapper deployed successfully.</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>ERC-7984 Token Address:</strong> <code style={{ fontFamily: 'var(--font-data)' }}>{successPair.confidentialAddress}</code>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                You can now wrap and unwrap {symbol} in the dashboard using this wrapper.
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleDeployAndSave()}
          disabled={deploying || !underlying.trim() || fetchingMeta || !!existingPair}
          style={{ width: '100%', height: 48, fontSize: 15, fontWeight: 700 }}
        >
          {deploying ? <div className="spinner" /> : 'Deploy & Register Wrapper'}
        </button>

      </div>

      {/* Custom Pairs List */}
      {allPairs.some((p) => p.isCustom) && (
        <div className="card" style={{ padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 className="label-caps" style={{ color: 'var(--text-primary)', margin: 0, fontSize: 13, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
            Custom Registered Wrapper Tokens
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {allPairs
              .filter((p) => p.isCustom)
              .map((p) => (
                <div key={p.confidentialAddress} style={{
                  padding: 14, background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--r-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{p.symbol}</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      <strong>ERC-7984:</strong> <code style={{ fontFamily: 'var(--font-data)' }}>{p.confidentialAddress}</code>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      <strong>Underlying ERC-20:</strong> <code style={{ fontFamily: 'var(--font-data)' }}>{p.underlyingAddress}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveCustomPair(p.confidentialAddress)}
                    style={{
                      background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.25)',
                      borderRadius: 'var(--r-sm)', width: 32, height: 32, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', color: '#f44336', flexShrink: 0
                    }}
                    title="Remove custom pair registration"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

    </div>
  );

  return (
    <div className={`screen-container ${isWeb ? 'screen-container-web' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {isWeb ? (
        <WebPageHeader
          title="Deploy Confidential Wrapper"
          subtitle="Deploy a custom ERC-7984 confidential wrapper for any underlying ERC-20 token to convert it."
          onBack={onBack}
        />
      ) : (
        <div className="top-bar" style={{ flexShrink: 0 }}>
          <button className="icon-btn" onClick={onBack} title="Back">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <span className="top-bar-brand" style={{ flex: 1, textAlign: 'center', marginRight: 32 }}>Deploy Wrapper</span>
        </div>
      )}

      <div className="screen-scroll" style={{ flex: 1, padding: isWeb ? 32 : 16, overflowY: 'auto' }}>
        {content}
      </div>
    </div>
  );
}
