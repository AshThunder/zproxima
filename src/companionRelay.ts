/** Relays extension → companion tab actions (injected on localhost companion pages). */
import { BRIDGE_ACTION_EVENT } from './lib/storageKeys';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'BRIDGE_RUN_ACTION') {
    window.dispatchEvent(new CustomEvent(BRIDGE_ACTION_EVENT, { detail: message }));
    sendResponse({ ok: true, delivered: true });
    return true;
  }
  return false;
});
