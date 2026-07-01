import { handleExternalBridgeMessage } from './lib/externalBridge';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  void handleExternalBridgeMessage(message as Record<string, unknown>, {
    tabId: sender.tab?.id,
  })
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  return true;
});
