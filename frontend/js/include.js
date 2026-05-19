(() => {
  const LB_ROOT_BASE = (() => {
    const fromWindow = String(window.LB_BASE_PATH || "").trim();
    if (fromWindow) return fromWindow.replace(/\/+$/, "");
    const path = String(window.location.pathname || "").replace(/\\/g, "/");
    return path.includes("/frontend/") ? "/frontend" : "";
  })();
  const withRootBase = (target) => {
    const clean = `/${String(target || "").replace(/^\/+/, "")}`;
    return `${LB_ROOT_BASE}${clean}`;
  };
  const welcomePath = (suffix) => withRootBase(`/welcome/${String(suffix || "").replace(/^\/+/, "")}`);

  const ensureLaunchOverlay = () => {
    // The site already has a dedicated launch page at `/frontend/index.html`.
    // Showing another full-screen "launch" overlay inside pages feels like a
    // second launch on mobile, so we skip it on small screens and also allow
    // explicit opt-out via a global flag/meta/html attribute.
    try {
      if (window.LB_DISABLE_LAUNCH_OVERLAY) return;
      const meta = document.querySelector('meta[name="lb:disable-launch"][content="true"]');
      if (meta) return;
      if (document.documentElement && document.documentElement.hasAttribute("data-lb-disable-launch")) return;
      if (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) return;
    } catch {}

    if (window.__lbLaunchOverlayReady) return;
    window.__lbLaunchOverlayReady = true;

    try {
      if (sessionStorage.getItem("lbLaunchSeen") === "1") return;
      sessionStorage.setItem("lbLaunchSeen", "1");
    } catch {}

    const style = document.createElement("style");
    style.id = "lb-launch-style";
    style.textContent = `
      :root{
        --lb-launch-bg: radial-gradient(900px 600px at 20% -10%, #fff7ed 0%, #ffffff 55%, #f8fafc 100%);
        --lb-launch-card: rgba(255,255,255,0.68);
        --lb-launch-border: rgba(148,163,184,0.35);
        --lb-launch-text: #0f172a;
        --lb-launch-sub: rgba(15,23,42,0.7);
        --lb-launch-ring: conic-gradient(from 180deg, #f97316, #fb923c, #22c55e, #3b82f6, #f97316);
      }
      html.lb-theme-dark{
        --lb-launch-bg: radial-gradient(1100px 700px at 20% -5%, #13284a 0%, #081428 58%, #061022 100%);
        --lb-launch-card: rgba(15,23,42,0.56);
        --lb-launch-border: rgba(148,163,184,0.22);
        --lb-launch-text: #e2e8f0;
        --lb-launch-sub: rgba(226,232,240,0.75);
        --lb-launch-ring: conic-gradient(from 180deg, #fb923c, #f97316, #22c55e, #60a5fa, #fb923c);
      }

      #lb-launch{
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        padding: 18px;
        background: var(--lb-launch-bg);
        transition: opacity 260ms ease, transform 260ms ease;
      }
      #lb-launch.lb-launch-hide{
        opacity: 0;
        transform: scale(1.01);
        pointer-events: none;
      }
      #lb-launch-card{
        width: min(520px, calc(100vw - 36px));
        border-radius: 18px;
        background: var(--lb-launch-card);
        border: 1px solid var(--lb-launch-border);
        box-shadow: 0 30px 70px -50px rgba(2,6,23,0.55);
        backdrop-filter: blur(14px);
        padding: 18px 18px 16px;
        display: grid;
        gap: 12px;
        text-align: center;
      }
      #lb-launch-top{
        display: grid;
        justify-items: center;
        gap: 10px;
      }
      #lb-launch-logo{
        width: 54px;
        height: 54px;
        border-radius: 16px;
        background: rgba(255,255,255,0.6);
        border: 1px solid rgba(148,163,184,0.24);
        display: grid;
        place-items: center;
        position: relative;
        overflow: hidden;
      }
      html.lb-theme-dark #lb-launch-logo{
        background: rgba(2,6,23,0.18);
        border-color: rgba(148,163,184,0.22);
      }
      #lb-launch-logo::before{
        content: "";
        position: absolute;
        inset: -10px;
        background: var(--lb-launch-ring);
        animation: lbLaunchSpin 1.3s linear infinite;
        opacity: 0.9;
      }
      #lb-launch-logo::after{
        content: "";
        position: absolute;
        inset: 2px;
        border-radius: 14px;
        background: var(--lb-launch-card);
        border: 1px solid rgba(148,163,184,0.15);
      }
      #lb-launch-logo img{
        position: relative;
        z-index: 1;
        width: 34px;
        height: 34px;
        object-fit: contain;
        border-radius: 10px;
      }
      #lb-launch-title{
        font-size: 18px;
        font-weight: 1000;
        letter-spacing: -0.2px;
        color: var(--lb-launch-text);
        line-height: 1.1;
      }
      #lb-launch-sub{
        margin-top: 0;
        font-size: 12px;
        font-weight: 800;
        color: var(--lb-launch-sub);
        line-height: 1.35;
      }
      #lb-launch-bar{
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(148,163,184,0.2);
        border: 1px solid rgba(148,163,184,0.22);
      }
      #lb-launch-bar > i{
        display: block;
        height: 100%;
        width: 45%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(249,115,22,0.0), rgba(249,115,22,0.9), rgba(34,197,94,0.7), rgba(96,165,250,0.75), rgba(249,115,22,0.0));
        transform: translateX(-70%);
        animation: lbLaunchBar 1.15s ease-in-out infinite;
      }
      #lb-launch-foot{
        display: flex;
        justify-content: center;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      #lb-launch-hint{
        font-size: 12px;
        font-weight: 800;
        color: var(--lb-launch-sub);
      }
      #lb-launch-dots{
        font-size: 12px;
        font-weight: 900;
        color: rgba(249,115,22,0.95);
        letter-spacing: 0.8px;
      }
      #lb-launch-actions{
        display: grid;
        gap: 8px;
        margin-top: 4px;
      }
      #lb-launch-enter{
        width: 100%;
        min-height: 42px;
        border-radius: 12px;
        border: 0;
        cursor: pointer;
        font-weight: 1000;
        letter-spacing: 0.1px;
        background: linear-gradient(135deg, #ff8a00, #ff9f2f);
        color: #ffffff;
        box-shadow: 0 16px 26px -20px rgba(249,115,22,0.75);
        transition: transform 160ms ease, filter 160ms ease;
      }
      #lb-launch-enter:active{ transform: translateY(1px) scale(0.99); }
      #lb-launch-enter:disabled{
        opacity: 0.78;
        cursor: not-allowed;
        filter: grayscale(0.1);
      }
      #lb-launch-skip{
        font-size: 11px;
        font-weight: 800;
        color: var(--lb-launch-sub);
      }

      @keyframes lbLaunchSpin{
        to{ transform: rotate(360deg); }
      }
      @keyframes lbLaunchBar{
        0%{ transform: translateX(-80%); opacity: 0.75; }
        55%{ opacity: 1; }
        100%{ transform: translateX(220%); opacity: 0.75; }
      }

      @media (prefers-reduced-motion: reduce){
        #lb-launch-logo::before, #lb-launch-bar > i{ animation: none !important; }
        #lb-launch{ transition: none; }
      }
      @media (max-width: 420px){
        #lb-launch-card{ padding: 16px; border-radius: 20px; }
        #lb-launch-title{ font-size: 16px; }
        #lb-launch-logo{ width: 52px; height: 52px; border-radius: 16px; }
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "lb-launch";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div id="lb-launch-card">
        <div id="lb-launch-top">
          <div id="lb-launch-logo" aria-hidden="true">
            <img alt="LocalBasket" src="/welcome/logo2.png?v=20260303" onerror="this.style.display='none'">
          </div>
          <div id="lb-launch-title">LocalBasket</div>
          <div id="lb-launch-sub">Fresh essentials, delivered fast.</div>
        </div>
        <div id="lb-launch-bar" aria-hidden="true"><i></i></div>
        <div id="lb-launch-foot">
          <div id="lb-launch-hint">Loading</div>
          <div id="lb-launch-dots" aria-hidden="true">•••</div>
        </div>
        <div id="lb-launch-actions">
          <button id="lb-launch-enter" type="button" disabled>Enter App</button>
          <div id="lb-launch-skip">Auto continue in a moment…</div>
        </div>
      </div>
    `;

    // ensure theme class is applied as early as possible (reduces flash)
    try {
      const saved = localStorage.getItem("lbTheme");
      if (saved === "dark") document.documentElement.classList.add("lb-theme-dark");
      if (saved === "light") document.documentElement.classList.remove("lb-theme-dark");
    } catch {}

    document.documentElement.appendChild(overlay);

    let dots = 0;
    const dotsEl = overlay.querySelector("#lb-launch-dots");
    const hintEl = overlay.querySelector("#lb-launch-hint");
    const dotsTimer = window.setInterval(() => {
      dots = (dots + 1) % 4;
      if (dotsEl) dotsEl.textContent = "•".repeat(Math.max(1, dots));
      if (hintEl) hintEl.textContent = document.readyState === "complete" ? "Almost done" : "Loading";
    }, 420);

    const start = Date.now();
    const minShowMs = 380;
    const hide = () => {
      if (!window.__lbLaunchOverlayReady) return;
      const el = document.getElementById("lb-launch");
      if (!el || el.classList.contains("lb-launch-hide")) return;
      const elapsed = Date.now() - start;
      const wait = Math.max(0, minShowMs - elapsed);
      window.setTimeout(() => {
        el.classList.add("lb-launch-hide");
        window.setTimeout(() => {
          try { window.clearInterval(dotsTimer); } catch {}
          try { el.remove(); } catch {}
        }, 320);
      }, wait);
    };

    window.lbHideLaunch = hide;

    // Hide when DOM is ready (faster than waiting for all images),
    // also hide on full load, plus a fallback timeout for safety.
    const enterBtn = overlay.querySelector("#lb-launch-enter");
    const skipEl = overlay.querySelector("#lb-launch-skip");
    const setReady = () => {
      if (!enterBtn) return;
      enterBtn.disabled = false;
      if (skipEl) skipEl.textContent = "Tap Enter App to continue";
    };

    if (enterBtn) {
      enterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        hide();
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        setReady();
        window.setTimeout(hide, 2200);
      }, { once: true });
    } else {
      setReady();
      window.setTimeout(hide, 2200);
    }

    window.addEventListener("load", setReady, { once: true });
    window.addEventListener("load", hide, { once: true });
    window.setTimeout(hide, 6500);
  };

  ensureLaunchOverlay();

  let dialogReady = false;
  const ensureDialog = () => {
    if (dialogReady) return;
    dialogReady = true;
    const style = document.createElement("style");
    style.textContent = `
      .lb-dialog-backdrop{
        position: fixed;
        inset: 0;
        background: rgba(15,23,42,0.45);
        backdrop-filter: blur(6px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 16px;
      }
      .lb-dialog{
        width: min(420px, calc(100vw - 32px));
        border-radius: 16px;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        box-shadow: 0 24px 50px -30px rgba(2,6,23,0.45);
        padding: 18px;
        display: grid;
        gap: 14px;
      }
      .lb-dialog-title{
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        color: #fb923c;
      }
      .lb-dialog-message{
        font-size: 14px;
        line-height: 1.4;
        color: inherit;
        white-space: pre-wrap;
      }
      .lb-dialog-actions{
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .lb-dialog-btn{
        min-width: 96px;
        padding: 10px 14px;
        border-radius: 12px;
        border: 1px solid transparent;
        font-weight: 800;
        cursor: pointer;
      }
      .lb-dialog-btn.primary{
        background: linear-gradient(135deg, #f97316, #fb923c);
        color: #1f2937;
        box-shadow: 0 10px 18px -14px rgba(251,146,60,0.8);
      }
      .lb-dialog-btn.ghost{
        background: #f1f5f9;
        color: #0f172a;
        border-color: #e2e8f0;
      }
      html.lb-theme-dark .lb-dialog{
        background: #0f172a;
        color: #e2e8f0;
        border-color: rgba(148,163,184,0.2);
        box-shadow: 0 26px 50px -30px rgba(2,6,23,0.8);
      }
      html.lb-theme-dark .lb-dialog-title{ color: #fb923c; }
      html.lb-theme-dark .lb-dialog-btn.ghost{
        background: rgba(15,23,42,0.7);
        color: #e2e8f0;
        border-color: rgba(148,163,184,0.25);
      }
      @media (max-width: 600px){
        .lb-dialog{ width: min(360px, calc(100vw - 24px)); padding: 16px; }
        .lb-dialog-actions{ justify-content: stretch; }
        .lb-dialog-btn{ flex: 1 1 auto; }
      }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "lb-dialog-backdrop";
    backdrop.innerHTML = `
      <div class="lb-dialog" role="dialog" aria-modal="true">
        <div class="lb-dialog-title">Notice</div>
        <div class="lb-dialog-message"></div>
        <div class="lb-dialog-actions">
          <button class="lb-dialog-btn ghost" data-cancel>Cancel</button>
          <button class="lb-dialog-btn primary" data-ok>OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const titleEl = backdrop.querySelector(".lb-dialog-title");
    const msgEl = backdrop.querySelector(".lb-dialog-message");
    const okBtn = backdrop.querySelector("[data-ok]");
    const cancelBtn = backdrop.querySelector("[data-cancel]");

    let resolver = null;
    let isConfirm = false;

    const close = (val) => {
      backdrop.style.display = "none";
      document.body.style.overflow = "";
      if (resolver) resolver(val);
      resolver = null;
    };

    okBtn.addEventListener("click", () => close(true));
    cancelBtn.addEventListener("click", () => close(false));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop && isConfirm) close(false);
      if (e.target === backdrop && !isConfirm) close(true);
    });

    window.lbAlert = (message, title = "Notice") => {
      titleEl.textContent = title || "Notice";
      msgEl.textContent = String(message || "");
      cancelBtn.style.display = "none";
      isConfirm = false;
      backdrop.style.display = "flex";
      document.body.style.overflow = "hidden";
      return new Promise((resolve) => { resolver = resolve; });
    };

    window.lbConfirm = (message, title = "Confirm") => {
      titleEl.textContent = title || "Confirm";
      msgEl.textContent = String(message || "");
      cancelBtn.style.display = "inline-flex";
      isConfirm = true;
      backdrop.style.display = "flex";
      document.body.style.overflow = "hidden";
      return new Promise((resolve) => { resolver = resolve; });
    };

    // override alert only (confirm is async; update callers to use lbConfirm)
    window.alert = (msg) => window.lbAlert(msg);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDialog);
  } else {
    ensureDialog();
  }
})();

