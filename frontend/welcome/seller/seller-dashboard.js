/* ==========================================================
   SELLER DASHBOARD LOGIC
   CLEAN  STABLE  ALL FEATURES
========================================================== */

const API_BASE = `${window.API_BASE_URL}/api`;
const UPLOADS_BASE = `${window.API_BASE_URL}/uploads`;
const REFRESH_MS = 15000;
const GLOBAL_COMMISSION_STORAGE_KEY = "lbGlobalCommission";
const SELLER_COMMISSION_MAP_KEY = "lbSellerCommissionMap";
const SIDEBAR_COLLAPSE_KEY = "lbSellerSidebarCollapsed";
const SPARK_HISTORY_KEY = "lbSellerSparkHistory";
const ADMIN_API_BASE_CANDIDATES = [
  `${window.API_BASE_URL}/api/admin`,
  `${window.API_BASE_URL}/api/admin`
];
const getSellerSession = () => {
  try {
    return JSON.parse(localStorage.getItem("lbSeller") || "null");
  } catch {
    return null;
  }
};
const getSellerToken = () => {
  const seller = getSellerSession();
  return String(seller?.token || localStorage.getItem("lbSellerToken") || "").trim();
};
const authFetch = (url, options = {}) => {
  const token = getSellerToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization") && /\/api\/seller(\/|$)/.test(String(url || ""))) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
};

const getJson = async (url, options) => {
  const res = await authFetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText || "Request failed");
  return data;
};
const resolveUploadUrl = (rawPath) => {
  const input = String(rawPath || "").trim();
  if (!input) return "";
  if (/^(https?:)?\/\//i.test(input) || input.startsWith("data:") || input.startsWith("blob:")) {
    return input;
  }
  let path = input.replace(/\\/g, "/").trim();
  if (path.startsWith("/uploads/")) path = path.slice("/uploads/".length);
  else if (path.startsWith("uploads/")) path = path.slice("uploads/".length);
  else if (path.startsWith("/")) return `${window.location.origin}${path}`;
  return `${UPLOADS_BASE}/${encodeURI(path.replace(/^\/+/, ""))}`;
};

