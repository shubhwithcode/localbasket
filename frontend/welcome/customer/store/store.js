/* =====================================================
   LOCALBASKET  STORE ENGINE (CUSTOMER)
===================================================== */

const host = String(window.location.hostname || "").trim();
const isPrivateLanHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
const isLocalHost = ["localhost", "127.0.0.1"].includes(host) || isPrivateLanHost || window.location.protocol === "file:";
const isVercelHost = host.endsWith(".vercel.app");
const localOrigin = window.location.protocol === "file:" ? "http://localhost:5000" : `${window.location.protocol}//${host}:5000`;
const API_BASE_URL = (() => {
  const stored = (typeof localStorage !== "undefined" && localStorage.getItem("lbApiBase")) || "";
  const isLoopbackBase = (value) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(value || "").trim().replace(/\/+$/, ""));
  const byWindow = String(window.API_BASE_URL || window.LB_API_BASE || "").trim();
  const byOrigin = window.location.protocol === "file:" ? localOrigin : window.location.origin;
  const safeWindowBase = !isLocalHost && isLoopbackBase(byWindow) ? "" : byWindow;
  const safeStoredBase = !isLocalHost && isLoopbackBase(stored) ? "" : stored;
  if (!isLocalHost && stored && isLoopbackBase(stored)) {
    try { localStorage.removeItem("lbApiBase"); } catch {}
  }
  const preferred = safeWindowBase || safeStoredBase || byOrigin;
  const clean = String(preferred || byOrigin).trim().replace(/\/+$/, "");
  window.API_BASE_URL = clean;
  return clean;
})();
const CONFIG = {
  API_URL: isLocalHost
    ? `${API_BASE_URL}/api`
    : (isVercelHost ? `${API_BASE_URL}/api` : `${API_BASE_URL}/api`),
  IMAGE_URL: isLocalHost
    ? `${localOrigin}/uploads/`
    : `${API_BASE_URL}/uploads/`,
  DEFAULT_IMG: "https://placehold.co/200?text=No+Image"
};

function resolveImageUrl(rawPath) {
  const input = String(rawPath || "").trim();
  if (!input) return CONFIG.DEFAULT_IMG;
  if (/^(https?:)?\/\//i.test(input) || input.startsWith("data:") || input.startsWith("blob:")) {
    return input;
  }

  const base = String(CONFIG.IMAGE_URL || `${window.location.origin}/uploads`).replace(/\/+$/, "");
  let path = input.replace(/\\/g, "/").trim();
  const lower = path.toLowerCase();
  const idx = lower.lastIndexOf("/uploads/");
  if (idx !== -1) path = path.slice(idx + "/uploads/".length);
  else if (lower.startsWith("uploads/")) path = path.slice("uploads/".length);
  else if (path.startsWith("/uploads/")) path = path.slice("/uploads/".length);
  else if (path.startsWith("/")) return `${API_BASE_URL}${path}`;

  return `${base}/${encodeURI(path.replace(/^\/+/, ""))}`;
}

