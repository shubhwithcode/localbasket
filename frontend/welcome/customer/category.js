const host = String(window.location.hostname || "").trim();
const isPrivateLanHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
const isLocalHost = ["localhost", "127.0.0.1"].includes(host) || isPrivateLanHost || window.location.protocol === "file:";
const isVercelHost = host.endsWith(".vercel.app");
const localOrigin = window.location.protocol === "file:" ? "http://localhost:5000" : `${window.location.protocol}//${host}:5000`;
const hostedOrigin = window.location.origin;
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
  const clean = String(safeWindowBase || safeStoredBase || byOrigin || "").trim().replace(/\/+$/, "");
  if (clean) window.API_BASE_URL = window.API_BASE_URL || clean;
  return clean;
})();

const CONFIG = {
  API_BASE: isLocalHost
    ? `${API_BASE_URL}/api`
    : (isVercelHost ? `${API_BASE_URL}/api` : `${API_BASE_URL}/api`),
  IMG_BASE: isLocalHost
    ? `${localOrigin}/uploads`
    : `${API_BASE_URL}/uploads`,
  DEFAULT_IMG: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80"
};

const state = {
  stores: [],
  active: "all",
  categories: [],
  requirePin: false,
  favoriteStoreIds: JSON.parse(localStorage.getItem("lbFavoriteStoreIds") || "[]")
};
const chipBar = document.getElementById("chipBar");
const sections = document.getElementById("categorySections");

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("lbUser") || "null");
  } catch {
    return null;
  }
};

const updateMobileTopbar = () => {
  const nameEl = document.getElementById("categoryMobileName");
  const actionBtn = document.getElementById("categoryMobileAction");
  const backBtn = document.getElementById("categoryMobileBack");
  const user = getStoredUser();

  if (nameEl) nameEl.textContent = "Explore Stores";

  if (backBtn && !backBtn.dataset.bound) {
    backBtn.addEventListener("click", () => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "/welcome/customer/index.html";
    });
    backBtn.dataset.bound = "1";
  }

  if (actionBtn) {
    if (user && (user.id || user.customer_id || user.phone || user.email || user.name)) {
      actionBtn.textContent = "Profile";
      actionBtn.onclick = () => {
        window.location.href = "/welcome/customer/profile/profile.html";
      };
    } else {
      actionBtn.textContent = "Login";
      actionBtn.onclick = () => {
        window.location.href = "/welcome/customer/index.html";
      };
    }
  }
};

const slugify = (text) => {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const mapStoreCategory = (store) => {
  const raw = String(store.category_slug || store.category_name || store.category || store.business_type || "").toLowerCase();
  return slugify(raw || "grocery");
};

const resolveImageUrl = (rawPath) => {
  const input = String(rawPath || "").trim();
  if (!input) return CONFIG.DEFAULT_IMG;
  if (/^(https?:)?\/\//i.test(input) || input.startsWith("data:") || input.startsWith("blob:")) {
    return input;
  }
  const base = String(CONFIG.IMG_BASE || `${window.location.origin}/uploads`).replace(/\/+$/, "");
  let path = input.replace(/\\/g, "/").trim();
  const lower = path.toLowerCase();
  const idx = lower.lastIndexOf("/uploads/");
  if (idx !== -1) path = path.slice(idx + "/uploads/".length);
  else if (lower.startsWith("uploads/")) path = path.slice("uploads/".length);
  else if (path.startsWith("/")) return `${window.location.origin}${path}`;
  return `${base}/${encodeURI(path.replace(/^\/+/, ""))}`;
};

const getStoredQuery = () => {
  const pin = localStorage.getItem("lbPin");
  const addr = localStorage.getItem("lbAddr");
  if (pin) return { query: pin, isPin: true };
  if (addr && addr !== "Select Location") {
    const raw = addr.replace(/^Area:\s*/i, "").replace(/^Pincode:\s*/i, "").trim();
    return { query: raw, isPin: false };
  }
  return { query: null, isPin: true };
};

const fetchStores = async () => {
  const { query, isPin } = getStoredQuery();
  const url = query
    ? (isPin
        ? `${CONFIG.API_BASE}/stores?pincode=${encodeURIComponent(query)}`
        : `${CONFIG.API_BASE}/stores?area=${encodeURIComponent(query)}`)
    : `${CONFIG.API_BASE}/stores`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data && data.success === false && /pincode/i.test(String(data.message || ""))) {
    state.requirePin = true;
    return [];
  }
  state.requirePin = false;
  return Array.isArray(data.stores) ? data.stores : (Array.isArray(data) ? data : []);
};

