chrome.runtime.onInstalled.addListener(() => {
  console.log('[Portfolio Pulse] extension initialized');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as { type?: string; url?: string };
  if (request.type !== 'fetch-text' || typeof request.url !== 'string') {
    return undefined;
  }
  const url = request.url;

  void (async () => {
    try {
      const response = await fetch(url);
      const text = await response.text();
      sendResponse({
        ok: response.ok,
        status: response.status,
        text,
      });
    } catch (error) {
      sendResponse({
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  })();

  return true;
});