function getApiCandidates() {
  const candidates = [
    CONFIG.API_URL,
    ...(isVercelHost ? [] : [`${window.location.origin}/api`])
  ]
    .map((value) => String(value || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return [...new Set(candidates)];
}

async function fetchJsonOrThrow(pathname, options) {
  const path = `/${String(pathname || "").replace(/^\/+/, "")}`;
  let lastError = null;

  for (const base of getApiCandidates()) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`API returned non-JSON response (${res.status}) for ${url}`);
      }
      if (!res.ok) {
        throw new Error(data?.message || `Request failed (${res.status}) for ${url}`);
      }
      return data;
    } catch (err) {
      console.warn("API candidate failed:", url, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to reach API");
}

const params = new URLSearchParams(window.location.search);
const storeId = params.get("id");

function getCartKey() {
  try {
    const u = JSON.parse(localStorage.getItem("lbUser"));
    const id = u && u.id ? u.id : "guest";
    return `lbCart_${id}`;
  } catch {
    return "lbCart_guest";
  }
}

function loadCart() {
  const key = getCartKey();
  let cart = JSON.parse(localStorage.getItem(key) || "[]");
  if (!cart.length) {
    const legacy = JSON.parse(localStorage.getItem("lbCart") || "[]");
    if (legacy.length) {
      localStorage.setItem(key, JSON.stringify(legacy));
      localStorage.removeItem("lbCart");
      cart = legacy;
    }
  }
  return cart;
}

function saveCart(cart) {
  localStorage.setItem(getCartKey(), JSON.stringify(cart));
}

const state = {
  store: null,
  products: [],
  filtered: [],
  isStoreOnline: false,
  minimumOrder: 100,
  cart: loadCart(),
  activeProductId: null,
  activeRating: 0,
  activeImageIndex: 0
};
const FLOATING_CHECKOUT_POS_KEY = "lbFloatingCheckoutPosV1";
const MOBILE_BAR_POS_KEY = "lbMobileBarPosV1";
let floatingCheckoutDragBound = false;
let mobileBarDragBound = false;

function getFloatingCheckoutBtn() {
  return document.getElementById("floatingCheckoutBtn");
}

function readFloatingCheckoutPos() {
  try {
    const raw = localStorage.getItem(FLOATING_CHECKOUT_POS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const x = Number(data?.x);
    const y = Number(data?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function writeFloatingCheckoutPos(x, y) {
  localStorage.setItem(FLOATING_CHECKOUT_POS_KEY, JSON.stringify({ x, y }));
}

function clampFloatingCheckoutPos(x, y, btn) {
  const width = Math.max(150, btn.offsetWidth || 0);
  const height = Math.max(1, btn.offsetHeight || 48);
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, window.innerWidth - width - 8);
  const maxY = Math.max(minY, window.innerHeight - height - 8);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y))
  };
}

function setFloatingCheckoutDefaultPosition(btn) {
  btn.style.left = "auto";
  btn.style.top = "auto";
  btn.style.right = "20px";
  btn.style.bottom = "20px";
}

function getMobileBarEl() {
  return document.getElementById("mobileBar");
}

function readMobileBarPos() {
  try {
    const raw = localStorage.getItem(MOBILE_BAR_POS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const x = Number(data?.x);
    const y = Number(data?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function writeMobileBarPos(x, y) {
  localStorage.setItem(MOBILE_BAR_POS_KEY, JSON.stringify({ x, y }));
}

function clampMobileBarPos(x, y, el) {
  const width = Math.max(132, el.offsetWidth || 0);
  const height = Math.max(1, el.offsetHeight || 40);
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, window.innerWidth - width - 8);
  const maxY = Math.max(minY, window.innerHeight - height - 8);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y))
  };
}

function applyMobileBarSavedPosition(el) {
  const pos = readMobileBarPos();
  if (!pos) return false;
  const safe = clampMobileBarPos(pos.x, pos.y, el);
  el.style.left = `${safe.x}px`;
  el.style.top = `${safe.y}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  return true;
}

function applyFloatingCheckoutSavedPosition(btn) {
  const pos = readFloatingCheckoutPos();
  if (!pos) {
    setFloatingCheckoutDefaultPosition(btn);
    return false;
  }
  const safe = clampFloatingCheckoutPos(pos.x, pos.y, btn);
  btn.style.left = `${safe.x}px`;
  btn.style.top = `${safe.y}px`;
  btn.style.right = "auto";
  btn.style.bottom = "auto";
  return true;
}

function initFloatingCheckoutDrag() {
  if (floatingCheckoutDragBound) return;
  const btn = getFloatingCheckoutBtn();
  if (!btn) return;
  floatingCheckoutDragBound = true;

  let dragging = false;
  let moved = false;
  let offsetX = 0;
  let offsetY = 0;
  let pointerId = null;

  const onPointerMove = (e) => {
    if (!dragging) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;
    const nextX = e.clientX - offsetX;
    const nextY = e.clientY - offsetY;
    const safe = clampFloatingCheckoutPos(nextX, nextY, btn);
    btn.style.left = `${safe.x}px`;
    btn.style.top = `${safe.y}px`;
    btn.style.right = "auto";
    btn.style.bottom = "auto";
    if (Math.abs(nextX - safe.x) > 1 || Math.abs(nextY - safe.y) > 1) moved = true;
    e.preventDefault();
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    btn.classList.remove("dragging");
    const x = parseFloat(btn.style.left || "0");
    const y = parseFloat(btn.style.top || "0");
    if (Number.isFinite(x) && Number.isFinite(y)) writeFloatingCheckoutPos(x, y);
    setTimeout(() => { moved = false; }, 0);
  };

  btn.addEventListener("pointerdown", (e) => {
    if (btn.style.display === "none") return;
    pointerId = e.pointerId;
    dragging = true;
    moved = false;
    const rect = btn.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    btn.classList.add("dragging");
    try { btn.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });

  btn.addEventListener("click", (e) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("resize", () => {
    const pos = readFloatingCheckoutPos();
    if (!pos || btn.style.display === "none") return;
    const safe = clampFloatingCheckoutPos(pos.x, pos.y, btn);
    btn.style.left = `${safe.x}px`;
    btn.style.top = `${safe.y}px`;
    btn.style.right = "auto";
    btn.style.bottom = "auto";
    writeFloatingCheckoutPos(safe.x, safe.y);
  }, { passive: true });
}

function initMobileBarDrag() {
  if (mobileBarDragBound) return;
  const bar = getMobileBarEl();
  if (!bar) return;
  mobileBarDragBound = true;

  // Always bind the checkout click (mobile + desktop)
  const btn = document.getElementById("mobileBarBtn");
  if (btn && !btn.dataset.lbBound) {
    btn.dataset.lbBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      checkout();
    });
  }

  // Dragging is only for desktop/tablet (non-mobile layout)
  if (window.matchMedia("(max-width: 768px)").matches) return;

  let dragging = false;
  let moved = false;
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  const onMove = (e) => {
    if (!dragging) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;
    const nextX = e.clientX - offsetX;
    const nextY = e.clientY - offsetY;
    const safe = clampMobileBarPos(nextX, nextY, bar);
    bar.style.left = `${safe.x}px`;
    bar.style.top = `${safe.y}px`;
    bar.style.right = "auto";
    bar.style.bottom = "auto";
    moved = true;
    e.preventDefault();
  };

  const onUp = (e) => {
    if (!dragging) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    const x = parseFloat(bar.style.left || "0");
    const y = parseFloat(bar.style.top || "0");
    if (Number.isFinite(x) && Number.isFinite(y)) writeMobileBarPos(x, y);
    setTimeout(() => { moved = false; }, 0);
  };

  bar.addEventListener("pointerdown", (e) => {
    if (!bar.classList.contains("is-visible")) return;
    if (e.target?.closest?.("#mobileBarBtn")) return;
    pointerId = e.pointerId;
    dragging = true;
    moved = false;
    const rect = bar.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    try { bar.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });

  bar.addEventListener("click", (e) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("resize", () => {
    const pos = readMobileBarPos();
    if (!pos) return;
    const safe = clampMobileBarPos(pos.x, pos.y, bar);
    writeMobileBarPos(safe.x, safe.y);
    if (bar.classList.contains("is-visible")) {
      bar.style.left = `${safe.x}px`;
      bar.style.top = `${safe.y}px`;
      bar.style.right = "auto";
      bar.style.bottom = "auto";
    }
  }, { passive: true });
}

document.addEventListener("DOMContentLoaded", async () => {
  const panel = document.getElementById("cartPanel");
  const backdrop = document.getElementById("cartBackdrop");
  if (panel) panel.classList.remove("active");
  if (backdrop) backdrop.classList.remove("active");
  if (typeof window.lbOpenCart === "function") {
    if (panel) panel.style.display = "none";
    if (backdrop) backdrop.style.display = "none";
  }
  document.body.style.overflow = "";

  if (!storeId) {
    showError("Invalid Store Link");
    return;
  }

  const ok = await loadStore();
  if (!ok) return;
  await loadProducts();
  syncCartFromStorage();
});

/* =====================================================
   LOAD STORE
===================================================== */
async function loadStore() {
  try {
    const data = await fetchJsonOrThrow(`/stores/${storeId}`);

    if (!data.success || !data.store) throw new Error(data.message || "Store not found");

    const store = data.store;
    state.store = store;
    state.isStoreOnline = Number(store.is_online) === 1;
    state.minimumOrder = Number(store.minimum_order);
    if (!Number.isFinite(state.minimumOrder) || state.minimumOrder < 0) state.minimumOrder = 100;

    document.getElementById("storeName").innerText = store.store_name;
    document.getElementById("headerStoreName").innerText = store.store_name;

    const img = document.getElementById("storeImg");
    img.src = resolveImageUrl(store.store_photo);
    img.onerror = () => (img.src = CONFIG.DEFAULT_IMG);

    const tag = document.querySelector(".online-tag");
    if (tag) {
      tag.innerText = state.isStoreOnline ? "OPEN NOW" : "CLOSED";
      tag.style.background = state.isStoreOnline ? "#10b981" : "#ef4444";
    }

    const categoryName = store.category_name || store.category || store.business_type || "General";
    const cat = document.getElementById("storeCategory");
    if (cat) {
      cat.innerText = `Category: ${categoryName}`;
    }

    let resolvedRatingText = "New";
    const ratingEl = document.getElementById("storeRating");
    if (ratingEl) {
      const candidates = [
        store?.rating,
        store?.avg_rating,
        store?.average_rating,
        store?.store_rating,
        store?.storeRating,
        store?.avgRating,
        store?.rating_avg,
        store?.ratingAverage
      ];
      const countCandidates = [
        store?.rating_count,
        store?.ratingCount,
        store?.reviews_count,
        store?.reviewCount
      ];
      const count = Number(countCandidates.find(v => v !== null && v !== undefined && v !== "") || 0);
      for (const v of candidates) {
        if (v === null || v === undefined || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) {
          resolvedRatingText = (n === 0 && count === 0) ? "New" : (count > 0 ? `${n.toFixed(1)} (${count})` : n.toFixed(1));
          break;
        }
      }
      ratingEl.innerText = `Rating: ${resolvedRatingText}`;
    }

    const compactMetaEl = document.getElementById("storeMetaCompact");
    if (compactMetaEl) compactMetaEl.innerText = `⭐ ${resolvedRatingText} • ${categoryName}`;

    const headerMetaEl = document.getElementById("headerStoreMeta");
    if (headerMetaEl) headerMetaEl.innerText = `⭐ ${resolvedRatingText} • ${state.isStoreOnline ? "Open" : "Closed"}`;

    const phoneText = store.phone || store.store_phone || "Not available";
    const phoneEl = document.getElementById("storePhone");
    if (phoneEl) phoneEl.innerText = phoneText;
    const compactPhoneEl = document.getElementById("storePhoneCompact");
    if (compactPhoneEl) compactPhoneEl.innerText = `📞 ${phoneText}`;

    const areaEl = document.getElementById("storeArea");
    if (areaEl) {
      const area = store.area || store.locality || store.city || "Not available";
      areaEl.innerText = `Area: ${area}`;
    }

    const addressEl = document.getElementById("storeAddress");
    if (addressEl) {
      const address = store.address || store.store_address || "Not available";
      addressEl.innerText = address;
    }

    const pinEl = document.getElementById("storePincode");
    if (pinEl) {
      const pin = store.pincode || store.pin_code || store.zip || "Not available";
      pinEl.innerText = pin;
    }

    const timingEl = document.getElementById("storeTiming");
    if (timingEl) timingEl.innerText = `Rs. ${state.minimumOrder}`;
    return true;
  } catch (err) {
    console.error("STORE ERROR:", err);
    showError(err.message || "Unable to load store");
    return false;
  }
}

/* =====================================================
   LOAD PRODUCTS
===================================================== */
async function loadProducts() {
  const list = document.getElementById("productList");
  if (!list) return;
  list.innerHTML = `<div class="empty-state">Loading products...</div>`;

  try {
    const data = await fetchJsonOrThrow(`/products?storeId=${storeId}`);

    if (!data.success || !Array.isArray(data.products) || !data.products.length) {
      list.innerHTML = `<div class="empty-state">No products available</div>`;
      return;
    }

    state.products = data.products;
    state.filtered = [...state.products];
    renderProducts(state.filtered);
  } catch (err) {
    console.error("PRODUCT ERROR:", err);
    list.innerHTML = `<div class="empty-state" style="color:#b91c1c;border-color:#fecaca;background:#fef2f2;">Server error</div>`;
  }
}

/* =====================================================
   SEARCH FILTER
===================================================== */
function filterProducts() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  state.filtered = state.products.filter(p =>
    String(p.name || "").toLowerCase().includes(q)
  );
  renderProducts(state.filtered);
}

/* =====================================================
   RENDER PRODUCTS
===================================================== */
function renderProducts(items) {
  const list = document.getElementById("productList");

  list.innerHTML = items.map(p => {
    const qty = getCartQty(p.id);
    const price = Number(p.price || 0);
    const mrp =
      Number(p.mrp || p.mrp_price || p.original_price || p.list_price || 0) || 0;
    const hasDiscount = mrp > price && price > 0;
    const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const ratingVal = Number(p.avg_rating || p.rating || 0);
    const ratingCount = Number(p.rating_count || p.reviews_count || 0);
    const ratingText = ratingCount || ratingVal > 0 ? ratingVal.toFixed(1) : "New";
    return `
      <div class="product-card" data-id="${p.id}" onclick="openProductView(${p.id})" ${!state.isStoreOnline ? 'style="opacity:.6"' : ""}>
        <div class="product-img-box">
          <img src="${(() => {
            const images = getProductImages(p);
            return images.length ? resolveImageUrl(images[0]) : CONFIG.DEFAULT_IMG;
          })()}" onerror="this.src='${CONFIG.DEFAULT_IMG}'">
          ${hasDiscount ? `<span class="discount-tag" title="${discountPct}% OFF"><span>${discountPct}%<br>OFF</span></span>` : ""}
        </div>

        <div class="product-name">${p.name}</div>
        <div class="product-unit">${p.unit || ""}</div>
        <div class="product-rating">
          <span class="stars">&#11088;</span>
          <span>${ratingText}</span>
        </div>

        <div class="product-footer">
          <div class="price-block">
            <div class="price-main">Rs. ${price}</div>
            ${hasDiscount ? `
              <div class="price-sub">
                <span class="mrp">Rs. ${mrp}</span>
                <span class="discount-badge">${discountPct}% OFF</span>
              </div>
            ` : ""}
          </div>
          <div class="card-cart-actions">
            <button class="add-btn" ${p.stock <= 0 ? "disabled" : ""} onclick="addToCart(${p.id}); event.stopPropagation();" style="display:${qty ? "none" : "inline-block"};">
              ${p.stock > 0 ? "Add" : "Out"}
            </button>
            <div class="qty-controls" style="display:${qty ? "flex" : "none"};">
              <button onclick="updateQty(${p.id}, -1); event.stopPropagation();">-</button>
              <span>${qty}</span>
              <button onclick="updateQty(${p.id}, 1); event.stopPropagation();">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* =====================================================
   CART LOGIC
