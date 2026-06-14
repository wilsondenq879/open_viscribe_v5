chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

const FEATURE_DEFAULTS = {
  clickRippleEnabled: false,
  pageDebugEnabled: false
};

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(Array.isArray(tabs) ? tabs : []));
  });
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (value) => resolve(value || {}));
  });
}

function setStorage(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, resolve);
  });
}

function executeScript(details) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(details, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function isInjectableUrl(url) {
  return /^(https?|file):/i.test(String(url || ''));
}

async function injectOpenViscribeScripts(tabId, options = {}) {
  const { includePageDebug = false, includeClickRipple = false } = options;

  if (!tabId) return;

  if (includePageDebug) {
    await executeScript({
      target: { tabId, allFrames: true },
      files: ['page-debug-bridge.js'],
      world: 'MAIN'
    });
  }

  if (includeClickRipple || includePageDebug) {
    await executeScript({
      target: { tabId, allFrames: true },
      files: ['click-ripple-content.js']
    });
  }
}

async function injectAcrossTabs(options = {}) {
  const tabs = await queryTabs({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id && isInjectableUrl(tab.url))
      .map((tab) => injectOpenViscribeScripts(tab.id, options))
  );
}

async function setClickRippleEnabled(enabled) {
  const nextEnabled = !!enabled;
  await setStorage({ clickRippleEnabled: nextEnabled });
  if (nextEnabled) {
    await injectAcrossTabs({ includeClickRipple: true });
  }
}

async function setPageDebugEnabled(enabled, options = {}) {
  const nextEnabled = !!enabled;
  const injectAllTabs = !!options.injectAllTabs;
  await setStorage({ pageDebugEnabled: nextEnabled });
  if (!nextEnabled) return;

  if (injectAllTabs) {
    await injectAcrossTabs({ includePageDebug: true });
    return;
  }

  const [activeTab] = await queryTabs({ active: true, lastFocusedWindow: true });
  if (activeTab?.id && isInjectableUrl(activeTab.url)) {
    await injectOpenViscribeScripts(activeTab.id, { includePageDebug: true });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void getStorage(FEATURE_DEFAULTS).then((state) => {
    void setStorage(state);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.clickRippleEnabled?.newValue) {
    void injectAcrossTabs({ includeClickRipple: true });
  }
  if (changes.pageDebugEnabled?.newValue) {
    void injectAcrossTabs({ includePageDebug: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;

  if (message.type === 'set-click-ripple-enabled') {
    void setClickRippleEnabled(message.enabled)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === 'set-page-debug-enabled') {
    void setPageDebugEnabled(message.enabled, { injectAllTabs: message.injectAllTabs })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return undefined;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.pendingUrl || tab.url || '';
  if (changeInfo.status !== 'loading' || !isInjectableUrl(targetUrl)) return;

  void getStorage(FEATURE_DEFAULTS).then((state) => {
    if (state.pageDebugEnabled) {
      return injectOpenViscribeScripts(tabId, { includePageDebug: true });
    }
    if (state.clickRippleEnabled) {
      return injectOpenViscribeScripts(tabId, { includeClickRipple: true });
    }
    return Promise.resolve();
  });
});
