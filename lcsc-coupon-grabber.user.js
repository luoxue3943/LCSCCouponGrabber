// ==UserScript==
// @name         LCSC Coupon Grabber
// @name:zh-CN   嘉立创商城抢券助手
// @namespace    https://github.com/luoxue3943/LCSC-Coupon-Grabber
// @version      1.1.1
// @description  嘉立创商城活动页抢券助手：从上到下依次点击“立即抢券”，跳过“去使用”，每次点击间隔 1 秒，自动滚动；PLUS 专区可由用户选择是否参与。
// @author       珞雪
// @license      MIT
// @match        https://www.szlcsc.com/huodong.html*
// @run-at       document-idle
// @noframes
// @grant        none
// @homepageURL  https://github.com/luoxue3943/LCSC-Coupon-Grabber
// @supportURL   https://github.com/luoxue3943/LCSC-Coupon-Grabber/issues

// ==/UserScript==

(() => {
  "use strict";

  const APP = {
    id: "lcsc-coupon-grabber",
    name: "嘉立创抢券助手",
    version: "1.1.1",
  };

  const CONFIG = {
    targetText: "立即抢券",
    ignoreText: "去使用",
    clickIntervalMs: 1000,
    scrollIntervalMs: 700,
    scrollRatio: 0.75,
    bottomChecks: 5,
  };

  const state = {
    running: false,
    clickedCount: 0,
    includePlus: false,
    clickedElements: new WeakSet(),
    clickedCoupons: new Set(),
  };

  // 双保险：仅允许在目标活动页运行。
  if (!location.href.startsWith("https://www.szlcsc.com/huodong.html")) {
    return;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function cleanText(value) {
    return String(value || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, "")
      .trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }

    const style = getComputedStyle(el);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(el) {
    return el.disabled === true || el.getAttribute("aria-disabled") === "true";
  }

  function findCouponCard(button) {
    let current = button;

    for (let i = 0; i < 8 && current; i++) {
      const text = cleanText(current.innerText);

      if (
        text.length >= 8 &&
        text.length <= 500 &&
        (text.includes(CONFIG.targetText) || text.includes(CONFIG.ignoreText))
      ) {
        return current;
      }

      current = current.parentElement;
    }

    return button;
  }

  function getCouponFingerprint(button) {
    const card = findCouponCard(button);

    return cleanText(card.innerText)
      .replaceAll(CONFIG.targetText, "[ACTION]")
      .replaceAll(CONFIG.ignoreText, "[ACTION]")
      .slice(0, 500);
  }

  function isPlusCoupon(button) {
    const card = findCouponCard(button);
    const text = cleanText(card.innerText).toUpperCase();

    // 只根据当前优惠券卡片本身判断，避免侧边栏“PLUS专区”导致误判。
    return (
      text.includes("PLUS专属券") ||
      text.includes("PLUS专享券") ||
      text.includes("PLUS会员券") ||
      text.includes("PLUS优惠券")
    );
  }

  function findCouponButtons() {
    const elements = document.querySelectorAll(
      'button, a, [role="button"], [onclick], div, span',
    );

    const result = [];
    const seen = new Set();

    for (const el of elements) {
      if (cleanText(el.innerText) !== CONFIG.targetText) {
        continue;
      }

      const clickable =
        el.closest('button, a, [role="button"], [onclick]') || el;

      if (
        !isVisible(clickable) ||
        isDisabled(clickable) ||
        state.clickedElements.has(clickable)
      ) {
        continue;
      }

      if (!state.includePlus && isPlusCoupon(clickable)) {
        continue;
      }

      const fingerprint = getCouponFingerprint(clickable);

      if (fingerprint && state.clickedCoupons.has(fingerprint)) {
        continue;
      }

      if (seen.has(clickable)) {
        continue;
      }

      seen.add(clickable);
      result.push(clickable);
    }

    result.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();

      return aRect.top + window.scrollY - (bRect.top + window.scrollY);
    });

    return result;
  }

  function createPanel() {
    const root = document.createElement("div");
    root.id = `${APP.id}-panel`;

    root.innerHTML = `
      <div class="lcg-header">
        <div>
          <div class="lcg-title">🎟 ${APP.name}</div>
          <div class="lcg-version">v${APP.version}</div>
        </div>
      </div>

      <div class="lcg-info">
        <div>
          <span>状态</span>
          <strong id="lcg-status">等待开始</strong>
        </div>
        <div>
          <span>已点击</span>
          <strong id="lcg-count">0</strong>
        </div>
      </div>

      <button id="lcg-toggle" type="button">
        开始抢券
      </button>

      <label class="lcg-switch-row" for="lcg-plus">
        <span>
          PLUS 专区
          <small>默认关闭</small>
        </span>

        <span class="lcg-switch">
          <input id="lcg-plus" type="checkbox">
          <span class="lcg-slider"></span>
        </span>
      </label>
    `;

    const style = document.createElement("style");

    style.textContent = `
      #${APP.id}-panel {
        position: fixed;
        top: 96px;
        right: 24px;
        z-index: 2147483647;

        width: 200px;
        box-sizing: border-box;
        padding: 14px;

        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 12px;

        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.14);
        backdrop-filter: blur(12px);

        color: #202124;

        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          "Microsoft YaHei",
          sans-serif;
      }

      #${APP.id}-panel * {
        box-sizing: border-box;
      }

      #${APP.id}-panel .lcg-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 13px;
      }

      #${APP.id}-panel .lcg-title {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
      }

      #${APP.id}-panel .lcg-version {
        margin-top: 2px;
        font-size: 10px;
        color: #999;
      }

      #${APP.id}-panel .lcg-info {
        display: flex;
        flex-direction: column;
        gap: 7px;
        margin-bottom: 13px;
      }

      #${APP.id}-panel .lcg-info > div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
      }

      #${APP.id}-panel .lcg-info span {
        color: #888;
      }

      #${APP.id}-panel .lcg-info strong {
        max-width: 118px;
        overflow: hidden;
        color: #333;
        font-weight: 500;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${APP.id}-panel #lcg-toggle {
        width: 100%;
        height: 36px;

        border: 0;
        border-radius: 8px;

        background: #1677ff;
        color: #fff;

        cursor: pointer;

        font-size: 13px;
        font-weight: 500;

        transition:
          background 0.15s ease,
          transform 0.15s ease;
      }

      #${APP.id}-panel #lcg-toggle:hover {
        background: #4096ff;
      }

      #${APP.id}-panel #lcg-toggle:active {
        transform: scale(0.98);
      }

      #${APP.id}-panel #lcg-toggle.lcg-stop {
        background: #ff4d4f;
      }

      #${APP.id}-panel #lcg-toggle.lcg-stop:hover {
        background: #ff7875;
      }

      #${APP.id}-panel .lcg-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;

        margin-top: 12px;

        color: #555;
        font-size: 12px;

        cursor: pointer;
        user-select: none;
      }

      #${APP.id}-panel .lcg-switch-row > span:first-child {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      #${APP.id}-panel .lcg-switch-row small {
        color: #aaa;
        font-size: 10px;
        font-weight: 400;
      }

      #${APP.id}-panel .lcg-switch {
        position: relative;
        display: inline-block;
        width: 34px;
        height: 20px;
        flex: 0 0 auto;
      }

      #${APP.id}-panel .lcg-switch input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      #${APP.id}-panel .lcg-slider {
        position: absolute;
        inset: 0;

        background: #d9d9d9;
        border-radius: 999px;

        transition: 0.2s;
      }

      #${APP.id}-panel .lcg-slider::before {
        position: absolute;
        top: 2px;
        left: 2px;

        width: 16px;
        height: 16px;

        content: "";

        background: #fff;
        border-radius: 50%;

        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

        transition: 0.2s;
      }

      #${APP.id}-panel .lcg-switch input:checked + .lcg-slider {
        background: #1677ff;
      }

      #${APP.id}-panel .lcg-switch input:checked + .lcg-slider::before {
        transform: translateX(14px);
      }

      #${APP.id}-panel .lcg-switch-row.lcg-disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(root);

    return {
      root,
      status: root.querySelector("#lcg-status"),
      count: root.querySelector("#lcg-count"),
      toggle: root.querySelector("#lcg-toggle"),
      plus: root.querySelector("#lcg-plus"),
      plusRow: root.querySelector(".lcg-switch-row"),
    };
  }

  const ui = createPanel();

  function setStatus(text) {
    ui.status.textContent = text;
  }

  function render() {
    ui.count.textContent = String(state.clickedCount);

    ui.plus.checked = state.includePlus;
    ui.plus.disabled = state.running;
    ui.plusRow.classList.toggle("lcg-disabled", state.running);

    if (state.running) {
      ui.toggle.textContent = "停止";
      ui.toggle.classList.add("lcg-stop");
    } else {
      ui.toggle.textContent = "开始抢券";
      ui.toggle.classList.remove("lcg-stop");
    }
  }

  async function clickCoupon(button) {
    if (!state.running) {
      return;
    }

    // 找到后先标记，保证每个候选只处理一次。
    state.clickedElements.add(button);

    const fingerprint = getCouponFingerprint(button);

    if (fingerprint) {
      state.clickedCoupons.add(fingerprint);
    }

    button.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    await sleep(250);

    if (!state.running) {
      return;
    }

    // 点击前再次确认文字，避免按钮已经变成“去使用”等状态。
    if (cleanText(button.innerText) !== CONFIG.targetText) {
      return;
    }

    // 点击前再次确认 PLUS 规则。
    if (!state.includePlus && isPlusCoupon(button)) {
      return;
    }

    setStatus("正在抢券");

    button.click();

    state.clickedCount += 1;
    render();

    console.log(
      `[${APP.name}] 已点击第 ${state.clickedCount} 张优惠券`,
      button,
    );

    // 两次真实点击之间固定等待 1 秒。
    await sleep(CONFIG.clickIntervalMs);
  }

  function reachedBottom() {
    const viewportBottom = window.scrollY + window.innerHeight;

    const documentHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );

    return viewportBottom >= documentHeight - 20;
  }

  async function start() {
    if (state.running) {
      return;
    }

    state.running = true;
    state.clickedCount = 0;
    state.clickedElements = new WeakSet();
    state.clickedCoupons.clear();

    render();
    setStatus("返回顶部");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    await sleep(800);

    let bottomCheckCount = 0;

    while (state.running) {
      const buttons = findCouponButtons();

      if (buttons.length > 0) {
        bottomCheckCount = 0;

        for (const button of buttons) {
          if (!state.running) {
            break;
          }

          await clickCoupon(button);
        }

        continue;
      }

      if (reachedBottom()) {
        bottomCheckCount += 1;

        setStatus(`底部检查 ${bottomCheckCount}/${CONFIG.bottomChecks}`);

        if (bottomCheckCount >= CONFIG.bottomChecks) {
          break;
        }

        await sleep(1000);
        continue;
      }

      setStatus("继续向下寻找");

      window.scrollBy({
        top: Math.floor(window.innerHeight * CONFIG.scrollRatio),
        behavior: "smooth",
      });

      await sleep(CONFIG.scrollIntervalMs);
    }

    if (!state.running) {
      return;
    }

    state.running = false;

    setStatus(
      state.clickedCount > 0
        ? `完成，共 ${state.clickedCount} 张`
        : "完成，未发现可抢券",
    );

    render();
  }

  function stop() {
    state.running = false;
    setStatus("已停止");
    render();
  }

  ui.plus.addEventListener("change", () => {
    if (state.running) {
      ui.plus.checked = state.includePlus;
      return;
    }

    state.includePlus = ui.plus.checked;

    console.log(
      `[${APP.name}] PLUS 专区：${state.includePlus ? "开启" : "关闭"}`,
    );
  });

  ui.toggle.addEventListener("click", () => {
    if (state.running) {
      stop();
    } else {
      start();
    }
  });

  render();

  console.log(`[${APP.name}] v${APP.version} 已加载`);
})();