===================================================== */
function addToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  let cart = loadCart();

  if (cart.length && String(cart[0].storeId) !== String(storeId)) {
    alert("You can order from only one store at a time");
    return;
  }

  const existing = cart.find(i => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      qty: 1,
      storeId,
      seller_id: product.seller_id
    });
  }

  saveCart(cart);
  syncCartFromStorage();
}

function updateQty(id, change) {
  let cart = loadCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;

  item.qty += change;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== id);
  }

  saveCart(cart);
  syncCartFromStorage();
}

function syncCartFromStorage() {
  state.cart = loadCart();
  updateCartUI();
  updateProductCardQtys();
  updateProductViewQty();
  window.dispatchEvent(new Event("lb-cart-updated"));
}

function updateProductCardQtys() {
  document.querySelectorAll(".product-card").forEach(card => {
    const id = Number(card.getAttribute("data-id"));
    const qty = getCartQty(id);
    const addBtn = card.querySelector(".add-btn");
    const qtyBox = card.querySelector(".qty-controls");

    if (addBtn) addBtn.style.display = qty ? "none" : "inline-block";
    if (qtyBox) {
      qtyBox.style.display = qty ? "flex" : "none";
      const span = qtyBox.querySelector("span");
      if (span) span.innerText = qty;
    }
  });
}

