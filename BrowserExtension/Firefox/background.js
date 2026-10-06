"use strict";

const hostName = "com.localvault.passwords";
const extensionApi = typeof browser !== "undefined" ? browser : chrome;

function sendToNative(message) {
  if (typeof browser !== "undefined")
    return browser.runtime.sendNativeMessage(hostName, message);

  return new Promise((resolve, reject) => {
    extensionApi.runtime.sendNativeMessage(hostName, message, (response) => {
      const error = extensionApi.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function createWindow(url, width, height) {
  if (typeof browser !== "undefined")
    return browser.windows.create({ url, type: "popup", width, height, focused: true });

  return new Promise((resolve, reject) => {
    extensionApi.windows.create(
      { url, type: "popup", width, height, focused: true },
      (createdWindow) => {
        const error = extensionApi.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(createdWindow);
      }
    );
  });
}

function sendTabMessage(tabId, message) {
  if (typeof browser !== "undefined")
    return browser.tabs.sendMessage(tabId, message).catch(() => null);

  return new Promise((resolve) => {
    extensionApi.tabs.sendMessage(tabId, message, () => {
      const error = extensionApi.runtime.lastError;
      resolve(error ? null : true);
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

async function getRequestUrl(message, sender, tabId = sender.tab?.id) {
  let candidate = sender.tab?.url;
  if (!candidate && sender.url && !sender.url.startsWith(extensionApi.runtime.getURL("")))
    candidate = sender.url;
  if (!candidate && Number.isInteger(tabId)) {
    const tab = await getTab(tabId);
    candidate = tab?.url;
  }
  candidate ||= message.url || "";
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" || url.protocol === "https:")
      return url.origin;
  } catch {
  }
  return candidate;
}

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "lookup") {
    getRequestUrl(message, sender, message.tabId)
      .then(url => sendToNative({ type: "lookup", url }))
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: "vault_unavailable" }));
    return true;
  }

  if (message?.type === "request-fill") {
    const tabId = Number.isInteger(message.tabId) ? message.tabId : sender.tab?.id;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab" });
      return false;
    }
    getRequestUrl(message, sender, tabId)
      .then(url => sendToNative({ type: "fill", url, entryId: message.entryId }))
      .then(async response => {
        if (!response?.ok || !response.credential) {
          sendResponse(response || { ok: false, error: "fill_failed" });
          return;
        }
        const result = await sendTabMessage(tabId, {
          type: "fill-credential",
          credential: response.credential,
          url: await getRequestUrl(message, sender, tabId)
        });
        sendResponse(result?.ok ? { ok: true } : { ok: false, error: "fill_failed" });
      })
      .catch(() => sendResponse({ ok: false, error: "fill_failed" }))
    return true;
  }

  if (message?.type === "unlock") {
    sendToNative({ type: "unlock", password: message.password })
      .then(async (response) => {
        if (response?.ok && Number.isInteger(message.tabId)) {
          await sendTabMessage(message.tabId, { type: "vault-unlocked" });
        }
        sendResponse(response || { ok: false, error: "vault_unavailable" });
      })
      .catch(() => sendResponse({ ok: false, error: "vault_unavailable" }));
    return true;
  }

  if (message?.type === "open-unlock") {
    const tabId = Number.isInteger(sender.tab?.id) ? sender.tab.id : message.tabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "invalid_tab" });
      return false;
    }
    getRequestUrl(message, sender, tabId)
      .then(url => {
        const unlockUrl = extensionApi.runtime.getURL("unlock.html")
          + `?tabId=${encodeURIComponent(tabId)}&url=${encodeURIComponent(url)}`;
        return createWindow(unlockUrl, 420, 470);
      })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "window_unavailable" }));
    return true;
  }

  return false;
});