const renderChips = () => {
  const categoriesWithState = state.categories.map(c => ({
    ...c,
    hasStores: state.stores.some(s => mapStoreCategory(s) === c.slug)
  }));

  if (
    state.active !== "all" &&
    state.active !== "favorites" &&
    !categoriesWithState.some(c => c.slug === state.active && c.hasStores)
  ) {
    state.active = "all";
  }

  const chips = [
    `<button class="chip ${state.active === "all" ? "active" : ""}" data-key="all">All</button>`,
    `<button class="chip ${state.active === "favorites" ? "active" : ""}" data-key="favorites">Favorites</button>`
  ];
  categoriesWithState.forEach(c => {
    chips.push(
      `<button class="chip ${state.active === c.slug ? "active" : ""} ${c.hasStores ? "" : "disabled"}" data-key="${c.slug}" ${c.hasStores ? "" : "disabled"}>${c.name}</button>`
    );
  });
  chipBar.innerHTML = chips.join("");

  chipBar.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("disabled")) return;
      state.active = btn.getAttribute("data-key");
      renderChips();
      renderAll();
    });
  });

  const activeChip = chipBar.querySelector('.chip.active');
  if (activeChip) {
    activeChip.classList.add("shift-pop");
    activeChip.classList.add("just-selected");
    activeChip.addEventListener("animationend", () => {
      activeChip.classList.remove("just-selected");
    }, { once: true });
    activeChip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
};

const renderSection = (title, stores) => {
  const gridClass = stores.length === 1 ? "store-grid single" : "store-grid";
  return `
    <section class="section">
      <h2>${title}</h2>
      <div class="${gridClass}">
        ${stores.map(store => `
          <div class="store-card" onclick="location.href='/welcome/customer/store/store.html?id=${store.id}'">
            <div class="store-img">
              <button
                class="fav-btn ${isFavoriteStore(store.id) ? "active" : ""}"
                type="button"
                onclick="toggleFavoriteStore(event, ${store.id})"
                aria-label="${isFavoriteStore(store.id) ? "Remove from favorites" : "Add to favorites"}"
              >${isFavoriteStore(store.id) ? "&#10084;" : "&#9825;"}</button>
              <img src="${resolveImageUrl(store.store_photo)}" onerror="this.src='${CONFIG.DEFAULT_IMG}'">
              <span class="status-pill ${Number(store.is_online) === 1 ? "open" : "closed"}">
                ${Number(store.is_online) === 1 ? "OPEN" : "CLOSED"}
              </span>
              <span class="store-cta">View Store</span>
              <span class="img-overlay"></span>
            </div>
            <div class="store-body">
              <h3>${store.store_name}</h3>
              <div class="store-meta-compact">${renderCompactStoreMeta(store)}</div>
              <div class="store-pin-line">&#128205; ${store.pincode || "-"}</div>
              <div class="store-open-line ${Number(store.is_online) === 1 ? "open" : "closed"}">${Number(store.is_online) === 1 ? "Open" : "Closed"}</div>
              <div class="store-cat">${store.business_type || store.category_name || store.category || 'General Store'}</div>
              <div class="store-meta-row">
                <span class="meta-pill">Pin: ${store.pincode || "-"}</span>
                ${renderRatingChip(store)}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
};

const renderCompactStoreMeta = (store) => {
  const rating = getStoreRating(store);
  const label = store.business_type || store.category_name || store.category || "General Store";
  const ratingText = !rating || rating.label === "New" ? "New" : rating.value.toFixed(1);
  return `\u2B50 ${ratingText} \u2022 ${label}`;
};

const getStoreRating = (store) => {
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
      if (n === 0 && count === 0) return { label: "New", value: 0, count: 0 };
      return { label: "Rated", value: Math.max(0, Math.min(5, n)), count };
    }
  }
  return { label: "New", value: 0, count: 0 };
};