function getCartQty(id) {
  const item = state.cart.find(i => i.id === id);
  return item ? item.qty : 0;
}

/* =====================================================
   PRODUCT VIEW MODAL
===================================================== */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getProductRating(p) {
  const ratingCandidates = [
    p.rating, p.avg_rating, p.average_rating, p.product_rating,
    p.rating_avg, p.ratingAverage
  ];
  const countCandidates = [
    p.rating_count, p.ratingCount, p.reviews_count, p.reviewCount, p.reviewsCount
  ];
  const count = Number(countCandidates.find(v => v !== null && v !== undefined && v !== "") || 0);
  let rating = 0;
  for (const v of ratingCandidates) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) { rating = n; break; }
  }
  return { rating, count };
}

function renderStars(rating) {
  const rounded = Math.max(0, Math.min(5, Number(rating) || 0));
  const full = Math.round(rounded);
  return "\u2605".repeat(full) + "\u2606".repeat(5 - full);
}

function getProductImages(product) {
  const out = [];
  const pushSafe = (value) => {
    const name = String(value || "").trim();
    if (!name) return;
    if (!out.includes(name)) out.push(name);
  };

  const raw = product?.images;
  if (Array.isArray(raw)) raw.forEach(pushSafe);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach(pushSafe);
    } catch {}
  }
  pushSafe(product?.image);

  return out;
}

