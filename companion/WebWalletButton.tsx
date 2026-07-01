interface Props {
  connected: boolean;
  address?: string;
  walletLabel?: string;
  busy?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WebWalletButton({
  connected,
  address,
  walletLabel = 'Wallet',
  busy = false,
  onConnect,
  onDisconnect,
}: Props) {
  if (!connected) {
    return (
      <button
        type="button"
        className="web-wallet-btn web-wallet-btn-connect"
        disabled={busy || !onConnect}
        onClick={onConnect}
      >
        <span className="material-symbols-outlined" aria-hidden>account_balance_wallet</span>
        {busy ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }

  const short = address ? shortenAddress(address) : '';

  return (
    <div className="web-wallet-btn-group">
      <div className="web-wallet-btn web-wallet-btn-address" title={address}>
        <span className="material-symbols-outlined" aria-hidden>account_balance_wallet</span>
        <span className="web-wallet-btn-label">{walletLabel}</span>
        {short && <span className="web-wallet-btn-addr">{short}</span>}
      </div>
      <button
        type="button"
        className="web-wallet-btn web-wallet-btn-disconnect"
        disabled={busy || !onDisconnect}
        onClick={onDisconnect}
      >
        {busy ? '…' : 'Disconnect'}
      </button>
    </div>
  );
}
