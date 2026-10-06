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
    .item { margin-top:8px; padding:10px; border:1px solid #e8eaf1; border-radius:10px; }
    .title { margin:0 0 3px; font-weight:650; overflow-wrap:anywhere; }
    .username { margin:0 0 9px; color:#7b8496; font-size:12px; overflow-wrap:anywhere; }
    button { width:100%; padding:8px 10px; border:0; border-radius:8px; color:white; background:#5468e8; font:inherit; font-weight:600; cursor:pointer; }
    button:hover { background:#4356d4; }
    button.secondary { color:#4659d4; background:#eef0ff; }
    button + button { margin-top:7px; }
    .footer { margin:11px 0 0; color:#8a92a2; font-size:10px; line-height:1.4; }
  `;
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "密碼庫登入建議");
  shadow.append(style, panel);

  let activeField = null;
  let requestSequence = 0;
  let lastLookupAt = 0;

  const sendMessage = (message) => {
    if (typeof browser !== "undefined")
      return browser.runtime.sendMessage(message);

    return new Promise((resolve, reject) => {
    extensionApi.runtime.sendMessage(message, (response) => {
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

    for (const credential of options.credentials || []) {
      const item = document.createElement("article");
      item.className = "item";
      const itemTitle = document.createElement("p");
      itemTitle.className = "title";
      itemTitle.textContent = credential.title || "未命名項目";
      const username = document.createElement("p");
      username.className = "username";
      username.textContent = credential.username || "未儲存使用者名稱";
      const fill = document.createElement("button");
      fill.type = "button";
      fill.textContent = "填入此帳號";
      fill.addEventListener("mousedown", event => event.preventDefault());
      fill.addEventListener("click", async () => {
        fill.disabled = true;
        try {
          const response = await sendMessage({
            type: "request-fill",
            entryId: credential.id,
            url: location.origin
          });
          if (!response?.ok)
            show("密碼庫已鎖定或無法填入，請重新點選登入欄。", { error: true });
        } catch {
          show("無法從本機密碼庫取得密碼。", { error: true });
        }
      });
      item.append(itemTitle, username, fill);
      panel.append(item);
    }

    if (options.locked) {
      const unlock = document.createElement("button");
      unlock.className = "secondary";
      unlock.type = "button";
      unlock.textContent = "在密碼庫視窗解鎖";
      unlock.addEventListener("mousedown", event => event.preventDefault());
      unlock.addEventListener("click", openUnlockWindow);
      panel.append(unlock);
    }
    const footer = document.createElement("p");
    footer.className = "footer";
    footer.textContent = "僅比對目前網站網域。選擇帳號後才會填入，不會自動送出。";
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

  async function openUnlockWindow() {
    try {
      const response = await sendMessage({
        type: "open-unlock",
        url: location.origin
      });
      if (!response?.ok)
        show("無法開啟密碼庫解鎖視窗。", { error: true });
    } catch {
      show("無法開啟密碼庫解鎖視窗。", { error: true });
    }
  }

  async function lookup() {
    const sequence = ++requestSequence;
    try {
      const response = await sendMessage({ type: "lookup", url: location.origin });
      if (sequence !== requestSequence || !activeField?.isConnected)
        return;
      if (response?.ok) {
        if (response.credentials?.length)
          show(`找到 ${response.credentials.length} 筆符合的帳號。`, { credentials: response.credentials });
        else
          show("這個網站目前沒有符合的密碼。");
      } else if (response?.error === "vault_locked") {
        show("密碼庫已鎖定。可在獨立視窗輸入主密碼解鎖。", { locked: true });
      } else if (response?.error === "vault_unavailable") {
        show("密碼庫程式未在背景執行，請先啟動密碼庫。", { error: true });
      } else if (response?.error === "insecure_origin") {
        show("為保護密碼，只能在 HTTPS 網站使用（localhost 除外）。", { error: true });
      } else if (response?.error === "vault_not_created") {
        show("尚未建立密碼庫，請先開啟密碼庫程式完成設定。", { error: true });
      } else {
        show("密碼庫無法處理目前網站。", { error: true });
      }
    } catch {
      if (sequence === requestSequence)
        show("無法連線到本機密碼庫。請確認密碼庫正在背景執行。", { error: true });
    }
  }

  function scheduleLookup(field) {
    activeField = field;
    const now = Date.now();
    if (now - lastLookupAt < 350)
      return;
    lastLookupAt = now;
    show("正在查詢符合的登入資料…");
    void lookup();
  }

  document.addEventListener("focusin", event => {
    const target = event.target;
    if (isLoginField(target)) {
      scheduleLookup(target);
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

    if (message?.type === "vault-unlocked") {
      lastLookupAt = 0;
      if (activeField?.isConnected)
        void lookup();
    }
    return false;
  });
})();
