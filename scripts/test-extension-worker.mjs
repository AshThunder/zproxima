/**
 * Smoke-test Zama worker + UMD load in a Chrome extension context.
 * Run: npm run build && node scripts/test-extension-worker.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const userData = mkdtempSync(join(tmpdir(), 'zregister-ext-test-'));

writeFileSync(
  join(dist, 'worker-test.html'),
  `<!doctype html><html><body><script>
(async () => {
  try {
    const workerUrl = chrome.runtime.getURL('relayer-sdk.worker.js');
    const w = new Worker(workerUrl);
    const id = crypto.randomUUID();
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker INIT timeout (90s)')), 90000);
      w.onmessage = (ev) => {
        const msg = ev.data;
        if (msg?.id !== id) return;
        clearTimeout(timer);
        if (msg.success) resolve(msg);
        else reject(new Error(msg.error || 'Worker INIT failed'));
      };
      w.onerror = (ev) => {
        clearTimeout(timer);
        reject(new Error(ev.message || 'Worker error'));
      };
      w.postMessage({
        type: 'INIT',
        id,
        payload: {
          cdnUrl: 'https://cdn.zama.org/relayer-sdk-js/0.4.2/relayer-sdk-js.umd.cjs',
          fhevmConfig: {
            aclContractAddress: '0x6877B2B2E0b9b4e3b8F5E8b8b8b8b8b8b8b8b8b8',
            relayerUrl: 'https://relayer.testnet.zama.org',
            network: 'https://ethereum-sepolia-rpc.publicnode.com',
            chainId: 11155111,
          },
          csrfToken: '',
          integrity: undefined,
          thread: undefined,
        },
      });
    });
    console.log('WORKER_INIT_OK', JSON.stringify(result.data));
    document.title = 'PASS';
  } catch (e) {
    console.error('WORKER_INIT_FAIL', e?.message || String(e));
    document.title = 'FAIL';
  }
})();
</script></body></html>`,
);

function findExtensionId() {
  const extRoot = join(userData, 'Default', 'Extensions');
  try {
    return readdirSync(extRoot)[0] ?? null;
  } catch {
    return null;
  }
}

function cleanup() {
  try {
    rmSync(userData, { recursive: true, force: true });
  } catch {
    // ignore chrome profile lock leftovers
  }
}

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--user-data-dir=${userData}`,
  `--load-extension=${dist}`,
  '--enable-logging=stderr',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let logs = '';
proc.stdout.on('data', (d) => { logs += d; });
proc.stderr.on('data', (d) => { logs += d; });

await new Promise((r) => setTimeout(r, 3000));
const extId = findExtensionId();
if (!extId) {
  proc.kill('SIGKILL');
  console.error('Could not detect extension ID.\n', logs.slice(-4000));
  cleanup();
  process.exit(1);
}

const testUrl = `chrome-extension://${extId}/worker-test.html`;
proc.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 500));

const nav = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--user-data-dir=${userData}`,
  '--enable-logging=stderr',
  testUrl,
], { stdio: ['ignore', 'pipe', 'pipe'] });

let out = '';
nav.stdout.on('data', (d) => { out += d; });
nav.stderr.on('data', (d) => { out += d; });

await new Promise((resolve) => {
  nav.on('exit', () => resolve());
  setTimeout(() => {
    nav.kill('SIGKILL');
    resolve();
  }, 120000);
});

cleanup();

const ok = out.includes('WORKER_INIT_OK');
console.log(out.slice(-5000));
console.log(ok ? '\n✓ Extension worker smoke test passed' : '\n✗ Extension worker smoke test failed');
process.exit(ok ? 0 : 1);