document.addEventListener("DOMContentLoaded", async () => {
  const path = window.location.pathname;
  const LB_COMPONENTS_VERSION = "20260311a";

  const isAdminPage = /\/welcome\/admin(\/|$)/.test(path) || path.includes("/welcome/admin");
  const isSellerPage = /\/welcome\/seller(\/|$)/.test(path) || path.includes("/welcome/seller");

  const ensureAiWidget = () => {
    // Skip on admin/seller pages by default; allow opt-in/out via flags.
    try {
      if (window.LB_DISABLE_AI_WIDGET) return;
      const meta = document.querySelector('meta[name="lb:disable-ai"][content="true"]');
      if (meta) return;
      if (document.documentElement && document.documentElement.hasAttribute("data-lb-disable-ai")) return;
      if (isAdminPage || isSellerPage) return;
    } catch {}

    if (document.getElementById("lb-ai-style")) return;

    const style = document.createElement("style");
    style.id = "lb-ai-style";
    style.textContent = `
      #lb-ai-panel, #lb-ai-btn{
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      }
      #lb-ai-panel, #lb-ai-panel *{
        box-sizing: border-box;
        max-width: 100%;
      }
      #lb-ai-backdrop{
        position: fixed;
        inset: 0;
        z-index: 119999;
        background: rgba(2,6,23,0.35);
        backdrop-filter: blur(6px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 180ms ease, visibility 180ms ease;
      }
      html.lb-theme-dark #lb-ai-backdrop{
        background: rgba(2,6,23,0.55);
      }
      #lb-ai-backdrop.lb-ai-open{
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
      #lb-ai-btn{
        position: fixed;
        bottom: calc(25px + env(safe-area-inset-bottom, 0px));
        right: env(safe-area-inset-right, 0px);
        z-index: 120001;
        border: 0;
        border-radius: 16px 0 0 16px;
        background: linear-gradient(135deg, #ff8c00, #ffa726);
        color: #ffffff;
        padding: 12px 14px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 900;
        letter-spacing: 0.2px;
        cursor: pointer;
        box-shadow: 0 18px 42px -28px rgba(255,140,0,0.9), 0 0 0 1px rgba(255,255,255,0.12) inset;
        transition: transform 140ms ease, filter 140ms ease;
        touch-action: none;
        max-width: calc(100vw - 24px);
      }
      #lb-ai-btn:hover{ transform: translateY(-1px); filter: brightness(1.02); }
      #lb-ai-btn:active{ transform: translateY(0px) scale(0.99); }
      #lb-ai-btn:focus-visible{ outline: none; box-shadow: 0 0 0 4px rgba(255,140,0,0.25), 0 18px 42px -28px rgba(255,140,0,0.85); }
      #lb-ai-badge{
        width: 30px; height: 30px;
        border-radius: 999px;
        background: rgba(255,255,255,0.18);
        display: grid; place-items: center;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22);
        flex: 0 0 auto;
      }
      #lb-ai-badge svg{ width: 18px; height: 18px; }

      .lb-ai-btn-label{
        white-space: nowrap;
        overflow: hidden;
        max-width: 0;
        opacity: 0;
        transform: translateX(6px);
        transition: max-width 240ms ease, opacity 200ms ease, transform 240ms ease;
        display: inline-block;
      }
      #lb-ai-btn:hover .lb-ai-btn-label,
      #lb-ai-btn:focus-visible .lb-ai-btn-label{
        max-width: 240px;
        opacity: 1;
        transform: translateX(0px);
      }

      #lb-ai-btn.lb-ai-hidden{
        opacity: 0;
        pointer-events: none;
        transform: translateY(6px);
      }

      #lb-ai-panel{
        --lb-ai-accent: #ff8c00;
        --lb-ai-accent2: #ffa726;
        --lb-ai-text: #0f172a;
        --lb-ai-muted: rgba(100,116,139,0.9);
        --lb-ai-border: rgba(15,23,42,0.12);
        --lb-ai-card: rgba(255,255,255,0.96);
        --lb-ai-surface: rgba(255,255,255,0.86);
        position: fixed;
        bottom: calc(86px + env(safe-area-inset-bottom, 0px));
        right: env(safe-area-inset-right, 0px);
        width: 350px;
        height: 500px;
        z-index: 120000;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(255,247,237,0.96) 0%, rgba(255,255,255,0.98) 48%, rgba(255,255,255,0.96) 100%);
        border: 1px solid var(--lb-ai-border);
        box-shadow: 0 34px 80px -54px rgba(2,6,23,0.55);
        overflow: hidden;
        display: grid;
        grid-template-rows: auto 1fr auto;
        backdrop-filter: blur(10px);
        max-height: calc(100vh - 120px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateX(22px);
        transition: opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1), visibility 180ms ease;
      }
      #lb-ai-panel > *{ min-height: 0; }
      #lb-ai-body{
        min-height: 140px;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }

      #lb-ai-panel.lb-ai-open{
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateX(0px);
      }
      html.lb-theme-dark #lb-ai-panel{
        background: rgba(15,23,42,0.92);
        border-color: rgba(148,163,184,0.22);
        box-shadow: 0 40px 80px -50px rgba(0,0,0,0.7);
        color: #e2e8f0;
      }

      #lb-ai-head{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 12px 10px;
        background: linear-gradient(90deg, rgba(255,140,0,0.14), rgba(255,255,255,0.0));
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(15,23,42,0.08);
        position: sticky;
        top: 0;
        z-index: 2;
      }
      html.lb-theme-dark #lb-ai-head{ border-bottom-color: rgba(148,163,184,0.18); }
      #lb-ai-title{
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 1000;
        color: inherit;
      }
      #lb-ai-title-badge{
        width: 34px;
        height: 34px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: rgba(255,140,0,0.14);
        border: 1px solid rgba(255,140,0,0.18);
        box-shadow: 0 10px 22px -18px rgba(255,140,0,0.55);
        flex: 0 0 auto;
        overflow: hidden;
      }
      #lb-ai-title-badge svg{ width: 18px; height: 18px; }
      #lb-ai-title-badge img{
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 4px;
        display: block;
      }
      #lb-ai-title small{
        display: block;
        font-weight: 800;
        font-size: 11px;
        color: rgba(100,116,139,0.92);
        letter-spacing: 0.2px;
        margin-top: 1px;
      }
      html.lb-theme-dark #lb-ai-title small{ color: rgba(226,232,240,0.75); }
      .lb-ai-dot{
        width: 8px;
        height: 8px;
        display: inline-block;
        border-radius: 99px;
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34,197,94,0.14);
        margin-right: 6px;
        transform: translateY(1px);
      }

      #lb-ai-head-actions{
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      #lb-ai-close, #lb-ai-clear{
        width: 36px;
        height: 36px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.78);
        color: inherit;
        border-radius: 12px;
        padding: 0;
        cursor: pointer;
        font-weight: 900;
        display: grid;
        place-items: center;
        transition: transform 140ms ease, filter 140ms ease, background 140ms ease;
        touch-action: manipulation;
      }
      #lb-ai-close:hover, #lb-ai-clear:hover{ transform: translateY(-1px); filter: brightness(1.02); }
      #lb-ai-close:active, #lb-ai-clear:active{ transform: translateY(0px) scale(0.98); }
      #lb-ai-close svg, #lb-ai-clear svg{ width: 18px; height: 18px; }
      html.lb-theme-dark #lb-ai-close, html.lb-theme-dark #lb-ai-clear{
        background: rgba(15,23,42,0.45);
        border-color: rgba(148,163,184,0.22);
      }
      #lb-ai-body{
        padding: 12px;
        overflow-y: auto;
        overflow-x: hidden;
        display: grid;
        gap: 10px;
        background: radial-gradient(120% 90% at 20% 0%, rgba(255,140,0,0.08) 0%, rgba(255,255,255,0.0) 55%);
      }
      .lb-ai-msg{
        max-width: 86%;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.08);
        background: #ffffff;
        color: #0f172a;
        box-shadow: 0 12px 24px -20px rgba(2,6,23,0.18);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.35;
        font-size: 13px;
        font-weight: 650;
        position: relative;
        animation: lbAiPop 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes lbAiPop{
        from{ opacity: 0; transform: translateY(6px) scale(0.99); }
        to{ opacity: 1; transform: translateY(0px) scale(1); }
      }
      .lb-ai-typing{
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .lb-ai-typing .dots{
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .lb-ai-typing .dot{
        width: 6px;
        height: 6px;
        border-radius: 99px;
        background: rgba(100,116,139,0.75);
        transform: translateY(0px);
        animation: lbAiDot 900ms ease-in-out infinite;
      }
      .lb-ai-typing .dot:nth-child(2){ animation-delay: 120ms; }
      .lb-ai-typing .dot:nth-child(3){ animation-delay: 240ms; }
      @keyframes lbAiDot{
        0%, 100%{ opacity: 0.45; transform: translateY(0px); }
        50%{ opacity: 1; transform: translateY(-3px); }
      }
      html.lb-theme-dark .lb-ai-typing .dot{ background: rgba(226,232,240,0.65); }
      html.lb-theme-dark .lb-ai-msg{
        background: rgba(2,6,23,0.55);
        border-color: rgba(148,163,184,0.18);
        color: #e2e8f0;
        box-shadow: none;
      }
      .lb-ai-msg:not(.user){
        padding-left: 44px;
      }
      .lb-ai-msg:not(.user)::before{
        content: "AI";
        position: absolute;
        left: 10px;
        top: 10px;
        width: 26px;
        height: 26px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        font-weight: 1000;
        font-size: 11px;
        letter-spacing: 0.4px;
        color: #9a3412;
        background: rgba(255,140,0,0.12);
        border: 1px solid rgba(255,140,0,0.18);
      }
      html.lb-theme-dark .lb-ai-msg:not(.user)::before{
        color: #fed7aa;
        background: rgba(255,140,0,0.14);
        border-color: rgba(255,140,0,0.22);
      }
      .lb-ai-chips-wrap{
        padding-left: 12px !important;
      }
      .lb-ai-chips-wrap::before{
        content: none !important;
      }
      .lb-ai-msg.user{
        margin-left: auto;
        background: linear-gradient(135deg, rgba(255,140,0,0.18), rgba(255,179,71,0.12));
        border-color: rgba(255,140,0,0.22);
      }

      .lb-ai-actions{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .lb-ai-action{
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.85);
        color: #0f172a;
        border-radius: 999px;
        padding: 8px 10px;
        font-weight: 900;
        font-size: 12px;
        cursor: pointer;
        touch-action: manipulation;
      }
      .lb-ai-action.primary{
        border-color: rgba(255,140,0,0.22);
        background: linear-gradient(135deg, rgba(255,140,0,0.18), rgba(255,167,38,0.12));
        color: #9a3412;
      }
      html.lb-theme-dark .lb-ai-action{
        background: rgba(2,6,23,0.45);
        border-color: rgba(148,163,184,0.22);
        color: #e2e8f0;
      }
      html.lb-theme-dark .lb-ai-action.primary{
        background: rgba(255,140,0,0.14);
        border-color: rgba(255,140,0,0.22);
        color: #fed7aa;
      }

      .lb-ai-chips{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
      }
      .lb-ai-chips::-webkit-scrollbar{ height: 8px; }
      .lb-ai-chips::-webkit-scrollbar-thumb{
        background: rgba(100,116,139,0.22);
        border-radius: 999px;
      }
      .lb-ai-chip{
        border: 1px solid rgba(255,140,0,0.18);
        background: rgba(255,140,0,0.10);
        color: #9a3412;
        border-radius: 999px;
        padding: 8px 10px;
        font-weight: 900;
        font-size: 12px;
        cursor: pointer;
        transition: transform 120ms ease, filter 120ms ease;
        touch-action: manipulation;
      }
      .lb-ai-chip:hover{ transform: translateY(-1px); filter: brightness(1.02); }
      .lb-ai-chip:active{ transform: translateY(0px); }
      html.lb-theme-dark .lb-ai-chip{
        background: rgba(255,140,0,0.12);
        border-color: rgba(255,140,0,0.18);
        color: #fed7aa;
      }

      #lb-ai-foot{
        border-top: 1px solid rgba(15,23,42,0.08);
        padding: 10px 10px 12px;
        display: grid;
        gap: 8px;
        background: rgba(255,255,255,0.92);
        position: sticky;
        bottom: 0;
        z-index: 2;
      }
      html.lb-theme-dark #lb-ai-foot{ border-top-color: rgba(148,163,184,0.18); }
      html.lb-theme-dark #lb-ai-foot{ background: rgba(15,23,42,0.78); }
      #lb-ai-input-row{
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }
      #lb-ai-input{
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.95);
        padding: 10px 12px;
        font-weight: 700;
        font-size: 13px;
        color: #0f172a;
      }
      #lb-ai-input:focus{
        outline: none;
        box-shadow: 0 0 0 4px rgba(255,140,0,0.18);
        border-color: rgba(255,140,0,0.35);
      }
      html.lb-theme-dark #lb-ai-input{
        background: rgba(2,6,23,0.35);
        border-color: rgba(148,163,184,0.22);
        color: #e2e8f0;
      }
      #lb-ai-send{
        border: 0;
        width: 42px;
        height: 42px;
        border-radius: 14px;
        padding: 0;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #ff8c00, #ffa726);
        color: #ffffff;
        font-weight: 1000;
        cursor: pointer;
        box-shadow: 0 14px 28px -18px rgba(255,140,0,0.85);
        touch-action: manipulation;
      }
      #lb-ai-send:hover{ filter: brightness(1.02); transform: translateY(-1px); }
      #lb-ai-send:active{ transform: translateY(0px) scale(0.98); }
      #lb-ai-help{
        font-size: 11px;
        font-weight: 800;
        color: rgba(100,116,139,0.85);
        text-align: center;
      }
      html.lb-theme-dark #lb-ai-help{ color: rgba(226,232,240,0.65); }

      /* Mobile/tablet: near full-screen with rounded corners */
       @media (max-width: 768px){
         /* Dock button to the edge, user can drag it up/down */
         #lb-ai-btn{
          right: 0;
          right: env(safe-area-inset-right, 0px);
          bottom: auto;
          top: 55%;
          transform: none;
          border-radius: 16px 0 0 16px;
          padding: 10px 10px;
          box-shadow: 0 18px 42px -28px rgba(255,140,0,0.75);
         }
        #lb-ai-btn:hover{ filter: brightness(1.02); }
        #lb-ai-btn:active{ transform: scale(0.99); }
        .lb-ai-btn-label{ display: none; }
        #lb-ai-panel{
          left: calc(10px + env(safe-area-inset-left, 0px));
          right: calc(10px + env(safe-area-inset-right, 0px));
          top: calc(10px + var(--lb-ai-vv-top, 0px) + env(safe-area-inset-top, 0px));
          bottom: auto;
          width: auto;
          height: calc(var(--lb-ai-vv-height, 100dvh) - 20px - env(safe-area-inset-top, 0px));
          border-radius: 22px;
          max-height: none;
          transform: translateX(18px);
        }
        #lb-ai-panel.lb-ai-open{ transform: translateX(0px); }
         #lb-ai-head{ padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
         #lb-ai-foot{ padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
         #lb-ai-body{ padding: 12px 10px; gap: 10px; }
         .lb-ai-msg{ max-width: 100%; }

         /* Make quick actions readable (no cut-off) */
         .lb-ai-actions{
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 10px;
         }
         .lb-ai-action{
           width: 100%;
           border-radius: 14px;
           padding: 10px 12px;
           text-align: center;
           white-space: normal;
           line-height: 1.2;
         }

         /* Show suggestion chips in-frame (no horizontal scrolling) */
         .lb-ai-chips{
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 10px;
           overflow: visible;
         }
         .lb-ai-chip{
           width: 100%;
           border-radius: 14px;
           padding: 10px 12px;
           white-space: normal;
           text-align: center;
           line-height: 1.2;
         }
       }

       /* Scrollbars: keep subtle (desktop only) */
       @media (min-width: 769px){
         #lb-ai-body::-webkit-scrollbar{
           width: 10px;
         }
         #lb-ai-body::-webkit-scrollbar-thumb{
           background: rgba(100,116,139,0.28);
           border-radius: 999px;
           border: 3px solid transparent;
           background-clip: content-box;
         }
         html.lb-theme-dark #lb-ai-body::-webkit-scrollbar-thumb{
           background: rgba(226,232,240,0.22);
           border: 3px solid transparent;
           background-clip: content-box;
         }
       }

       /* Small phones: single column actions/chips */
       @media (max-width: 420px){
         .lb-ai-actions{ grid-template-columns: 1fr; }
         .lb-ai-chips{ grid-template-columns: 1fr; }
       }
     `;
    document.head.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.id = "lb-ai-backdrop";

    const btn = document.createElement("button");
    btn.id = "lb-ai-btn";
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-controls", "lb-ai-panel");
    btn.innerHTML = `
      <span class="lb-ai-btn-label">Ask LocalBasket AI</span>
      <span id="lb-ai-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M7 7.5c0-2.5 2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M6.5 10.5c0-1.1.9-2 2-2h7c1.1 0 2 .9 2 2v5c0 2-1.6 3.5-3.5 3.5h-1.2l-1.8 1.6-1.8-1.6H10c-2 0-3.5-1.6-3.5-3.5v-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9.5 13h.01M12 13h.01M14.5 13h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </span>
    `;

    const panel = document.createElement("section");
    panel.id = "lb-ai-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div id="lb-ai-head">
        <div id="lb-ai-title">
          <div id="lb-ai-title-badge" aria-hidden="true">
            <img alt="LocalBasket" src="/welcome/logo2.png?v=20260303" onerror="this.style.display='none'">
          </div>
          <div>
            <div>LocalBasket AI</div>
            <small><span class="lb-ai-dot" aria-hidden="true"></span>Ready to help</small>
          </div>
        </div>
        <div id="lb-ai-head-actions">
          <button id="lb-ai-clear" type="button" aria-label="Clear chat" title="Clear chat">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M10 7V5.5c0-.8.7-1.5 1.5-1.5h1c.8 0 1.5.7 1.5 1.5V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M8 7l1 14h6l1-14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </button>
          <button id="lb-ai-close" type="button" aria-label="Close" title="Close">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div id="lb-ai-body"></div>
      <div id="lb-ai-foot">
        <div id="lb-ai-input-row">
          <input id="lb-ai-input" type="text" placeholder="Type your question..." autocomplete="off" />
          <button id="lb-ai-send" type="button" aria-label="Send" title="Send">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 12l16-8-6 16-2.5-7L4 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div id="lb-ai-help">Tips: try "track my order" or "ingredients for chai"</div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const body = panel.querySelector("#lb-ai-body");
    const input = panel.querySelector("#lb-ai-input");
    const send = panel.querySelector("#lb-ai-send");
    const close = panel.querySelector("#lb-ai-close");
    const clearBtn = panel.querySelector("#lb-ai-clear");

    if (!body || !input || !send || !close || !clearBtn) {
      try { panel.remove(); } catch {}
      try { btn.remove(); } catch {}
      try { backdrop.remove(); } catch {}
      try { window.alert("LocalBasket AI failed to initialize. Please refresh."); } catch {}
      return;
    }

    const MAX_HISTORY = 40;

    const safeParse = (raw, fallback) => {
      try { return JSON.parse(raw); } catch { return fallback; }
    };

    const getAiUserId = () => {
      try {
        const user = safeParse(localStorage.getItem("lbUser") || "null", null);
        if (!user || typeof user !== "object") return null;
        const id =
          user.id ??
          user.customer_id ??
          user._id ??
          user.user_id ??
          user.customerId ??
          user.customerID ??
          user.userId ??
          null;
        const cleaned = id != null ? String(id).trim() : "";
        return cleaned ? cleaned : null;
      } catch {
        return null;
      }
    };

    const getAiUser = () => {
      try {
        const user = safeParse(localStorage.getItem("lbUser") || "null", null);
        return user && typeof user === "object" ? user : null;
      } catch {
        return null;
      }
    };

    const fnv1a = (str) => {
      // Small stable hash to avoid using full tokens in storage keys.
      // Returns unsigned 32-bit integer.
      let h = 0x811c9dc5;
      const s = String(str || "");
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0);
    };

    const getAiTokenHint = () => {
      try {
        const t = String(localStorage.getItem("lbToken") || "").trim();
        if (!t) return null;
        return `t_${fnv1a(t).toString(16)}`;
      } catch {
        return null;
      }
    };

    const getChatStore = () => {
      // Keep AI chat isolated per-customer so one customer's chat doesn't appear for another.
      // - Logged-in: localStorage per user id
      // - Token-only sessions: localStorage per token hash
      // - Guest: sessionStorage per-tab id
      const uid = getAiUserId();
      if (uid) return { storage: localStorage, key: `lbAiChatV1_u_${uid}` };
      const tokenHint = getAiTokenHint();
      if (tokenHint) return { storage: localStorage, key: `lbAiChatV1_${tokenHint}` };

      let guestId = "";
      try { guestId = String(sessionStorage.getItem("lbAiGuestId") || "").trim(); } catch {}
      if (!guestId) {
        try {
          guestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          sessionStorage.setItem("lbAiGuestId", guestId);
        } catch {
          guestId = "guest";
        }
      }
      return { storage: sessionStorage, key: `lbAiChatV1_guest_${guestId}` };
    };

    const getCartKey = () => {
      try {
        const user = safeParse(localStorage.getItem("lbUser") || "null", null);
        if (user && user.id) return `lbCart_${user.id}`;
      } catch {}
      return "lbCart_guest";
    };

    const loadCart = () => {
      try {
        const key = getCartKey();
        const parsed = safeParse(localStorage.getItem(key) || "[]", []);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const saveCart = (cart) => {
      try {
        const key = getCartKey();
        localStorage.setItem(key, JSON.stringify(Array.isArray(cart) ? cart : []));
        if (localStorage.getItem("lbCart")) localStorage.removeItem("lbCart");
      } catch {}
      try { window.dispatchEvent(new Event("lb-cart-updated")); } catch {}
    };

    const addItemsToCart = async ({ storeId, storeName, items }) => {
      const sid = Number(storeId || 0);
      const list = Array.isArray(items) ? items : [];
      if (!sid || !list.length) {
        addMsg("Nothing to add to cart yet.", "bot");
        return;
      }

      let cart = loadCart();
      if (cart.length && String(cart[0]?.storeId) !== String(sid)) {
        const ok = typeof window.lbConfirm === "function"
          ? await window.lbConfirm(`Your cart has items from another store.\nReplace cart with items from ${storeName || "this store"}?`, "Confirm")
          : confirm("Your cart has items from another store. Replace cart?");
        if (!ok) return;
        cart = [];
      }

      const byId = new Map();
      cart.forEach((c) => {
        const id = Number(c?.id || 0);
        if (!id) return;
        byId.set(id, { ...c });
      });

      list.forEach((it) => {
        const id = Number(it?.id || 0);
        if (!id) return;
        const existing = byId.get(id);
        if (existing) {
          existing.qty = Number(existing.qty || 0) + Number(it.qty || 1);
          byId.set(id, existing);
          return;
        }
        byId.set(id, {
          id,
          name: String(it?.name || "Item"),
          price: Number(it?.price || 0),
          qty: Number(it?.qty || 1),
          storeId: sid,
          seller_id: it?.seller_id || it?.sellerId || null,
        });
      });

      const next = Array.from(byId.values()).filter((x) => Number(x.qty || 0) > 0);
      saveCart(next);
      addMsg(`Added ${list.length} item(s) to cart.`, "bot", [
        { label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${sid}`, primary: true },
        { label: "Checkout", type: "nav", href: "/welcome/customer/checkout/checkout.html" },
      ]);
    };

    const readCartAny = () => {
      try {
        const user = safeParse(localStorage.getItem("lbUser") || "null", null);
        const keys = [];
        if (user && user.id) keys.push(`lbCart_${user.id}`);
        keys.push("lbCart_guest", "lbCart");
        for (const k of keys) {
          const parsed = safeParse(localStorage.getItem(k) || "[]", []);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch {}
      return [];
    };

    const persistChat = () => {
      try {
        const { storage, key } = getChatStore();
        const all = Array.from(body.querySelectorAll("[data-lb-ai-role]")).map((el) => ({
          role: el.getAttribute("data-lb-ai-role") || "bot",
          text: el.getAttribute("data-lb-ai-text") || el.textContent || "",
          ts: Number(el.getAttribute("data-lb-ai-ts") || Date.now()),
        }));
        storage.setItem(key, JSON.stringify(all.slice(-MAX_HISTORY)));
      } catch {}
    };

    const addMsg = (text, who, actions = null) => {
      const el = document.createElement("div");
      el.className = "lb-ai-msg" + (who === "user" ? " user" : "");
      const ts = Date.now();
      el.setAttribute("data-lb-ai-role", who === "user" ? "user" : "bot");
      el.setAttribute("data-lb-ai-text", String(text || ""));
      el.setAttribute("data-lb-ai-ts", String(ts));
      el.textContent = String(text || "");

      if (Array.isArray(actions) && actions.length) {
        const wrap = document.createElement("div");
        wrap.className = "lb-ai-actions";
        actions.slice(0, 4).forEach((a) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "lb-ai-action" + (a.primary ? " primary" : "");
          b.textContent = String(a.label || "Action");
          b.addEventListener("click", async () => {
            try {
              if (a.type === "nav" && a.href) window.location.href = String(a.href);
              if (a.type === "copy" && a.text) navigator.clipboard?.writeText?.(String(a.text));
              if (a.type === "ask" && a.text) {
                input.value = String(a.text);
                onSend();
              }
              if (a.type === "geo" && a.kind === "nearbyStores") {
                await runNearbyStoresFlow();
              }
              if (a.type === "cart" && a.payload) {
                await addItemsToCart(a.payload);
              }
            } catch {}
          });
          wrap.appendChild(b);
        });
        el.appendChild(wrap);
      }

      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      persistChat();
    };

    const aiState = {
      awaiting: null, // "pincode"
      lastIntent: null,
      lastStore: null, // { id, name, pin }
      lastSearch: null, // { storeId, storeName, products: [{id,name,price,seller_id}] }
      cache: {
        storesByPin: new Map(),
        productsByStore: new Map(),
      }
    };

    const sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));

    const parsePincode = (text) => {
      const m = String(text || "").match(/\b(\d{6})\b/);
      return m ? m[1] : null;
    };

    const getSavedPincode = () => {
      try {
        const pin = String(localStorage.getItem("lbPin") || "").trim();
        return /^\d{6}$/.test(pin) ? pin : null;
      } catch {
        return null;
      }
    };

    const setSavedPincode = (pin) => {
      try {
        if (/^\d{6}$/.test(String(pin || ""))) localStorage.setItem("lbPin", String(pin));
      } catch {}
    };

    const getStoredLastStoreId = () => {
      try {
        const raw = String(localStorage.getItem("lbAiLastStoreId") || "").trim();
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
      } catch {
        return null;
      }
    };

    const setStoredLastStore = (store) => {
      try {
        const id = Number(store?.id || 0);
        if (!id) return;
        localStorage.setItem("lbAiLastStoreId", String(id));
        if (store?.store_name) localStorage.setItem("lbAiLastStoreName", String(store.store_name));
      } catch {}
    };

    const getStoreFromCurrentPage = () => {
      try {
        const path = String(window.location.pathname || "");
        if (!/\/welcome\/customer\/store\/store\.html$/i.test(path)) return null;
        const qs = new URLSearchParams(String(window.location.search || ""));
        const id = Number(qs.get("id") || 0);
        if (!Number.isFinite(id) || id <= 0) return null;
        return { id };
      } catch {
        return null;
      }
    };

    // If user is currently on a store page, remember it for better suggestions.
    try {
      const current = getStoreFromCurrentPage();
      if (current?.id) localStorage.setItem("lbAiLastStoreId", String(current.id));
    } catch {}

    const fetchJson = async (path, options = {}) => {
      const res = await fetch(path, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      return data || {};
    };

    const listMyOrders = async () => {
      const uid = getAiUserId();
      if (!uid) return [];
      const data = await fetchJson(`/api/orders/customer/${encodeURIComponent(String(uid))}`, { method: "GET" });
      const orders = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
      return orders;
    };

    const getAreaByPincode = async (pin) => {
      try {
        const data = await fetchJson(`/api/location/area?pincode=${encodeURIComponent(pin)}`, { method: "GET" });
        return data?.success ? String(data.area || "").trim() : "";
      } catch {
        return "";
      }
    };

    const listStoresByPincode = async (pin) => {
      const now = Date.now();
      const cached = aiState.cache.storesByPin.get(pin);
      if (cached && Number.isFinite(cached.ts) && now - cached.ts < 2 * 60 * 1000) {
        return Array.isArray(cached.stores) ? cached.stores : [];
      }
      const data = await fetchJson(`/api/stores?pincode=${encodeURIComponent(pin)}`, { method: "GET" });
      const stores = Array.isArray(data?.stores) ? data.stores : [];
      aiState.cache.storesByPin.set(pin, { ts: now, stores });
      return stores;
    };

    const listProductsByStoreId = async (storeId) => {
      const sid = Number(storeId || 0);
      if (!sid) return [];
      const now = Date.now();
      const cached = aiState.cache.productsByStore.get(sid);
      if (cached && Number.isFinite(cached.ts) && now - cached.ts < 2 * 60 * 1000) {
        return Array.isArray(cached.products) ? cached.products : [];
      }
      const data = await fetchJson(`/api/products?storeId=${encodeURIComponent(String(sid))}`, { method: "GET" });
      const products = Array.isArray(data?.products) ? data.products : [];
      aiState.cache.productsByStore.set(sid, { ts: now, products });
      return products;
    };

    const isRecipeQuery = (t) => {
      const s = String(t || "").toLowerCase();
      if (!s) return false;
      return /recipe|ingredients|how to|make |cook|prepare|banane|banau|kaise|kya chahiye|kya kya|kya lagega/.test(s);
    };

    const isGreeting = (t) => /^(hi|hello|hey|hii|hlo|namaste|good (morning|evening|afternoon))\b/.test(normalizeQuery(t));
    const isThanks = (t) => /\b(thanks|thank you|thx|dhanyavad|shukriya)\b/.test(normalizeQuery(t));
    const wantsSteps = (t) => /\b(how to|recipe|steps?|method|banane|kaise|tarika|process)\b/.test(normalizeQuery(t));
    const wantsOnlyIngredients = (t) => /\bingredients\b/.test(normalizeQuery(t)) && !wantsSteps(t);
    const isCartQuery = (t) => /\b(cart|basket|my cart|checkout)\b/.test(normalizeQuery(t));
    const isProductQuery = (t) => /\b(price|rate|cost|mrp|available|stock|add|buy|need|chahiye|mangao|search|find)\b/.test(normalizeQuery(t));
    const parseServings = (raw) => {
      const m = String(raw || "").match(/\b(for|serves?)\s*(\d{1,2})\b/i) || String(raw || "").match(/\b(\d{1,2})\s*(people|persons|servings?)\b/i);
      const n = m ? Number(m[2] || m[1]) : NaN;
      if (!Number.isFinite(n)) return null;
      if (n < 1 || n > 12) return null;
      return n;
    };

    const recipeDB = [
      {
        match: /\bchai\b|\btea\b/,
        title: "Chai",
        ingredients: ["Milk", "Tea powder", "Sugar", "Water", "Ginger (optional)", "Cardamom (optional)"],
        steps: ["Boil water + ginger.", "Add tea, simmer 2-3 min.", "Add milk, boil 2-3 min.", "Add sugar, strain and serve."],
      },
      {
        match: /\bpasta\b/,
        title: "Pasta",
        ingredients: ["Pasta", "Tomato puree (or tomatoes)", "Garlic", "Onion (optional)", "Olive oil (or butter)", "Salt", "Chili flakes / oregano (optional)", "Cheese (optional)"],
        steps: ["Boil pasta with salt, drain.", "Saute garlic (and onion).", "Add tomato puree + spices, cook 6-8 min.", "Mix pasta, top with cheese."],
      },
      {
        match: /\bbiryani\b/,
        title: "Biryani",
        ingredients: ["Basmati rice", "Onions", "Tomatoes", "Curd (yogurt)", "Ginger-garlic paste", "Biryani masala", "Whole spices", "Mint and coriander", "Ghee/oil"],
        steps: ["Wash and soak rice 20 min.", "Fry onions, add masala + curd + veggies/chicken.", "Parboil rice, layer with masala, steam 15-20 min."],
      },
      {
        match: /\bpoha\b/,
        title: "Poha",
        ingredients: ["Poha", "Onion", "Potato", "Peanuts", "Mustard seeds", "Turmeric", "Lemon", "Salt", "Oil"],
        steps: ["Rinse poha, drain.", "Temper mustard + peanuts, saute onion/potato.", "Add turmeric + poha + salt, cook 2-3 min.", "Finish with lemon."],
      },
      {
        match: /\bmaggi\b|\bnoodles\b/,
        title: "Instant noodles",
        ingredients: ["Noodles", "Tastemaker", "Water", "Vegetables (optional)"],
        steps: ["Boil water, add veggies (optional).", "Add noodles + tastemaker.", "Cook 2-3 min and serve."],
      },
      {
        match: /\bomelette\b|\banda\b/,
        title: "Omelette",
        ingredients: ["Eggs", "Onion (optional)", "Green chili (optional)", "Salt", "Oil/butter"],
        steps: ["Beat eggs with salt.", "Add chopped onion/chili.", "Cook on pan 1-2 min per side."],
      },
      {
        match: /\bpaneer\b/,
        title: "Paneer dish",
        ingredients: ["Paneer", "Onion", "Tomato", "Ginger-garlic paste", "Spices", "Cream (optional)", "Butter/oil", "Salt"],
        steps: ["Saute onion + ginger-garlic.", "Add tomato + spices, cook.", "Add paneer, simmer 5 min.", "Finish with cream (optional)."],
      },
      {
        match: /\bdal\b/,
        title: "Dal",
        ingredients: ["Dal (lentils)", "Onion (optional)", "Tomato (optional)", "Turmeric", "Salt", "Oil/ghee", "Cumin", "Garlic (optional)"],
        steps: ["Boil dal with turmeric + salt.", "Temper cumin + garlic/onion.", "Add tomato (optional) + dal, simmer 5 min."],
      },
      {
        match: /\bfried\\s*rice\b/,
        title: "Fried rice",
        ingredients: ["Rice", "Vegetables", "Soy sauce (optional)", "Vinegar (optional)", "Salt", "Oil"],
        steps: ["Cook rice and cool.", "Stir-fry veggies on high flame.", "Add rice + sauces, toss 2-3 min."],
      },
      {
        match: /\b(alu|aloo)\\s*paratha\b|\bpotato\\s*paratha\b/,
        title: "Aloo paratha",
        ingredients: ["Wheat flour", "Potato", "Onion (optional)", "Green chili (optional)", "Salt", "Ajwain (optional)", "Oil/ghee"],
        steps: ["Make dough.", "Mix mashed potato with spices.", "Stuff, roll, roast with ghee."],
      },
      {
        match: /\b(upma)\b/,
        title: "Upma",
        ingredients: ["Rava (suji)", "Onion", "Mustard seeds", "Curry leaves (optional)", "Green chili (optional)", "Salt", "Oil", "Water"],
        steps: ["Roast rava.", "Temper mustard + onion.", "Add water + salt, then rava slowly.", "Cook 3-4 min."],
      },
    ];

    const guessRecipe = (raw) => {
      const t = String(raw || "").toLowerCase();
      for (const r of recipeDB) {
        if (r.match.test(t)) return { title: r.title, ingredients: r.ingredients, steps: r.steps || [] };
      }
      const dish = String(raw || "")
        .replace(/ingredients|recipe|how to make|how to cook|how to prepare|banane ka tarika|banane|kaise banaye|kaise banau|make|cook|prepare/gi, "")
        .trim();
      const title = dish ? `${dish} (basic)` : "Recipe (basic)";
      const base = ["Oil", "Salt", "Onion (optional)", "Tomato (optional)", "Ginger-garlic (optional)", "Spices (as needed)"];
      const steps = ["Heat oil.", "Saute onion/tomato (optional).", "Add spices + main ingredient.", "Cook until done."];
      return { title, ingredients: base, steps };
    };

    const ingredientKeywords = (ing) => {
      const s = String(ing || "").toLowerCase();
      const map = [
        { k: ["milk"], w: ["milk", "doodh"] },
        { k: ["tea powder"], w: ["tea", "chai", "patti"] },
        { k: ["sugar"], w: ["sugar", "chini"] },
        { k: ["ginger"], w: ["ginger", "adrak"] },
        { k: ["cardamom"], w: ["cardamom", "elaichi"] },
        { k: ["paneer"], w: ["paneer"] },
        { k: ["butter"], w: ["butter"] },
        { k: ["ghee"], w: ["ghee"] },
        { k: ["oil"], w: ["oil"] },
        { k: ["salt"], w: ["salt", "namak"] },
        { k: ["onion"], w: ["onion", "pyaz"] },
        { k: ["tomato"], w: ["tomato"] },
        { k: ["garlic"], w: ["garlic", "lahsun"] },
        { k: ["ginger-garlic"], w: ["ginger", "garlic", "paste"] },
        { k: ["rice"], w: ["rice", "chawal", "basmati"] },
        { k: ["noodles"], w: ["noodles", "maggi"] },
        { k: ["poha"], w: ["poha"] },
        { k: ["dal"], w: ["dal", "lentil", "toor", "moong", "masoor"] },
        { k: ["curd"], w: ["curd", "dahi", "yogurt"] },
        { k: ["masala"], w: ["masala", "spice"] },
        { k: ["cumin"], w: ["cumin", "jeera"] },
      ];
      for (const entry of map) {
        if (entry.k.some((x) => s.includes(x))) return entry.w;
      }
      const tokens = s.replace(/[()]/g, " ").split(/\s+/).map((x) => x.trim()).filter((x) => x.length >= 3);
      return tokens.slice(0, 4);
    };

    const suggestAddOnsFromNames = (names) => {
      const list = (Array.isArray(names) ? names : []).map((x) => String(x || "").toLowerCase());
      const has = (k) => list.some((n) => n.includes(k));
      const out = [];
      const push = (x) => { if (x && !out.includes(x)) out.push(x); };

      if (has("bread")) { push("butter"); push("jam"); }
      if (has("milk") && (has("tea") || has("chai"))) { push("sugar"); push("tea"); }
      if (has("milk") && has("coffee")) { push("sugar"); }
      if (has("pasta")) { push("tomato sauce"); push("cheese"); }
      if (has("rice") || has("chawal")) { push("dal"); push("oil"); }
      if (has("egg") || has("anda")) { push("butter"); }
      if (has("poha")) { push("peanuts"); push("lemon"); }

      return out.slice(0, 6);
    };

    const chooseStoreForPin = async (pin) => {
      const stores = await listStoresByPincode(pin);
      if (!stores.length) return null;
      const rememberedId = getStoredLastStoreId();
      if (rememberedId) {
        const remembered = stores.find((s) => Number(s?.id || 0) === Number(rememberedId));
        if (remembered) {
          aiState.lastStore = { id: remembered.id, name: remembered.store_name || "", pin };
          setStoredLastStore(remembered);
          return remembered;
        }
      }
      const online = stores.find((s) => String(s?.is_online || "").toLowerCase() === "1" || s?.is_online === 1 || s?.is_online === true);
      const picked = online || stores[0];
      aiState.lastStore = { id: picked.id, name: picked.store_name || "", pin };
      setStoredLastStore(picked);
      return picked;
    };

    const getStoreContext = async () => {
      // Priority: store page -> last chosen store -> choose from pincode (if present)
      const onPage = getStoreFromCurrentPage();
      if (onPage?.id) {
        try {
          const data = await fetchJson(`/api/stores/${encodeURIComponent(String(onPage.id))}`, { method: "GET" });
          const store = data?.store || null;
          if (store?.id) {
            aiState.lastStore = { id: store.id, name: store.store_name || "", pin: store.pincode || "" };
            setStoredLastStore(store);
            return store;
          }
        } catch {
          // fall through
        }
        return { id: onPage.id };
      }

      const rememberedId = getStoredLastStoreId();
      if (rememberedId) {
        try {
          const data = await fetchJson(`/api/stores/${encodeURIComponent(String(rememberedId))}`, { method: "GET" });
          const store = data?.store || null;
          if (store?.id) return store;
        } catch {
          return { id: rememberedId };
        }
      }

      const pin = getSavedPincode();
      if (pin) return await chooseStoreForPin(pin);
      return null;
    };

    const normalizeQuery = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[^\w\s+]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const extractProductTerm = (raw) => {
      const t = normalizeQuery(raw);
      if (!t) return "";
      const cleaned = t
        .replace(/\b(price|rate|cost|rs|rupees|mrp|kitna|kitne|kitni|daam|dam|value)\b/g, " ")
        .replace(/\b(add|buy|need|want|order|cart|chahiye|mangao|manga|lana|le aao|len aao)\b/g, " ")
        .replace(/\b(please|plz|pls|kya|hai|ka|ki|ke|my|mere|mujhe|show|find|search|available|do you have)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleaned.slice(0, 60);
    };

    const scoreTextMatch = (text, terms) => {
      const s = normalizeQuery(text);
      if (!s) return 0;
      let score = 0;
      terms.forEach((term) => {
        const k = normalizeQuery(term);
        if (!k) return;
        if (s === k) score += 10;
        if (s.includes(k)) score += 6;
        if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(s)) score += 4;
      });
      return score;
    };

    const searchProducts = async ({ storeId, query, limit = 6 }) => {
      const sid = Number(storeId || 0);
      const q = String(query || "").trim();
      if (!sid || !q) return [];
      const products = await listProductsByStoreId(sid);
      const terms = normalizeQuery(q).split(" ").filter((x) => x.length >= 2).slice(0, 6);
      const scored = (products || []).map((p) => {
        const name = String(p?.name || "");
        const cat = String(p?.category || "");
        const sc = scoreTextMatch(name, terms) * 2 + scoreTextMatch(cat, terms);
        return { p, sc };
      });
      const take = Math.max(1, Math.min(10, Number(limit || 6)));
      return scored
        .filter((x) => Number(x.sc || 0) > 0 && Number(x.p?.id || 0) > 0)
        .sort((a, b) => (b.sc || 0) - (a.sc || 0))
        .slice(0, take)
        .map((x) => x.p);
    };

    const matchProductsForIngredients = async ({ storeId, ingredients }) => {
      const products = await listProductsByStoreId(storeId);
      const found = [];
      const missing = [];

      const norm = (x) => String(x || "").toLowerCase();
      const escapeRe = (s) => String(s || "").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
      const scoreProduct = (p, keys) => {
        const name = norm(p?.name);
        const cat = norm(p?.category);
        let score = 0;
        keys.forEach((k) => {
          if (!k) return;
          const kk = norm(k);
          if (name.includes(kk)) score += 3;
          if (cat.includes(kk)) score += 1;
          if (new RegExp(`\\b${escapeRe(kk)}\\b`, "i").test(name)) score += 2;
        });
        return score;
      };

      for (const ing of ingredients) {
        const keys = ingredientKeywords(ing);
        let best = null;
        let bestScore = 0;
        for (const p of products) {
          const id = Number(p?.id || 0);
          if (!id) continue;
          const sc = scoreProduct(p, keys);
          if (sc > bestScore) {
            bestScore = sc;
            best = p;
          }
        }
        if (!best || bestScore < 3) {
          missing.push(String(ing));
          continue;
        }
        found.push({ ingredient: String(ing), product: best });
      }

      const unique = new Map();
      const cartItems = [];
      found.forEach(({ product }) => {
        const pid = Number(product?.id || 0);
        if (!pid || unique.has(pid)) return;
        unique.set(pid, true);
        cartItems.push({
          id: pid,
          name: String(product?.name || "Item"),
          price: Number(product?.price || 0),
          qty: 1,
          storeId: Number(storeId),
          seller_id: product?.seller_id || null,
        });
      });

      return { found, missing, cartItems };
    };

    const storeToLine = (s) => {
      const name = String(s?.store_name || "Store").trim();
      const rating = Number(s?.avg_rating || 0);
      const count = Number(s?.rating_count || 0);
      const minOrder = Number(s?.minimum_order || 0);
      const r = count ? `${rating.toFixed(1)} (${count})` : "New";
      return `${name}\n- Rating: ${r}\n- Min order: Rs. ${Number.isFinite(minOrder) ? minOrder : 0}`;
    };

    const showStores = async (pin) => {
      const stores = await listStoresByPincode(pin);
      if (!stores.length) {
        return [{
          text: `No stores found for pincode ${pin}.\nTry another pincode or use current location.`,
          actions: [{ label: "Use my location", type: "geo", kind: "nearbyStores", primary: true }]
        }];
      }

      const top = stores.slice(0, 3);
      const out = [{
        text: `Found ${stores.length} store(s) for ${pin}. Top picks:`,
        actions: [
          { label: "Open Home", type: "nav", href: "/welcome/customer/index.html", primary: true },
          { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html" },
        ]
      }];

      top.forEach((s) => {
        out.push({
          text: storeToLine(s),
          actions: [
            { label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${s.id}`, primary: true },
          ]
        });
      });

      return out;
    };

    const runNearbyStoresFlow = async () => {
      if (!navigator.geolocation) {
        addMsg("Location is not supported on this browser. Please share your 6-digit pincode.", "bot");
        aiState.awaiting = "pincode";
        return;
      }

      addMsg("Getting your location... (please allow permission)", "bot");
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      }).catch((e) => {
        addMsg("Couldn't access location. Please type your 6-digit pincode.", "bot");
        aiState.awaiting = "pincode";
        return null;
      });
      if (!pos) return;

      const latitude = pos.coords?.latitude;
      const longitude = pos.coords?.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        addMsg("Location coordinates look invalid. Please type your 6-digit pincode.", "bot");
        aiState.awaiting = "pincode";
        return;
      }

      let pin = "";
      let area = "";
      try {
        const data = await fetchJson("/api/location/nearby-stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        });
        pin = String(data?.pincode || "").trim();
        area = String(data?.area || "").trim();
      } catch {
        addMsg("Couldn't resolve pincode from your location. Please type your 6-digit pincode.", "bot");
        aiState.awaiting = "pincode";
        return;
      }

      if (!/^\d{6}$/.test(pin)) {
        addMsg("Couldn't resolve a valid pincode from your location. Please type your 6-digit pincode.", "bot");
        aiState.awaiting = "pincode";
        return;
      }

      setSavedPincode(pin);
      const label = area ? `${pin} (${area})` : pin;
      addMsg(`Location set: ${label}`, "bot");

      const storeMsgs = await showStores(pin);
      storeMsgs.forEach((m) => addMsg(m.text, "bot", m.actions));
    };

    const handleQuery = async (q) => {
      const raw = String(q || "").trim();
      const t = raw.toLowerCase();
      if (!t) return [{ text: "Please type a question." }];

      const callGemini = async () => {
        try {
          const { storage, key } = getChatStore();
          const history = safeParse(storage.getItem(key) || "[]", []);
          const recent = Array.isArray(history) ? history.slice(-10) : [];
          const messages = recent
            .map((m) => ({
              role: String(m?.role || "").toLowerCase() === "user" ? "user" : "model",
              text: String(m?.text || "").trim()
            }))
            .filter((m) => m.text)
            .slice(-10);

          const pin = getSavedPincode();
          const system = [
            "You are LocalBasket AI.",
            "Answer concisely in Hinglish.",
            "If user asks about stores/products/orders, guide them with the app flows.",
            pin ? `User pincode (if relevant): ${pin}.` : ""
          ].filter(Boolean).join(" ");

          const data = await fetchJson("/api/ai/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages,
              query: raw,
              system,
              model: (window.LB_GEMINI_MODEL || "").trim() || undefined
            })
          });
          const text = String(data?.text || "").trim();
          if (!text) return null;
          return [{ text }];
        } catch {
          return null;
        }
      };

      // Awaiting pincode flow
      if (aiState.awaiting === "pincode") {
        const pin = parsePincode(raw);
        if (!pin) return [{ text: "Please send a 6-digit pincode (example: 401105)." }];
        aiState.awaiting = null;
        setSavedPincode(pin);
        const area = await getAreaByPincode(pin);
        const label = area ? `${pin} (${area})` : pin;
        const msgs = [{ text: `Pincode set to ${label}.`, actions: [{ label: "Open Home", type: "nav", href: "/welcome/customer/index.html", primary: true }] }];
        const storeMsgs = await showStores(pin);
        return msgs.concat(storeMsgs);
      }

      // Pincode in query
      const inlinePin = parsePincode(raw);
      if (inlinePin) {
        setSavedPincode(inlinePin);
        const area = await getAreaByPincode(inlinePin);
        const label = area ? `${inlinePin} (${area})` : inlinePin;
        const storeMsgs = await showStores(inlinePin);
        return [{ text: `Using pincode ${label}.` }].concat(storeMsgs);
      }

      // Follow-up: "add it / add top / add 1" after a product search
      try {
        const norm = normalizeQuery(raw);
        if (aiState.lastSearch && aiState.lastSearch.products && aiState.lastSearch.products.length) {
          const wantsAdd = /\b(add|yes|ok)\b/.test(norm) && /\b(add|cart|buy|order|it|that|top|first|1|2|3)\b/.test(norm);
          if (wantsAdd && /\b(add|cart|buy|order)\b/.test(norm)) {
            let idx = 0;
            const m = norm.match(/\b(1|2|3)\b/);
            if (m) idx = Math.max(0, Number(m[1]) - 1);
            if (/\b(second)\b/.test(norm)) idx = 1;
            if (/\b(third)\b/.test(norm)) idx = 2;
            const p = aiState.lastSearch.products[idx] || aiState.lastSearch.products[0];
            if (p && Number(p.id || 0)) {
              return [{
                text: `Adding: ${String(p.name || "Item")} to cart.`,
                actions: [{
                  label: "Add to cart",
                  type: "cart",
                  payload: {
                    storeId: aiState.lastSearch.storeId,
                    storeName: aiState.lastSearch.storeName,
                    items: [{ id: p.id, name: p.name, price: p.price, qty: 1, seller_id: p.seller_id }],
                  },
                  primary: true
                }]
              }];
            }
          }
        }
      } catch {}

      // Quick greetings / thanks
      if (isGreeting(t)) {
        return [{
          text: "Hi! What would you like to do?",
          actions: [
            { label: "Nearby stores", type: "nav", href: "/welcome/customer/index.html", primary: true },
            { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html" },
            { label: "My orders", type: "nav", href: "/welcome/customer/order/customer-orders.html" },
          ]
        }, {
          text: "Try: \"stores near me\", \"ingredients for chai\", \"price of milk\", \"my orders\"."
        }];
      }
      if (isThanks(t)) {
        return [{
          text: "You're welcome. Want help with stores, recipes, prices, or orders?",
          actions: [
            { label: "Nearby stores", type: "nav", href: "/welcome/customer/index.html", primary: true },
            { label: "Recipe ingredients", type: "ask", text: "Ingredients for " },
            { label: "Search product", type: "ask", text: "Price of " },
          ]
        }];
      }

      // Cart
      if (isCartQuery(t)) {
        const cart = readCartAny();
        if (!Array.isArray(cart) || !cart.length) {
          return [{
            text: "Your cart is empty.",
            actions: [
              { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html", primary: true },
              { label: "Nearby stores", type: "nav", href: "/welcome/customer/index.html" },
            ]
          }];
        }
        const lines = cart.slice(0, 8).map((x) => {
          const name = String(x?.product_name || x?.name || x?.productName || "Item").trim();
          const qty = Number(x?.qty || x?.quantity || 1);
          const price = Number(x?.price || x?.product_price || 0);
          const total = Number.isFinite(price) ? price * (Number.isFinite(qty) ? qty : 1) : 0;
          return `- ${name} x${Number.isFinite(qty) ? qty : 1} (Rs. ${Math.max(0, Math.round(total))})`;
        });
        const msg = {
          text: `Your cart (${cart.length} item(s)):\n${lines.join("\n")}${cart.length > 8 ? "\n- ..." : ""}`,
          actions: [
            { label: "Checkout", type: "nav", href: "/welcome/customer/checkout/checkout.html", primary: true },
            { label: "Open cart", type: "nav", href: "/welcome/customer/index.html" },
          ]
        };

        const names = cart
          .map((x) => String(x?.product_name || x?.name || x?.productName || "").trim())
          .filter(Boolean)
          .slice(0, 12);
        const addons = suggestAddOnsFromNames(names);
        if (!addons.length) return [msg];
        return [msg, {
          text: `You might also need:\n- ${addons.join("\n- ")}`,
          actions: addons.slice(0, 3).map((x, i) => ({ label: `Add ${x}`, type: "ask", text: `add ${x}`, primary: i === 0 }))
        }];
      }

      // Orders
      if (/\b(my orders|my order|order status|orders)\b/.test(normalizeQuery(t))) {
        const uid = getAiUserId();
        if (!uid) {
          return [{
            text: "Please login first to see your orders.",
            actions: [{ label: "Open My Orders", type: "nav", href: "/welcome/customer/order/customer-orders.html", primary: true }]
          }];
        }
        let orders = [];
        try { orders = await listMyOrders(); } catch { orders = []; }
        if (!orders.length) {
          return [{
            text: "No orders found yet. Once you place an order, it will appear in My Orders.",
            actions: [
              { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html", primary: true },
              { label: "Open My Orders", type: "nav", href: "/welcome/customer/order/customer-orders.html" },
            ]
          }];
        }
        const top = orders.slice(0, 3).map((o) => {
          const id = o?.id ?? o?.order_id ?? o?.orderId ?? "";
          const status = String(o?.status || "").toUpperCase() || "UNKNOWN";
          const store = String(o?.store_name || o?.storeName || "").trim();
          return `- Order ${id || "(id)"}: ${status}${store ? ` (${store})` : ""}`;
        });
        return [{
          text: `Latest orders:\n${top.join("\n")}`,
          actions: [{ label: "Open My Orders", type: "nav", href: "/welcome/customer/order/customer-orders.html", primary: true }]
        }];
      }
      if (/(track).*(order)|order.*(track)/.test(t)) {
        const wanted = (String(raw || "").match(/\b(\d{3,})\b/) || [])[1] || "";
        const uid = getAiUserId();
        if (uid && wanted) {
          try {
            const orders = await listMyOrders();
            const hit = (orders || []).find((o) => String(o?.id ?? o?.order_id ?? o?.orderId ?? "") === String(wanted));
            if (hit) {
              const status = String(hit?.status || "").toUpperCase() || "UNKNOWN";
              const store = String(hit?.store_name || hit?.storeName || "").trim();
              return [{
                text: `Order ${wanted} status: ${status}${store ? ` (${store})` : ""}`,
                actions: [{ label: "Open My Orders", type: "nav", href: "/welcome/customer/order/customer-orders.html", primary: true }]
              }];
            }
          } catch {}
        }
        return [{
          text: "To track your order:\n- Open: My Orders\n- Select the latest order\n- Check the status.\n\nIf you want, share your order id here.",
          actions: [{ label: "Open My Orders", type: "nav", href: "/welcome/customer/order/customer-orders.html", primary: true }]
        }];
      }
      if (/(cancel).*(order)|order.*(cancel)/.test(t)) {
        return [{
          text: "To cancel an order:\n- Open: My Orders\n- Select the order\n- Tap: Cancel (if available).\n\nIf it is already shipped, cancellation may not be possible.",
          actions: [{ label: "Open My Orders", type: "nav", href: "/welcome/customer/order/customer-orders.html", primary: true }]
        }];
      }

      // Stores/area/pincode
      if (/store|stores|near me|nearby|area|pincode|pin code/.test(t)) {
        const pin = getSavedPincode();
        if (!pin) {
          aiState.awaiting = "pincode";
          return [{
            text: "Tell me your 6-digit pincode, or use current location.",
            actions: [{ label: "Use my location", type: "geo", kind: "nearbyStores", primary: true }]
          }];
        }
        return await showStores(pin);
      }

      // Product search / price / add to cart (store-aware)
      if (isProductQuery(t) && !isRecipeQuery(t)) {
        const term = extractProductTerm(raw);
        if (!term) {
          return [{ text: "Which product should I search? Example: \"price of milk\" or \"add bread\"." }];
        }

        const store = await getStoreContext();
        if (!store || !Number(store?.id || 0)) {
          const pin = getSavedPincode();
          if (!pin) {
            aiState.awaiting = "pincode";
            return [{
              text: `I can search products for "${term}" if you share your 6-digit pincode, or use current location.`,
              actions: [{ label: "Use my location", type: "geo", kind: "nearbyStores", primary: true }]
            }];
          }
          const picked = await chooseStoreForPin(pin);
          if (!picked) {
            return [{
              text: `No stores found for pincode ${pin}. Try another pincode.`,
              actions: [{ label: "Set pincode", type: "ask", text: "My pincode is ", primary: true }]
            }];
          }

          const products = await searchProducts({ storeId: picked.id, query: term, limit: 6 });
          if (!products.length) {
            return [{
              text: `I couldn't find "${term}" in ${String(picked.store_name || "this store")}.`,
              actions: [{ label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${picked.id}`, primary: true }]
            }];
          }

          const lines = products.map((p) => `- ${String(p?.name || "Item")} (Rs. ${Math.max(0, Number(p?.price || 0))})`);
          const actions = [
            { label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${picked.id}` },
            ...(products.slice(0, 3).map((p, idx) => ({
              label: idx === 0 ? "Add top match" : `Add: ${String(p?.name || "Item").slice(0, 18)}`,
              type: "cart",
              payload: { storeId: picked.id, storeName: picked.store_name, items: [{ id: p.id, name: p.name, price: p.price, qty: 1, seller_id: p.seller_id }] },
              primary: idx === 0 && /\b(add|buy|need|chahiye|order)\b/.test(normalizeQuery(t))
            }))),
          ];

          try {
            aiState.lastSearch = {
              storeId: picked.id,
              storeName: String(picked.store_name || "store"),
              products: products.slice(0, 6).map((p) => ({ id: p.id, name: p.name, price: p.price, seller_id: p.seller_id })),
            };
          } catch {}
          return [{ text: `Top matches in ${String(picked.store_name || "store")} for "${term}":\n${lines.join("\n")}`, actions }];
        }

        const products = await searchProducts({ storeId: store.id, query: term, limit: 6 });
        const storeName = String(store?.store_name || store?.name || localStorage.getItem("lbAiLastStoreName") || "store");
        if (!products.length) {
          return [{
            text: `I couldn't find "${term}" in ${storeName}.`,
            actions: [{ label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${store.id}`, primary: true }]
          }];
        }

        const lines = products.map((p) => `- ${String(p?.name || "Item")} (Rs. ${Math.max(0, Number(p?.price || 0))})`);
        const actions = [
          { label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${store.id}` },
          ...(products.slice(0, 3).map((p, idx) => ({
            label: idx === 0 ? "Add top match" : `Add: ${String(p?.name || "Item").slice(0, 18)}`,
            type: "cart",
            payload: { storeId: store.id, storeName, items: [{ id: p.id, name: p.name, price: p.price, qty: 1, seller_id: p.seller_id }] },
            primary: idx === 0 && /\b(add|buy|need|chahiye|order)\b/.test(normalizeQuery(t))
          }))),
        ];

        try {
          aiState.lastSearch = {
            storeId: store.id,
            storeName,
            products: products.slice(0, 6).map((p) => ({ id: p.id, name: p.name, price: p.price, seller_id: p.seller_id })),
          };
        } catch {}
        return [{ text: `Top matches in ${storeName} for "${term}":\n${lines.join("\n")}`, actions }];
      }

      // Recipes: show ingredients + suggest real products from nearby store when possible
      if (isRecipeQuery(t) || recipeDB.some((r) => r.match.test(t))) {
        const recipe = guessRecipe(raw);
        const servings = parseServings(raw);
        const header = servings ? `${recipe.title} (serves ${servings})` : recipe.title;
        const ingredientsText = `${header}\nIngredients:\n- ${recipe.ingredients.join("\n- ")}`;
        const stepsText = wantsOnlyIngredients(t) ? "" : `\n\nSteps:\n${(recipe.steps || []).slice(0, 8).map((s, i) => `${i + 1}) ${s}`).join("\n")}`;
        const fullRecipeText = `${ingredientsText}${stepsText}`;

        const pin = getSavedPincode();

        // Prefer current/remembered store if available (even without pincode).
        const store = await getStoreContext() || (pin ? await chooseStoreForPin(pin) : null);
        if (!store) {
          return [{
            text: `${fullRecipeText}\n\nTo suggest products, share your 6-digit pincode or use current location.`,
            actions: [{ label: "Use my location", type: "geo", kind: "nearbyStores", primary: true }]
          }];
        }

        const match = await matchProductsForIngredients({ storeId: store.id, ingredients: recipe.ingredients });
        const lines = match.found.slice(0, 10).map(({ ingredient, product }) => {
          const price = Number(product?.price || 0);
          const nm = String(product?.name || "Item");
          return `- ${ingredient} -> ${nm} (Rs. ${Number.isFinite(price) ? price : 0})`;
        });
        const missing = match.missing.length ? `\n\nNot found in store:\n- ${match.missing.slice(0, 8).join("\n- ")}` : "";

        const suggestionText = `Suggested products in ${String(store.store_name || "store")}:\n${lines.length ? lines.join("\n") : "- (No close matches found)"}${missing}`;

        const actions = [
          match.cartItems.length ? { label: "Add ingredients to cart", type: "cart", payload: { storeId: store.id, storeName: store.store_name, items: match.cartItems }, primary: true } : null,
          { label: "Open store", type: "nav", href: `/welcome/customer/store/store.html?id=${store.id}` },
          { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html" },
        ].filter(Boolean);

        return [
          { text: fullRecipeText, actions: [{ label: "Copy recipe", type: "copy", text: fullRecipeText, primary: true }] },
          { text: suggestionText, actions }
        ];
      }

      // Deals
      if (/deal|discount|offer|cheapest/.test(t)) {
        const pin = getSavedPincode();
        const hint = pin ? `Your pincode: ${pin}` : "Set your pincode to see nearby stores.";
        return [{
          text: `To find best deals:\n- Open Categories\n- Compare store prices\n\n${hint}`,
          actions: [
            { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html", primary: true },
            { label: "Set pincode", type: "ask", text: "My pincode is " },
          ]
        }];
      }

      const gemini = await callGemini();
      if (gemini) return gemini;

      return [{
        text: "I can help with:\n- Nearby stores\n- Grocery suggestions\n- Recipe ingredients\n- Deals\n- Orders\n\nTry: \"stores near me\", \"my pincode is 401105\", \"ingredients for chai\", \"track my order\".",
        actions: [
          { label: "Use my location", type: "geo", kind: "nearbyStores", primary: true },
          { label: "Browse categories", type: "nav", href: "/welcome/customer/category.html" },
        ]
      }];
    };

    const showChipsInChat = (items) => {
      const list = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!list.length) return;

      const wrap = document.createElement("div");
      wrap.className = "lb-ai-msg lb-ai-chips-wrap";

      const chips = document.createElement("div");
      chips.className = "lb-ai-chips";

      list.slice(0, 10).forEach((label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lb-ai-chip";
        b.textContent = String(label);
        b.addEventListener("click", () => {
          input.value = String(label);
          onSend();
        });
        chips.appendChild(b);
      });

      wrap.appendChild(chips);
      body.appendChild(wrap);
      body.scrollTop = body.scrollHeight;
    };

    const welcome = () => {
      addMsg(
        "Hi.\n\nI am LocalBasket AI.\nI can help you:\n- Find nearby stores\n- Suggest groceries\n- Help with recipes\n- Show best deals\n- Help with orders",
        "bot",
        [
          { label: "Nearby stores", type: "nav", href: "/welcome/customer/index.html", primary: true },
          { label: "Categories", type: "nav", href: "/welcome/customer/category.html" },
          { label: "My orders", type: "nav", href: "/welcome/customer/order/customer-orders.html" },
        ]
      );

      const cart = readCartAny();
      const names = cart
        .map((x) => String(x?.product_name || x?.name || x?.productName || "").trim())
        .filter(Boolean)
        .slice(0, 6);
      const has = (k) => names.some((n) => n.toLowerCase().includes(k));
      if (names.length) {
        if (has("milk") && has("bread")) {
          addMsg("I noticed milk and bread in your cart.\nYou might also need:\n- Butter\n- Eggs", "bot");
        }
      }

      showChipsInChat([
        "Find grocery stores in my area",
        "Ingredients for pasta",
        "Cheapest vegetables",
        "Track my order",
      ]);
    };

    const restore = () => {
      try {
        const { storage, key } = getChatStore();
        panel.dataset.lbAiChatKey = key;

        // Migrate legacy guest key (older builds) into the per-tab guest key.
        try {
          if (storage === sessionStorage && !storage.getItem(key) && storage.getItem("lbAiChatV1_guest")) {
            storage.setItem(key, storage.getItem("lbAiChatV1_guest"));
            storage.removeItem("lbAiChatV1_guest");
          }
        } catch {}

        const hist = safeParse(storage.getItem(key) || "[]", []);
        if (!Array.isArray(hist) || !hist.length) return false;
        body.innerHTML = "";
        hist.slice(-MAX_HISTORY).forEach((m) => {
          addMsg(String(m?.text || ""), String(m?.role || "bot") === "user" ? "user" : "bot");
        });
        return true;
      } catch {
        return false;
      }
    };

    const isMobileDock = () => {
      try { return window.matchMedia && window.matchMedia("(max-width: 768px)").matches; } catch { return false; }
    };

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const syncVisualViewportVars = () => {
      // Fix mobile keyboard issues where fixed panels can jump and header appears "missing".
      // We size the panel to the *visual* viewport when supported.
      try {
        if (!isMobileDock()) return;
        const vv = window.visualViewport;
        const h = Math.max(1, Math.round(Number(vv?.height || window.innerHeight || 1)));
        const top = Math.max(0, Math.round(Number(vv?.offsetTop || 0)));
        panel.style.setProperty("--lb-ai-vv-height", `${h}px`);
        panel.style.setProperty("--lb-ai-vv-top", `${top}px`);
      } catch {}
    };

    const applyBtnPosition = () => {
      try {
        const vh = Math.max(1, window.innerHeight || 1);
        const rect = btn.getBoundingClientRect();

        // Migrate old desktop free-move storage (x/y) to right-docked mode.
        try {
          if (!btn.__lbAiBtnPosMigrated) {
            btn.__lbAiBtnPosMigrated = true;
            localStorage.removeItem("lbAiBtnPos");
          }
        } catch {}

        // Desktop: always bottom-right (use CSS). This also clears any inline left/top.
        if (!isMobileDock()) {
          btn.style.transform = "";
          btn.style.left = "auto";
          btn.style.top = "auto";
          btn.style.right = "calc(0px + env(safe-area-inset-right, 0px))";
          btn.style.bottom = "calc(25px + env(safe-area-inset-bottom, 0px))";
          return;
        }

        const saved = Number(localStorage.getItem("lbAiBtnY") || "NaN");
        const y = Number.isFinite(saved) ? saved : Math.round(vh * 0.55 - rect.height / 2);

        // Keep button on the right edge; we only control `top` via drag.
        btn.style.transform = "none";
        btn.style.left = "auto";
        btn.style.right = "";
        btn.style.bottom = "auto";
        btn.style.top = `${clamp(y, 10, vh - rect.height - 10)}px`;
      } catch {}
    };

    const open = () => {
      const ensureIdentity = () => {
        // If user changed (logout/login), switch to that user's chat store.
        try {
          const { key } = getChatStore();
          if (panel.dataset.lbAiChatKey && panel.dataset.lbAiChatKey !== key) {
            body.innerHTML = "";
            panel.__lbAiWelcomed = false;
            panel.dataset.lbAiChatKey = "";
            return true;
          }
        } catch {}
        return false;
      };

      ensureIdentity();

      panel.classList.add("lb-ai-open");
      backdrop.classList.add("lb-ai-open");
      btn.classList.add("lb-ai-hidden");
      btn.setAttribute("aria-expanded", "true");
      panel.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      // First open can render with stale visual viewport metrics on some mobile browsers.
      // Sync a few times across frames so header/body/footer sizes settle without requiring reload.
      syncVisualViewportVars();
      try { requestAnimationFrame(() => syncVisualViewportVars()); } catch {}
      try { setTimeout(syncVisualViewportVars, 60); } catch {}
      try { setTimeout(syncVisualViewportVars, 220); } catch {}
      try {
        window.visualViewport?.addEventListener("resize", syncVisualViewportVars, { passive: true });
        window.visualViewport?.addEventListener("scroll", syncVisualViewportVars, { passive: true });
      } catch {}
      try { input.focus(); } catch {}
      if (!panel.__lbAiWelcomed) {
        panel.__lbAiWelcomed = true;
        if (!restore()) welcome();
        try { requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; }); } catch {}
        try { setTimeout(() => { try { body.scrollTop = body.scrollHeight; } catch {} }, 80); } catch {}
      }

      // Safety: while open, periodically re-check identity so chat doesn't leak
      // if the user logs out/logs in without reloading the page.
      try { clearInterval(panel.__lbAiIdentityWatch); } catch {}
      try {
        panel.__lbAiIdentityWatch = setInterval(() => {
          if (!panel.classList.contains("lb-ai-open")) return;
          const changed = ensureIdentity();
          if (changed && !panel.__lbAiWelcomed) {
            panel.__lbAiWelcomed = true;
            if (!restore()) welcome();
          }
        }, 1200);
      } catch {}
    };

    const closePanel = () => {
      panel.classList.remove("lb-ai-open");
      backdrop.classList.remove("lb-ai-open");
      btn.classList.remove("lb-ai-hidden");
      btn.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      try {
        window.visualViewport?.removeEventListener("resize", syncVisualViewportVars);
        window.visualViewport?.removeEventListener("scroll", syncVisualViewportVars);
      } catch {}
      try { clearInterval(panel.__lbAiIdentityWatch); } catch {}
    };

    const onSend = () => {
      const q = String(input.value || "").trim();
      if (!q) return;
      input.value = "";
      addMsg(q, "user");

      // typing indicator (simple)
      const typing = document.createElement("div");
      typing.className = "lb-ai-msg";
      typing.setAttribute("data-lb-ai-role", "bot");
      typing.setAttribute("data-lb-ai-text", "typing");
      typing.setAttribute("data-lb-ai-ts", String(Date.now()));
      typing.innerHTML = `
        <span class="lb-ai-typing" aria-label="Typing">
          <span>Typing</span>
          <span class="dots" aria-hidden="true">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        </span>
      `;
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;

      (async () => {
        await sleep(180);
        let msgs = [];
        try {
          msgs = await handleQuery(q);
        } catch (e) {
          msgs = [{ text: `Sorry, something went wrong. ${e?.message || ""}`.trim() }];
        }
        try { typing.remove(); } catch {}
        (msgs || []).forEach((m) => addMsg(m.text, "bot", m.actions || null));
      })();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSend();
      }
    });

    // When keyboard opens, keep panel sized to the visible area.
    input.addEventListener("focus", () => {
      syncVisualViewportVars();
      try { body.scrollTop = body.scrollHeight; } catch {}
    });

    // Drag: docked vertical move (keeps button on the right edge). Click/tap opens panel.
    applyBtnPosition();
    // First paint on some mobile browsers can report a "wrong" visual viewport until after load.
    // Sync a few times so the chat shell sizes correctly without requiring reload.
    syncVisualViewportVars();
    try { requestAnimationFrame(() => syncVisualViewportVars()); } catch {}
    try { setTimeout(syncVisualViewportVars, 60); } catch {}
    try { window.addEventListener("load", () => { try { syncVisualViewportVars(); } catch {} }, { once: true, passive: true }); } catch {}
    window.addEventListener("resize", applyBtnPosition, { passive: true });

    let dragStartX = 0;
    let dragStartY = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;
    let dragging = false;

    const onPointerMove = (e) => {
      if (!dragging) return;
      try { if (e.cancelable) e.preventDefault(); } catch {}
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;

      if (!isMobileDock()) return;
      const vh = Math.max(1, window.innerHeight || 1);
      const rect = btn.getBoundingClientRect();
      const y = clamp(startTop + dy, 10, vh - rect.height - 10);
      btn.style.top = `${y}px`;
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      try { btn.releasePointerCapture?.(btn.__lbPointerId); } catch {}

      // Persist position (Y only; keep right-docked)
      try {
        const rect = btn.getBoundingClientRect();
        if (isMobileDock()) localStorage.setItem("lbAiBtnY", String(Math.round(rect.top)));
      } catch {}

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };

    btn.addEventListener("pointerdown", (e) => {
      if (panel.classList.contains("lb-ai-open")) return;
      if (!isMobileDock()) return;
      try { if (e.cancelable) e.preventDefault(); } catch {}
      moved = false;
      dragging = true;
      btn.__lbPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      try { btn.setPointerCapture?.(e.pointerId); } catch {}
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    });

    // Touch fallback (for browsers where pointer events are unreliable)
    if (typeof window !== "undefined" && !("PointerEvent" in window)) {
      btn.addEventListener("touchstart", (e) => {
        if (panel.classList.contains("lb-ai-open")) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        moved = false;
        dragging = true;
        dragStartX = t.clientX;
        dragStartY = t.clientY;
        const rect = btn.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
      }, { passive: true });

      window.addEventListener("touchmove", (e) => {
        if (!dragging) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        const fake = { clientX: t.clientX, clientY: t.clientY, cancelable: false };
        onPointerMove(fake);
      }, { passive: false });

      window.addEventListener("touchend", endDrag, { passive: true });
      window.addEventListener("touchcancel", endDrag, { passive: true });
    }

    btn.addEventListener("click", () => {
      if (moved) { moved = false; return; }
      if (panel.classList.contains("lb-ai-open")) closePanel();
      else open();
    });
    close.addEventListener("click", closePanel);
    backdrop.addEventListener("click", closePanel);
    send.addEventListener("click", onSend);
    clearBtn.addEventListener("click", async () => {
      const ok = typeof window.lbConfirm === "function"
        ? await window.lbConfirm("Clear this chat?", "Confirm")
        : confirm("Clear this chat?");
      if (!ok) return;
      body.innerHTML = "";
      try {
        const { storage, key } = getChatStore();
        storage.removeItem(key);
      } catch {}
      panel.__lbAiWelcomed = false;
      welcome();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onSend();
      if (e.key === "Escape") closePanel();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
  };

  // Ensure AI widget early so it feels native across pages.
  try { ensureAiWidget(); } catch {}

  const ensureMaintenanceOverlay = () => {
    if (document.getElementById("lb-maintenance-overlay")) return;

    const style = document.createElement("style");
    style.id = "lb-maintenance-style";
    style.textContent = `
      #lb-maintenance-overlay{
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(2,6,23,0.62);
        backdrop-filter: blur(10px);
      }
      #lb-maintenance-card{
        width: min(520px, calc(100vw - 36px));
        border-radius: 18px;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid rgba(148,163,184,0.35);
        box-shadow: 0 30px 60px -40px rgba(2,6,23,0.55);
        padding: 18px;
        display: grid;
        gap: 12px;
      }
      #lb-maintenance-kicker{
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        color: #f97316;
      }
      #lb-maintenance-title{
        font-size: 22px;
        font-weight: 900;
        margin: 0;
      }
      #lb-maintenance-text{
        font-size: 14px;
        line-height: 1.5;
        color: rgba(15,23,42,0.78);
        margin: 0;
      }
      #lb-maintenance-actions{
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 6px;
      }
      #lb-maintenance-actions button{
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: 900;
        border: 1px solid rgba(148,163,184,0.4);
        background: #ffffff;
        color: #0f172a;
        cursor: pointer;
      }
      #lb-maintenance-actions button.primary{
        border-color: transparent;
        background: linear-gradient(135deg, #f97316, #fb923c);
        color: #1f2937;
        box-shadow: 0 12px 22px -18px rgba(251,146,60,0.9);
      }
      html.lb-theme-dark #lb-maintenance-card{
        background: #0b1220;
        color: #e2e8f0;
        border-color: rgba(148,163,184,0.2);
        box-shadow: 0 40px 70px -50px rgba(0,0,0,0.75);
      }
      html.lb-theme-dark #lb-maintenance-text{ color: rgba(226,232,240,0.75); }
      html.lb-theme-dark #lb-maintenance-actions button{
        background: rgba(15,23,42,0.85);
        color: #e2e8f0;
        border-color: rgba(148,163,184,0.25);
      }
      @media (max-width: 520px){
        #lb-maintenance-title{ font-size: 20px; }
        #lb-maintenance-actions{ justify-content: stretch; }
        #lb-maintenance-actions button{ flex: 1 1 auto; }
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "lb-maintenance-overlay";
    overlay.innerHTML = `
      <div id="lb-maintenance-card" role="dialog" aria-modal="true" aria-label="Maintenance Mode">
        <div id="lb-maintenance-kicker">Maintenance Mode</div>
        <h2 id="lb-maintenance-title">We will be back soon</h2>
        <p id="lb-maintenance-text">LocalBasket is temporarily unavailable while we do some updates. Please try again later.</p>
        <div id="lb-maintenance-actions">
          <button type="button" class="primary" data-lb-maint-refresh>Refresh</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const refreshBtn = overlay.querySelector("[data-lb-maint-refresh]");
    refreshBtn?.addEventListener("click", () => window.location.reload());
  };

  const showMaintenanceOverlay = () => {
    ensureMaintenanceOverlay();
    const overlay = document.getElementById("lb-maintenance-overlay");
    if (!overlay) return;
    overlay.style.display = "flex";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  };

  const hideMaintenanceOverlay = () => {
    const overlay = document.getElementById("lb-maintenance-overlay");
    if (!overlay) return;
    overlay.style.display = "none";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  };

  const fetchSystemStatus = async () => {
    const base = String(window.API_BASE_URL || "").replace(/\/+$/, "");
    const url = `${base}/api/system/status?v=${encodeURIComponent(LB_COMPONENTS_VERSION)}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store", credentials: "include" });

    // If backend blocks non-whitelisted APIs in maintenance, it still allows /api/system/status.
    // Still, support the 503 body as a fallback.
    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch {}
      return payload;
    }
    return res.json();
  };

  const applyMaintenanceMode = async () => {
    if (isAdminPage) return;
    try {
      const status = await fetchSystemStatus();
      const mode = String(status && (status.system_mode || status.systemMode) || "").toLowerCase();
      const isMaintenance = mode === "maintenance" || !!(status && status.maintenance);
      if (isMaintenance) {
        sessionStorage.setItem("lbMaintenance", "1");
        showMaintenanceOverlay();
      } else {
        sessionStorage.removeItem("lbMaintenance");
        hideMaintenanceOverlay();
      }
    } catch {
      // If last known mode was maintenance, keep blocking until a successful check clears it.
      if (sessionStorage.getItem("lbMaintenance") === "1") showMaintenanceOverlay();
    }
  };

  await applyMaintenanceMode();

  if (
    path.includes("seller") ||
    path.includes("admin") ||
    path.includes("auth")
  ) {
    console.log("Skipping header/footer for auth pages");
    return;
  }

  function ensureSharedStyles() {
    if (document.querySelector('link[data-lb-shared-style="header-footer"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = withRootBase("/css/header-footer.css");
    link.setAttribute("data-lb-shared-style", "header-footer");
    document.head.appendChild(link);
  }

  ensureSharedStyles();

  function applySharedAssetBindings(scope) {
    if (!scope) return;
    scope.querySelectorAll("[data-lb-href]").forEach((el) => {
      const target = (el.getAttribute("data-lb-href") || "").trim();
      if (!target) return;
      el.setAttribute("href", welcomePath(target));
    });
    scope.querySelectorAll("[data-lb-src]").forEach((el) => {
      const target = (el.getAttribute("data-lb-src") || "").trim();
      if (!target) return;
      el.setAttribute("src", welcomePath(target));
    });
  }

  function reInitializeUI() {
    const OPEN_LOCATION_FLAG = "lbOpenLocationAfterRedirect";
    const OPEN_CART_FLAG = "lbOpenCartAfterRedirect";
    const escapeHtml = (value) =>
      String(value || "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch]));
    const setLocationTicker = (elementId, text, opts = {}) => {
      const target = document.getElementById(elementId);
      if (!target) return;

      const rawText = String(text || "Select Location");
      const safeText = escapeHtml(rawText);
      const spacer = Number(opts.spacer || 32);
      const minOverflow = Number(opts.minOverflow || 6);
      const minSpeed = Number(opts.minSpeed || 7);
      const maxSpeed = Number(opts.maxSpeed || 18);
      const speedDivisor = Number(opts.speedDivisor || 22);

      target.dataset.lbTickerApplying = "1";
      target.innerHTML = `<span class="lb-loc-marquee-track"><span class="lb-loc-copy">${safeText}</span></span>`;
      target.classList.remove("is-marquee");
      target.style.removeProperty("--lb-loc-loop");
      target.style.removeProperty("--lb-loc-speed");

      const track = target.querySelector(".lb-loc-marquee-track");
      const copy = target.querySelector(".lb-loc-copy");
      if (!track) return;

      requestAnimationFrame(() => {
        const copyWidth = Math.ceil(copy ? copy.scrollWidth : track.scrollWidth);
        const overflow = Math.ceil(copyWidth - target.clientWidth);
        if (overflow > minOverflow) {
          const shift = overflow + spacer;
          const speed = Math.max(minSpeed, Math.min(maxSpeed, shift / speedDivisor));
          target.style.setProperty("--lb-loc-loop", String(shift));
          target.style.setProperty("--lb-loc-gap", `${spacer}px`);
          target.style.setProperty("--lb-loc-speed", `${speed}s`);
          target.classList.add("is-marquee");
        }
        target.dataset.lbTickerApplying = "";
      });
    };
    const setMobileLocationTicker = (text) => {
      setLocationTicker("locTextMobile", text, { spacer: 32, minOverflow: 6, minSpeed: 7, maxSpeed: 18, speedDivisor: 22 });
      setSharedMobileHeaderAddress(text);
    };
    const setDesktopLocationTicker = (text) =>
      setLocationTicker("locText", text, { spacer: 26, minOverflow: 8, minSpeed: 8, maxSpeed: 20, speedDivisor: 24 });
    const setSharedMobileHeaderAddress = (text) => {
      const target = document.getElementById("mobileHeaderAddress");
      if (target) target.textContent = String(text || "Select Location");
    };

    const syncBottomNavSpacing = () => {
      const nav = document.querySelector(".lb-bottom-nav");
      if (!nav) return;

      const display = getComputedStyle(nav).display;
      if (display === "none") return;

      // Avoid double-padding on pages that already reserve space for the fixed bottom nav.
      const height = Math.ceil(nav.getBoundingClientRect().height || 0);
      if (!height) return;

      const bodyStyles = getComputedStyle(document.body);
      const currentPad = Math.max(0, parseFloat(bodyStyles.paddingBottom) || 0);
      const needed = height + 10;

      if (currentPad < needed) {
        document.body.style.paddingBottom = `${needed}px`;
      }
    };
    const getDefaultTimeZone = () => "Asia/Kolkata";
    const isValidTimeZone = (timeZone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: String(timeZone || "") }).format(new Date(0));
        return true;
      } catch {
        return false;
      }
    };
    const getAppTimeZone = () => {
      const candidate = getDefaultTimeZone();
      return isValidTimeZone(candidate) ? candidate : "Asia/Kolkata";
    };
    const getHourInTimeZone = (timeZone) => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          hour12: false,
          timeZone: String(timeZone || "Asia/Kolkata")
        }).formatToParts(new Date());
        const hourPart = parts.find((p) => p.type === "hour")?.value;
        const hour = Number(hourPart);
        return Number.isFinite(hour) ? hour : new Date().getHours();
      } catch {
        return new Date().getHours();
      }
    };
    const getTimeGreeting = () => {
      const hour = getHourInTimeZone(getAppTimeZone());
      // Treat late night / early morning as "Good Night" (0-4).
      if (hour < 5) return "Good Night";
      if (hour < 12) return "Good Morning";
      if (hour < 17) return "Good Afternoon";
      if (hour < 21) return "Good Evening";
      return "Good Night";
    };
    const getMobilePageTitle = (path) => {
      const value = String(path || "").toLowerCase();
      if (value.includes("/customer/store/")) return "Explore Stores";
      if (value.includes("/customer/profile/")) return "My Profile";
      if (value.includes("/customer/order/")) return "My Orders";
      if (value.includes("/customer/support/")) return "Help Center";
      if (value.includes("/customer/checkout/")) return "Checkout";
      if (value.includes("/customer/category")) return "Explore Categories";
      return "LocalBasket";
    };
    const watchLocationTicker = (elementId, opts = {}) => {
      const target = document.getElementById(elementId);
      if (!target || target.dataset.lbTickerWatch === "1") return;
      target.dataset.lbTickerWatch = "1";

      let rafId = 0;
      const reapply = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const rawText = String(target.textContent || "").replace(/\s+/g, " ").trim() || "Select Location";
          setLocationTicker(elementId, rawText, opts);
        });
      };

      const observer = new MutationObserver(() => {
        if (target.dataset.lbTickerApplying === "1") return;
        reapply();
      });
      observer.observe(target, { childList: true, characterData: true, subtree: true });
      reapply();
    };
    window.lbSetLocMobileText = setMobileLocationTicker;
    window.lbSetLocDesktopText = setDesktopLocationTicker;

    // Login popup
    if (window.initAuth) {
      window.initAuth();
    }

    // Cart system
    if (window.initCart) {
      window.initCart();
    }

    // Theme toggle
    if (window.initTheme) {
      window.initTheme();
    }
    const mobileThemeSlot = document.getElementById("lbMobileThemeSlot");
    const mobileThemeToggle = document.getElementById("lbThemeToggleBtnMobile");
    if (mobileThemeSlot && mobileThemeToggle) {
      mobileThemeSlot.classList.add("has-toggle");
    }

    const syncHeaderAuth = () => {
      let user = null;
      try {
        user = JSON.parse(localStorage.getItem("lbUser") || "null");
      } catch (err) {
        user = null;
      }

      const loginBtn = document.getElementById("loginBtn");
      const userAccount = document.getElementById("userAccount");
      const userInitials = document.getElementById("userInitials");
      const userFullName = document.getElementById("userFullName");
      const mobileHeaderKicker = document.getElementById("mobileHeaderKicker");
      const mobileGreetingEyebrow = document.getElementById("mobileGreetingEyebrow");
      const mobileHeaderName = document.getElementById("mobileHeaderName");
      const mobileHeaderAction = document.getElementById("mobileHeaderAction");
      const currentPath = String(window.location.pathname || "").toLowerCase();
      const isInnerMobileHeader = document.body.classList.contains("lb-mobile-inner-header");

      const normalizedId = user && (user.id || user.customer_id || user._id || user.user_id || user.customerId);
      if (user && !user.id && normalizedId) {
        user.id = normalizedId;
        try {
          localStorage.setItem("lbUser", JSON.stringify(user));
        } catch (err) {
          // ignore storage failures
        }
      }

      const token = String(localStorage.getItem("lbToken") || "").trim();
      const hasUser = !!(
        token ||
        (user && (user.id || user.customer_id || user._id || user.user_id || user.phone || user.mobile || user.email))
      );

      if (loginBtn) loginBtn.style.display = hasUser ? "none" : "inline-flex";
      if (userAccount) userAccount.style.display = hasUser ? "flex" : "none";
      syncBottomNavSpacing();
      const timeGreeting = getTimeGreeting();
      if (mobileHeaderKicker) {
        mobileHeaderKicker.textContent = timeGreeting;
        mobileHeaderKicker.style.display = hasUser ? "" : "none";
      }
      if (mobileGreetingEyebrow) {
        mobileGreetingEyebrow.textContent = timeGreeting;
        mobileGreetingEyebrow.style.display = hasUser ? "" : "none";
      }

      if (hasUser) {
        const fullName = String(user.name || user.full_name || user.phone || user.email || "User").trim();
        const firstName = fullName.split(/\s+/).filter(Boolean)[0] || "User";
        const initials = fullName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part.charAt(0).toUpperCase())
          .join("") || "U";
        if (userInitials) userInitials.textContent = initials;
        if (userFullName) userFullName.textContent = fullName;
        if (mobileHeaderName) {
          mobileHeaderName.textContent = isInnerMobileHeader ? getMobilePageTitle(currentPath) : fullName;
        }
        if (mobileHeaderAction) {
          mobileHeaderAction.textContent = "Profile";
          mobileHeaderAction.setAttribute("aria-label", `Open ${firstName} profile`);
          mobileHeaderAction.onclick = () => {
            if (window.viewProfile) window.viewProfile();
            else window.location.href = "/welcome/customer/profile/profile.html";
          };
        }
      } else {
        if (userInitials) userInitials.textContent = "";
        if (userFullName) userFullName.textContent = "Welcome!";
        if (mobileHeaderName) {
          if (isInnerMobileHeader) {
            mobileHeaderName.textContent = getMobilePageTitle(currentPath);
          } else {
            mobileHeaderName.innerHTML = `<span class="lb-brand-mark"><span class="lb-brand-accent">Local</span>Basket</span>`;
          }
        }
        if (mobileHeaderAction) {
          mobileHeaderAction.textContent = "Login";
          mobileHeaderAction.setAttribute("aria-label", "Open login");
          mobileHeaderAction.onclick = () => {
            if (window.openAuth) window.openAuth();
            else document.getElementById("loginBtn")?.click();
          };
        }
      }
    };

    syncHeaderAuth();
    if (!document.body.dataset.lbGreetingClockBound) {
      window.setInterval(() => {
        const token = String(localStorage.getItem("lbToken") || "").trim();
        let user = null;
        try { user = JSON.parse(localStorage.getItem("lbUser") || "null"); } catch { user = null; }
        const hasUser = !!(
          token ||
          (user && (user.id || user.customer_id || user._id || user.user_id || user.phone || user.mobile || user.email))
        );
        const mobileHeaderKicker = document.getElementById("mobileHeaderKicker");
        const mobileGreetingEyebrow = document.getElementById("mobileGreetingEyebrow");
        const timeGreeting = getTimeGreeting();
        if (mobileHeaderKicker) {
          mobileHeaderKicker.textContent = timeGreeting;
          mobileHeaderKicker.style.display = hasUser ? "" : "none";
        }
        if (mobileGreetingEyebrow) {
          mobileGreetingEyebrow.textContent = timeGreeting;
          mobileGreetingEyebrow.style.display = hasUser ? "" : "none";
        }
      }, 60000);
      document.body.dataset.lbGreetingClockBound = "1";
    }

    // Navbar buttons
    document.querySelectorAll("[data-login]")
      .forEach(btn => btn.onclick = () =>
        document.getElementById("authModal")?.classList.add("active")
      );

    const savedAddress = String(localStorage.getItem("lbAddr") || "").trim();
    if (savedAddress) {
      setDesktopLocationTicker(savedAddress);
      setMobileLocationTicker(savedAddress);
      setSharedMobileHeaderAddress(savedAddress);
    }
    if (!savedAddress) setSharedMobileHeaderAddress("Select Location");
    watchLocationTicker("locText", { spacer: 26, minOverflow: 8, minSpeed: 8, maxSpeed: 20, speedDivisor: 24 });
    watchLocationTicker("locTextMobile", { spacer: 32, minOverflow: 6, minSpeed: 7, maxSpeed: 18, speedDivisor: 22 });

    const goBackSafe = () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = "/welcome/customer/index.html";
    };

    const currentPath = String(window.location.pathname || "").toLowerCase();
    const isHomePage =
      currentPath.endsWith("/welcome/customer/index.html") ||
      currentPath === "/welcome/customer/index.html";
    const isCategoryPage = currentPath.includes("/welcome/customer/category");
    document.body.classList.toggle("lb-mobile-inner-header", !isHomePage && !isCategoryPage);

    ["lbHeaderBackBtn", "lbHeaderBackBtnMobile", "mobileHeaderInlineBack"].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.style.display = isHomePage ? "none" : "inline-flex";
      if (btn.dataset.lbBackBound) return;
      btn.addEventListener("click", goBackSafe);
      btn.dataset.lbBackBound = "1";
    });

    const openLocation = () => {
      const modal = document.getElementById("locationModal");
      if (modal) {
        modal.style.display = "flex";
        window.dispatchEvent(new Event("lb-location-modal-opened"));
        return;
      }

      if (window.getLocation) {
        window.getLocation();
        return;
      }

      try {
        sessionStorage.setItem(OPEN_LOCATION_FLAG, "1");
      } catch (err) {
        // ignore storage failures
      }
      window.location.href = "/welcome/customer/index.html";
    };

    ["locBtn", "mobileLocBtn"].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.lbLocBound) return;
      btn.addEventListener("click", openLocation);
      btn.dataset.lbLocBound = "1";
    });
    const mobileHeaderSummary = document.getElementById("mobileHeaderSummary");
    if (mobileHeaderSummary) {
      const isInnerMobileHeader = document.body.classList.contains("lb-mobile-inner-header");
      if (!isInnerMobileHeader && !mobileHeaderSummary.dataset.lbLocBound) {
        mobileHeaderSummary.addEventListener("click", openLocation);
        mobileHeaderSummary.dataset.lbLocBound = "1";
      }
    }

    const openCart = () => {
      if (typeof window.toggleCart === "function") {
        window.toggleCart(true);
        return;
      }

      const drawer = document.getElementById("cartDrawer");
      const overlay = document.getElementById("cartOverlay");
      if (drawer && overlay) {
        drawer.classList.add("active");
        overlay.style.display = "block";
        return;
      }

      const sharedDrawer = document.getElementById("lbCartDrawer");
      const sharedOverlay = document.getElementById("lbCartOverlay");
      if (sharedDrawer && sharedOverlay) {
        sharedDrawer.classList.add("active");
        sharedOverlay.style.display = "block";
      }
    };

    ["cartPill"].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.lbCartBound) return;
      btn.style.cursor = "pointer";
      btn.addEventListener("click", openCart);
      btn.dataset.lbCartBound = "1";
    });

    const isUserLoggedIn = () => {
      try {
        const raw = localStorage.getItem("lbUser");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed && (parsed.id || parsed.customer_id || parsed.phone || parsed.email));
      } catch (err) {
        return false;
      }
    };

    const openLoginPopup = () => {
      if (window.openAuth) {
        window.openAuth();
        return;
      }
      const loginBtn = document.getElementById("loginBtn");
      if (loginBtn) loginBtn.click();
    };

    const navItems = document.querySelectorAll(".lb-nav-item[data-nav]");
    if (navItems.length) {
      navItems.forEach((btn) => {
        if (btn.dataset.lbNavBound) return;
        const key = String(btn.getAttribute("data-nav") || "").trim();
        if (!key) return;
        btn.addEventListener("click", () => {
          if (key === "home") window.location.href = "/welcome/customer/index.html";
          if (key === "browse") window.location.href = "/welcome/customer/category.html";
          if (key === "cart") openCart();
          if (key === "profile") {
            if (!isUserLoggedIn()) {
              openLoginPopup();
              return;
            }
            window.location.href = "/welcome/customer/profile/profile.html";
          }
        });
        btn.dataset.lbNavBound = "1";
      });

      const currentPath = String(window.location.pathname || "").toLowerCase();
      let activeKey = "home";
      if (currentPath.includes("/customer/category")) activeKey = "browse";
      else if (currentPath.includes("/customer/profile")) activeKey = "profile";
      else if (currentPath.includes("/customer/checkout")) activeKey = "cart";

      navItems.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-nav") === activeKey);
      });
    }

    const accountBtn = document.getElementById("accountBtn");
    const userMenu = document.getElementById("userMenu");
    const userAccount = document.getElementById("userAccount");

    if (accountBtn && !accountBtn.dataset.lbAccountBound) {
      accountBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const hasStoredUser = isUserLoggedIn();
        const isVisibleLoggedIn =
          !!(userAccount && getComputedStyle(userAccount).display !== "none");
        const isLoggedIn = hasStoredUser || isVisibleLoggedIn;

        if (!isLoggedIn) {
          openLoginPopup();
          return;
        }

        if (!userMenu) return;
        const isOpen = userMenu.style.display === "flex";
        userMenu.style.display = isOpen ? "none" : "flex";
      });
      accountBtn.dataset.lbAccountBound = "1";
    }

    if (userMenu && !userMenu.dataset.lbMenuActionBound) {
      userMenu.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("button[data-action]");
        if (!actionBtn) return;
        const action = String(actionBtn.getAttribute("data-action") || "").trim();

        if (action === "profile") {
          if (window.viewProfile) window.viewProfile();
          else window.location.href = "/welcome/customer/profile/profile.html";
        }
        if (action === "orders") {
          if (window.viewOrders) window.viewOrders();
          else window.location.href = "/welcome/customer/order/customer-orders.html";
        }
        if (action === "logout") {
          // Clear any scroll locks (dialogs/overlays) before logout flow.
          document.documentElement.style.overflow = "";
          document.body.style.overflow = "";

          // Ensure login/location overlays don't keep covering the bottom nav after logout.
          ["authOverlay", "authModal", "locationModal", "cartOverlay"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.display = "none";
            el.classList?.remove?.("active");
          });

          if (window.logoutUser) window.logoutUser();
          else {
            localStorage.removeItem("lbUser");
            localStorage.removeItem("lbToken");
            userMenu.style.display = "none";
            syncHeaderAuth();
            window.dispatchEvent(new Event("lb-auth-updated"));
          }
        }
      });
      userMenu.dataset.lbMenuActionBound = "1";
    }

    if (!document.body.dataset.lbAccountOutsideBound) {
      window.addEventListener("click", (e) => {
        const menu = document.getElementById("userMenu");
        if (!menu) return;
        if (e.target.closest("#accountBtn") || e.target.closest("#userMenu")) return;
        menu.style.display = "none";
      });
      document.body.dataset.lbAccountOutsideBound = "1";
    }

    if (!document.body.dataset.lbAuthSyncBound) {
      window.addEventListener("lb-auth-updated", syncHeaderAuth);
      window.addEventListener("storage", (e) => {
        if (e.key === "lbUser" || e.key === "lbToken") syncHeaderAuth();
      });
      document.body.dataset.lbAuthSyncBound = "1";
    }

    // Ensure spacing after footer/nav injection.
    syncBottomNavSpacing();

    if (!document.body.dataset.lbHrefDelegateBound) {
      document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-lb-href]");
        if (!el) return;
        const target = String(el.getAttribute("data-lb-href") || "").trim();
        if (!target) return;
        e.preventDefault();
        window.location.href = welcomePath(target);
      });
      document.body.dataset.lbHrefDelegateBound = "1";
    }

    const sellerBtn = document.getElementById("lbFooterSellerBtn");
    if (sellerBtn && !sellerBtn.dataset.lbBound) {
      sellerBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.href = welcomePath("seller/seller-auth/seller-auth.html");
      });
      sellerBtn.dataset.lbBound = "1";
    }

    const ADMIN_AUTH_KEY = "lbAdminAuth";
    const ADMIN_LOGIN_REDIRECT_FLAG = "lbOpenAdminLoginAfterRedirect";
    const ADMIN_RETURN_PATH_KEY = "lbAdminReturnPath";
    const adminBtn = document.getElementById("lbAdminLoginBtn");
    const adminOverlay = document.getElementById("lbAdminPopupOverlay");
    const adminClose = document.getElementById("lbAdminPopupClose");
    const adminForm = document.getElementById("lbAdminPopupForm");
    const adminEmailInput = document.getElementById("lbAdminEmail");
    const adminOtpInput = document.getElementById("lbAdminOtp");
    const adminSendOtpBtn = document.getElementById("lbAdminSendOtpBtn");
    const adminOtpToggle = document.getElementById("lbAdminOtpToggle");
    const adminError = document.getElementById("lbAdminPopupError");

    let adminResendTimer = null;
    let adminResendRemaining = 0;
    let adminOtpExpiryTimer = null;
    let adminOtpExpiryRemaining = 0;

    const setAdminMsg = (text) => {
      if (!adminError) return;
      adminError.textContent = String(text || "");
    };

    const clearAdminTimers = () => {
      try { if (adminResendTimer) clearInterval(adminResendTimer); } catch {}
      try { if (adminOtpExpiryTimer) clearInterval(adminOtpExpiryTimer); } catch {}
      adminResendTimer = null;
      adminOtpExpiryTimer = null;
      adminResendRemaining = 0;
      adminOtpExpiryRemaining = 0;
    };

    const startAdminResendCooldown = (seconds = 30) => {
      if (!adminSendOtpBtn) return;
      if (adminResendTimer) clearInterval(adminResendTimer);
      adminResendRemaining = Math.max(1, Number(seconds) || 30);
      adminSendOtpBtn.disabled = true;
      adminSendOtpBtn.textContent = `Resend in ${adminResendRemaining}s`;
      adminResendTimer = setInterval(() => {
        adminResendRemaining -= 1;
        if (adminResendRemaining <= 0) {
          clearInterval(adminResendTimer);
          adminResendTimer = null;
          adminSendOtpBtn.disabled = false;
          adminSendOtpBtn.textContent = "Resend OTP";
          return;
        }
        adminSendOtpBtn.textContent = `Resend in ${adminResendRemaining}s`;
      }, 1000);
    };

    const startAdminOtpExpiry = (seconds = 300) => {
      if (adminOtpExpiryTimer) clearInterval(adminOtpExpiryTimer);
      adminOtpExpiryRemaining = Math.max(1, Number(seconds) || 300);
      const fmt = (s) => {
        const n = Math.max(0, s | 0);
        const mm = String(Math.floor(n / 60)).padStart(2, "0");
        const ss = String(n % 60).padStart(2, "0");
        return `${mm}:${ss}`;
      };
      setAdminMsg(`OTP expires in ${fmt(adminOtpExpiryRemaining)}`);
      adminOtpExpiryTimer = setInterval(() => {
        adminOtpExpiryRemaining -= 1;
        if (adminOtpExpiryRemaining <= 0) {
          clearInterval(adminOtpExpiryTimer);
          adminOtpExpiryTimer = null;
          setAdminMsg("OTP expired. Tap Resend OTP.");
          return;
        }
        setAdminMsg(`OTP expires in ${fmt(adminOtpExpiryRemaining)}`);
      }, 1000);
    };

    const getAdminAuth = () => {
      try {
        const raw = localStorage.getItem(ADMIN_AUTH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const now = Date.now();
        const expiresAt = Number(parsed.expiresAt || 0);
        if (expiresAt && now > expiresAt) {
          localStorage.removeItem(ADMIN_AUTH_KEY);
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    };

    const saveAdminAuth = (auth, userId) => {
      const expiresAtMs = Date.parse(String(auth?.expires_at || "")) || (Date.now() + 12 * 60 * 60 * 1000);
      const session = {
        userId: String(userId || auth?.email || "admin").trim() || "admin",
        token: String(auth?.token || "").trim(),
        role: String(auth?.role || "admin").trim() || "admin",
        tokenType: String(auth?.token_type || "Bearer").trim() || "Bearer",
        loggedInAt: Date.now(),
        expiresAt: expiresAtMs,
        expires_at_ms: expiresAtMs,
        expires_at: String(auth?.expires_at || "")
      };
      localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(session));
      if (session.token) localStorage.setItem("admin_token", session.token);
    };

    const goAdminDashboard = () => {
      let target = welcomePath("admin/admin.html");
      try {
        const saved = String(sessionStorage.getItem(ADMIN_RETURN_PATH_KEY) || "").trim();
        if (saved.startsWith("/welcome/admin/")) {
          target = saved;
        }
        sessionStorage.removeItem(ADMIN_RETURN_PATH_KEY);
      } catch {
        // ignore storage errors
      }
      window.location.href = target;
    };

    const openAdminPopup = () => {
      if (!adminOverlay) {
        try {
          sessionStorage.setItem(ADMIN_LOGIN_REDIRECT_FLAG, "1");
        } catch {
          // ignore storage errors
        }
        window.location.href = welcomePath("customer/index.html");
        return;
      }
      adminOverlay.hidden = false;
      document.body.style.overflow = "hidden";
      clearAdminTimers();
      setAdminMsg("");
      try { if (adminEmailInput) adminEmailInput.value = ""; } catch {}
      try { adminOtpInput && (adminOtpInput.value = ""); } catch {}
      if (adminEmailInput) adminEmailInput.focus();
      else if (adminOtpInput) adminOtpInput.focus();
    };

    const closeAdminPopup = () => {
      if (!adminOverlay) return;
      adminOverlay.hidden = true;
      document.body.style.overflow = "";
      clearAdminTimers();
      setAdminMsg("");
      if (adminForm) adminForm.reset();
    };

    if (adminBtn && !adminBtn.dataset.lbBound) {
      adminBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openAdminPopup();
      });
      adminBtn.dataset.lbBound = "1";
    }
    if (adminClose && !adminClose.dataset.lbBound) {
      adminClose.addEventListener("click", closeAdminPopup);
      adminClose.dataset.lbBound = "1";
    }
    if (adminOverlay && !adminOverlay.dataset.lbBound) {
      adminOverlay.addEventListener("click", (e) => {
        if (e.target === adminOverlay) closeAdminPopup();
      });
      adminOverlay.dataset.lbBound = "1";
    }
    const fetchJson = async (url, options = {}) => {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      return { res, data };
    };

    if (adminOtpToggle && adminOtpInput && !adminOtpToggle.dataset.lbBound) {
      adminOtpToggle.addEventListener("click", () => {
        const visible = adminOtpToggle.dataset.visible === "1";
        adminOtpToggle.dataset.visible = visible ? "0" : "1";
        try { adminOtpInput.type = visible ? "password" : "text"; } catch {}
      });
      adminOtpToggle.dataset.lbBound = "1";
    }

    if (adminSendOtpBtn && !adminSendOtpBtn.dataset.lbBound) {
      adminSendOtpBtn.addEventListener("click", async () => {
        setAdminMsg("");
        const emailRaw = String(adminEmailInput?.value || "").trim();
        const email = emailRaw.toLowerCase();
        if (!emailRaw) {
          setAdminMsg("Enter admin email first.");
          try { adminEmailInput?.focus?.(); } catch {}
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setAdminMsg("Enter a valid email address.");
          try { adminEmailInput?.focus?.(); } catch {}
          return;
        }
        adminSendOtpBtn.disabled = true;
        adminSendOtpBtn.textContent = "Sending...";
        try {
          const out = await fetchJson("/api/admin/auth/otp/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
          if (!out.res.ok || !out.data?.success) {
            throw new Error(out.data?.message || `Request failed (${out.res.status})`);
          }
          startAdminResendCooldown(30);
          startAdminOtpExpiry(out.data?.expires_in_seconds || 300);
          setTimeout(() => { try { adminOtpInput?.focus?.(); } catch {} }, 0);
        } catch (err) {
          setAdminMsg(err?.message || "Failed to send OTP.");
          adminSendOtpBtn.disabled = false;
          adminSendOtpBtn.textContent = "Send OTP";
        }
      });
      adminSendOtpBtn.dataset.lbBound = "1";
    }

    if (adminForm && !adminForm.dataset.lbBound) {
      adminForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setAdminMsg("");
        const emailRaw = String(adminEmailInput?.value || "").trim();
        const email = emailRaw.toLowerCase();
        const otp = String(adminOtpInput?.value || "").trim();
        if (!emailRaw) {
          setAdminMsg("Enter admin email first.");
          try { adminEmailInput?.focus?.(); } catch {}
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setAdminMsg("Enter a valid email address.");
          try { adminEmailInput?.focus?.(); } catch {}
          return;
        }
        if (!/^\d{6}$/.test(otp)) {
          setAdminMsg("Enter valid 6-digit OTP.");
          try { adminOtpInput?.focus?.(); } catch {}
          return;
        }

        try {
          const out = await fetchJson("/api/admin/auth/otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp })
          });
          if (!out.res.ok || !out.data?.success) {
            throw new Error(out.data?.message || `Verify failed (${out.res.status})`);
          }
          saveAdminAuth(out.data?.auth || { token: out.data?.token, role: "admin" }, email);
          closeAdminPopup();
          goAdminDashboard();
        } catch (err) {
          setAdminMsg(err?.message || "OTP verification failed.");
        }
      });
      adminForm.dataset.lbBound = "1";
    }
    if (!document.body.dataset.lbAdminEscBound) {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const overlay = document.getElementById("lbAdminPopupOverlay");
          if (overlay && !overlay.hidden) {
            overlay.hidden = true;
            document.body.style.overflow = "";
          }
        }
      });
      document.body.dataset.lbAdminEscBound = "1";
    }

    try {
      if (sessionStorage.getItem(ADMIN_LOGIN_REDIRECT_FLAG) === "1") {
        sessionStorage.removeItem(ADMIN_LOGIN_REDIRECT_FLAG);
        openAdminPopup();
      }
    } catch {
      // ignore storage errors
    }
  }

  async function loadHeader() {
    const headerContainer =
      document.getElementById("siteHeader") ||
      document.getElementById("header");
    if (!headerContainer) return;

    const basePath = (() => {
      const path = String(window.location.pathname || "").replace(/\\/g, "/");
      return path.includes("/frontend/") ? "/frontend" : "";
    })();
    const candidates = [
      `${basePath}/components/header.html?v=${LB_COMPONENTS_VERSION}`,
      `/components/header.html?v=${LB_COMPONENTS_VERSION}`
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    let html = "";
    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    headerContainer.innerHTML = html;
    reInitializeUI();
    applySharedAssetBindings(headerContainer);
  }

  async function loadFooter() {
    const footerContainer =
      document.getElementById("siteFooter") ||
      document.getElementById("footer");
    if (!footerContainer) return;

    const basePath = (() => {
      const path = String(window.location.pathname || "").replace(/\\/g, "/");
      return path.includes("/frontend/") ? "/frontend" : "";
    })();
    const candidates = [
      `${basePath}/components/footer.html?v=${LB_COMPONENTS_VERSION}`,
      `/components/footer.html?v=${LB_COMPONENTS_VERSION}`
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    let html = "";
    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    footerContainer.innerHTML = html;
    applySharedAssetBindings(footerContainer);
    reInitializeUI();
  }
  await loadHeader();
  await loadFooter();

});

// Basic visit tracking (for admin dashboard analytics).
// Excludes admin routes to avoid inflating counts.
(function () {
  try {
    const path = String(window.location && window.location.pathname || "");
    if (path.startsWith("/welcome/admin")) return;

    const apiBase = String(window.API_BASE_URL || window.LB_API_BASE || "").replace(/\/+$/, "");
    if (!apiBase) return;

    const sidKey = "lb_sid";
    const startKey = "lb_sid_start";

    let sid = "";
    try { sid = String(sessionStorage.getItem(sidKey) || ""); } catch {}
    if (!sid) {
      const rand = (() => {
        try {
          if (window.crypto && crypto.getRandomValues) {
            const b = new Uint8Array(16);
            crypto.getRandomValues(b);
            return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
          }
        } catch {}
        return String(Math.random()).slice(2) + String(Date.now());
      })();
      sid = ("s" + rand).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      try { sessionStorage.setItem(sidKey, sid); } catch {}
    }

    let start = 0;
    try { start = Number(sessionStorage.getItem(startKey) || 0); } catch { start = 0; }
    if (!start || !Number.isFinite(start)) {
      start = Date.now();
      try { sessionStorage.setItem(startKey, String(start)); } catch {}
    }

    const url = apiBase + "/api/system/analytics/visit";

    const send = (event) => {
      const payload = {
        sid,
        event: String(event || "ping"),
        path: String(window.location && window.location.pathname || ""),
        referrer: String(document.referrer || ""),
        elapsed_ms: Math.max(0, Date.now() - start)
      };

      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon(url, blob);
          return;
        }
      } catch {}

      try {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(() => {});
      } catch {}
    };

    send("load");
    const timer = setInterval(() => send("ping"), 15000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") send("hide");
      else send("show");
    });
    window.addEventListener("pagehide", () => {
      try { clearInterval(timer); } catch {}
      send("pagehide");
    });
  } catch {
    // non-blocking
  }
})();