function openProductView(id) {
  const product = state.products.find(p => Number(p.id) === Number(id));
  if (!product) return;
  state.activeProductId = Number(id);
  state.activeRating = 0;
  state.activeImageIndex = 0;
  renderProductImageSlider(product);

  document.getElementById("pvTitle").innerText = product.name || "Product";
  document.getElementById("pvUnit").innerText = product.unit || "Unit";

  const inStock = Number(product.stock || 0) > 0;
  document.getElementById("pvStock").innerText = inStock ? "In Stock" : "Out of Stock";
  const pvAddBtn = document.getElementById("pvAddBtn");
  if (pvAddBtn) {
    pvAddBtn.disabled = !inStock;
    pvAddBtn.innerText = inStock ? "Add to Basket" : "Out of Stock";
  }

  const desc = product.description || product.sub_category || product.details || product.desc || "No description available.";
  document.getElementById("pvDesc").innerText = desc;

  const price = Number(product.price || 0);
  const mrp = Number(product.mrp || product.mrp_price || product.original_price || product.list_price || 0) || 0;
  const hasDiscount = mrp > price && price > 0;
  document.getElementById("pvPrice").innerText = `Rs. ${price}`;
  const mrpEl = document.getElementById("pvMrp");
  const discEl = document.getElementById("pvDiscount");
  if (hasDiscount) {
    const discountPct = Math.round(((mrp - price) / mrp) * 100);
    mrpEl.innerText = `Rs. ${mrp}`;
    mrpEl.style.display = "inline";
    discEl.innerText = `${discountPct}% OFF`;
    discEl.style.display = "inline-block";
  } else {
    mrpEl.innerText = "";
    mrpEl.style.display = "none";
    discEl.style.display = "none";
  }

  const { rating, count } = getProductRating(product);
  document.getElementById("pvStars").innerText = renderStars(rating);
  document.getElementById("pvRatingText").innerText = count ? `${rating.toFixed(1)} (${count})` : "New";

  const reviewsBox = document.getElementById("pvReviews");
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  if (!reviews.length) {
    reviewsBox.innerHTML = `<div class="pv-review-card">Loading reviews...</div>`;
  } else {
    reviewsBox.innerHTML = renderReviewCards(reviews);
  }

  updateProductViewQty();
  resetReviewForm();
  document.getElementById("productViewOverlay").style.display = "flex";
  document.body.style.overflow = "hidden";
  fetchProductReviews(product.id);
}

