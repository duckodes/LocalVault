"use strict";

(() => {
  if (window.top !== window || !["http:", "https:"].includes(location.protocol))
    return;

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
  const host = document.createElement("div");
  host.setAttribute("aria-label", "密碼庫自動填入");
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;display:none;";
  (document.documentElement || document).append(host);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel { width: 320px; max-height: 360px; overflow: auto; box-sizing: border-box; padding: 14px; border: 1px solid #e3e7f0; border-radius: 14px; background: #fff; color: #172033; box-shadow: 0 12px 38px rgba(23,32,51,.2); font: 14px "Segoe UI","Microsoft JhengHei",sans-serif; }
    .header { display:flex; align-items:center; gap:9px; margin-bottom:9px; }
    .mark { display:grid; width:30px; height:30px; place-items:center; border-radius:9px; color:white; background:#5468e8; font-size:15px; }
    .heading { margin:0; font-size:14px; font-weight:700; }
    .site { margin:2px 0 0; color:#7b8496; font-size:11px; overflow-wrap:anywhere; }
    .status { margin:10px 0; color:#59657c; line-height:1.45; overflow-wrap:anywhere; }
    .error { color:#b63848; }
    button { width:100%; padding:8px 10px; border:0; border-radius:8px; color:white; background:#5468e8; font:inherit; font-weight:600; cursor:pointer; }
    button:hover { background:#4356d4; }
    .footer { margin:11px 0 0; color:#8a92a2; font-size:10px; line-height:1.4; }
  `;
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "密碼庫登入建議");
  shadow.append(style, panel);

  let activeField = null;
  const sendMessage = (message) => {
    if (typeof browser !== "undefined")
      return browser.runtime.sendMessage(message);

    return new Promise((resolve, reject) => {
      extensionApi.runtime.sendMessage(message, response => {
        const error = extensionApi.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      });
    });
  };

  function positionPanel(field) {
    const rect = field.getBoundingClientRect();
    const width = 320;
    const height = Math.min(panel.scrollHeight || 230, 360);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8)
      top = Math.max(8, rect.top - height - 8);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  function isSecureOrigin() {
    return location.protocol === "https:"
      || (location.protocol === "http:"
        && (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]"));
  }

  function show(message, options = {}) {
    const title = document.createElement("p");
    title.className = "heading";
    title.textContent = "密碼庫";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = "🔒";
    const head = document.createElement("div");
    head.className = "header";
    const headText = document.createElement("div");
    const site = document.createElement("p");
    site.className = "site";
    site.textContent = location.hostname;
    headText.append(title, site);
    head.append(mark, headText);
    const status = document.createElement("p");
    status.className = `status${options.error ? " error" : ""}`;
    status.textContent = message;
    panel.replaceChildren(head, status);

    if (options.selectionButton) {
      const select = document.createElement("button");
      select.type = "button";
      select.textContent = "在主程式選擇登入資料";
      select.addEventListener("mousedown", event => event.preventDefault());
      select.addEventListener("click", requestCredentialSelection);
      panel.append(select);
    }
    const footer = document.createElement("p");
    footer.className = "footer";
    footer.textContent = "帳號僅會在你於主程式選定後傳送到擴充套件填入；不會自動送出。";
    panel.append(footer);
    host.style.display = "block";
    positionPanel(activeField || document.activeElement);
  }

  function hide() {
    host.style.display = "none";
    panel.replaceChildren();
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden"
      && rect.width > 0 && rect.height > 0 && !element.disabled;
  }

  function isLoginField(element) {
    if (!(element instanceof HTMLInputElement) || !isVisible(element))
      return false;
    if (element.type === "password")
      return element.autocomplete !== "new-password";
    if (["text", "email", "tel"].includes(element.type) && element.form
      && Array.from(element.form.querySelectorAll('input[type="password"]')).some(isVisible))
      return true;
    return ["text", "email", "tel"].includes(element.type)
      && (element.autocomplete === "username"
        || /user|email|login|account/i.test(`${element.name} ${element.id} ${element.autocomplete}`));
  }

  function findLoginFields(field) {
    const scope = field.form || document;
    const inputs = Array.from(scope.querySelectorAll("input")).filter(isVisible);
    const password = inputs.find(input => input.type === "password" && input.autocomplete !== "new-password");
    const username = inputs.find(input => input !== password
      && ["text", "email", "tel"].includes(input.type)
      && (input.autocomplete === "username"
        || /user|email|login|account/i.test(`${input.name} ${input.id} ${input.autocomplete}`)));
    return { password, username };
  }

  function setValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillCredential(credential) {
    if (location.protocol !== "https:" && location.hostname !== "localhost"
      && location.hostname !== "127.0.0.1" && location.hostname !== "[::1]") {
      show("為保護密碼，只能在 HTTPS 網站填入（localhost 除外）。", { error: true });
      return false;
    }
    if (!activeField || !activeField.isConnected || !isVisible(activeField)) {
      show("登入欄位已變更，請重新點選欄位。", { error: true });
      return false;
    }
    const fields = findLoginFields(activeField);
    if (fields.username) setValue(fields.username, credential.username || "");
    if (fields.password) setValue(fields.password, credential.password || "");
    if (!fields.username && !fields.password) {
      show("找不到可用的登入欄位，請重新選擇。", { error: true });
      return false;
    }
    show(fields.password
      ? (fields.username ? "帳號與密碼已填入，請確認後自行登入。" : "密碼已填入；未找到明確帳號欄位。")
      : "帳號已填入；請再選擇密碼欄以填入密碼。");
    setTimeout(hide, 3500);
    return true;
  }

  async function requestCredentialSelection(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await sendMessage({
        type: "request-selection",
        url: location.origin
      });
      if (!response?.ok) {
        show(getSelectionError(response?.error), { error: true, selectionButton: true });
        return;
      }
    } catch {
      show("無法連線到密碼庫主程式。請確認瀏覽器橋接已安裝。", { error: true, selectionButton: true });
    }
  }

  function getSelectionError(error) {
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
      return "找不到可用的登入欄位；請先重新點選登入欄位。";
    return "密碼庫主程式無法完成選擇。請確認密碼庫已解鎖。";
  }

  function showPrompt(field) {
    activeField = field;
    if (!isSecureOrigin()) {
      show("為保護密碼，只能在 HTTPS 網站使用（localhost 除外）。", { error: true });
      return;
    }
    show("按下按鈕後，主程式才會顯示符合此網站的登入資料。", { selectionButton: true });
  }

  document.addEventListener("focusin", event => {
    const target = event.target;
    if (isLoginField(target)) {
      showPrompt(target);
    } else if (!host.contains(target)) {
      hide();
    }
  }, true);

  document.addEventListener("pointerdown", event => {
    if (host.contains(event.target))
      return;
    if (event.target !== activeField && !host.contains(event.target))
      hide();
  }, true);

  window.addEventListener("scroll", () => {
    if (host.style.display !== "none" && activeField)
      positionPanel(activeField);
  }, true);
  window.addEventListener("resize", () => {
    if (host.style.display !== "none" && activeField)
      positionPanel(activeField);
  });
  window.addEventListener("pagehide", hide, { once: true });

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "fill-credential") {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(message.url).origin === location.origin;
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin) {
        sendResponse({ ok: false });
        return false;
      }
      sendResponse({ ok: fillCredential(message.credential) });
      return false;
    }

    return false;
  });
})();