document.addEventListener("DOMContentLoaded", () => {
  /* ================= SESSION CHECK ================= */
  const seller = JSON.parse(localStorage.getItem("lbSeller") || "null");
  if (!seller || !seller.id) {
    location.href = "/welcome/seller/seller-auth/seller-auth.html";
    return;
  }

  const sellerAccountStatus = seller.account_status || "ACTIVE";

  /* ================= DOM CACHE ================= */
  const el = {
    storeName: document.getElementById("storeName"),
    sellerId: document.getElementById("sellerIdText"),
    sellerCategory: document.getElementById("sellerCategoryText"),
    storeImg: document.getElementById("storeImage"),
    totalOrders: document.getElementById("totalOrders"),
    totalProducts: document.getElementById("totalProducts"),
    totalPayments: document.getElementById("totalPayments"),
    totalPaymentsValue: document.getElementById("totalPaymentsValue"),
    commissionLabel: document.getElementById("commissionLabel"),
    recentOrders: document.getElementById("recentOrders"),
    onlineToggle: document.getElementById("onlineToggle"),
    statusLabel: document.getElementById("statusLabel"),
    onlineText: document.getElementById("onlineText"),
    themeToggle: document.getElementById("themeToggle"),
    menuBtn: document.getElementById("menuBtn"),
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    collapseBtn: document.getElementById("collapseBtn"),
    main: document.querySelector(".main"),
    avgRating: document.getElementById("avgRating"),
    avgStars: document.getElementById("avgStars"),
    ratingCount: document.getElementById("ratingCount"),
    feedbackList: document.getElementById("feedbackList"),
    bar1: document.getElementById("bar1"),
    bar2: document.getElementById("bar2"),
    bar3: document.getElementById("bar3"),
    bar4: document.getElementById("bar4"),
    bar5: document.getElementById("bar5"),
    toastContainer: document.getElementById("toast-container"),
    confirmModal: document.getElementById("confirmModal"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmOk: document.getElementById("confirmOk"),
    confirmCancel: document.getElementById("confirmCancel"),
    rejectReasonModal: document.getElementById("rejectReasonModal"),
    rejectReasonInput: document.getElementById("rejectReasonInput"),
    rejectReasonError: document.getElementById("rejectReasonError"),
    rejectReasonSubmit: document.getElementById("rejectReasonSubmit"),
    rejectReasonCancel: document.getElementById("rejectReasonCancel")
  };

  /* ================= HELPERS ================= */
  const normalizeStatus = s => (!s ? "PLACED" : String(s).toUpperCase());
  const clampPercent = v => Math.min(100, Math.max(0, Number(v) || 0));
  const normalizePercent = v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 100) return null;
    return clampPercent(n);
  };
  const pickFirstPercent = (...values) => {
    for (const value of values) {
      const pct = normalizePercent(value);
      if (pct !== null) return pct;
    }
    return null;
  };
  const readGlobalCommission = () => {
    try {
      const raw = localStorage.getItem(GLOBAL_COMMISSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed?.enabled !== false,
        percent: clampPercent(parsed?.percent)
      };
    } catch {
      return null;
    }
  };
  const readSellerCommissionFromMap = sellerId => {
    try {
      const raw = localStorage.getItem(SELLER_COMMISSION_MAP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizePercent(parsed[String(Number(sellerId))]);
    } catch {
      return null;
    }
  };
  const commissionFromObject = obj => {
    if (!obj || typeof obj !== "object") return null;
    return pickFirstPercent(
      obj.commission,
      obj.commission_percent,
      obj.commissionPercentage,
      obj.admin_commission,
      obj.adminCommission,
      obj.platform_commission,
      obj.platformCommission,
      obj.platform_fee_percent,
      obj.platformFeePercent
    );
  };
  const fetchSellerCommissionFromAdminApi = async sellerId => {
    const id = Number(sellerId);
    if (!Number.isFinite(id)) return null;

    for (const base of ADMIN_API_BASE_CANDIDATES) {
      try {
        const data = await getJson(`${base}/sellers`);
        const sellers = Array.isArray(data?.sellers) ? data.sellers : [];
        const match = sellers.find(s => Number(s?.id) === id);
        const pct = commissionFromObject(match);
        if (pct !== null) return pct;
      } catch {
        // try next base
      }
    }
    return null;
  };

  const setStatusUI = isOnline => {
    if (el.statusLabel) el.statusLabel.innerText = isOnline ? "Online" : "Offline";
    if (el.onlineText) {
      el.onlineText.classList.toggle("online", isOnline);
      el.onlineText.classList.toggle("offline", !isOnline);
    }
  };

  const formatMoney = v => `Rs. ${Number(v || 0).toLocaleString("en-IN")}`;
  const formatInt = v => Number(v || 0).toLocaleString("en-IN");

  const animateValue = (node, nextValue, options = {}) => {
    if (!node) return;
    const { duration = 650, formatter = v => v } = options;
    const from = Number(node.dataset.lastValue || 0);
    const to = Number(nextValue || 0);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      node.textContent = formatter(nextValue);
      return;
    }
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (to - from) * eased;
      node.textContent = formatter(value);
      if (t < 1) requestAnimationFrame(step);
    };
    node.dataset.lastValue = String(to);
    requestAnimationFrame(step);
  };

  const getSparkHistory = () => {
    try {
      const raw = localStorage.getItem(`${SPARK_HISTORY_KEY}:${seller.id}`);
      return raw ? JSON.parse(raw) : { orders: [], products: [], earnings: [] };
    } catch {
      return { orders: [], products: [], earnings: [] };
    }
  };

  const setSparkHistory = history => {
    localStorage.setItem(`${SPARK_HISTORY_KEY}:${seller.id}`, JSON.stringify(history));
  };

  const pushSparkValue = (history, key, value) => {
    const list = Array.isArray(history[key]) ? history[key] : [];
    list.push(Number(value || 0));
    if (list.length > 12) list.shift();
    history[key] = list;
  };

  const renderSparkline = (svg, values) => {
    if (!svg) return;
    const width = 100;
    const height = 30;
    const safe = values.length ? values : [0, 0, 0, 0, 0];
    const min = Math.min(...safe);
    const max = Math.max(...safe, min + 1);
    const points = safe.map((v, i) => {
      const x = (i / (safe.length - 1 || 1)) * width;
      const y = height - ((v - min) / (max - min)) * (height - 6) - 3;
      return [x, y];
    });
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
    svg.innerHTML = `<path class="spark-fill" d="${area}"></path><path d="${line}"></path>`;
  };

  const renderFeedbackSection = (feedbacks = []) => {
    if (!el.feedbackList) return;

    const safeFeedbacks = (Array.isArray(feedbacks) ? feedbacks : [])
      .filter(f => Number(f?.rating) >= 1 && Number(f?.rating) <= 5)
      .map(f => ({
        rating: Math.max(1, Math.min(5, Number(f.rating || 0))),
        comment: f.comment || "",
        created_at: f.created_at || new Date().toISOString()
      }));
    if (!safeFeedbacks.length) {
      if (el.avgRating) el.avgRating.textContent = "0.0";
      if (el.avgStars) el.avgStars.textContent = "\u2606\u2606\u2606\u2606\u2606";
      if (el.ratingCount) el.ratingCount.textContent = "0";
      [el.bar1, el.bar2, el.bar3, el.bar4, el.bar5].forEach(b => { if (b) b.style.width = "0%"; });
      el.feedbackList.innerHTML = `<div class="empty-feedback">No feedback yet</div>`;
      return;
    }

    const counts = [0,0,0,0,0,0]; // 1..5
    let sum = 0;
    safeFeedbacks.forEach(f => {
      const r = Math.max(1, Math.min(5, Number(f.rating || 0)));
      counts[r] += 1;
      sum += r;
    });
    const total = safeFeedbacks.length;
    const avg = (sum / total).toFixed(1);
    if (el.avgRating) el.avgRating.textContent = avg;
    if (el.avgStars) el.avgStars.textContent = "\u2605\u2605\u2605\u2605\u2605".slice(0, Math.round(avg)) + "\u2606\u2606\u2606\u2606\u2606".slice(0, 5 - Math.round(avg));
    if (el.ratingCount) el.ratingCount.textContent = String(total);

    const setBar = (bar, n) => {
      if (!bar) return;
      const pct = total ? (n / total) * 100 : 0;
      bar.style.width = `${pct}%`;
    };
    setBar(el.bar5, counts[5]);
    setBar(el.bar4, counts[4]);
    setBar(el.bar3, counts[3]);
    setBar(el.bar2, counts[2]);
    setBar(el.bar1, counts[1]);

    const recent = safeFeedbacks
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 6);

    el.feedbackList.innerHTML = recent.map(f => `
      <div class="feedback-item">
        <div class="meta">
          <span>${new Date(f.created_at || Date.now()).toLocaleDateString("en-IN")}</span>
          <span>${Number(f.rating).toFixed(1)}</span>
        </div>
        <div class="stars">${"\u2605".repeat(f.rating)}${"\u2606".repeat(5 - f.rating)}</div>
        <div class="comment">${f.comment ? String(f.comment) : "No comment"}</div>
      </div>
    `).join("");
  };

  const showToast = (message, type = "success") => {
    if (!el.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i>
      <span>${message}</span>
    `;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  };

  const confirmDialog = (message, title = "Confirm") => {
    return new Promise(resolve => {
      if (!el.confirmModal || !el.confirmOk || !el.confirmCancel) {
        if (window.lbConfirm) {
          window.lbConfirm(message, title).then(resolve);
        } else {
          resolve(window.confirm(message));
        }
        return;
      }

      if (el.confirmTitle) el.confirmTitle.textContent = title;
      if (el.confirmMessage) el.confirmMessage.textContent = message;

      el.confirmModal.classList.add("show");
      el.confirmModal.setAttribute("aria-hidden", "false");
      el.confirmModal.querySelector(".modal")?.classList.add("attn");
      setTimeout(() => {
        el.confirmModal.querySelector(".modal")?.classList.remove("attn");
      }, 350);
      el.confirmOk?.focus();

      const onKeydown = e => {
        if (e.key === "Escape") {
          cleanup();
          resolve(false);
        }
      };

      const onBackdropClick = e => {
        if (e.target === el.confirmModal) {
          cleanup();
          resolve(false);
        }
      };

      const cleanup = () => {
        el.confirmModal.classList.remove("show");
        el.confirmModal.setAttribute("aria-hidden", "true");
        el.confirmOk.onclick = null;
        el.confirmCancel.onclick = null;
        el.confirmModal.removeEventListener("click", onBackdropClick);
        document.removeEventListener("keydown", onKeydown);
      };

      el.confirmModal.addEventListener("click", onBackdropClick);
      document.addEventListener("keydown", onKeydown);

      el.confirmOk.onclick = () => {
        cleanup();
        resolve(true);
      };
      el.confirmCancel.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  };

  const askRejectReason = () => {
    return new Promise(resolve => {
      if (!el.rejectReasonModal || !el.rejectReasonInput || !el.rejectReasonSubmit || !el.rejectReasonCancel) {
        const value = String(window.prompt("Please enter rejection reason:") || "").trim();
        resolve(value || null);
        return;
      }

      const modal = el.rejectReasonModal;
      const input = el.rejectReasonInput;
      const err = el.rejectReasonError;
      const onInput = () => {
        if (err) err.classList.remove("show");
      };

      input.value = "";
      if (err) err.classList.remove("show");
      input.addEventListener("input", onInput);

      const cleanup = () => {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        modal.removeEventListener("click", onBackdropClick);
        document.removeEventListener("keydown", onKeydown);
        input.removeEventListener("input", onInput);
        el.rejectReasonSubmit.onclick = null;
        el.rejectReasonCancel.onclick = null;
      };

      const submit = () => {
        const reason = String(input.value || "").trim();
        if (!reason) {
          if (err) err.classList.add("show");
          input.focus();
          return;
        }
        cleanup();
        resolve(reason);
      };

      const cancel = () => {
        cleanup();
        resolve(null);
      };

      const onBackdropClick = e => {
        if (e.target === modal) cancel();
      };

      const onKeydown = e => {
        if (e.key === "Escape") cancel();
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
      };

      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
      input.focus();

      modal.addEventListener("click", onBackdropClick);
      document.addEventListener("keydown", onKeydown);
      el.rejectReasonSubmit.onclick = submit;
      el.rejectReasonCancel.onclick = cancel;
    });
  };

  /* ================= SIDEBAR ================= */
  const openSidebar = () => {
    if (!el.sidebar) return;
    el.sidebar.classList.add("open");
    if (el.sidebarOverlay) el.sidebarOverlay.style.display = "block";
  };

  const closeSidebar = () => {
    if (!el.sidebar) return;
    el.sidebar.classList.remove("open");
    if (el.sidebarOverlay) el.sidebarOverlay.style.display = "none";
  };

  if (el.menuBtn) el.menuBtn.addEventListener("click", openSidebar);
  if (el.sidebarOverlay) el.sidebarOverlay.addEventListener("click", closeSidebar);

  const setSidebarCollapsed = collapsed => {
    if (!el.sidebar || !el.main) return;
    el.sidebar.classList.toggle("collapsed", collapsed);
    el.main.classList.toggle("sidebar-collapsed", collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
  };

  if (el.collapseBtn) {
    el.collapseBtn.addEventListener("click", () => {
      const isCollapsed = el.sidebar?.classList.contains("collapsed");
      setSidebarCollapsed(!isCollapsed);
    });
  }

  /* ================= INIT UI ================= */
  const initUI = () => {
    if (el.storeName) el.storeName.innerText = seller.store_name || "My Store";
    if (el.sellerId) el.sellerId.innerText = `ID: #${seller.id}`;
    if (el.sellerCategory) {
      const categoryName = seller.category || seller.category_name || "---";
      el.sellerCategory.innerText = `Category: ${categoryName}`;
    }

    if (el.storeImg) {
      el.storeImg.src = seller.store_photo
        ? resolveUploadUrl(seller.store_photo)
        : "/assets/images/logo.png";
      el.storeImg.onerror = () => {
        el.storeImg.src = "/assets/images/logo.png";
      };
    }

    if (sellerAccountStatus === "BLOCKED") {
      if (el.onlineToggle) {
        el.onlineToggle.checked = false;
        el.onlineToggle.disabled = true;
      }
      if (el.statusLabel) {
        el.statusLabel.innerText = "Blocked by Admin";
        el.statusLabel.style.color = "#dc2626";
      }
      return;
    }

    if (el.onlineToggle) {
      el.onlineToggle.checked = seller.is_online === 1;
      setStatusUI(seller.is_online === 1);
    }

    if (localStorage.getItem("theme") === "dark") {
      document.body.classList.add("dark");
      if (el.themeToggle) el.themeToggle.checked = true;
    }

    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
    setSidebarCollapsed(collapsed);

    document.querySelectorAll(".reveal").forEach((node, idx) => {
      setTimeout(() => node.classList.add("show"), 120 + idx * 80);
    });

    renderFeedbackSection([]);
  };

  /* ================= RENDER ORDERS ================= */
  const renderOrders = orders => {
    if (!el.recentOrders) return;

    if (!orders.length) {
      el.recentOrders.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fas fa-box-open"></i></div>
          <h3>No new orders</h3>
          <p>You're all caught up. Add products or refresh later.</p>
          <div class="empty-actions">
            <button class="btn-solid" onclick="goPage('/welcome/seller/seller-add-product.html')">Add Product</button>
            <button class="btn-outline" onclick="location.reload()">Refresh</button>
          </div>
        </div>
      `;
      return;
    }

    el.recentOrders.innerHTML = orders.map(order => {
      const cart = Array.isArray(order.cart) ? order.cart : [];
      const safeCustomer = order.customer_name || "Customer";
      const safePayment = order.payment_method || "COD";

      return `
        <div class="order-card reveal" id="order-${order.id}">
          <div class="order-header">
            <div>
              <b>#${order.id}</b><br>
              <small>${safeCustomer}  ${safePayment}</small>
            </div>
            <b>${formatMoney(order.total_amount)}</b>
          </div>

          <div class="order-items">
            ${cart.map(i => `
              <div class="item-row">
                <span>${i.qty || 1} ${i.name || "Item"}</span>
                <span>${formatMoney((i.qty || 1) * (i.price || 0))}</span>
              </div>
            `).join("")}
          </div>

          <div class="order-actions">
            <button class="btn-reject" onclick="processOrderAction(${order.id}, 'REJECTED')">Reject</button>
            <button class="btn-accept" onclick="processOrderAction(${order.id}, 'CONFIRMED')">Accept</button>
          </div>
        </div>
      `;
    }).join("");

    el.recentOrders.querySelectorAll(".order-card").forEach((card, idx) => {
      setTimeout(() => card.classList.add("show"), 80 + idx * 60);
    });
  };

  /* ================= DASHBOARD REFRESH ================= */
  const refreshDashboard = async () => {
    try {
      if (el.recentOrders) {
        el.recentOrders.innerHTML = `
          <div class="skeleton-loader">
            <div class="sk-card"></div>
            <div class="sk-card"></div>
            <div class="sk-card sk-card-short"></div>
          </div>
        `;
      }

      const [ordersData, productsData, dashboardData, adminCommissionPercent, feedbackData] = await Promise.all([
        getJson(`${API_BASE}/seller/orders/${seller.id}`),
        getJson(`${API_BASE}/seller/products?seller_id=${seller.id}`),
        getJson(`${API_BASE}/seller/dashboard/${seller.id}`).catch(() => null),
        fetchSellerCommissionFromAdminApi(seller.id),
        getJson(`${API_BASE}/seller/feedback/${seller.id}`).catch(() => ({ success: false, feedback: [] }))
      ]);

      const orders = Array.isArray(ordersData.orders) ? ordersData.orders : [];
      const products = Array.isArray(productsData.products) ? productsData.products : [];
      const globalCommission = readGlobalCommission();
      const mappedCommissionPercent = readSellerCommissionFromMap(seller.id);
      const apiCommissionPercent = pickFirstPercent(
        commissionFromObject(dashboardData?.seller),
        commissionFromObject(dashboardData),
        commissionFromObject(ordersData?.seller),
        commissionFromObject(ordersData)
      );
      const effectiveCommissionPercent = pickFirstPercent(
        adminCommissionPercent,
        apiCommissionPercent,
        mappedCommissionPercent,
        globalCommission?.enabled === false ? 0 : globalCommission?.percent,
        seller.commission,
        10
      );
      const commissionRate = (effectiveCommissionPercent || 0) / 100;

      const finalApiPercent = pickFirstPercent(adminCommissionPercent, apiCommissionPercent);
      if (finalApiPercent !== null && seller.commission !== finalApiPercent) {
        seller.commission = finalApiPercent;
        localStorage.setItem("lbSeller", JSON.stringify(seller));
      }

      if (el.totalOrders) animateValue(el.totalOrders, orders.length, { formatter: v => formatInt(v) });
      if (el.totalProducts) animateValue(el.totalProducts, products.length, { formatter: v => formatInt(v) });

      const earnings = orders
        .filter(o => normalizeStatus(o.status) === "DELIVERED")
        .reduce((sum, o) => {
          const gross = Number(o.total_amount || 0);
          if (!Number.isFinite(gross) || gross <= 0) return sum;

          const commission = gross * commissionRate;
          const net = Math.max(gross - commission, 0);
          return sum + net;
        }, 0);

      if (el.totalPaymentsValue) {
        animateValue(el.totalPaymentsValue, earnings, { formatter: v => formatMoney(v) });
      }
      if (el.commissionLabel) {
        const commissionLabel = `${Math.round((effectiveCommissionPercent || 0) * 100) / 100}%`;
        el.commissionLabel.innerText = `After ${commissionLabel} admin commission`;
      }

      const history = getSparkHistory();
      pushSparkValue(history, "orders", orders.length);
      pushSparkValue(history, "products", products.length);
      pushSparkValue(history, "earnings", Math.round(earnings));
      setSparkHistory(history);
      document.querySelectorAll(".sparkline").forEach(svg => {
        const key = svg.getAttribute("data-spark");
        renderSparkline(svg, history[key] || []);
      });

      // Dashboard should only show incoming orders that still need seller action.
      // Once accepted (CONFIRMED/ACCEPTED), they should move to the Orders page.
      const activeOrders = orders.filter(o => {
        const s = normalizeStatus(o.status);
        return s === "PLACED" || s === "PENDING";
      });

      renderOrders(activeOrders);
      renderFeedbackSection(Array.isArray(feedbackData?.feedback) ? feedbackData.feedback : []);
    } catch (err) {
      console.error("DASHBOARD ERROR:", err);
      if (el.recentOrders) {
        el.recentOrders.innerHTML = `
          <div style="text-align:center;padding:40px;color:#ef4444">
            Failed to load orders
          </div>
        `;
      }
    }
  };

  /* ================= ORDER ACTION ================= */
  window.processOrderAction = async (orderId, status) => {
    if (sellerAccountStatus === "BLOCKED") {
      showToast("Your account is blocked by admin", "error");
      return;
    }

    const payload = { status, status_updated_by: "SELLER" };

    if (status === "REJECTED") {
      const ok = await confirmDialog("Reject this order?", "Reject Order");
      if (!ok) return;

      const reason = await askRejectReason();
      if (!reason) {
        showToast("Rejection reason is required", "error");
        return;
      }

      payload.reason = reason;
      payload.status_reason = reason;
      payload.seller_reason = reason;
      payload.reject_reason = reason;
      payload.rejection_reason = reason;
      payload.rejected_by = "SELLER";
      payload.rejected_by_role = "SELLER";
    }

    try {
      const data = await getJson(`${API_BASE}/seller/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!data.success) throw new Error("Update failed");

      const card = document.getElementById(`order-${orderId}`);
      if (card) card.remove();
      showToast("Order updated", "success");
      refreshDashboard();
    } catch {
      showToast("Order update failed", "error");
    }
  };

  /* ================= ONLINE / OFFLINE ================= */
  if (el.onlineToggle && sellerAccountStatus !== "BLOCKED") {
    el.onlineToggle.onchange = async e => {
      const newState = e.target.checked ? 1 : 0;
      const oldState = seller.is_online;

      try {
        const data = await getJson(`${API_BASE}/seller/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seller_id: seller.id, is_online: newState })
        });

        if (!data.success) throw new Error("Status update failed");

        seller.is_online = newState;
        localStorage.setItem("lbSeller", JSON.stringify(seller));
        setStatusUI(newState === 1);
        showToast("Status updated", "success");
      } catch {
        seller.is_online = oldState;
        e.target.checked = oldState === 1;
        setStatusUI(oldState === 1);
        showToast("Status update failed", "error");
      }
    };
  }

  /* ================= THEME ================= */
  if (el.themeToggle) {
    el.themeToggle.onchange = e => {
      document.body.classList.toggle("dark", e.target.checked);
      localStorage.setItem("theme", e.target.checked ? "dark" : "light");
      showToast(`Theme: ${e.target.checked ? "Dark" : "Light"}`, "success");
    };
  }

  /* ================= START ================= */
  initUI();
  refreshDashboard();
  setInterval(refreshDashboard, REFRESH_MS);
});

/* ================= LOGOUT ================= */
async function logout() {
  const confirmModal = document.getElementById("confirmModal");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  const ok = await new Promise(resolve => {
    if (!confirmModal || !confirmOk || !confirmCancel) {
      if (window.lbConfirm) {
        window.lbConfirm("Logout?").then(resolve);
      } else {
        resolve(window.confirm("Logout?"));
      }
      return;
    }

    if (confirmTitle) confirmTitle.textContent = "Logout";
    if (confirmMessage) confirmMessage.textContent = "Logout from your account?";

    const onKeydown = e => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    const onBackdropClick = e => {
      if (e.target === confirmModal) {
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      confirmModal.classList.remove("show");
      confirmModal.setAttribute("aria-hidden", "true");
      confirmOk.onclick = null;
      confirmCancel.onclick = null;
      confirmModal.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKeydown);
    };

    confirmModal.classList.add("show");
    confirmModal.setAttribute("aria-hidden", "false");
    confirmModal.querySelector(".modal")?.classList.add("attn");
    setTimeout(() => {
      confirmModal.querySelector(".modal")?.classList.remove("attn");
    }, 350);
    confirmOk?.focus();

    confirmModal.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKeydown);

    confirmOk.onclick = () => {
      cleanup();
      resolve(true);
    };
    confirmCancel.onclick = () => {
      cleanup();
      resolve(false);
    };
  });

  if (!ok) return;
  localStorage.removeItem("lbSeller");
  location.href = "/welcome/seller/seller-auth/seller-auth.html";
}

function goPage(url) {
  location.href = url;
}