function closeProductView() {
  const overlay = document.getElementById("productViewOverlay");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
  state.activeProductId = null;
  state.activeRating = 0;
  state.activeImageIndex = 0;
  updateCartUI();
}

function renderProductImageSlider(product) {
  const images = getProductImages(product);
  const list = images.length ? images : [null];
  const maxIdx = Math.max(0, list.length - 1);
  state.activeImageIndex = Math.min(state.activeImageIndex, maxIdx);

  const img = document.getElementById("pvImg");
  const prevBtn = document.getElementById("pvPrevBtn");
  const nextBtn = document.getElementById("pvNextBtn");
  const dots = document.getElementById("pvDots");

  if (img) {
    const current = list[state.activeImageIndex];
    img.src = current ? resolveImageUrl(current) : CONFIG.DEFAULT_IMG;
    img.onerror = () => (img.src = CONFIG.DEFAULT_IMG);
  }

  const multi = list.length > 1;
  if (prevBtn) prevBtn.classList.toggle("show", multi);
  if (nextBtn) nextBtn.classList.toggle("show", multi);
  if (dots) {
    dots.innerHTML = multi
      ? list.map((_, idx) => `<button class="pv-dot ${idx === state.activeImageIndex ? "active" : ""}" onclick="setProductImage(${idx}, event)" aria-label="Image ${idx + 1}"></button>`).join("")
      : "";
  }
}

function setProductImage(index, evt) {
  if (evt) evt.stopPropagation();
  if (!state.activeProductId) return;
  const product = state.products.find((p) => Number(p.id) === Number(state.activeProductId));
  if (!product) return;
  const images = getProductImages(product);
  if (!images.length) return;
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, images.length - 1));
  state.activeImageIndex = safeIndex;
  renderProductImageSlider(product);
}

function prevProductImage(evt) {
  if (evt) evt.stopPropagation();
  if (!state.activeProductId) return;
  const product = state.products.find((p) => Number(p.id) === Number(state.activeProductId));
  if (!product) return;
  const images = getProductImages(product);
  if (images.length <= 1) return;
  state.activeImageIndex = (state.activeImageIndex - 1 + images.length) % images.length;
  renderProductImageSlider(product);
}

function nextProductImage(evt) {
  if (evt) evt.stopPropagation();
  if (!state.activeProductId) return;
  const product = state.products.find((p) => Number(p.id) === Number(state.activeProductId));
  if (!product) return;
  const images = getProductImages(product);
  if (images.length <= 1) return;
  state.activeImageIndex = (state.activeImageIndex + 1) % images.length;
  renderProductImageSlider(product);
}

function updateProductViewQty() {
  if (!state.activeProductId) return;
  const qty = getCartQty(state.activeProductId);
  const addBtn = document.getElementById("pvAddBtn");
  const buyNowBtn = document.getElementById("pvBuyNowBtn");
  const checkoutBtn = document.getElementById("pvCheckoutBtn");
  const qtyBox = document.getElementById("pvQty");
  const qtyVal = document.getElementById("pvQtyValue");
  if (!addBtn || !qtyBox || !qtyVal) return;

  const product = state.products.find(p => Number(p.id) === Number(state.activeProductId));
  const inStock = Number(product?.stock || 0) > 0;

  addBtn.style.display = qty ? "none" : (inStock ? "inline-flex" : "none");
  if (buyNowBtn) buyNowBtn.style.display = qty ? "none" : (inStock ? "inline-flex" : "none");
  if (checkoutBtn) checkoutBtn.style.display = qty ? "inline-flex" : "none";
  qtyBox.style.display = qty ? "flex" : "none";
  qtyVal.innerText = qty || 1;
}

function addToCartFromView() {
  if (!state.activeProductId) return;
  addToCart(state.activeProductId);
  updateProductViewQty();
}

function buyNowFromView() {
  if (!state.activeProductId) return;
  const qty = getCartQty(state.activeProductId);
  if (!qty) addToCart(state.activeProductId);
  checkout();
}

function checkoutFromView() {
  checkout();
}

function updateQtyFromView(change) {
  if (!state.activeProductId) return;
  updateQty(state.activeProductId, change);
  updateProductViewQty();
}

function resetReviewForm() {
  const starLabel = document.getElementById("pvStarLabel");
  const reviewText = document.getElementById("pvReviewText");
  document.querySelectorAll(".pv-star-btn").forEach(btn => btn.classList.remove("active"));
  if (starLabel) starLabel.innerText = "Tap to rate";
  if (reviewText) reviewText.value = "";
}

function setStarRating(value) {
  state.activeRating = value;
  const starLabel = document.getElementById("pvStarLabel");
  document.querySelectorAll(".pv-star-btn").forEach(btn => {
    const star = Number(btn.getAttribute("data-star"));
    btn.classList.toggle("active", star <= value);
  });
  if (starLabel) starLabel.innerText = value ? `${value} Star${value > 1 ? "s" : ""}` : "Tap to rate";
}

