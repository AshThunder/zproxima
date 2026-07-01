import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import { getActiveNetwork } from '../lib/wallet';
import type { WalletSession } from '../lib/walletSession';
import WebPageHeader from '../components/WebPageHeader';
import Icon from '../components/Icon';

interface Props {
  session: WalletSession;
  onBack: () => void;
}

export default function ReceiveScreen({ session, onBack }: Props) {
  const isWeb = session.surface === 'web';
  const network = getActiveNetwork();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const qrSize = isWeb ? 280 : 220;
  const qrImageSize = qrSize - 24;

  let displayAddress = session.address;
  try {
    displayAddress = ethers.getAddress(session.address);
  } catch {
    // Keep raw address if checksum fails.
  }

  const explorerUrl = `${network.explorer}/address/${displayAddress}`;

  useEffect(() => {
    let cancelled = false;
    const payload = `ethereum:${displayAddress}`;
    void QRCode.toDataURL(payload, {
      width: qrImageSize,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [displayAddress, qrImageSize]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const content = (
    <>
      <div className="card card-padded receive-network-card">
        <div className="receive-network-row">
          <div className="network-dot" />
          <span className="label-caps">{network.name}</span>
        </div>
        <p className="receive-network-hint">
          Only send assets on this network. Deposits on other chains will be lost.
        </p>
      </div>

      <div className="card card-padded receive-address-card">
        <div
          className="receive-qr-wrap"
          style={{ width: qrSize, height: qrSize }}
          aria-label={`QR code for deposit address ${displayAddress}`}
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Deposit QR code for ${displayAddress}`}
            />
          ) : (
            <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
          )}
        </div>
        <span className="label-caps receive-address-label">Your deposit address</span>
        <p className="receive-address-value">{displayAddress}</p>
        <button type="button" className="btn-primary receive-copy-btn" onClick={() => void handleCopy()}>
          <Icon name={copied ? 'check' : 'content_copy'} size={18} />
          {copied ? 'Copied' : 'Copy address'}
        </button>
      </div>

      <div className="card card-padded receive-info-card">
        <div className="receive-info-row">
          <Icon name="account_balance_wallet" size={20} color="var(--text-secondary)" />
          <div>
            <strong>Public deposits</strong>
            <p>Send ETH or ERC-20 tokens to this address. They appear as public balances on your registry.</p>
          </div>
        </div>
        <div className="receive-info-row">
          <Icon name="shield" size={20} color="var(--text-secondary)" />
          <div>
            <strong>Shield after arrival</strong>
            <p>Use Wrap on the dashboard to move public tokens into confidential balances.</p>
          </div>
        </div>
        <div className="receive-info-row">
          <Icon name="lock" size={20} color="var(--text-secondary)" />
          <div>
            <strong>Confidential transfers</strong>
            <p>Others can send you encrypted tokens directly — they arrive in your private balance.</p>
          </div>
        </div>
      </div>

      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary receive-explorer-link"
      >
        <Icon name="open_in_new" size={18} />
        View on {network.id === 'mainnet' ? 'Etherscan' : 'Sepolia Etherscan'}
      </a>
    </>
  );

  if (isWeb) {
    return (
      <div className="screen web-page">
        <WebPageHeader
          title="Receive"
          subtitle="Deposit ETH or ERC-20 tokens to your wallet address."
          onBack={onBack}
        />
        <div className="web-page-body">
          <div className="web-page-body-inner web-receive-layout">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ background: 'var(--bg-base)' }}>
      <div className="top-bar">
        <button type="button" className="icon-btn" onClick={onBack} title="Back">
          <Icon name="arrow_back_ios_new" size={22} />
        </button>
        <span className="top-bar-title" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 16 }}>
          Receive
        </span>
        <div style={{ width: 36 }} />
      </div>
      <div className="screen-scroll">
        {content}
      </div>
    </div>
  );
}
