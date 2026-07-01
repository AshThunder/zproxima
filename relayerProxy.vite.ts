/** Vite dev/preview proxy — same-origin relayer for browser FHE worker (see @zama-fhe/sdk README). */
export const relayerDevProxy = {
  '/api/relayer/11155111': {
    target: 'https://relayer.testnet.zama.org',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/relayer\/11155111/, '/v2'),
  },
  '/api/relayer/1': {
    target: 'https://relayer.mainnet.zama.org',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/relayer\/1/, '/v2'),
  },
};