async function submitProductReview() {
  if (!state.activeProductId) return;
  if (!state.activeRating) {
    alert("Please select a rating");
    return;
  }
  const user = JSON.parse(localStorage.getItem("lbUser") || "null");
  const product = state.products.find(p => Number(p.id) === Number(state.activeProductId));
  const comment = (document.getElementById("pvReviewText")?.value || "").trim();
  const resolvedStoreId = product?.seller_id || Number(storeId) || null;

  try {
    const data = await fetchJsonOrThrow(`/products/${state.activeProductId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: state.activeRating,
        comment,
        customer_id: user?.id || null,
        customer_name: user?.name || user?.username || "Customer",
        store_id: resolvedStoreId
      })
    });
    if (!data.success) throw new Error(data.message || "Failed");
    resetReviewForm();
    fetchProductReviews(state.activeProductId);
  } catch (err) {
    alert(err?.message || "Unable to submit review");
  }
}

async function fetchProductReviews(productId) {
  try {
    const data = await fetchJsonOrThrow(`/products/${productId}/reviews`);
    if (!data || !data.success) throw new Error(data?.message || "Failed");

    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    const reviewsBox = document.getElementById("pvReviews");
    if (reviewsBox) {
      reviewsBox.innerHTML = reviews.length
        ? renderReviewCards(reviews)
        : `<div class="pv-review-card">No reviews yet.</div>`;
    }
    if (state.activeProductId === productId) {
      const rating = Number(data.avg_rating || 0);
      const count = Number(data.rating_count || 0);
      document.getElementById("pvStars").innerText = renderStars(rating);
      document.getElementById("pvRatingText").innerText = count ? `${rating.toFixed(1)} (${count})` : "New";
    }
  } catch (err) {
    const reviewsBox = document.getElementById("pvReviews");
    if (reviewsBox) {
      reviewsBox.innerHTML = `<div class="pv-review-card">No reviews yet.</div>`;
    }
  }
}

function renderReviewCards(reviews) {
  return reviews.slice(0, 8).map(r => {
    const name = escapeHtml(r.customer_name || r.name || r.user || "Customer");
    const comment = escapeHtml(r.comment || r.review || r.message || "");
    const rr = Number(r.rating || 0);
    return `
      <div class="pv-review-card">
        <div class="pv-review-head">
          <span>${name}</span>
          <span class="pv-stars">${renderStars(rr)}</span>
        </div>
        <div>${comment || "No comment."}</div>
      </div>
    `;
  }).join("");
}

/* =====================================================
   CART UI
===================================================== */
function updateCartUI() {
  const count = state.cart.reduce((sum, i) => sum + i.qty, 0);
  const total = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const totalText = `Rs. ${Math.round(total)}`;
  const isLegacyCartOpen = !!document.getElementById("cartPanel")?.classList.contains("active");
  const isSharedCartOpen = !!document.getElementById("lbCartDrawer")?.classList.contains("active");
  const isCartOpen = isLegacyCartOpen || isSharedCartOpen;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  document.getElementById("cartCountLabel").innerText = `Basket (${count})`;
  document.getElementById("cartTotal").innerText = totalText;
  document.getElementById("mItemCount").innerText = `Basket (${count})`;
  document.getElementById("mTotalAmount").innerText = totalText;

  const mobileBarBtn = document.getElementById("mobileBarBtn");
  if (mobileBarBtn) {
    mobileBarBtn.innerText = "Checkout";
  }

  const mobileBar = document.getElementById("mobileBar");
  if (mobileBar) {
    mobileBar.classList.toggle("is-visible", count > 0 && !isCartOpen);
    if (count > 0 && !isCartOpen) {
      if (isMobile) {
        mobileBar.style.left = "0";
        mobileBar.style.right = "0";
        mobileBar.style.top = "auto";
      } else {
        applyMobileBarSavedPosition(mobileBar);
      }
    }
  }

  const floatingCheckoutBtn = document.getElementById("floatingCheckoutBtn");
  if (floatingCheckoutBtn) {
    floatingCheckoutBtn.style.display = count > 0 && !isCartOpen ? "inline-flex" : "none";
    if (count > 0 && !isCartOpen) {
      const positioned = applyFloatingCheckoutSavedPosition(floatingCheckoutBtn);
      if (!positioned) setFloatingCheckoutDefaultPosition(floatingCheckoutBtn);
    } else {
      setFloatingCheckoutDefaultPosition(floatingCheckoutBtn);
    }
    floatingCheckoutBtn.innerText = `Checkout (${totalText})`;
  }

  updateFooterSafeOffsets();

  const box = document.getElementById("cartItemsContainer");
  if (!count) {
    box.innerHTML = "<p>Your basket is empty</p>";
    return;
  }

  box.innerHTML = state.cart.map(i => `
    <div class="cart-row">
      <div>
        <strong>${i.name}</strong><br>
        <small>Rs. ${i.price}</small>
      </div>
      <div class="cart-qty">
        <button onclick="updateQty(${i.id}, -1)">-</button>
        <strong>${i.qty}</strong>
        <button onclick="updateQty(${i.id}, 1)">+</button>
      </div>
    </div>
  `).join("");
}

/* =====================================================
   CHECKOUT
===================================================== */
function checkout() {
  if (!state.cart.length) {
    alert("Cart is empty");
    return;
  }

  if (!state.isStoreOnline) {
    alert("Store is currently closed. Please try later.");
    return;
  }

  const total = state.cart.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0), 0);
  const minOrder = Number(state.minimumOrder);
  if (Number.isFinite(minOrder) && total < minOrder) {
    alert(`Minimum order is Rs. ${minOrder}. Please add more items.`);
    return;
  }

  // Use absolute path to avoid routing issues on some hosts (e.g. static deploys).
  window.location.href = "/welcome/customer/checkout/checkout.html";
}

/* =====================================================
   HELPERS
===================================================== */
function toggleCart(show) {
  if (typeof window.lbOpenCart === "function" && typeof window.lbCloseCart === "function") {
    const mobileBar = document.getElementById("mobileBar");
    const floatingCheckoutBtn = document.getElementById("floatingCheckoutBtn");
    if (show) {
      window.lbOpenCart();
      if (mobileBar) mobileBar.classList.remove("is-visible");
      if (floatingCheckoutBtn) floatingCheckoutBtn.style.display = "none";
    } else {
      window.lbCloseCart();
      updateCartUI();
    }
    return;
  }

  document.getElementById("cartPanel").classList.toggle("active", show);
  const backdrop = document.getElementById("cartBackdrop");
  if (backdrop) backdrop.classList.toggle("active", show);
  const mobileBar = document.getElementById("mobileBar");
  const floatingCheckoutBtn = document.getElementById("floatingCheckoutBtn");
  if (show) {
    if (mobileBar) mobileBar.classList.remove("is-visible");
    if (floatingCheckoutBtn) floatingCheckoutBtn.style.display = "none";
  } else {
    updateCartUI();
  }
  document.body.style.overflow = show ? "hidden" : "";
}

function showError(msg) {
  document.body.innerHTML = `
    <div style="height:100vh;display:flex;align-items:center;justify-content:center;">
      <h2>${msg}</h2>
    </div>
  `;
}

function updateFooterSafeOffsets() {
  const footer = document.getElementById("siteFooter");
  const floatingCheckoutBtn = document.getElementById("floatingCheckoutBtn");
  const mobileBar = document.getElementById("mobileBar");
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const bottomNav = document.querySelector(".lb-bottom-nav");
  const navHeight = bottomNav ? Math.ceil(bottomNav.getBoundingClientRect().height || 0) : 0;
  const nearPageBottom = (window.scrollY + window.innerHeight) >= (document.documentElement.scrollHeight - 8);
  const footerTop = footer ? footer.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
  const overlap = nearPageBottom ? Math.max(0, window.innerHeight - footerTop + 10) : 0;

  if (floatingCheckoutBtn && floatingCheckoutBtn.style.display !== "none") {
    const hasCustom = !!readFloatingCheckoutPos();
    if (!hasCustom) {
      floatingCheckoutBtn.style.bottom = `${20 + overlap}px`;
    }
  }
  if (mobileBar && mobileBar.classList.contains("is-visible")) {
    if (isMobile) {
      mobileBar.style.bottom = `${Math.max(88, navHeight + 24) + overlap}px`;
      mobileBar.style.left = "0";
      mobileBar.style.right = "0";
      mobileBar.style.top = "auto";
    } else {
      const hasCustom = !!readMobileBarPos();
      if (!hasCustom) {
        mobileBar.style.bottom = `${20 + overlap}px`;
      }
    }
  }
}

window.filterProducts = filterProducts;
window.openProductView = openProductView;
window.closeProductView = closeProductView;
window.addToCartFromView = addToCartFromView;
window.buyNowFromView = buyNowFromView;
window.checkoutFromView = checkoutFromView;
window.updateQtyFromView = updateQtyFromView;
window.submitProductReview = submitProductReview;
window.setStarRating = setStarRating;
window.prevProductImage = prevProductImage;
window.nextProductImage = nextProductImage;
window.setProductImage = setProductImage;

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".pv-star-btn");
  if (!btn) return;
  const value = Number(btn.getAttribute("data-star"));
  setStarRating(value);
});

window.addEventListener("scroll", updateFooterSafeOffsets, { passive: true });
window.addEventListener("resize", updateFooterSafeOffsets);
document.addEventListener("DOMContentLoaded", () => {
  initFloatingCheckoutDrag();
  initMobileBarDrag();
  updateFooterSafeOffsets();
});


