# Zproxima — Confidential Registry

A confidential registry that is always by your side and one click away. Production-ready dApp for the [Zama Wrappers Registry](https://docs.zama.org/protocol/sdk/getting-started/quick-start). Browse official ERC-20 ↔ ERC-7984 pairs on Sepolia and Mainnet, wrap and unwrap, decrypt confidential balances (including arbitrary ERC-7984 tokens), and claim Sepolia testnet faucet tokens.

**Live web app:** Available at [https://zproxima.vercel.app](https://zproxima.vercel.app). See [Deploy the web dApp](#deploy-the-web-dapp) for custom deployments.

**Chrome extension:** Optional side-panel wallet with built-in vault or browser wallet bridge (supports switching between live, local, and custom companion dApps).

**Upgrading from ZRegister:** On first launch after updating, stored vault data, activity, decrypted balances, and preferences are migrated automatically from `zregister_*` keys to `zproxima_*`. Reload the extension once after the update.

---

## Features (Zama Dev Program checklist)

| Requirement | Status |
|-------------|--------|
| Browse official registry pairs (Sepolia + Mainnet) | ✅ On-chain `WrappersRegistry` + static fallbacks |
| Wrap / unwrap every registry pair | ✅ Shield + two-phase unshield |
| EIP-712 user-decrypt (any ERC-7984) | ✅ Registry cards + **Decrypt** screen (paste address) |
| Sepolia faucet (official cTokenMocks) | ✅ 1,000 tokens per claim via `mint()` |
| Hybrid registry (on-chain + local custom pairs) | ✅ Merge in `fetchRegistryPairs()` |
| Documented pair extension | ✅ See [Adding a new pair](#adding-a-new-pair) |
| FHEVM relayer SDK integration | ✅ `@zama-fhe/sdk` v3 |
| ZBot Chatbot Assistant | ✅ Interactive smart assistant for registry commands |
| Error handling (approvals, balance, network) | ✅ `formatRelayerError` + client pre-checks |

---

## Supported networks

| Network | Registry contract | Relayer |
|---------|-------------------|---------|
| **Sepolia** (primary — judges) | `0x2f0750Bbb0A246059d80e94c454586a7F27a128e` |official Wrappers Registry Public testnet (no API key) |
| **Ethereum Mainnet** | `0xeb5015fF021DB115aCe010f23F55C2591059bBA0` | Requires `VITE_RELAYER_API_KEY` or proxy |

Sepolia includes all official **cTokenMocks** plus **ctGBP (Restricted)**. Faucet covers mock tokens with public `mint()` only.

---

## How the registry is sourced

`fetchRegistryPairs()` in `src/lib/zama.ts` merges three layers (in order):

1. **Static fallbacks** — `SEPOLIA_OFFICIAL_PAIRS` / `MAINNET_OFFICIAL_PAIRS` for instant UI and offline resilience.
2. **On-chain registry** — `WrappersRegistry` via `@zama-fhe/sdk` (`listPairs` with metadata) when a signer is available, or a read-only RPC fetch in `src/lib/registry.ts` when browsing without a wallet.
3. **Local custom pairs** — stored in `localStorage` / `chrome.storage.local` under `custom_pairs_{sepolia|mainnet}`.

Token metadata (symbol, name, decimals) comes from on-chain ERC-20 calls when fetched via the read-only path.

---

## Adding a new pair

### Option A — In-app UI (recommended for dev/test)

1. Open the **Registry** dashboard.
2. Click **Register New Asset**.
3. Enter:
   - Underlying ERC-20 address
   - Confidential wrapper (ERC-7984) address
   - Symbol (e.g. `cMYTOKEN`)
   - Name (e.g. `Confidential MYTOKEN`)
4. The pair is saved locally and merged with on-chain registry data.

**Example (Sepolia custom dev token):**

```
Underlying:     0xYourErc20...
Confidential:   0xYourErc7984Wrapper...
Symbol:         cDEV
Name:           Confidential DEV
```

### Option B — On-chain registration

Register the pair in the official [Wrappers Registry](https://docs.zama.org/) on Sepolia or Mainnet. The app picks it up automatically on the next refresh via `sdk.registry.listPairs()`.

### Option C — Local configuration file

Developers can declare custom or dev-only pairs directly in the codebase:
1. Open [src/config/localConfig.ts](file:///home/michael/proxima/src/config/localConfig.ts).
2. Add your custom pair(s) to either the `sepolia` or `mainnet` arrays.
3. The pairs will be automatically merged on application start.

**Example:**
```typescript
export const LOCAL_CONFIG_PAIRS = {
  sepolia: [
    {
      symbol: 'cMYTOKEN',
      name: 'Confidential MYTOKEN',
      underlyingAddress: '0x1234567890123456789012345678901234567890',
      confidentialAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      decimals: 18,
    }
  ],
  mainnet: []
};
```

### Decrypting unlisted ERC-7984 tokens

Use **Decrypt** in the web app (or **Decrypt Any ERC-7984** on the dashboard). Paste any ERC-7984 contract address — the app resolves metadata on-chain and runs the EIP-712 user-decryption flow even if the token is not in the registry UI.

### ZBot Chatbot Assistant

The application includes **ZBot**, a built-in smart assistant bot accessible via the chatbot tab. It lets you run registry actions directly using natural language commands. ZBot currently supports:

* **Checking Balance:** `balance <token>` (e.g. `balance usdc`, `check balance weth`)
* **Claiming Faucet:** `faucet <token>` (e.g. `faucet usdt`, `claim weth`, `mint usdc`)
* **Wrapping Tokens:** `wrap <amount> <token>` (e.g. `wrap 100 usdc`, `shield 5 weth`)
* **Unwrapping Tokens:** `unwrap <amount> <token>` (e.g. `unwrap 50 usdt`, `unshield 1 zama`)
* **Sending/Transferring:** `send <amount> <token> to <address>` (e.g. `send 10 usdc to 0x...`)
* **Help Desk:** `help` (shows instructions)

> [!NOTE]
> ZBot actions perform client-side signing and transactions using your secure built-in vault. Switch to the embedded built-in wallet mode in Settings to use the chat assistant.

---

## Quick start (local)

```bash
cd zproxima-ext
npm install
cp .env.example .env   # optional — Sepolia works without an API key
npm run build
```

### Web dApp (judges / browser wallet)

```bash
npm run serve:companion   # http://localhost:5174
```

Connect your browser wallet on Sepolia → browse registry → claim faucet → wrap → decrypt → unwrap.

### Chrome extension (optional)

Load **`dist/`** as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked).

---

## Deploy the web dApp

Build with your public URL baked in:

```bash
VITE_COMPANION_URL=https://your-dapp.example npm run build:companion
```

Output: `companion-dist/` (includes `vercel.json` for SPA + COOP/COEP headers).

**Vercel:** Import repo, set root directory to `zproxima-ext`, build command `npm run build:companion`, output `companion-dist`.

**Netlify / GitHub Pages / IPFS:** Upload `companion-dist/` contents. Ensure HTTPS and these headers for FHE WASM:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

---

## Environment variables

See `.env.example` (baked in at build time):

| Variable | Purpose |
|----------|---------|
| `VITE_COMPANION_URL` | Public URL of the web dApp. Default is `https://zproxima.vercel.app`. The extension includes a dynamic URL selector in the External Connect screen to easily switch between Production, Local Dev (`http://localhost:5174`), or any custom URL. |
| `VITE_RELAYER_API_KEY` | Mainnet relayer auth |
| `VITE_RELAYER_PROXY_URL_MAINNET` | Optional mainnet relayer proxy |
| `VITE_SEPOLIA_RPC_URL` | Optional Sepolia RPC override |
| `VITE_MAINNET_RPC_URL` | Optional mainnet RPC override |

---

## Sepolia demo flow (for video / judges)

1. Connect wallet on Sepolia at the live URL.
2. **Registry** — browse all official cTokenMocks (+ ctGBP Restricted).
3. **Faucet** — claim 1,000 of each mock token.
4. **Wrap** — approve ERC-20 → shield into ERC-7984.
5. **Decrypt** — key icon on asset card or **Decrypt** tab → EIP-712 signature → view balance.
6. **Unwrap** — two-phase unshield back to ERC-20.
7. **Decrypt (arbitrary)** — paste an ERC-7984 address not in the registry list.
8. **Add pair** — show Register New Asset modal + README section.

---

## Project structure

```
zproxima-ext/
  src/
    lib/           vault, wallet, zama SDK, registry.ts, activity
    screens/       Dashboard, WrapUnwrap, Send, Faucet, DecryptToken, Activity
    components/    errors, banners, mainnet warning
  companion/       Web dApp shell (Vite entry)
  companion-dist/  Production web build output
  dist/            Chrome extension build output
```

---

## Development

```bash
npm run dev              # Extension HMR :5173
npm run dev:companion    # Web dApp HMR :5174
npm test                 # Vitest unit tests
```

---

## Tech stack

- React 19 + TypeScript + Vite
- `@zama-fhe/sdk` v3 (FHEVM relayer, shield/unshield, EIP-712 decrypt)
- ethers v6
- CRXJS (Chrome extension)

---

## License

Open source — see repository license file.
