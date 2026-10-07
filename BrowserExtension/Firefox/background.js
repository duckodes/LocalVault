"use strict";

const hostName = "com.localvault.passwords";
const extensionApi = typeof browser !== "undefined" ? browser : chrome;

function sendToNative(message) {
  if (typeof browser !== "undefined")
    return browser.runtime.sendNativeMessage(hostName, message);

  return new Promise((resolve, reject) => {
    extensionApi.runtime.sendNativeMessage(hostName, message, response => {
      const error = extensionApi.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function sendTabMessage(tabId, message) {
  if (typeof browser !== "undefined")
    return browser.tabs.sendMessage(tabId, message).catch(() => null);

  return new Promise(resolve => {
    extensionApi.tabs.sendMessage(tabId, message, response => {
      const error = extensionApi.runtime.lastError;
      resolve(error ? null : response);
    });
  });
}

function getTab(tabId) {
  if (typeof browser !== "undefined")
    return browser.tabs.get(tabId);

  return new Promise((resolve, reject) => {
    extensionApi.tabs.get(tabId, tab => {
      const error = extensionApi.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(tab);
    });
  });
}

async function getRequestUrl(sender, tabId = sender.tab?.id) {
  let candidate = sender.tab?.url;
  if (!candidate && sender.url && !sender.url.startsWith(extensionApi.runtime.getURL("")))
    candidate = sender.url;
  if (!candidate && Number.isInteger(tabId)) {
    const tab = await getTab(tabId);
    candidate = tab?.url;
  }
  try {
    const url = new URL(candidate || "");
    if (url.protocol === "http:" || url.protocol === "https:")
      return url.origin;
  } catch {
  }
  return "";
}

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "request-selection") return false;

  const tabId = Number.isInteger(message.tabId) ? message.tabId : sender.tab?.id;
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, error: "invalid_tab" });
    return false;
  }

  (async () => {
    const url = await getRequestUrl(sender, tabId);
    if (!url)
      return { ok: false, error: "invalid_origin" };

    const response = await sendToNative({ type: "select-credential", url });
    if (!response?.ok || !response.credential)
      return response || { ok: false, error: "selection_failed" };

    const tab = await getTab(tabId);
    let currentOrigin = "";
    try {
      currentOrigin = new URL(tab.url).origin;
    } catch {
    }
    if (currentOrigin !== url)
      return { ok: false, error: "page_changed" };

    const result = await sendTabMessage(tabId, {
      type: "fill-credential",
      credential: response.credential,
      url
    });
    return result?.ok ? { ok: true } : { ok: false, error: "fill_failed" };
  })()
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: "vault_unavailable" }));
  return true;
});
