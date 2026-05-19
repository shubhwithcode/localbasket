(function () {
  const ADMIN_AUTH_KEY = "lbAdminAuth";
  const ADMIN_LOGIN_REDIRECT_FLAG = "lbOpenAdminLoginAfterRedirect";
  const ADMIN_RETURN_PATH_KEY = "lbAdminReturnPath";
  const readAdminAuth = () => {
    try {
      const raw = localStorage.getItem(ADMIN_AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const expiresAtMs = Number(parsed.expiresAt || parsed.expires_at_ms || 0);
      if (expiresAtMs && Date.now() > expiresAtMs) {
        localStorage.removeItem(ADMIN_AUTH_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const isAdminAuthenticated = () => {
    const session = readAdminAuth();
    return !!(session && String(session.token || "").trim());
  };

  const clearAdminAuth = () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    localStorage.removeItem("admin_token");
  };

  const withAdminAuthHeaders = (input, init = {}) => {
    const url = typeof input === "string" ? input : String(input?.url || "");
    if (!/\/api\/admin(\/|$)/.test(url)) return init;
    const session = readAdminAuth();
    const token = String(session?.token || localStorage.getItem("admin_token") || "").trim();
    if (!token) return init;
    const headers = new Headers(init.headers || {});
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return { ...init, headers };
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => nativeFetch(input, withAdminAuthHeaders(input, init));

  if (!isAdminAuthenticated()) {
    clearAdminAuth();
    try {
      sessionStorage.setItem(ADMIN_LOGIN_REDIRECT_FLAG, "1");
      sessionStorage.setItem(ADMIN_RETURN_PATH_KEY, window.location.pathname);
    } catch {
      // ignore storage errors
    }
    window.location.replace("/welcome/customer/index.html");
    return;
  }

  window.logout = async () => {
    const ok = await window.lbConfirm("Logout from admin panel?");
    if (!ok) return;
    clearAdminAuth();
    window.location.replace("/welcome/customer/index.html");
  };

  const ADMIN_BASE = "/welcome/admin/";
  const page = (location.pathname.split("/").pop() || "admin.html").toLowerCase();

  const menu = [
    { file: "admin.html", icon: "fa-chart-pie", label: "Dashboard" },
    { file: "admin-sellers.html", icon: "fa-user-check", label: "Seller Verification" },
    { file: "admin-customers.html", icon: "fa-users", label: "Customers" },
    { file: "admin-orders.html", icon: "fa-shopping-cart", label: "Orders" },
    { file: "admin-payments.html", icon: "fa-wallet", label: "Payments" },
    { file: "admin-support.html", icon: "fa-headset", label: "Support Requests" },
    { file: "admin-reports.html", icon: "fa-chart-line", label: "Reports" },
    { file: "admin-categories.html", icon: "fa-tags", label: "Categories" },
    { file: "admin-settings.html", icon: "fa-cog", label: "Settings" }
  ];

  function toAdminPath(file) {
    const clean = String(file || "").trim().replace(/^\/+/, "");
    if (!clean) return ADMIN_BASE + "admin.html";
    if (/^https?:\/\//i.test(clean) || clean.startsWith("/")) return clean;
    return ADMIN_BASE + clean;
  }

  function normalizeAdminLinks() {
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = String(a.getAttribute("href") || "").trim();
      if (!/^admin[-a-z]*\.html$/i.test(href)) return;
      a.setAttribute("href", toAdminPath(href));
    });

    document.querySelectorAll("[onclick]").forEach((el) => {
      const raw = String(el.getAttribute("onclick") || "");
      if (!raw) return;
      const updated = raw
        .replace(/location\.href\s*=\s*'((admin[-a-z]*\.html))'/gi, (_m, p1) => `location.href='${toAdminPath(p1)}'`)
        .replace(/location\.href\s*=\s*"((admin[-a-z]*\.html))"/gi, (_m, p1) => `location.href=\"${toAdminPath(p1)}\"`);
      if (updated !== raw) el.setAttribute("onclick", updated);
    });
  }

  function ensureOverlay() {
    let overlay = document.getElementById("sidebarOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "sidebarOverlay";
      document.body.prepend(overlay);
    }
    overlay.addEventListener("click", closeSidebar);
    return overlay;
  }

  function openSidebar() {
    const sb = document.querySelector(".sidebar");
    const overlay = ensureOverlay();
    if (!sb) return;
    sb.classList.add("open");
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    const sb = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sb) sb.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    document.body.style.overflow = "auto";
  }

  function toggleSidebarState() {
    const sb = document.querySelector(".sidebar");
    if (!sb) return;
    if (sb.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  window.toggleMenu = toggleSidebarState;
  window.toggleSidebar = toggleSidebarState;

  function bindMobileButtons() {
    document.querySelectorAll(".menu-toggle, .mobile-toggle").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openSidebar();
      });
    });
    document.querySelectorAll(".close-sidebar").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        closeSidebar();
      });
    });
  }

  function renderSidebar() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    const items = menu.map(item => {
      const active = page === item.file ? "active" : "";
      return `<button class="${active}" data-link="${item.file}"><i class="fas ${item.icon}"></i> ${item.label}</button>`;
    }).join("");

    sidebar.innerHTML = `
      <button class="close-sidebar" aria-label="Close menu">
        <i class="fas fa-times"></i>
      </button>
      <div class="brand">
        <img src="/welcome/logo2.png?v=20260303" alt="Logo">
        <h2>Admin Panel</h2>
        <p class="brand-sub">Control Center</p>
      </div>
      <div class="menu">
        ${items}
      </div>
      <div class="menu-footer">
        <button data-logout class="logout-btn">
          <i class="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>
    `;

    sidebar.querySelectorAll("button[data-link]").forEach(btn => {
      btn.addEventListener("click", () => {
        location.href = toAdminPath(btn.getAttribute("data-link"));
      });
    });

    const logoutBtn = sidebar.querySelector("button[data-logout]");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        if (typeof window.logout === "function") {
          window.logout();
        } else {
          window.lbConfirm("Logout?").then((ok) => {
            if (!ok) return;
            localStorage.clear();
            location.href = "/welcome/customer/index.html";
          });
        }
      });
    }
  }

  function ensureThemeToggle() {
    const top = document.querySelector(".topbar") || document.querySelector(".top-nav") || document.querySelector(".top-header");
    if (!top || top.querySelector("#themeToggle")) return;

    if (!top.classList.contains("lb-header")) top.classList.add("lb-header");
    let right = top.querySelector(".lb-header-right");
    if (!right) {
      right = document.createElement("div");
      right.className = "lb-header-right";
      top.appendChild(right);
    }

    const holder = document.createElement("div");
    holder.className = "lb-theme-pill";
    holder.innerHTML = `
      <i class="fas fa-moon"></i>
      <label class="lb-switch">
        <input type="checkbox" id="themeToggle">
        <span class="lb-slider"></span>
      </label>
    `;

    right.appendChild(holder);
  }

  function ensureMenuToggle() {
    const top = document.querySelector(".topbar") || document.querySelector(".top-nav") || document.querySelector(".top-header");
    if (!top) return;
    if (!top.classList.contains("lb-header")) top.classList.add("lb-header");
    const left = top.querySelector(".lb-header-left") || top;
    if (left.querySelector(".menu-toggle") || left.querySelector(".mobile-toggle")) return;

    const btn = document.createElement("button");
    btn.className = "menu-toggle";
    btn.innerHTML = '<i class="fas fa-bars"></i>';
    left.prepend(btn);
  }

  function initTheme() {
    const themeToggle = document.getElementById("themeToggle");
    const isDark = localStorage.getItem("theme") === "dark";
    document.body.classList.toggle("dark", isDark);
    if (themeToggle) {
      themeToggle.checked = isDark;
      themeToggle.addEventListener("change", () => {
        const dark = themeToggle.checked;
        document.body.classList.toggle("dark", dark);
        localStorage.setItem("theme", dark ? "dark" : "light");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    normalizeAdminLinks();
    ensureOverlay();
    renderSidebar();
    ensureMenuToggle();
    ensureThemeToggle();
    initTheme();
    bindMobileButtons();
  });
})();

