"use strict";

const extensionApi = typeof browser !== "undefined" ? browser : chrome;
const statusElement = document.getElementById("status");
const siteElement = document.getElementById("site");
const credentialsElement = document.getElementById("credentials");

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function sendMessage(message) {
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

function openUnlock(tabId, url) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "在密碼庫視窗解鎖";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const response = await sendMessage({ type: "open-unlock", tabId, url: new URL(url).origin });
      if (!response?.ok) throw new Error();
      setStatus("已開啟安全解鎖視窗。");
    } catch {
      setStatus("無法開啟解鎖視窗。", true);
      button.disabled = false;
    }
  });
  credentialsElement.append(button);
}

function showCredentials(tabId, url, credentials) {
  credentialsElement.replaceChildren();
  if (!credentials.length) {
    setStatus("此網站沒有完全符合的已儲存密碼。", false);
    return;
  }

  setStatus(`找到 ${credentials.length} 筆符合的登入資料。`);
  for (const credential of credentials) {
    const card = document.createElement("article");
    card.className = "credential";
    const title = document.createElement("p");
    title.className = "credential-title";
    title.textContent = credential.title || "未命名項目";
    const username = document.createElement("p");
    username.className = "credential-user";
    username.textContent = credential.username || "未儲存使用者名稱";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "填入此帳號";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await sendMessage({
          type: "request-fill",
          tabId,
          entryId: credential.id,
          url
        });
        if (!result?.ok) {
          setStatus("找不到可用的登入欄位；請先點選登入欄位。", true);
          button.disabled = false;
          return;
        }
        setStatus("已通知網頁填入；請確認後自行登入。", false);
      } catch {
        setStatus("填入失敗。請確認目前分頁未重新導向，並重試。", true);
        button.disabled = false;
      }
    });
    card.append(title, username, button);
    credentialsElement.append(card);
  }
}

async function initialize() {
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      setStatus("無法讀取目前分頁。", true);
      return;
    }
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      setStatus("自動填入只適用於一般 HTTP 或 HTTPS 網頁。", true);
      siteElement.textContent = url.hostname || "此頁不支援";
      return;
    }

    siteElement.textContent = url.hostname;
    const response = await sendMessage({ type: "lookup", url: url.origin });
    if (!response?.ok) {
      if (response?.error === "vault_locked") {
        setStatus("密碼庫已鎖定。請在網頁欄位的提示中安全解鎖。", true);
        openUnlock(tab.id, url.origin);
      } else if (response?.error === "vault_unavailable") {
        setStatus("密碼庫程式未執行，或瀏覽器橋接尚未安裝。", true);
      } else if (response?.error === "insecure_origin") {
        setStatus("為保護密碼，只能在 HTTPS 網站使用（localhost 除外）。", true);
      } else if (response?.error === "vault_not_created") {
        setStatus("尚未建立密碼庫，請先開啟密碼庫程式完成設定。", true);
      } else {
        setStatus("密碼庫無法處理這個網站要求。", true);
      }
      return;
    }
    showCredentials(tab.id, url.origin, response.credentials || []);
  } catch {
    setStatus("無法連線到密碼庫。請確認密碼庫程式正在執行，且已完成瀏覽器橋接安裝。", true);
  }
}

initialize();