const renderStars = (value) => {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return "\u2605\u2605\u2605\u2605\u2605".split("").map((_, i) => {
    if (i < full) return "\u2605";
    if (i === full && hasHalf) return "\u2605";
    return "\u2606";
  }).join("");
};

const renderRatingChip = (store) => {
  const rating = getStoreRating(store);
  if (!rating || rating.label === "New") {
    return `<span class="meta-pill">Rating: New</span>`;
  }
  return `
    <span class="rating-chip" title="Based on customer reviews">
      <span class="rating-stars">${renderStars(rating.value)}</span>
      <span>${rating.value.toFixed(1)}</span>
      ${rating.count > 0 ? `<span class="rating-count">(${rating.count})</span>` : ""}
    </span>
  `;
};

const renderAll = () => {
  if (!sections) return;
  sections.classList.toggle("category-focused", state.active !== "all");

  if (!state.stores.length) {
    if (state.requirePin) {
      sections.innerHTML = `<div class="empty-state">Enter a valid 6-digit pincode to see stores.</div>`;
    } else {
      sections.innerHTML = `<div class="empty-state">No stores found.</div>`;
    }
    return;
  }

  if (state.active !== "all") {
    if (state.active === "favorites") {
      const filtered = state.stores.filter(s => isFavoriteStore(s.id));
      sections.innerHTML = filtered.length
        ? renderSection("My Favorite Stores", filtered)
        : `<div class="empty-state">No favorite stores yet. Tap &#10084; on any store card.</div>`;
      return;
    }
    const filtered = state.stores.filter(s => mapStoreCategory(s) === state.active);
    if (!filtered.length) {
      state.active = "all";
      renderChips();
      renderAll();
      return;
    }
    const title = state.categories.find(c => c.slug === state.active)?.name || "Category";
    sections.innerHTML = renderSection(title, filtered);
    return;
  }

  const grouped = state.categories.map(c => {
    return {
      key: c.slug,
      title: c.name,
      items: state.stores.filter(s => mapStoreCategory(s) === c.slug)
    };
  }).filter(g => g.items.length);

    sections.innerHTML = grouped.length
    ? grouped.map(g => renderSection(g.title, g.items)).join("")
    : `<div class="empty-state">No stores found.</div>`;
};

const init = async () => {
  updateMobileTopbar();
  const pinInput = document.getElementById("pinInput");
  if (pinInput) {
    const saved = localStorage.getItem("lbPin") || "";
    pinInput.value = saved;
    pinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") setPinAndLoad();
    });
  }
  state.stores = await fetchStores();
  await loadCategories();
  renderChips();
  renderAll();
};

init();

function setPinAndLoad() {
  const input = document.getElementById("pinInput");
  const val = (input && input.value ? input.value.trim() : "");
  if (!/^\d{6}$/.test(val)) {
    alert("Please enter a valid 6-digit pincode");
    return;
  }
  localStorage.setItem("lbPin", val);
  localStorage.removeItem("lbAddr");
  location.reload();
}

window.setPinAndLoad = setPinAndLoad;

async function loadCategories() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/admin/categories`);
    const data = await res.json();
    const cats = Array.isArray(data.categories) ? data.categories : [];
    state.categories = cats
      .filter(c => c && (c.is_active === 1 || c.is_active === true))
      .map(c => ({
        name: c.name || "Category",
        slug: c.slug ? slugify(c.slug) : slugify(c.name)
      }));
  } catch (e) {
    state.categories = [];
  }
}

function isFavoriteStore(storeId) {
  return Array.isArray(state.favoriteStoreIds) && state.favoriteStoreIds.includes(Number(storeId));
}

function persistFavoriteStores() {
  localStorage.setItem("lbFavoriteStoreIds", JSON.stringify((state.favoriteStoreIds || []).slice(0, 100)));
}

function toggleFavoriteStore(event, storeId) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const id = Number(storeId);
  if (!id) return;
  const list = Array.isArray(state.favoriteStoreIds) ? [...state.favoriteStoreIds] : [];
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(id);
  state.favoriteStoreIds = list;
  persistFavoriteStores();
  renderChips();
  renderAll();
}

window.toggleFavoriteStore = toggleFavoriteStore;


