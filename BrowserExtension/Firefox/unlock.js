"use strict";

const extensionApi = typeof browser !== "undefined" ? browser : chrome;
const parameters = new URLSearchParams(location.search);
const tabId = Number(parameters.get("tabId"));
const targetUrl = parameters.get("url") || "";
const siteElement = document.getElementById("site");
const statusElement = document.getElementById("status");
const passwordInput = document.getElementById("master-password");
const unlockButton = document.getElementById("unlock-button");

try {
  siteElement.textContent = new URL(targetUrl).hostname;
} catch {
  siteElement.textContent = "未知網站";
}

function sendUnlock(message) {
  if (typeof browser !== "undefined")
    return browser.runtime.sendMessage(message);

  return new Promise((resolve, reject) => {
    extensionApi.runtime.sendMessage(message, response => {
      const error = extensionApi.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

document.getElementById("unlock-form").addEventListener("submit", async event => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!password) return;
  unlockButton.disabled = true;
  statusElement.textContent = "正在解鎖本機密碼庫…";
  let response;
  try {
    response = await sendUnlock({ type: "unlock", password, tabId });
  } catch {
    response = { ok: false, error: "vault_unavailable" };
  } finally {
    passwordInput.value = "";
  }

  if (response?.ok) {
    statusElement.textContent = "密碼庫已解鎖，正在回到網站…";
    window.close();
    return;
  }
  if (response?.error === "invalid_password") {
    statusElement.textContent = "主密碼錯誤，請再試一次。";
  } else if (response?.error === "unlock_throttled") {
    statusElement.textContent = "嘗試次數過多，請稍後再試。";
    unlockButton.disabled = true;
    return;
  } else if (response?.error === "vault_not_created") {
    statusElement.textContent = "尚未建立密碼庫，請先開啟密碼庫程式完成設定。";
  } else {
    statusElement.textContent = "密碼庫目前無法解鎖。請確認密碼庫程式正在背景執行。";
  }
  unlockButton.disabled = false;
  passwordInput.focus();
});
