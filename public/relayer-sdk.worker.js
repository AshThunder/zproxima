(function() {
	//#region src/utils/assertions.ts
	function assertObject(value, context) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${context} must be an object, got ${typeof value}`);
	}
	function assertString(value, context) {
		if (typeof value !== "string") throw new TypeError(`${context} must be a string, got ${typeof value}`);
	}
	function assertFunction(value, context) {
		if (typeof value !== "function") throw new TypeError(`${context} must be a function, got ${typeof value}`);
	}
	/** Assert that `obj[key]` is a string. Narrows `obj` to include `{ [key]: string }`. */
	function assertStringProp(obj, key, context) {
		assertString(obj[key], context);
	}
	/** Assert that `obj[key]` is a function. Narrows `obj` to include `{ [key]: F }`. */
	function assertFunctionProp(obj, key, context) {
		assertFunction(obj[key], context);
	}
	function assertCondition(condition, message) {
		if (!condition) throw new TypeError(message);
	}
	//#endregion
	//#region src/utils/hex.ts
	/** Normalize a un-prefixed hex payload to a 0x-prefixed `Hex` value. */
	function prefixHex(value) {
		return value.startsWith("0x") ? value : `0x${value}`;
	}
	/** Convert a public `Hex` value back an unprefixed format. */
	function unprefixHex(value) {
		assertCondition(value.startsWith("0x"), `Expected 0x-prefixed hex, got: ${value}`);
		return value.slice(2);
	}
	//#endregion
	//#region src/worker/browser-extension.ts
	function isValidRuntime(runtime) {
		try {
			assertObject(runtime, "runtime");
			assertStringProp(runtime, "id", "runtime.id");
			assertFunctionProp(runtime, "getURL", "runtime.getURL");
			return true;
		} catch {
			return false;
		}
	}
	/**
	* Return the browser extension runtime object, or `undefined` outside extensions.
	* Works across Chrome/Edge (`chrome.runtime`) and Firefox/Safari (`browser.runtime`).
	* Extensions have restricted CSP that blocks `blob:` URLs, so callers use
	* this to detect the environment and resolve file URLs via `runtime.getURL`.
	*/
	function getBrowserExtensionRuntime() {
		const g = globalThis;
		for (const ns of [g.chrome, g.browser]) try {
			assertObject(ns, "ns");
			if (isValidRuntime(ns.runtime)) return ns.runtime;
		} catch {
			continue;
		}
	}
	//#endregion
	//#region src/worker/relayer-sdk.worker.ts
	const instances = /* @__PURE__ */ new Map();
	const pending = /* @__PURE__ */ new Map();
	const configs = /* @__PURE__ */ new Map();
	/** Convert an FheChain to the FhevmInstanceConfig shape expected by createInstance. */
	function toInstanceConfig(chain) {
		return {
			...chain,
			chainId: chain.id
		};
	}
	let sdkGlobal = null;
	/**
	* Get or lazily create an FhevmInstance for the given chain.
	*/
	async function getInstance(chainId) {
		const existing = instances.get(chainId);
		if (existing) return existing;
		const inflight = pending.get(chainId);
		if (inflight) return inflight;
		const config = configs.get(chainId);
		if (!config) throw new Error(`No config for chain ${chainId}. Available: [${[...configs.keys()].join(", ")}]`);
		if (!sdkGlobal) throw new Error("Relayer SDK is not initialized. Call INIT first.");
		console.error("[Worker] createInstance starting for chain", chainId);
		const promise = sdkGlobal.createInstance({
			...toInstanceConfig(config),
			batchRpcCalls: false
		}).then((instance) => {
			instances.set(chainId, instance);
			pending.delete(chainId);
			return instance;
		}).catch((err) => {
			pending.delete(chainId);
			throw err;
		});
		pending.set(chainId, promise);
		return promise;
	}
	function unreachableFheType(_) {
		throw new Error("Unsupported FHE type");
	}
	const relayerUrls = /* @__PURE__ */ new Set();
	let csrfTokenBase = "";
	const CSRF_HEADER_NAME = "x-csrf-token";
	const MUTATING_METHODS = /* @__PURE__ */ new Set([
		"POST",
		"PUT",
		"DELETE",
		"PATCH"
	]);
	/**
	* Register relayer URLs from chain configs for fetch interception.
	*/
	function registerRelayerUrls(chainConfigs) {
		for (const c of chainConfigs) if (c.relayerUrl) relayerUrls.add(c.relayerUrl);
	}
	/**
	* Send a success response back to the main thread.
	* Optionally transfers ArrayBuffers for zero-copy performance.
	*/
	function sendSuccess(id, type, data, transfer) {
		const response = {
			id,
			type,
			success: true,
			data
		};
		return transfer ? self.postMessage(response, transfer) : self.postMessage(response);
	}
	/**
	* Send an error response back to the main thread.
	*/
	function sendError(id, type, error, statusCode) {
		const response = {
			id,
			type,
			success: false,
			error
		};
		if (statusCode !== void 0) response.statusCode = statusCode;
		self.postMessage(response);
	}
	const originalFetch = fetch;
	/** Allowed CDN hostnames for loading the relayer SDK script. */
	const ALLOWED_CDN_HOSTS = /* @__PURE__ */ new Set(["cdn.zama.org"]);
	/**
	* Validate the CDN URL supplied by the caller.
	* Ensures only HTTPS URLs from approved hosts are used when loading
	* SDK code into the worker.
	*/
	function validateCdnUrl(rawUrl) {
		let url;
		try {
			url = new URL(rawUrl);
		} catch {
			throw new Error("Invalid CDN URL");
		}
		if (url.protocol !== "https:") throw new Error("CDN URL must use https");
		if (!ALLOWED_CDN_HOSTS.has(url.hostname)) throw new Error(`CDN URL host is not allowed: ${url.hostname}`);
		return url.toString();
	}
	/**
	* Set up fetch interceptor to add credentials and CSRF token for relayer requests.
	* Workers don't automatically include cookies, so we intercept fetch calls
	* targeting our relayer proxy to inject credentials and CSRF headers.
	*/
	function setupFetchInterceptor() {
		globalThis.fetch = async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const method = init?.method?.toUpperCase() ?? "GET";
			if (relayerUrls.size > 0 && [...relayerUrls].some((base) => url.startsWith(base))) {
				const headers = new Headers(init?.headers);
				if (MUTATING_METHODS.has(method) && csrfTokenBase) headers.set(CSRF_HEADER_NAME, csrfTokenBase);
				return originalFetch(input, {
					...init,
					headers,
					credentials: (self.location?.href ?? "").includes("-extension:") ? "same-origin" : "include"
				});
			}
			return originalFetch(input, init);
		};
	}
	/**
	* Verify a fetched script's SHA-384 hash matches the expected integrity value.
	*/
	async function verifyIntegrity(content, expectedHash) {
		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.digest("SHA-384", encoder.encode(content));
		const hashHex = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
		if (hashHex !== expectedHash) throw new Error(`CDN integrity check failed: expected SHA-384 ${expectedHash}, got ${hashHex}`);
	}
	/**
	* Load SDK script from CDN.
	* Uses two strategies depending on the environment:
	* - **Web apps (default):** fetch + blob URL + importScripts. Avoids MIME-type
	*   rejections (some CDNs serve .cjs as `application/node`) and CSP
	*   `unsafe-eval` violations.
	* - **Browser extensions (Chrome/Firefox/Safari):** importScripts directly.
	*   Blob URLs are blocked by extension CSP, but the CDN must be allowed
	*   in the extension's manifest CSP.
	*
	* Integrity is always verified when a hash is provided, regardless of strategy.
	*/
	async function fetchScript(cdnUrl) {
		const response = await originalFetch(cdnUrl);
		if (!response.ok) throw new Error(`Failed to fetch SDK: ${response.status} ${response.statusText}`);
		return response.text();
	}
	async function loadSdkScript(cdnUrl, integrity) {
		const href = self.location?.href ?? "";
		try {
			return self.importScripts(new URL("relayer-sdk-js.umd.js", href).href);
		} catch (e) {
			console.error("[Worker] Failed to load local UMD, falling back:", e);
		}
		const runtime = getBrowserExtensionRuntime();
		if (runtime) return self.importScripts(runtime.getURL("relayer-sdk-js.umd.js"));
		const validatedUrl = validateCdnUrl(cdnUrl);
		const scriptContent = await fetchScript(validatedUrl);
		if (integrity) await verifyIntegrity(scriptContent, integrity);
		const blob = new Blob([scriptContent], { type: "application/javascript" });
		const blobUrl = URL.createObjectURL(blob);
		try {
			self.importScripts(blobUrl);
		} finally {
			URL.revokeObjectURL(blobUrl);
		}
	}
	/**
	* Handle INIT request - load SDK WASM and register chain configs (instances are lazy).
	*/
	async function handleInit(request) {
		const { id, type, payload } = request;
		try {
			if (payload.env !== "web") throw new Error(`Web worker received unexpected env: ${payload.env}`);
			const { cdnUrl, csrfToken, integrity, thread } = payload;
			csrfTokenBase = csrfToken;
			setupFetchInterceptor();
			await loadSdkScript(cdnUrl, integrity);
			if (!self.relayerSDK) throw new Error("Failed to load relayerSDK from CDN");
			sdkGlobal = self.relayerSDK;
			await (async () => {
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
		})();
			registerRelayerUrls(payload.chains);
			for (const chain of payload.chains) configs.set(chain.id, chain);
			sendSuccess(id, type, { initialized: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
			const detail = cause ? message + ": " + cause : message;
			console.error("[Worker] Init error:", detail, error);
			sendError(id, type, detail);
		}
	}
	/** Coerce a boolean to bigint for numeric FHE types. */
	function toBigInt(value) {
		return typeof value === "boolean" ? value ? 1n : 0n : value;
	}
	/**
	* Add a single typed value to the encrypted input builder.
	*/
	function addTypedValue(input, entry) {
		const { value, type: fheType } = entry;
		switch (fheType) {
			case "ebool":
				input.addBool(typeof value === "boolean" ? value : value !== 0n);
				break;
			case "euint8":
				input.add8(toBigInt(value));
				break;
			case "euint16":
				input.add16(toBigInt(value));
				break;
			case "euint32":
				input.add32(toBigInt(value));
				break;
			case "euint64":
				input.add64(toBigInt(value));
				break;
			case "euint128":
				input.add128(toBigInt(value));
				break;
			case "euint256":
				input.add256(toBigInt(value));
				break;
			case "eaddress":
				input.addAddress(value);
				break;
			default: unreachableFheType(fheType);
		}
	}
	/**
	* Handle ENCRYPT request.
	*/
	async function handleEncrypt(request) {
		const { id, type, payload } = request;
		const { values, contractAddress, userAddress } = payload;
		try {
			const input = (await getInstance(payload.chainId)).createEncryptedInput(contractAddress, userAddress);
			for (const entry of values) addTypedValue(input, entry);
			const encrypted = await input.encrypt();
			sendSuccess(id, type, {
				handles: encrypted.handles,
				inputProof: encrypted.inputProof
			}, [encrypted.inputProof.buffer, ...encrypted.handles.map((h) => h.buffer)]);
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Handle USER_DECRYPT request.
	*/
	async function handleUserDecrypt(request) {
		const { id, type, payload } = request;
		try {
			const instance = await getInstance(payload.chainId);
			const handleContractPairs = payload.encryptedValues.map((encryptedValue) => ({
				handle: encryptedValue,
				contractAddress: payload.contractAddress
			}));
			sendSuccess(id, type, { clearValues: await instance.userDecrypt(handleContractPairs, unprefixHex(payload.privateKey), unprefixHex(payload.publicKey), payload.signature, payload.signedContractAddresses, payload.signerAddress, payload.startTimestamp, payload.durationDays) });
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Extract an HTTP status code from an error, if present.
	* Relayer SDK errors may carry a `status` or `statusCode` property.
	*/
	function extractHttpStatus(error) {
		if (error === null || error === void 0 || typeof error !== "object") return;
		const e = error;
		if (typeof e.statusCode === "number") return e.statusCode;
		if (typeof e.status === "number") return e.status;
		if (e.cause !== null && e.cause !== void 0 && typeof e.cause === "object") {
			const cause = e.cause;
			if (typeof cause.statusCode === "number") return cause.statusCode;
			if (typeof cause.status === "number") return cause.status;
		}
	}
	/**
	* Handle PUBLIC_DECRYPT request.
	*/
	async function handlePublicDecrypt(request) {
		const { id, type, payload } = request;
		try {
			sendSuccess(id, type, { ...await (await getInstance(payload.chainId)).publicDecrypt(payload.encryptedValues) });
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Handle GENERATE_KEYPAIR request.
	*/
	async function handleGenerateKeypair(request) {
		const { id, type, payload } = request;
		try {
			const keypair = (await getInstance(payload.chainId)).generateKeypair();
			sendSuccess(id, type, {
				publicKey: prefixHex(keypair.publicKey),
				privateKey: prefixHex(keypair.privateKey)
			});
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error));
		}
	}
	/**
	* Handle CREATE_EIP712 request.
	*/
	async function handleCreateEIP712(request) {
		const { id, type, payload } = request;
		try {
			sendSuccess(id, type, (await getInstance(payload.chainId)).createEIP712(unprefixHex(payload.publicKey), payload.contractAddresses, payload.startTimestamp, payload.durationDays));
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error));
		}
	}
	/**
	* Handle CREATE_DELEGATED_EIP712 request.
	*/
	async function handleCreateDelegatedEIP712(request) {
		const { id, type, payload } = request;
		try {
			sendSuccess(id, type, (await getInstance(payload.chainId)).createDelegatedUserDecryptEIP712(unprefixHex(payload.publicKey), payload.contractAddresses, payload.delegatorAddress, payload.startTimestamp, payload.durationDays));
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error));
		}
	}
	/**
	* Handle DELEGATED_USER_DECRYPT request.
	*/
	async function handleDelegatedUserDecrypt(request) {
		const { id, type, payload } = request;
		try {
			const instance = await getInstance(payload.chainId);
			const handleContractPairs = payload.encryptedValues.map((encryptedValue) => ({
				handle: encryptedValue,
				contractAddress: payload.contractAddress
			}));
			sendSuccess(id, type, { clearValues: await instance.delegatedUserDecrypt(handleContractPairs, unprefixHex(payload.privateKey), unprefixHex(payload.publicKey), payload.signature, payload.signedContractAddresses, payload.delegatorAddress, payload.delegateAddress, payload.startTimestamp, payload.durationDays) });
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Handle REQUEST_ZK_PROOF_VERIFICATION request.
	*/
	async function handleRequestZKProofVerification(request) {
		const { id, type, payload } = request;
		try {
			const result = await (await getInstance(payload.chainId)).requestZKProofVerification(payload.zkProof);
			sendSuccess(id, type, result, [result.inputProof.buffer, ...result.handles.map((h) => h.buffer)]);
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Handle GET_PUBLIC_KEY request.
	*/
	async function handleGetPublicKey(request) {
		const { id, type, payload } = request;
		try {
			sendSuccess(id, type, { result: (await getInstance(payload.chainId)).getPublicKey() });
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Handle GET_PUBLIC_PARAMS request.
	*/
	async function handleGetPublicParams(request) {
		const { id, type, payload } = request;
		try {
			sendSuccess(id, type, { result: (await getInstance(payload.chainId)).getPublicParams(payload.bits) });
		} catch (error) {
			sendError(id, type, error instanceof Error ? error.message : String(error), extractHttpStatus(error));
		}
	}
	/**
	* Handle UPDATE_CSRF request - update the stored CSRF token.
	*/
	function handleUpdateCsrf(request) {
		const { id, type, payload } = request;
		csrfTokenBase = payload.csrfToken;
		sendSuccess(id, type, { updated: true });
	}
	/**
	* Main message handler.
	*/
	self.onmessage = async (event) => {
		const request = event.data;
		try {
			switch (request.type) {
				case "INIT":
					await handleInit(request);
					break;
				case "UPDATE_CSRF":
					handleUpdateCsrf(request);
					break;
				case "ENCRYPT":
					await handleEncrypt(request);
					break;
				case "USER_DECRYPT":
					await handleUserDecrypt(request);
					break;
				case "PUBLIC_DECRYPT":
					await handlePublicDecrypt(request);
					break;
				case "GENERATE_KEYPAIR":
					await handleGenerateKeypair(request);
					break;
				case "CREATE_EIP712":
					await handleCreateEIP712(request);
					break;
				case "CREATE_DELEGATED_EIP712":
					await handleCreateDelegatedEIP712(request);
					break;
				case "DELEGATED_USER_DECRYPT":
					await handleDelegatedUserDecrypt(request);
					break;
				case "REQUEST_ZK_PROOF_VERIFICATION":
					await handleRequestZKProofVerification(request);
					break;
				case "GET_PUBLIC_KEY":
					await handleGetPublicKey(request);
					break;
				case "GET_PUBLIC_PARAMS":
					await handleGetPublicParams(request);
					break;
				default: throw new Error(`Unknown request type: ${request.type}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendError(request?.id ?? "unknown", request?.type ?? "UNKNOWN", message);
		}
	};
	//#endregion
})();
