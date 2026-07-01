import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { relayerDevProxy } from '../relayerProxy.vite';

const zamaWorkerSrc = resolve(__dirname, '../node_modules/@zama-fhe/sdk/dist/esm/relayer-sdk.worker.js');
const zamaBundleSrc = resolve(__dirname, '../node_modules/@zama-fhe/relayer-sdk/bundle/relayer-sdk-js.umd.cjs');
const publicDir = resolve(__dirname, '../public');
const zamaWorkerDest = resolve(publicDir, 'relayer-sdk.worker.js');
const zamaBundleDest = resolve(publicDir, 'relayer-sdk-js.umd.js');
const zamaBundleDir = resolve(__dirname, '../node_modules/@zama-fhe/relayer-sdk/bundle');

const WORKER_PATCH = `async function loadSdkScript(cdnUrl, integrity) {
		const href = self.location?.href ?? "";
		try {
			return self.importScripts(new URL("relayer-sdk-js.umd.js", href).href);
		} catch (e) {
			console.error("[Worker] Failed to load local UMD, falling back:", e);
		}
		const runtime = getBrowserExtensionRuntime();
		if (runtime) return self.importScripts(runtime.getURL("relayer-sdk-js.umd.js"));
		const validatedUrl = validateCdnUrl(cdnUrl);`;

const INIT_SDK_TARGET = `await sdkGlobal.initSDK(thread !== null && thread !== void 0 ? { thread } : void 0);`;
const INIT_SDK_PATCH = `await (async () => {
			const href = self.location?.href ?? "";
			const needsWasm = true;
			function wasmUrl(name) {
				return new URL(name, new URL("./", href).href).href;
			}
			const initArgs = {
				tfheParams: wasmUrl("tfhe_bg.wasm"),
				kmsParams: wasmUrl("kms_lib_bg.wasm"),
				...(thread !== null && thread !== void 0 ? { thread } : {})
			};
			console.error("[Worker] compiling WASM from", wasmUrl("tfhe_bg.wasm"), "(may take several minutes on first run)…");
			await sdkGlobal.initSDK(initArgs);
			console.error("[Worker] initSDK complete");
		})();`;

const INIT_ERROR_TARGET = `} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error));
		}`;
const INIT_ERROR_PATCH = `} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
			const detail = cause ? message + ": " + cause : message;
			console.error("[Worker] Init error:", detail, error);
			sendError(id, type, detail);
		}`;

const CREATE_INSTANCE_TARGET = `const promise = sdkGlobal.createInstance({
			...toInstanceConfig(config),
			batchRpcCalls: false
		})`;
const CREATE_INSTANCE_PATCH = `console.error("[Worker] createInstance starting for chain", chainId);
		const promise = sdkGlobal.createInstance({
			...toInstanceConfig(config),
			batchRpcCalls: false
		})`;

const zamaWasmFiles = ['tfhe_bg.wasm', 'kms_lib_bg.wasm'] as const;

async function ensureZamaWasm() {
  mkdirSync(publicDir, { recursive: true });
  for (const file of zamaWasmFiles) {
    const src = resolve(zamaBundleDir, file);
    const dest = resolve(publicDir, file);
    if (!existsSync(src)) {
      throw new Error(`Missing Zama WASM at ${src}`);
    }
    if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) {
      copyFileSync(src, dest);
    }
  }
}

async function copyZamaAssets() {
  if (!existsSync(zamaWorkerSrc)) {
    throw new Error(`Missing Zama worker at ${zamaWorkerSrc}`);
  }
  if (!existsSync(zamaBundleSrc)) {
    throw new Error(`Missing Zama relayer bundle at ${zamaBundleSrc}`);
  }

  await ensureZamaWasm();

  let worker = readFileSync(zamaWorkerSrc, 'utf8');
  const patchTarget = `async function loadSdkScript(cdnUrl, integrity) {
		const validatedUrl = validateCdnUrl(cdnUrl);
		if (getBrowserExtensionRuntime()) {
			if (integrity) await verifyIntegrity(await fetchScript(validatedUrl), integrity);
			return self.importScripts(validatedUrl);
		}`;
  if (!worker.includes(patchTarget)) {
    throw new Error('Zama worker patch target not found — SDK version may have changed.');
  }
  worker = worker.replace(patchTarget, WORKER_PATCH);
  if (!worker.includes(INIT_SDK_TARGET)) {
    throw new Error('Zama worker initSDK patch target not found — SDK version may have changed.');
  }
  worker = worker.replace(INIT_SDK_TARGET, INIT_SDK_PATCH);
  if (!worker.includes(CREATE_INSTANCE_TARGET)) {
    throw new Error('Zama worker createInstance patch target not found — SDK version may have changed.');
  }
  worker = worker.replace(CREATE_INSTANCE_TARGET, CREATE_INSTANCE_PATCH);
  if (!worker.includes(INIT_ERROR_TARGET)) {
    throw new Error('Zama worker init error patch target not found — SDK version may have changed.');
  }
  worker = worker.replace(INIT_ERROR_TARGET, INIT_ERROR_PATCH);

  if (!worker.includes('credentials: "include"')) {
    throw new Error('Zama worker credentials patch target not found — SDK version may have changed.');
  }
  worker = worker.replace('credentials: "include"', 'credentials: (self.location?.href ?? "").includes("-extension:") ? "same-origin" : "include"');
  writeFileSync(zamaWorkerDest, worker);

  let bundle = readFileSync(zamaBundleSrc, 'utf8');
  const threadPoolTarget = 'await Ut.initThreadPool(e)';
  if (!bundle.includes(threadPoolTarget)) {
    throw new Error('Zama bundle thread pool target not found — SDK version may have changed.');
  }
  bundle = bundle.replace(
    threadPoolTarget,
    'await ((self.location?.href ?? "").includes("-extension:") ? Promise.resolve() : Ut.initThreadPool(e))'
  );
  writeFileSync(zamaBundleDest, bundle);
}

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, '../public'),
  plugins: [
    {
      name: 'copy-zama-relayer-worker',
      async buildStart() {
        await copyZamaAssets();
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../src/lib'),
      '@screens': resolve(__dirname, '../src/screens'),
      '@components': resolve(__dirname, '../src/components'),
      '@hooks': resolve(__dirname, '../src/hooks'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: relayerDevProxy,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    port: 5174,
    strictPort: true,
    proxy: relayerDevProxy,
  },
  build: {
    outDir: resolve(__dirname, '../companion-dist'),
    emptyOutDir: true,
  },
});
