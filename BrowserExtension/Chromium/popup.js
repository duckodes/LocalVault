"use strict";

const extensionApi = typeof browser !== "undefined" ? browser : chrome;
const statusElement = document.getElementById("status");
const siteElement = document.getElementById("site");
const actionsElement = document.getElementById("actions");

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

function isSecureOrigin(url) {
  return url.protocol === "https:"
    || (url.protocol === "http:" && url.hostname !== ""
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"));
}

async function initialize() {
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id) || !tab.url) {
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
    if (!isSecureOrigin(url)) {
      setStatus("為保護密碼，只能在 HTTPS 網站使用（localhost 除外）。", true);
      return;
    }

    setStatus("帳號只會在你於主程式選定後，才傳送到擴充套件進行填入。");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "在主程式選擇登入資料";
    button.addEventListener("click", async () => {
      button.disabled = true;
      setStatus("正在開啟主程式的網站登入選擇頁…");
      try {
        const result = await sendMessage({ type: "request-selection", tabId: tab.id });
        if (result?.ok) {
          setStatus("已填入所選帳號；請確認後自行登入。");
        } else {
          setStatus(getErrorMessage(result?.error), true);
          button.disabled = false;
        }
      } catch {
        setStatus("無法連線到密碼庫主程式。請確認瀏覽器橋接已安裝。", true);
        button.disabled = false;
      }
    });
    actionsElement.append(button);
  } catch {
    setStatus("無法確認目前網站。", true);
  }
}

function getErrorMessage(error) {
  if (error === "credential_not_found")
    return "此網站沒有符合的已儲存登入資料。";
  if (error === "selection_cancelled")
    return "已取消選擇，沒有資料傳送到網頁。";
  if (error === "selection_timeout")
    return "等待主程式解鎖逾時，請再次按下按鈕。";
  if (error === "selection_busy")
    return "另一個網站登入選擇正在處理中，請稍後再試。";
  if (error === "vault_locked")
    return "密碼庫仍處於鎖定狀態；請在主程式解鎖後重新按下按鈕。";
  if (error === "vault_unavailable")
    return "無法連線到密碼庫主程式；請確認主程式已啟動，或重新安裝瀏覽器橋接。";
  if (error === "invalid_request")
    return "瀏覽器橋接收到無效要求；請重新啟動瀏覽器後再試。";
  if (error === "bridge_not_installed")
    return "找不到瀏覽器橋接設定；請重新執行 install-browser-bridge.cmd。";
  if (error === "bridge_executable_mismatch")
    return "瀏覽器橋接版本或路徑不一致；請重新建置並安裝瀏覽器橋接。";
  if (error === "browser_process_unverified")
    return "無法確認請求由支援的瀏覽器啟動；請重新啟動瀏覽器後再試。";
  if (error === "bridge_client_unverified")
    return "無法驗證瀏覽器橋接程序；請重新啟動密碼庫與瀏覽器後再試。";
  if (error === "insecure_origin")
    return "為保護密碼，只能在 HTTPS 網站使用（localhost 除外）。";
  if (error === "vault_not_created")
    return "尚未建立密碼庫，請先開啟密碼庫程式完成設定。";
  if (error === "page_changed")
    return "目前分頁已變更，為保護密碼未填入任何資料。";
  if (error === "fill_failed")
    return "找不到可用的登入欄位；請先點選登入欄位後重試。";
  return "密碼庫主程式無法完成選擇。請確認密碼庫已解鎖。";
}

initialize();
