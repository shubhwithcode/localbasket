/******************************************************
 * LOCALBASKET — FULL ENGINE (V2 OPTIMIZED)
 ******************************************************/

const host = String(window.location.hostname || "").trim();
const isPrivateLanHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
const isVercelHost = host.endsWith(".vercel.app");
const IS_LOCAL_HOST =
    ["localhost", "127.0.0.1"].includes(host) ||
    isPrivateLanHost ||
    window.location.protocol === "file:";
const localApiOrigin = window.location.protocol === "file:" ? "http://localhost:5000" : `${window.location.protocol}//${host}:5000`;
const API_BASE_URL = (() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("lbApiBase")) || "";
    const byOrigin = window.location.protocol === "file:" ? localApiOrigin : window.location.origin;
    const isHosted = !IS_LOCAL_HOST;
    const isLoopbackBase = (value) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(value || "").trim().replace(/\/+$/, ""));
    const byWindow = String(window.API_BASE_URL || window.LB_API_BASE || "").trim();
    const safeWindowBase = isHosted && isLoopbackBase(byWindow) ? "" : byWindow;
    const safeStoredBase = isHosted && isLoopbackBase(stored) ? "" : stored;
    if (isHosted && stored && isLoopbackBase(stored)) {
        try { localStorage.removeItem("lbApiBase"); } catch {}
    }
    const preferred = safeWindowBase || safeStoredBase || byOrigin;
    const clean = String(preferred || byOrigin).trim().replace(/\/+$/, "");
    window.API_BASE_URL = clean;
    return clean;
})();
const CONFIG = {
    API_BASE: IS_LOCAL_HOST
        ? `${API_BASE_URL}/api`
        : (isVercelHost ? `${API_BASE_URL}/api` : `${API_BASE_URL}/api`),
    IMG_BASE: IS_LOCAL_HOST
        ? `${localApiOrigin}/uploads`
        : `${API_BASE_URL}/uploads`,
    DEFAULT_IMG: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80"
};

function getApiCandidates() {
    const candidates = [
        CONFIG.API_BASE,
        ...(isVercelHost ? [] : [`${window.location.origin}/api`])
    ]
        .map((value) => String(value || "").trim().replace(/\/+$/, ""))
        .filter(Boolean);

    return [...new Set(candidates)];
}

async function fetchApiJson(pathname, options) {
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

const WELCOME_BASE = (() => {
    const path = String(window.location.pathname || "").replace(/\\/g, "/");
    return path.includes("/frontend/") ? "/frontend" : "";
})();

const welcomePath = (suffix) => `${WELCOME_BASE}/welcome/${String(suffix || "").replace(/^\/+/, "")}`;

/* ============ SAFE STORAGE PARSE ============ */
const safeParse = (value, fallback = null) => {
    if (value == null || value === "undefined") return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const normalizeUser = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const user = { ...raw };
    const canonicalId = user.id || user.customer_id || user._id || user.user_id || user.customerId || null;
    if (canonicalId != null) user.id = canonicalId;
    if (!user.name && user.full_name) user.name = user.full_name;
    return user;
};

const resolveImageUrl = (rawPath) => {
    const input = String(rawPath || "").trim();
    if (!input) return CONFIG.DEFAULT_IMG;
    if (/^(https?:)?\/\//i.test(input) || input.startsWith("data:") || input.startsWith("blob:")) {
        return input;
    }

    const imgBase = String(CONFIG.IMG_BASE || `${window.location.origin}/uploads`).replace(/\/+$/, "");
    let path = input.replace(/\\/g, "/").trim();
    const lower = path.toLowerCase();
    const idx = lower.lastIndexOf("/uploads/");
    if (idx !== -1) path = path.slice(idx + "/uploads/".length);
    else if (lower.startsWith("uploads/")) path = path.slice("uploads/".length);
    else if (path.startsWith("/")) return `${window.location.origin}${path}`;

    return `${imgBase}/${encodeURI(path.replace(/^\/+/, ""))}`;
};

const pickProductImage = (item) => {
    if (!item || typeof item !== "object") return CONFIG.DEFAULT_IMG;
    const images = Array.isArray(item.images) ? item.images : [];
    const candidate = item.image || images[0] || "";
    return resolveImageUrl(candidate);
};

/* ============ CART KEY (PER USER) ============ */
const getCartKey = () => {
    const u = normalizeUser(safeParse(localStorage.getItem("lbUser"), null));
    const id = u && u.id ? u.id : "guest";
    return `lbCart_${id}`;
};

const loadCart = () => {
    const key = getCartKey();
    let cart = safeParse(localStorage.getItem(key), []);
    if (!cart.length) {
        const legacy = safeParse(localStorage.getItem("lbCart"), []);
        if (legacy.length) {
            localStorage.setItem(key, JSON.stringify(legacy));
            localStorage.removeItem("lbCart");
            cart = legacy;
        }
    }
    return cart;
};

const saveCart = (cart) => {
    localStorage.setItem(getCartKey(), JSON.stringify(cart));
};

/* ============ 1. STATE MANAGEMENT ============ */
const state = {
    user: normalizeUser(safeParse(localStorage.getItem("lbUser"), null)),
    cart: loadCart(),
    location: {
        address: localStorage.getItem("lbAddr") || "Select Location",
        pincode: localStorage.getItem("lbPin") || null
    },
    authMode: "login",
    authUseOtp: false,
    token: localStorage.getItem("lbToken") || null,
    stores: [],
    activeCategory: "all",
    categories: [],
    storeSearch: "",
    openNowOnly: false,
    storeSort: "relevance",
    viewMode: localStorage.getItem("lbStoreViewMode") || "comfortable",
    recentStores: safeParse(localStorage.getItem("lbRecentStores"), []),
    storeSearchTimer: null,
    storeProductsCache: {},
    topRatedStores: [],
    topProducts: [],
    topPicks: safeParse(localStorage.getItem("lbTopPicks"), [])
};
const AUTO_LOCATION_SESSION_KEY = "lbAutoLocAttempted";
const AUTO_LOCATION_FRESH_MS = 30 * 60 * 1000;
const LOCATION_CACHE_KEY = "lbLocGeoCacheV1";
const LOCATION_CACHE_TTL_MS = 12 * 60 * 1000;
const LOCATION_LOOKUP_TIMEOUT_MS = 7000;
const OPEN_LOCATION_FLAG = "lbOpenLocationAfterRedirect";
let locationMap = null;
let locationMarker = null;

/* ============ 2. DOM SELECTORS ============ */
const getEl = (id) => document.getElementById(id);

// Centralized DOM access to prevent "null" errors
const dom = {
    locText: () => getEl("locText"),
    cartCount: () => getEl("cartCount"),
    loginBtn: () => getEl("loginBtn"),
    userAccount: () => getEl("userAccount"),
    userInitials: () => getEl("userInitials"),
    userFullName: () => getEl("userFullName"),
    userIdLine: () => getEl("userIdLine"),
    userMenu: () => getEl("userMenu"),
    accountBtn: () => getEl("accountBtn"),
    authOverlay: () => getEl("authOverlay"),
    registerFields: () => getEl("registerFields"),
    authPhone: () => getEl("authPhone"),
    authPassword: () => getEl("authPassword"),
    authOtp: () => getEl("authOtp"),
    authOtpRow: () => getEl("authOtpRow"),
    authUseOtpBtn: () => getEl("authUseOtpBtn"),
    authRequestOtpBtn: () => getEl("authRequestOtpBtn"),
    cartDrawer: () => getEl("cartDrawer"),
    cartOverlay: () => getEl("cartOverlay"),
    cartItems: () => getEl("cartItems"),
    storeGrid: () => getEl("storeGrid"),
    storeSearchInput: () => getEl("storeSearchInput"),
    mobilePinInput: () => getEl("mobilePinInput"),
    mobileGreetingName: () => getEl("mobileGreetingName"),
    mobileAddressLabel: () => getEl("mobileAddressLabel"),
    mobileLocationSummary: () => getEl("mobileLocationSummary"),
    mobileUserAvatar: () => getEl("mobileUserAvatar"),
    mobileAuthBtn: () => getEl("mobileAuthBtn"),
    mobileCategoryBar: () => getEl("mobileCategoryBar"),
    mobilePromoArt: () => document.querySelector(".mobile-promo-art"),
    mobileFilterTrigger: () => getEl("mobileFilterTrigger"),
    mobileFilterPanel: () => getEl("mobileFilterPanel"),
    mobileSortSelect: () => getEl("mobileSortSelect"),
    mobileAvailabilitySelect: () => getEl("mobileAvailabilitySelect"),
    openNowOnlyToggle: () => getEl("openNowOnlyToggle"),
    storeSortSelect: () => getEl("storeSortSelect"),
    heroPinInput: () => getEl("pinInput"),
    locModal: () => getEl("locationModal"),
    modalPinInput: () => getEl("modalPinInput"),
    mapFrame: () => getEl("mapFrame"),
    locAccuracyText: () => getEl("locAccuracyText"),
    improveLocBtn: () => getEl("improveLocBtn"),
    recentStoresSection: () => getEl("recentStoresSection"),
    recentStoresGrid: () => getEl("recentStoresGrid"),
    clearRecentBtn: () => getEl("clearRecentBtn"),
    discoveryZone: () => getEl("discoveryZone"),
    topRatedSection: () => getEl("topRatedSection"),
    topRatedGrid: () => getEl("topRatedGrid"),
    topProductsSection: () => getEl("topProductsSection"),
    topProductsRow: () => getEl("topProductsRow"),
    heroAvgValue: () => getEl("heroAvgValue"),
    heroAvgLabel: () => getEl("heroAvgLabel"),
    heroAvgMeta: () => getEl("heroAvgMeta"),
    heroOnlineValue: () => getEl("heroOnlineValue"),
    heroOnlineLabel: () => getEl("heroOnlineLabel"),
    heroOnlineMeta: () => getEl("heroOnlineMeta"),
    heroStoreValue: () => getEl("heroStoreValue"),
    heroStoreLabel: () => getEl("heroStoreLabel"),
    heroStoreMeta: () => getEl("heroStoreMeta"),
    storeResultsCount: () => getEl("storeResultsCount"),
    storeResultsHint: () => getEl("storeResultsHint"),
    activeFilters: () => getEl("activeFilters"),
    viewToggle: () => getEl("viewToggle"),
    backToTopBtn: () => getEl("backToTopBtn")
};

/* ============ 3. INITIALIZATION ============ */
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

function bindAuthVisibilityToggles() {
    const bind = (btnId, inputId, labels = {}) => {
        const btn = getEl(btnId);
        const input = getEl(inputId);
        if (!btn || !input) return;
        const icon = btn.querySelector("i");
        const showLabel = labels.show || "Show";
        const hideLabel = labels.hide || "Hide";
        const setState = (visible) => {
            try { input.type = visible ? "text" : "password"; } catch {}
            btn.setAttribute("aria-label", visible ? hideLabel : showLabel);
            if (icon) icon.className = `fas ${visible ? "fa-eye-slash" : "fa-eye"}`;
            btn.dataset.visible = visible ? "1" : "0";
        };
        setState(false);
        btn.addEventListener("click", () => {
            const visible = btn.dataset.visible === "1";
            setState(!visible);
        });
    };

    bind("toggleAuthPassword", "authPassword", { show: "Show password", hide: "Hide password" });
    bind("toggleAuthOtp", "authOtp", { show: "Show OTP", hide: "Hide OTP" });
}

function initApp() {
    bindAuthVisibilityToggles();
    updateAuthUI();
    updateCartUI();
    updateLocationUI();
    updateMobileHomeShell();
    loadMobilePromoArt();
    applyViewMode(state.viewMode);
    updateMobileSortButtons();
    updateHeroInsights();
    updateStoreMeta(0, "Enter your pincode to start browsing");
    hydrateLocationStatus();
    enrichAddressFromSavedCoords().catch(() => {});
    initLocationMap();
    try {
        if (sessionStorage.getItem(OPEN_LOCATION_FLAG) === "1") {
            sessionStorage.removeItem(OPEN_LOCATION_FLAG);
            const modal = dom.locModal();
            if (modal) {
                modal.style.display = "flex";
                window.dispatchEvent(new Event("lb-location-modal-opened"));
            }
        }
    } catch (err) {
        // ignore storage failures
    }
    renderRecentStores();
    loadCategories();

    if (dom.storeGrid()) {
        if (state.location.pincode) {
            loadStores(state.location.pincode, true);
        } else {
            loadStores("", false);
        }
    }
    setTimeout(() => {
        autoDetectLocationOnLoad().catch(() => {});
    }, 260);
}

function isLocationModalVisible() {
    const modal = dom.locModal();
    if (!modal) return false;
    return getComputedStyle(modal).display !== "none";
}

function syncLocationMapSize() {
    if (!(locationMap && typeof locationMap.invalidateSize === "function")) return;
    const redrawTiles = () => {
        if (!locationMap || typeof locationMap.eachLayer !== "function") return;
        locationMap.eachLayer((layer) => {
            if (layer && typeof layer.redraw === "function") {
                try { layer.redraw(); } catch {}
            }
        });
    };
    const run = () => {
        const mapEl = dom.mapFrame();
        if (mapEl && (mapEl.offsetWidth < 40 || mapEl.offsetHeight < 40)) return;
        locationMap.invalidateSize({ pan: false, animate: false });
        redrawTiles();
        if (locationMarker && typeof locationMarker.getLatLng === "function") {
            const p = locationMarker.getLatLng();
            locationMap.setView([p.lat, p.lng], locationMap.getZoom() || 13, { animate: false });
        }
    };
    [0, 90, 220, 420, 700].forEach((ms) => setTimeout(run, ms));
}

function updateMobileSortButtons() {
    const row = getEl("mobileSortRow");
    if (row) {
        row.querySelectorAll(".mobile-sort-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.getAttribute("data-sort") === state.storeSort);
        });
    }
    const mobileSortSelect = dom.mobileSortSelect();
    if (mobileSortSelect) mobileSortSelect.value = state.storeSort || "relevance";
    const mobileAvailabilitySelect = dom.mobileAvailabilitySelect();
    if (mobileAvailabilitySelect) mobileAvailabilitySelect.value = state.openNowOnly ? "open" : "all";
}

function normalizePromoImageList(list = []) {
    if (!Array.isArray(list)) return [];
    return list
        .map((item) => {
            if (!item) return null;
            if (typeof item === "string") return item.trim();
            if (typeof item === "object") {
                return String(item.src || item.url || item.image || "").trim();
            }
            return null;
        })
        .filter(Boolean);
}

function renderMobilePromoArt(rawPath) {
    const box = dom.mobilePromoArt();
    if (!box) return;
    const image = String(rawPath || "").trim();
    if (!image) {
        box.innerHTML = "🥕";
        return;
    }
    const safeSrc = resolveImageUrl(image);
    box.innerHTML = "";
    const img = document.createElement("img");
    img.src = safeSrc;
    img.alt = "Promo";
    img.addEventListener("error", () => {
        box.innerHTML = "🥕";
    }, { once: true });
    box.appendChild(img);
}

function renderMobilePromoCopy(settings = {}) {
    const kicker = getEl("mobilePromoKicker");
    const title = getEl("mobilePromoTitle");
    const highlight = getEl("mobilePromoHighlight");
    const cta = getEl("mobilePromoCta");

    if (kicker && settings.mobile_promo_kicker != null) {
        const next = String(settings.mobile_promo_kicker || "").trim();
        if (next) kicker.textContent = next;
    }
    if (title && settings.mobile_promo_title != null) {
        const next = String(settings.mobile_promo_title || "").trim();
        if (next) title.textContent = next;
    }
    if (highlight && settings.mobile_promo_highlight != null) {
        const next = String(settings.mobile_promo_highlight || "").trim();
        if (next) highlight.textContent = next;
    }
    if (cta && settings.mobile_promo_cta != null) {
        const next = String(settings.mobile_promo_cta || "").trim();
        if (next) cta.textContent = next;
    }
}

async function loadMobilePromoArt() {
    try {
        const data = await fetchApiJson("/admin/settings");
        const settings = data?.global || {};
        const mobileImages = normalizePromoImageList(
            safeParse(settings.hero_images_mobile_json, [])
        );
        const desktopImages = normalizePromoImageList(
            safeParse(settings.hero_images_json, [])
        );
        renderMobilePromoCopy(settings);
        renderMobilePromoArt(mobileImages[0] || settings.hero_image || desktopImages[0] || "");
    } catch (err) {
        renderMobilePromoArt("");
    }
}

function setMobileFilterPanel(open) {
    const trigger = dom.mobileFilterTrigger();
    const panel = dom.mobileFilterPanel();
    if (!trigger || !panel) return;
    const next = !!open;
    trigger.setAttribute("aria-expanded", next ? "true" : "false");
    panel.hidden = !next;
    panel.classList.toggle("open", next);
}

function setupEventListeners() {
    // 1. User Menu Toggle
    const accBtn = dom.accountBtn();
    if (accBtn) {
        accBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const menu = dom.userMenu();
            if (state.user && menu) {
                const isVisible = menu.style.display === "flex";
                menu.style.display = isVisible ? "none" : "flex";
            } else {
                openAuth();
            }
        });
    }

    // 2. Global Click (Close Menus)
    window.addEventListener("click", (e) => {
        const menu = dom.userMenu();
        if (menu && !e.target.closest("#accountBtn") && !e.target.closest("#userMenu")) {
            menu.style.display = "none";
        }
        const panel = dom.mobileFilterPanel();
        const trigger = dom.mobileFilterTrigger();
        if (
            panel && trigger &&
            !panel.hidden &&
            !e.target.closest("#mobileFilterPanel") &&
            !e.target.closest("#mobileFilterTrigger")
        ) {
            setMobileFilterPanel(false);
        }
        if (e.target === dom.cartOverlay()) toggleCart(false);
    });

    // 3. Pincode Input Logic
    [dom.heroPinInput(), dom.modalPinInput()].forEach(input => {
        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") searchByPincode();
        });
    });
    const improveBtn = dom.improveLocBtn();
    if (improveBtn) {
        improveBtn.addEventListener("click", () => getLocation(true));
    }
    const useSavedLocBtn = getEl("useSavedLocBtn");
    if (useSavedLocBtn) {
        const hasSavedPin = /^[0-9]{6}$/.test(String(localStorage.getItem("lbPin") || ""));
        useSavedLocBtn.disabled = !hasSavedPin;
        useSavedLocBtn.addEventListener("click", useSavedLocation);
    }
    const useDroppedPinBtn = getEl("useDroppedPinBtn");
    if (useDroppedPinBtn) {
        useDroppedPinBtn.addEventListener("click", useDroppedPinLocation);
    }
    ["locBtn", "mobileLocBtn"].forEach((id) => {
        const trigger = getEl(id);
        if (!trigger) return;
        trigger.addEventListener("click", () => {
            syncLocationMapSize();
        });
    });
    const mobileLocationSummary = dom.mobileLocationSummary();
    if (mobileLocationSummary) {
        mobileLocationSummary.addEventListener("click", () => {
            const modal = dom.locModal();
            if (modal) {
                modal.style.display = "flex";
                window.dispatchEvent(new Event("lb-location-modal-opened"));
                return;
            }
            getLocation();
        });
    }
    window.addEventListener("lb-location-modal-opened", syncLocationMapSize);
    window.addEventListener("resize", () => {
        if (isLocationModalVisible()) syncLocationMapSize();
    }, { passive: true });
    window.addEventListener("orientationchange", () => {
        if (isLocationModalVisible()) syncLocationMapSize();
    }, { passive: true });
    const modalPinInput = dom.modalPinInput();
    if (modalPinInput) {
        modalPinInput.addEventListener("input", () => {
            modalPinInput.value = String(modalPinInput.value || "").replace(/[^\d]/g, "").slice(0, 6);
        });
    }
    const storeSearchInput = dom.storeSearchInput();
    if (storeSearchInput) {
        // Prevent browser/account autofill (often injects saved phone numbers here).
        storeSearchInput.setAttribute("autocomplete", "off");
        storeSearchInput.setAttribute("autocorrect", "off");
        storeSearchInput.setAttribute("autocapitalize", "none");
        storeSearchInput.setAttribute("spellcheck", "false");
        storeSearchInput.setAttribute("readonly", "readonly");
        storeSearchInput.name = `store_query_${Date.now()}`;
        storeSearchInput.value = "";
        storeSearchInput.defaultValue = "";
        state.storeSearch = "";
        updateStoreMeta(0, "Use search and filters to quickly find your store");

        // Some browsers inject autofill after initial paint, clear again.
        setTimeout(() => {
            if (!storeSearchInput) return;
            storeSearchInput.value = "";
            state.storeSearch = "";
            renderActiveFilterChips();
        }, 120);

        storeSearchInput.addEventListener("focus", () => {
            storeSearchInput.removeAttribute("readonly");
            if (storeSearchInput.value) {
                storeSearchInput.value = "";
                state.storeSearch = "";
                applyCategoryFilter();
            }
        });

        storeSearchInput.addEventListener("input", () => {
            state.storeSearch = (storeSearchInput.value || "").trim().toLowerCase();
            if (state.storeSearchTimer) clearTimeout(state.storeSearchTimer);
            state.storeSearchTimer = setTimeout(() => applyCategoryFilter(), 150);
        });
    }
    window.addEventListener("pageshow", () => {
        const input = dom.storeSearchInput();
        if (!input) return;
        input.value = "";
        state.storeSearch = "";
        renderActiveFilterChips();
    });
    const openNowOnlyToggle = dom.openNowOnlyToggle();
    if (openNowOnlyToggle) {
        openNowOnlyToggle.addEventListener("change", () => {
            state.openNowOnly = !!openNowOnlyToggle.checked;
            applyCategoryFilter();
        });
    }
    const storeSortSelect = dom.storeSortSelect();
    if (storeSortSelect) {
        storeSortSelect.addEventListener("change", () => {
            state.storeSort = storeSortSelect.value || "relevance";
            updateMobileSortButtons();
            applyCategoryFilter();
        });
    }
    const mobileSortSelect = dom.mobileSortSelect();
    if (mobileSortSelect) {
        mobileSortSelect.addEventListener("change", () => {
            state.storeSort = mobileSortSelect.value || "relevance";
            if (storeSortSelect) storeSortSelect.value = state.storeSort;
            updateMobileSortButtons();
            applyCategoryFilter();
        });
    }
    const mobileAvailabilitySelect = dom.mobileAvailabilitySelect();
    if (mobileAvailabilitySelect) {
        mobileAvailabilitySelect.addEventListener("change", () => {
            state.openNowOnly = mobileAvailabilitySelect.value === "open";
            const toggle = dom.openNowOnlyToggle();
            if (toggle) toggle.checked = state.openNowOnly;
            updateMobileSortButtons();
            applyCategoryFilter();
        });
    }
    const mobileFilterTrigger = dom.mobileFilterTrigger();
    if (mobileFilterTrigger) {
        mobileFilterTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const expanded = mobileFilterTrigger.getAttribute("aria-expanded") === "true";
            setMobileFilterPanel(!expanded);
        });
    }
    const mobileSortRow = getEl("mobileSortRow");
    if (mobileSortRow) {
        mobileSortRow.addEventListener("click", (e) => {
            const btn = e.target.closest(".mobile-sort-btn");
            if (!btn) return;
            const next = String(btn.getAttribute("data-sort") || "relevance");
            state.storeSort = next;
            if (storeSortSelect) storeSortSelect.value = next;
            updateMobileSortButtons();
            applyCategoryFilter();
        });
    }
    const clearRecentBtn = dom.clearRecentBtn();
    if (clearRecentBtn) {
        clearRecentBtn.addEventListener("click", () => {
            state.recentStores = [];
            localStorage.setItem("lbRecentStores", JSON.stringify([]));
            renderRecentStores();
        });
    }
    const filtersWrap = dom.activeFilters();
    if (filtersWrap) {
        filtersWrap.addEventListener("click", (e) => {
            const chip = e.target.closest(".filter-chip");
            if (!chip) return;
            const kind = chip.getAttribute("data-filter");
            if (kind === "search") {
                state.storeSearch = "";
                const input = dom.storeSearchInput();
                if (input) input.value = "";
            } else if (kind === "open") {
                state.openNowOnly = false;
                const toggle = dom.openNowOnlyToggle();
                if (toggle) toggle.checked = false;
                const mobileAvailability = dom.mobileAvailabilitySelect();
                if (mobileAvailability) mobileAvailability.value = "all";
            } else if (kind === "category") {
                state.activeCategory = "all";
            } else if (kind === "sort") {
                state.storeSort = "relevance";
                const sel = dom.storeSortSelect();
                if (sel) sel.value = "relevance";
                const mobileSort = dom.mobileSortSelect();
                if (mobileSort) mobileSort.value = "relevance";
                updateMobileSortButtons();
            } else if (kind === "clear-all") {
                state.storeSearch = "";
                state.openNowOnly = false;
                state.activeCategory = "all";
                state.storeSort = "relevance";
                const input = dom.storeSearchInput();
                const toggle = dom.openNowOnlyToggle();
                const sel = dom.storeSortSelect();
                const mobileSort = dom.mobileSortSelect();
                const mobileAvailability = dom.mobileAvailabilitySelect();
                if (input) input.value = "";
                if (toggle) toggle.checked = false;
                if (sel) sel.value = "relevance";
                if (mobileSort) mobileSort.value = "relevance";
                if (mobileAvailability) mobileAvailability.value = "all";
                updateMobileSortButtons();
            }
            setActiveCategory(state.activeCategory);
        });
    }
    const viewToggle = dom.viewToggle();
    if (viewToggle) {
        viewToggle.addEventListener("click", (e) => {
            const btn = e.target.closest(".view-btn");
            if (!btn) return;
            applyViewMode(btn.getAttribute("data-view"));
        });
    }
    const backBtn = dom.backToTopBtn();
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        const onScroll = () => {
            backBtn.classList.toggle("show", window.scrollY > 420);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    }

    // 4. Category Filter Buttons (delegated)
    const bar = document.getElementById("categoryBar");
    if (bar) {
        bar.addEventListener("click", (e) => {
            const btn = e.target.closest(".cat-btn");
            if (!btn) return;
            if (btn.classList.contains("disabled")) return;
            const category = btn.getAttribute("data-category") || "all";
            setActiveCategory(category);
        });
    }

    const mobileBar = dom.mobileCategoryBar();
    if (mobileBar) {
        mobileBar.addEventListener("click", (e) => {
            const btn = e.target.closest(".mobile-chip");
            if (!btn) return;
            const category = btn.getAttribute("data-category") || "all";
            setActiveCategory(category);
        });
    }

    const mobilePinInput = dom.mobilePinInput();
    if (mobilePinInput) {
        mobilePinInput.addEventListener("input", () => {
            mobilePinInput.value = mobilePinInput.value.replace(/[^\d]/g, "").slice(0, 6);
        });
        mobilePinInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") searchByPincode();
        });
    }
}

/* ============ CATEGORIES (FROM DB) ============ */
async function loadCategories() {
    const bar = document.getElementById("categoryBar");
    if (bar) {
        bar.innerHTML = `<button class="cat-btn" data-category="all">All</button>`;
    }
    renderMobileCategories();
    try {
        const data = await fetchApiJson("/admin/categories");
        const cats = Array.isArray(data.categories) ? data.categories : [];
        state.categories = cats.filter((c) => {
            if (!c) return false;
            if (c.is_active === undefined || c.is_active === null || c.is_active === "") return true;
            const activeValue = String(c.is_active).toLowerCase();
            return activeValue === "1" || activeValue === "true";
        });
        if (!state.categories.length && state.stores.length) {
            state.categories = deriveCategoriesFromStores(state.stores);
        }
        renderCategories();
    } catch (e) {
        console.error("Category load failed", e);
        if (state.stores.length) {
            state.categories = deriveCategoriesFromStores(state.stores);
        }
        renderMobileCategories();
    }
}

function renderCategories() {
    const bar = document.getElementById("categoryBar");
    const buttons = [
        `<button class="cat-btn" data-category="all">All</button>`
    ];
    state.categories.forEach(c => {
        const slug = c.slug || slugify(c.name || "category");
        const name = c.name || slug;
        const hasStores = state.stores.some(s => mapStoreCategory(s) === slug);
        buttons.push(
            `<button class="cat-btn ${hasStores ? "" : "disabled"}" data-category="${slug}" ${hasStores ? "" : "disabled"}>${name}</button>`
        );
    });
    if (bar) {
        bar.innerHTML = buttons.join("");
    }
    renderMobileCategories();
    if (state.activeCategory !== "all" && !state.stores.some(s => mapStoreCategory(s) === state.activeCategory)) {
        state.activeCategory = "all";
    }
    setActiveCategory(state.activeCategory || "all");
}

function renderMobileCategories() {
    const bar = dom.mobileCategoryBar();
    if (!bar) return;
    const getMobileCategoryMeta = (slug, name) => {
        const key = `${slug} ${name}`.toLowerCase();
        if (key.includes("fruit")) return { icon: "🍎", tone: "fruit" };
        if (key.includes("vegetable")) return { icon: "🥦", tone: "veg" };
        if (key.includes("snack")) return { icon: "🍪", tone: "snack" };
        if (key.includes("oil")) return { icon: "🫒", tone: "oil" };
        if (key.includes("dairy") || key.includes("milk")) return { icon: "🥛", tone: "dairy" };
        if (key.includes("bakery")) return { icon: "🥐", tone: "bakery" };
        if (key.includes("drink") || key.includes("beverage")) return { icon: "🥤", tone: "drink" };
        if (key.includes("masala") || key.includes("spice")) return { icon: "🌶️", tone: "spice" };
        return { icon: "🛒", tone: "all" };
    };
    const chips = [
        `<button class="mobile-chip ${state.activeCategory === "all" ? "active" : ""}" type="button" data-category="all"><span class="mobile-chip-icon tone-all" aria-hidden="true">🛒</span><span class="mobile-chip-text">All</span></button>`
    ];
    state.categories.forEach((c) => {
        const slug = c.slug || slugify(c.name || "category");
        const name = c.name || slug;
        const meta = getMobileCategoryMeta(slug, name);
        chips.push(
            `<button class="mobile-chip ${state.activeCategory === slug ? "active" : ""}" type="button" data-category="${slug}"><span class="mobile-chip-icon tone-${meta.tone}" aria-hidden="true">${meta.icon}</span><span class="mobile-chip-text">${name}</span></button>`
        );
    });
    bar.innerHTML = chips.join("");
}

function deriveCategoriesFromStores(stores) {
    const seen = new Map();
    (Array.isArray(stores) ? stores : []).forEach((store) => {
        const slug = slugify(store?.category_slug || store?.category_name || store?.category || store?.business_type || "");
        const name = String(store?.category_name || store?.category || store?.business_type || "").trim();
        if (!slug || !name || seen.has(slug)) return;
        seen.set(slug, {
            slug,
            name,
            is_active: 1
        });
    });
    return Array.from(seen.values());
}

function slugify(text) {
    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/* ============ 4. AUTH UI & LOGIC ============ */

function updateAuthUI() {
    const isLoggedIn = !!state.user;
    const loginBtn = dom.loginBtn();
    const accountDiv = dom.userAccount();

    if (loginBtn) loginBtn.style.display = isLoggedIn ? "none" : "flex";
    if (accountDiv) accountDiv.style.display = isLoggedIn ? "flex" : "none";

    if (isLoggedIn && state.user.name) {
        const names = state.user.name.trim().split(" ");
        const initials = names.length > 1 
            ? (names[0][0] + names[names.length - 1][0]).toUpperCase() 
            : names[0][0].toUpperCase();

        if (dom.userInitials()) dom.userInitials().innerText = initials;
        if (dom.userFullName()) dom.userFullName().innerText = `Hi, ${names[0]}`;
    }

    const userId = state.user?.id;
    if (dom.userIdLine()) {
        dom.userIdLine().textContent = userId ? `ID: #${userId}` : "ID: #---";
    }
    updateMobileHomeShell();
}

function updateMobileHomeShell() {
    const eyebrowEl = dom.mobileGreetingEyebrow ? dom.mobileGreetingEyebrow() : getEl("mobileGreetingEyebrow");
    const greetingEl = dom.mobileGreetingName();
    const addressEl = dom.mobileAddressLabel();
    const authBtn = dom.mobileAuthBtn();
    const pinInput = dom.mobilePinInput();
    const hour = (() => {
        try {
            const tz = "Asia/Kolkata";
            const parts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz }).formatToParts(new Date());
            const hourPart = parts.find((p) => p.type === "hour")?.value;
            const value = Number(hourPart);
            return Number.isFinite(value) ? value : new Date().getHours();
        } catch {
            return new Date().getHours();
        }
    })();
    const greeting =
        hour < 5
            ? "Good Night"
            : hour < 12
                ? "Good Morning"
                : hour < 17
                    ? "Good Afternoon"
                    : hour < 21
                        ? "Good Evening"
                        : "Good Night";
    const token = String(state.token || localStorage.getItem("lbToken") || "").trim();
    const user = state.user || null;
    const isLoggedIn = !!(
        token ||
        (user && (user.id || user.customer_id || user._id || user.user_id || user.phone || user.mobile || user.email))
    );
    const fullName = isLoggedIn ? (String(state.user?.name || "").trim() || "Customer") : "Local Basket";
    const locationText =
        state.location?.address && state.location.address !== "Select Location"
            ? state.location.address
            : (state.location?.pincode ? `Pincode: ${state.location.pincode}` : "Select your location");

    if (eyebrowEl) eyebrowEl.textContent = greeting;
    if (greetingEl) greetingEl.textContent = fullName;
    if (addressEl) addressEl.textContent = locationText;
    if (pinInput && !pinInput.value) pinInput.value = String(state.location?.pincode || "").trim();
    if (authBtn) {
        if (isLoggedIn) {
            authBtn.textContent = "Profile";
            authBtn.setAttribute("aria-label", "Profile");
            authBtn.onclick = () => viewProfile();
        } else {
            authBtn.textContent = "Login";
            authBtn.setAttribute("aria-label", "Login");
            authBtn.onclick = () => openAuth();
        }
    }

    if (eyebrowEl) eyebrowEl.style.display = isLoggedIn ? "" : "none";
}

function switchTab(mode) {
    state.authMode = mode;
    state.authUseOtp = false;
    const tabs = document.querySelectorAll(".auth-tab-btn");
    const regFields = dom.registerFields();

    tabs.forEach(t => t.classList.remove("active"));
    
    if (mode === 'register') {
        tabs[1]?.classList.add("active");
        if (regFields) regFields.style.display = "block";
    } else {
        tabs[0]?.classList.add("active");
        if (regFields) regFields.style.display = "none";
    }
    updateOtpAuthUI();
}

function openAuth() {
    const overlay = dom.authOverlay();
    if (!overlay) return;
    switchTab("login");
    overlay.style.display = "flex";
    try {
        const input = dom.authPhone();
        if (input && !String(input.value || "").trim()) {
            const saved = String(localStorage.getItem("lbLastAuthIdentifier") || "").trim();
            if (saved) input.value = saved;
        }
        setTimeout(() => input?.focus?.(), 0);
    } catch {}
}

function updateOtpAuthUI() {
    const isOtp = state.authMode === "login" && state.authUseOtp;
    const otpRow = dom.authOtpRow();
    const otpInput = dom.authOtp();
    const passInput = dom.authPassword();
    const otpToggleBtn = dom.authUseOtpBtn();
    const authInput = dom.authPhone();

    if (otpRow) otpRow.classList.toggle("active", isOtp);
    if (otpInput) {
        otpInput.required = isOtp;
        if (!isOtp) otpInput.value = "";
    }
    if (passInput) {
        passInput.style.display = "block";
        passInput.required = state.authMode === "login";
        passInput.placeholder = isOtp ? "New Password" : "Password";
    }
    if (otpToggleBtn) {
        otpToggleBtn.style.display = state.authMode === "login" ? "block" : "none";
        otpToggleBtn.textContent = isOtp ? "Back to Password Login" : "Forgot password? Reset with OTP";
    }
    if (authInput) {
        if (state.authMode === "register") {
            authInput.placeholder = "Phone Number";
            authInput.type = "text";
            authInput.inputMode = "tel";
        } else if (isOtp) {
            authInput.placeholder = "Registered Email (OTP comes on email)";
            authInput.type = "email";
            authInput.inputMode = "email";
        } else {
            authInput.placeholder = "Phone Number or Email";
            authInput.type = "text";
            authInput.inputMode = "text";
        }
    }
}

function toggleOtpLogin() {
    if (state.authMode !== "login") return;
    state.authUseOtp = !state.authUseOtp;
    updateOtpAuthUI();
}

async function requestCustomerOtp() {
    if (state.authMode !== "login") return;
    const identifier = String(dom.authPhone()?.value || "").trim();
    if (!identifier) return alert("Enter registered email or phone first");
    if (!state.authUseOtp) {
        state.authUseOtp = true;
        updateOtpAuthUI();
    }

    const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());
    if (state.authUseOtp && !emailOk(identifier)) {
        const input = dom.authPhone();
        if (input) {
            input.focus();
            try { input.select(); } catch {}
        }
        return alert("For OTP, please enter your registered email (OTP comes on email).");
    }

    try { localStorage.setItem("lbLastAuthIdentifier", identifier); } catch {}

    const btn = dom.authRequestOtpBtn();
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending...";
    }
    try {
        const endpoints = state.authUseOtp
            ? ["/customer/password-reset/request", "/customer/login-otp/request"]
            : ["/customer/login-otp/request"];
        let lastErr = null;

        for (const endpoint of endpoints) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 45000);
                let res;
                try {
                    res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ identifier }),
                        signal: controller.signal
                    });
                } finally {
                    clearTimeout(timeout);
                }
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.message || "OTP send failed");
                alert(data.message || "OTP sent successfully. Please check your registered email.");
                return;
            } catch (err) {
                lastErr = err;
            }
        }

        throw lastErr || new Error("OTP send failed");
    } catch (err) {
        const msg = err && err.name === "AbortError"
            ? "OTP request timed out. Please try again."
            : (err.message || "OTP send failed");
        alert(`Error: ${msg}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Send OTP";
        }
    }
}

async function submitAuth() {
    const phone = dom.authPhone()?.value.trim();
    const password = dom.authPassword()?.value.trim();
    const otp = dom.authOtp()?.value.trim();
    const regEmail = getEl("regEmail")?.value.trim();
    const regName = getEl("regName")?.value.trim();
    const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());

    if (!phone) return alert("Enter phone/email");
    if (state.authMode === "login" && !state.authUseOtp && !password) return alert("Enter password");
    if (state.authMode === "login" && state.authUseOtp && !otp) return alert("Enter OTP");
    if (state.authMode === "login" && state.authUseOtp && !password) return alert("Enter new password");
    if (state.authMode === "login" && state.authUseOtp && !emailOk(phone)) {
        const input = dom.authPhone();
        if (input) {
            input.focus();
            try { input.select(); } catch {}
        }
        return alert("For OTP, please enter your registered email (OTP comes on email).");
    }
    if (state.authMode === "register" && !regName) return alert("Enter full name");
    if (state.authMode === "register" && !regEmail) return alert("Enter email");
    if (state.authMode === "register" && !emailOk(regEmail)) return alert("Enter valid email");

    const endpoint = state.authMode === "login"
        ? (state.authUseOtp ? "/customer/password-reset/verify" : "/customer/login")
        : "/customer/register";
    
    const payload = state.authMode === "login" 
        ? (state.authUseOtp ? { identifier: phone, otp, newPassword: password } : { identifier: phone, password })
        : { 
            name: regName,
            phone,
            email: regEmail,
            password 
          };

    try {
        const fetchJson = async (url, options = {}) => {
            const res = await fetch(url, options);
            const data = await res.json().catch(() => ({}));
            return { res, data };
        };

        if (state.authMode === "login" && state.authUseOtp) {
            const resetTry = await fetchJson(`${CONFIG.API_BASE}/customer/password-reset/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: phone, otp, newPassword: password })
            });

            if (resetTry.res.ok && resetTry.data?.success) {
                alert(resetTry.data.message || "Password reset successful. Please login with new password.");
                state.authUseOtp = false;
                updateOtpAuthUI();
                const otpInput = dom.authOtp();
                if (otpInput) otpInput.value = "";
                return;
            }

            const resetMsg = String(resetTry.data?.message || "");
            const canFallback =
                resetTry.res.status === 404 ||
                resetTry.res.status === 405 ||
                /cannot post|not found|route/i.test(resetMsg);

            if (!canFallback) {
                throw new Error(resetMsg || "Password reset failed");
            }

            const otpLogin = await fetchJson(`${CONFIG.API_BASE}/customer/login-otp/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: phone, otp })
            });
            if (!otpLogin.res.ok || !otpLogin.data?.success) {
                throw new Error(otpLogin.data?.message || "OTP verification failed");
            }

            const resolvedUser = normalizeUser(
                otpLogin.data.user || otpLogin.data.customer || otpLogin.data.account || null
            );
            const token = otpLogin.data.token || "";
            if (!resolvedUser || !resolvedUser.id || !token) {
                throw new Error("OTP verified but user session missing");
            }

            const updateRes = await fetchJson(`${CONFIG.API_BASE}/customer/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    id: resolvedUser.id,
                    name: resolvedUser.name || "User",
                    email: resolvedUser.email || "",
                    phone: resolvedUser.phone || "",
                    password
                })
            });

            if (!updateRes.res.ok || !updateRes.data?.success) {
                throw new Error(updateRes.data?.message || "Password update failed");
            }

            alert("Password reset successful. Please login with new password.");
            state.authUseOtp = false;
            updateOtpAuthUI();
            const otpInput = dom.authOtp();
            if (otpInput) otpInput.value = "";
            return;
        }

        const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || "Auth failed");
        }

        // Success
        const resolvedUser = normalizeUser(data.user || data.customer || data.account || null);
        if (!resolvedUser) {
            throw new Error("Login response missing user details");
        }

        state.user = resolvedUser;
        state.token = data.token || null;
        localStorage.setItem("lbUser", JSON.stringify(resolvedUser));
        if (state.token) localStorage.setItem("lbToken", state.token);
        try { localStorage.setItem("lbLastAuthIdentifier", phone); } catch {}

        state.cart = loadCart();
        
        if (dom.authOverlay()) dom.authOverlay().style.display = "none";
        updateAuthUI();
        updateCartUI();
        
        // Refresh local view
        if (state.location.pincode) loadStores(state.location.pincode);
        alert(`Welcome, ${data.user.name}!`);

    } catch (err) {
        console.error("Auth Error:", err);
        alert(`Error: ${err.message}`);
    }
}

async function logoutUser() {
    localStorage.removeItem("lbUser");
    localStorage.removeItem("lbToken");
    state.user = null;
    state.cart = loadCart();
    state.token = null;
    
    updateAuthUI();
    updateCartUI();
    if (dom.userMenu()) dom.userMenu().style.display = "none";

    // Ensure any modal/overlay scroll locks are cleared before navigation.
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";

    if (typeof window.lbAlert === "function") {
        await window.lbAlert("Logged out successfully", "Logout");
    } else {
        window.alert("Logged out successfully");
    }

    window.location.reload(); // Hard reset to clear memory
}

/* ============ 5. LOCATION & STORE ENGINE ============ */

function updateLocationUI() {
    const address = state.location.address;
    const locEl = dom.locText();
    if (typeof window.lbSetLocDesktopText === "function") {
        window.lbSetLocDesktopText(address);
    } else if (locEl) {
        locEl.innerText = address;
    }
    const locMobile = document.getElementById("locTextMobile");
    if (typeof window.lbSetLocMobileText === "function") {
        window.lbSetLocMobileText(address);
    } else if (locMobile) {
        locMobile.innerText = address;
    }
    updateMobileHomeShell();
}

function setLocationStatus(message, tone = "info") {
    const el = dom.locAccuracyText();
    if (!el) return;
    el.innerText = message || "";
    el.setAttribute("data-tone", tone);
}

function hydrateLocationStatus() {
    const acc = Number(localStorage.getItem("lbLocAccM") || 0);
    const at = localStorage.getItem("lbLocUpdatedAt");
    if (!acc || !Number.isFinite(acc)) return;
    const timeText = at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const suffix = timeText ? ` at ${timeText}` : "";
    const tone = acc <= 100 ? "success" : (acc <= 220 ? "warn" : "error");
    setLocationStatus(`Last accuracy: ~${Math.round(acc)}m${suffix}`, tone);
}

function getCachedGeoResult() {
    const cached = safeParse(localStorage.getItem(LOCATION_CACHE_KEY), null);
    if (!cached || typeof cached !== "object") return null;
    const ts = Number(cached.ts || 0);
    if (!Number.isFinite(ts) || (Date.now() - ts) > LOCATION_CACHE_TTL_MS) return null;
    const pincode = String(cached.pincode || "");
    if (!/^[0-9]{6}$/.test(pincode)) return null;
    return cached;
}

function setCachedGeoResult(payload) {
    if (!payload || typeof payload !== "object") return;
    const pincode = String(payload.pincode || "");
    if (!/^[0-9]{6}$/.test(pincode)) return;
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({
        pincode,
        area: String(payload.area || ""),
        fullAddress: String(payload.fullAddress || ""),
        lat: Number(payload.lat || 0) || 0,
        lon: Number(payload.lon || 0) || 0,
        acc: Number(payload.acc || 0) || 0,
        ts: Date.now()
    }));
}

function initLocationMap() {
    const mapEl = dom.mapFrame();
    if (!mapEl || locationMap || typeof window.L === "undefined") return;

    const savedLat = Number(localStorage.getItem("lbLocLat") || 19.076);
    const savedLon = Number(localStorage.getItem("lbLocLon") || 72.8777);
    locationMap = window.L.map(mapEl, {
        preferCanvas: true,
        zoomControl: true,
        attributionControl: true
    }).setView([savedLat, savedLon], 13);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(locationMap);

    locationMarker = window.L.marker([savedLat, savedLon], {
        draggable: true,
        autoPan: true
    }).addTo(locationMap);

    locationMarker.on("dragend", () => {
        const pos = locationMarker.getLatLng();
        localStorage.setItem("lbLocLat", String(pos.lat));
        localStorage.setItem("lbLocLon", String(pos.lng));
        setLocationStatus("Pin moved. Tap 'Use Dropped Pin' to apply this location.", "info");
    });

    locationMap.whenReady(() => {
        syncLocationMapSize();
    });

    if (isLocationModalVisible()) syncLocationMapSize();
}

function updateMapFromCoords(lat, lon) {
    const map = dom.mapFrame();
    if (!map || !lat || !lon) return;
    if (locationMap && locationMarker) {
        locationMarker.setLatLng([lat, lon]);
        locationMap.setView([lat, lon], Math.max(locationMap.getZoom() || 13, 13), { animate: true });
        return;
    }
    if (map.tagName === "IFRAME") {
        const d = 0.02;
        const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
        map.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
    }
}

async function fetchNearbyStoresByCoords(lat, lon) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOCATION_LOOKUP_TIMEOUT_MS);
    try {
        return await fetchApiJson("/location/nearby-stores", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: lat, longitude: lon }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchReverseAddress(lat, lon) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&zoom=18`;
        const res = await fetch(url, {
            method: "GET",
            headers: { "Accept": "application/json" },
            signal: controller.signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data) return "";
        const full = String(data.display_name || "").trim();
        if (full) return full;
        const addr = data.address || {};
        const parts = [
            addr.road,
            addr.suburb || addr.neighbourhood,
            addr.city || addr.town || addr.village,
            addr.state_district || addr.state,
            addr.postcode
        ].filter(Boolean);
        return parts.join(", ");
    } catch {
        return "";
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildDisplayAddress({ fullAddress = "", area = "", pincode = "" } = {}) {
    const full = String(fullAddress || "").trim();
    if (full) return full;
    const cleanArea = String(area || "").trim();
    if (cleanArea) return `Area: ${cleanArea}`;
    const cleanPin = String(pincode || "").trim();
    if (cleanPin) return `Pincode: ${cleanPin}`;
    return "Select Location";
}

function looksShortAreaAddress(text) {
    const raw = String(text || "").trim();
    if (!raw) return true;
    if (/^area\s*:/i.test(raw)) return true;
    if (/^pincode\s*:/i.test(raw)) return true;
    return raw.length < 24;
}

async function enrichAddressFromSavedCoords(force = false) {
    const current = String(localStorage.getItem("lbAddr") || state.location.address || "").trim();
    if (!force && !looksShortAreaAddress(current)) return;

    const lat = Number(localStorage.getItem("lbLocLat") || 0);
    const lon = Number(localStorage.getItem("lbLocLon") || 0);
    const pin = String(localStorage.getItem("lbPin") || state.location.pincode || "").trim();
    if (!lat || !lon) return;

    const fullAddress = await fetchReverseAddress(lat, lon).catch(() => "");
    if (!fullAddress) return;

    state.location.address = fullAddress;
    localStorage.setItem("lbAddr", fullAddress);
    localStorage.setItem("lbLocFullAddr", fullAddress);
    updateLocationUI();

    if (pin && /^[0-9]{6}$/.test(pin)) {
        const cached = getCachedGeoResult() || {};
        setCachedGeoResult({
            pincode: pin,
            area: String(cached.area || "").replace(/^Area:\s*/i, ""),
            fullAddress,
            lat,
            lon,
            acc: Number(localStorage.getItem("lbLocAccM") || cached.acc || 0)
        });
    }
}

function applyResolvedPincode(pincode, area = "", meta = {}) {
    if (!/^[0-9]{6}$/.test(String(pincode || ""))) return false;
    state.location.pincode = String(pincode);
    state.location.address = buildDisplayAddress({
        fullAddress: meta.fullAddress || "",
        area,
        pincode: state.location.pincode
    });
    localStorage.setItem("lbPin", state.location.pincode);
    localStorage.setItem("lbAddr", state.location.address);
    if (meta.fullAddress) localStorage.setItem("lbLocFullAddr", String(meta.fullAddress));
    localStorage.setItem("lbLocUpdatedAt", new Date().toISOString());
    if (meta.acc) localStorage.setItem("lbLocAccM", String(Math.round(meta.acc)));
    if (meta.lat && meta.lon) {
        localStorage.setItem("lbLocLat", String(meta.lat));
        localStorage.setItem("lbLocLon", String(meta.lon));
        updateMapFromCoords(Number(meta.lat), Number(meta.lon));
    }
    setCachedGeoResult({
        pincode: state.location.pincode,
        area,
        fullAddress: meta.fullAddress || "",
        lat: meta.lat,
        lon: meta.lon,
        acc: meta.acc
    });
    updateLocationUI();
    if (dom.locModal()) dom.locModal().style.display = "none";
    loadStores(state.location.pincode, true);
    return true;
}

function useSavedLocation() {
    const pincode = String(localStorage.getItem("lbPin") || "");
    if (!/^[0-9]{6}$/.test(pincode)) {
        setLocationStatus("No saved pincode found. Use current location once.", "warn");
        return;
    }
    const areaText = String(localStorage.getItem("lbAddr") || "");
    const area = areaText.startsWith("Area: ") ? areaText.slice(6) : "";
    const lat = Number(localStorage.getItem("lbLocLat") || 0);
    const lon = Number(localStorage.getItem("lbLocLon") || 0);
    applyResolvedPincode(pincode, area, { lat, lon });
    setLocationStatus(`Using saved location (${pincode}).`, "success");
}

async function useDroppedPinLocation() {
    if (!(locationMarker && locationMap)) {
        setLocationStatus("Map is still loading. Please try again.", "warn");
        return;
    }
    const pos = locationMarker.getLatLng();
    const lat = Number(pos?.lat || 0);
    const lon = Number(pos?.lng || 0);
    if (!lat || !lon) {
        setLocationStatus("Invalid dropped pin location. Try dragging again.", "error");
        return;
    }
    setLocationStatus("Resolving dropped pin location...", "info");
    const [data, fullAddress] = await Promise.all([
        fetchNearbyStoresByCoords(lat, lon).catch(() => ({})),
        fetchReverseAddress(lat, lon).catch(() => "")
    ]);
    if (data?.success && data?.pincode) {
        applyResolvedPincode(data.pincode, data.area || "", {
            lat,
            lon,
            fullAddress: fullAddress || data.full_address || data.address || ""
        });
        setLocationStatus(`Location set from dropped pin (${data.pincode}).`, "success");
        return;
    }
    setLocationStatus("Couldn't resolve pincode from pin. Move pin slightly and retry.", "warn");
}

function shouldAutoDetectLocation() {
    if (!navigator.geolocation) return false;
    if (sessionStorage.getItem(AUTO_LOCATION_SESSION_KEY) === "1") return false;
    const lastUpdate = Date.parse(localStorage.getItem("lbLocUpdatedAt") || "");
    if (state.location.pincode && Number.isFinite(lastUpdate) && (Date.now() - lastUpdate) < AUTO_LOCATION_FRESH_MS) {
        return false;
    }
    return true;
}

async function autoDetectLocationOnLoad() {
    if (!shouldAutoDetectLocation()) return;
    sessionStorage.setItem(AUTO_LOCATION_SESSION_KEY, "1");
    if (navigator.permissions?.query) {
        try {
            const status = await navigator.permissions.query({ name: "geolocation" });
            if (status.state === "denied") {
                setLocationStatus("Location permission is blocked. Tap Change and enable location.", "warn");
                return;
            }
        } catch {}
    }
    await getLocation({ silent: true, fastMode: true });
}

function getGeoPosition(options) {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}

function describeGeoError(err) {
    const code = Number(err?.code || 0);
    const msg = String(err?.message || "").trim();
    if (code === 1) return "Location permission denied. Please allow location in browser settings.";
    if (code === 2) return "Location unavailable. Turn on GPS and try again.";
    if (code === 3) return "Location request timed out. Please try again.";
    return msg ? `Location error: ${msg}` : "Unable to access location.";
}

async function getBestGeoPosition(samples, options) {
    let best = null;
    let lastErr = null;
    const total = Math.max(1, Number(samples || 1));
    for (let i = 0; i < total; i += 1) {
        try {
            const pos = await getGeoPosition(options);
            const acc = Number(pos?.coords?.accuracy || Number.POSITIVE_INFINITY);
            const bestAcc = Number(best?.coords?.accuracy || Number.POSITIVE_INFINITY);
            if (!best || acc < bestAcc) best = pos;
        } catch (err) {
            lastErr = err;
        }
    }
    if (!best) throw (lastErr || new Error("No geolocation sample found"));
    return best;
}

async function applyDetectedLocation(pos, { fallback = false } = {}) {
    const lat = Number(pos?.coords?.latitude || 0);
    const lon = Number(pos?.coords?.longitude || 0);
    const accuracy = Number(pos?.coords?.accuracy || 0);
    if (!lat || !lon) throw new Error("Invalid location coordinates");

    updateMapFromCoords(lat, lon);

    const roundedAcc = Number.isFinite(accuracy) && accuracy > 0 ? Math.round(accuracy) : null;
    const accText = roundedAcc ? `~${roundedAcc}m` : "N/A";
    setLocationStatus(`Location locked (${accText} accuracy).`, fallback ? "warn" : "success");

    const [data, fullAddress] = await Promise.all([
        fetchNearbyStoresByCoords(lat, lon).catch(() => ({})),
        fetchReverseAddress(lat, lon).catch(() => "")
    ]);
    if (data?.success && data?.pincode) {
        applyResolvedPincode(data.pincode, data.area || "", {
            lat,
            lon,
            acc: roundedAcc || 0,
            fullAddress: fullAddress || data.full_address || data.address || ""
        });
        return;
    }

    state.location.address = buildDisplayAddress({ fullAddress, pincode: "" }) || "Current Location";
    localStorage.setItem("lbAddr", state.location.address);
    if (roundedAcc) localStorage.setItem("lbLocAccM", String(roundedAcc));
    localStorage.setItem("lbLocUpdatedAt", new Date().toISOString());
    localStorage.setItem("lbLocLat", String(lat));
    localStorage.setItem("lbLocLon", String(lon));
    updateLocationUI();
    if (dom.locModal()) dom.locModal().style.display = "none";
}

function searchByPincode() {
    const heroRaw = String(dom.heroPinInput()?.value || "").trim();
    const mobileRaw = String(dom.mobilePinInput()?.value || "").trim();
    const modalRaw = String(dom.modalPinInput()?.value || "").trim();
    const raw = isLocationModalVisible()
        ? (modalRaw || mobileRaw || heroRaw)
        : (mobileRaw || heroRaw || modalRaw);
    if (!/^[0-9]{6}$/.test(raw)) {
        alert("Enter valid 6-digit pincode");
        return;
    }

    if (dom.heroPinInput()) dom.heroPinInput().value = raw;
    if (dom.mobilePinInput()) dom.mobilePinInput().value = raw;

    state.location.pincode = raw;
    state.location.address = `Pincode: ${raw}`;
    localStorage.setItem("lbPin", raw);
    localStorage.setItem("lbAddr", state.location.address);

    updateLocationUI();
    updateMobileHomeShell();
    setLocationStatus(`Manual pin set: ${raw}`, "info");
    if (dom.locModal()) dom.locModal().style.display = 'none';
    scrollToStoresArea();
    loadStores(raw, true);
}

function scrollToStoresArea() {
    const target = getEl("storesSection") || dom.storeGrid() || getEl("categorySection");
    if (!target) return;
    const headerOffset = window.innerWidth <= 768 ? 88 : 96;
    const y = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

async function getLocation(optionsOrForce = false) {
    const opts = typeof optionsOrForce === "boolean"
        ? { forceHighAccuracy: optionsOrForce, silent: false, fastMode: false }
        : { forceHighAccuracy: false, silent: false, fastMode: false, ...(optionsOrForce || {}) };
    const forceHighAccuracy = !!opts.forceHighAccuracy;
    const silent = !!opts.silent;
    const fastMode = !!opts.fastMode;

    if (!navigator.geolocation) {
        if (!silent) alert("Geolocation not supported on this browser");
        setLocationStatus("Geolocation not supported on this browser.", "error");
        return;
    }
    if (!window.isSecureContext && window.location.protocol !== "file:") {
        const tip = "Current location works only on HTTPS. Please open the HTTPS link or enter pincode.";
        setLocationStatus(tip, "warn");
        if (!silent) alert(tip);
        return;
    }
    const improveBtn = dom.improveLocBtn();
    const useSavedLocBtn = getEl("useSavedLocBtn");
    const setLocLoading = (loading) => {
        if (improveBtn) {
            improveBtn.disabled = loading;
            improveBtn.textContent = loading ? "Improving..." : "Refresh With High Accuracy";
        }
        if (useSavedLocBtn) useSavedLocBtn.disabled = loading;
    };
    try {
        if (!forceHighAccuracy) {
            const cached = getCachedGeoResult();
            if (cached && applyResolvedPincode(cached.pincode, cached.area || "", {
                lat: Number(cached.lat || 0),
                lon: Number(cached.lon || 0),
                acc: Number(cached.acc || 0),
                fullAddress: String(cached.fullAddress || "")
            })) {
                setLocationStatus("Using recent location cache for faster loading.", "success");
                if (!String(cached.fullAddress || "").trim()) {
                    enrichAddressFromSavedCoords(true).catch(() => {});
                }
                return;
            }
        }
        setLocLoading(true);
        setLocationStatus("Detecting location with high accuracy...", "info");
        let pos = await getBestGeoPosition(forceHighAccuracy ? 3 : 1, {
            enableHighAccuracy: forceHighAccuracy || !fastMode,
            timeout: forceHighAccuracy ? 24000 : (fastMode ? 8500 : 13000),
            maximumAge: fastMode ? 45000 : 0
        });

        const acc = Number(pos?.coords?.accuracy || 0);
        if (!forceHighAccuracy && acc > (fastMode ? 260 : 180)) {
            setLocationStatus(`Weak GPS signal (~${Math.round(acc)}m). Retrying...`, "warn");
            try {
                pos = await getBestGeoPosition(1, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                });
            } catch {}
        }

        const finalAcc = Number(pos?.coords?.accuracy || 0);
        if (finalAcc > 350) {
            setLocationStatus(`Low accuracy (~${Math.round(finalAcc)}m). Using approximate location.`, "warn");
            if (!silent) alert("Low GPS accuracy. We'll use approximate location. For better results, tap Improve Accuracy or enter pincode.");
            await applyDetectedLocation(pos, { fallback: true });
            return;
        }

        await applyDetectedLocation(pos);
    } catch (err) {
        try {
            setLocationStatus(describeGeoError(err) + " Trying fallback location...", "warn");
            const fallbackPos = await getGeoPosition({
                enableHighAccuracy: false,
                timeout: 12000,
                maximumAge: 0
            });
            const fallbackAcc = Number(fallbackPos?.coords?.accuracy || 0);
            if (fallbackAcc > 500) {
                setLocationStatus(`Using approximate location (~${Math.round(fallbackAcc)}m).`, "warn");
            }
            await applyDetectedLocation(fallbackPos, { fallback: true });
        } catch (err2) {
            const message = describeGeoError(err2 || err);
            setLocationStatus(message + " Enter pincode manually.", "error");
            if (!silent) alert(message);
        }
    } finally {
        setLocLoading(false);
    }
}

async function loadStores(query, isPin = true) {
    const grid = dom.storeGrid();
    if (!grid) return;

    const normalizedQuery = String(query || "").trim();
    const hasPinFilter = isPin && /^[0-9]{6}$/.test(normalizedQuery);

    if (isPin && normalizedQuery && !hasPinFilter) {
        showPincodeRequired();
        return;
    }

    const loadingLabel = hasPinFilter ? `Searching stores in ${normalizedQuery}...` : "Loading stores...";
    grid.innerHTML = `<div class="loader">${loadingLabel}</div>`;
    updateStoreMeta(0, loadingLabel);

    try {
        const data = await fetchApiJson(
            hasPinFilter
                ? `/stores?pincode=${encodeURIComponent(normalizedQuery)}`
                : "/stores"
        );
        const rawStores = Array.isArray(data.stores) ? data.stores : (Array.isArray(data) ? data : []);
        const stores = rawStores.map(normalizeStorePayload).filter(Boolean);

        if (stores.length > 0) {
            state.stores = stores;
            if (!state.categories.length) {
                state.categories = deriveCategoriesFromStores(stores);
            }
            updateHeroInsights();
            renderCategories();
            applyCategoryFilter();
            renderTopRatedStores();
            renderTopProductsLoading();
            refreshTopProducts().catch(() => renderTopProducts([]));
        } else {
            state.stores = [];
            updateHeroInsights();
            renderCategories();
            const emptyText = hasPinFilter ? `No stores found in ${normalizedQuery}` : "No approved stores found";
            grid.innerHTML = `<div class="empty-state">${emptyText}</div>`;
            updateStoreMeta(0, emptyText);
            renderTopRatedStores([]);
            renderTopProducts([]);
        }
    } catch (err) {
        state.stores = [];
        updateHeroInsights();
        renderCategories();
        grid.innerHTML = `<div class="error">Server Connection Failed</div>`;
        updateStoreMeta(0, "Server connection failed. Please try again.");
        renderTopRatedStores([]);
        renderTopProducts([]);
    }
}

function normalizeStorePayload(store) {
    if (!store || typeof store !== "object") return null;
    const normalized = { ...store };
    normalized.id = Number(store.id || store.store_id || 0) || String(store.id || store.store_id || "").trim();
    normalized.store_name = store.store_name || store.storeName || store.name || "Store";
    normalized.store_photo = store.store_photo || store.storePhoto || store.image || store.photo || "";
    normalized.pincode = store.pincode || store.pin || "";
    normalized.business_type =
        store.business_type ||
        store.category_name ||
        store.category ||
        store.category_slug ||
        "General Store";
    normalized.category_name = store.category_name || store.category || normalized.business_type;
    normalized.category_slug = store.category_slug || slugify(normalized.category_name);
    normalized.is_online = Number(
        store.is_online ??
        store.isOnline ??
        store.online ??
        0
    ) ? 1 : 0;
    normalized.avg_rating = Number(
        store.avg_rating ??
        store.rating ??
        normalized.avg_rating ??
        0
    ) || 0;
    normalized.rating_count = Number(
        store.rating_count ??
        store.reviews_count ??
        store.reviewCount ??
        0
    ) || 0;
    return normalized;
}

function showPincodeRequired() {
    const grid = dom.storeGrid();
    if (!grid) return;
    grid.innerHTML = `<div class="empty-state">Enter a valid 6-digit pincode to view stores.</div>`;
    updateHeroInsights();
    updateStoreMeta(0, "Enter a valid 6-digit pincode to view stores.");
}

function renderStores(stores) {
    const grid = dom.storeGrid();
    grid.innerHTML = stores.map(store => `
        <div class="store-card" onclick="openStore(${store.id})">
            <div class="store-img-wrap">
                <img class="store-img" src="${resolveImageUrl(store.store_photo)}" 
                     alt="${store.store_name}" 
                     onerror="this.src='${CONFIG.DEFAULT_IMG}'">
                <span class="status-badge ${store.is_online ? 'online' : 'offline'}">
                    ${store.is_online ? 'OPEN' : 'CLOSED'}
                </span>
            </div>
            <div class="store-body">
                <h3>${store.store_name}</h3>
                <div class="store-cat">${store.business_type || store.category_name || store.category || 'General Store'}</div>
                <div class="meta-row">
                    <span class="meta-pill">Pin: ${store.pincode}</span>
                    ${renderRatingChip(store)}
                </div>
            </div>
        </div>
    `).join('');
}

function getStoreRatingValue(store) {
    return Number(store?.avg_rating || store?.rating || 0);
}

function getStoreRatingCount(store) {
    return Number(store?.rating_count || store?.reviews_count || 0);
}

function getTopPickKey(item) {
    const fallback = `${Number(item?.store_id || 0)}-${String(item?.name || "product").toLowerCase()}`;
    const raw = item?.id ?? fallback;
    return String(raw).replace(/[^\w-]/g, "_");
}

function isTopPickSaved(key) {
    const needle = String(key || "");
    return Array.isArray(state.topPicks) && state.topPicks.includes(needle);
}

function saveTopPicks() {
    localStorage.setItem("lbTopPicks", JSON.stringify(state.topPicks || []));
}

function toggleTopPick(event, key) {
    if (event) event.stopPropagation();
    const id = String(key || "");
    if (!id) return;
    const picks = Array.isArray(state.topPicks) ? [...state.topPicks] : [];
    const idx = picks.indexOf(id);
    if (idx >= 0) {
        picks.splice(idx, 1);
    } else {
        picks.unshift(id);
    }
    state.topPicks = picks.slice(0, 30);
    saveTopPicks();

    document.querySelectorAll(`.tp-save[data-pick-key="${id}"]`).forEach((btn) => {
        const saved = state.topPicks.includes(id);
        btn.classList.toggle("saved", saved);
        btn.setAttribute("aria-pressed", saved ? "true" : "false");
        btn.innerHTML = saved ? "Saved" : "Save";
    });
}

function renderTopRatedStores(customList = null) {
    const section = dom.topRatedSection();
    const grid = dom.topRatedGrid();
    if (!section || !grid) return;

    const list = Array.isArray(customList) ? customList : [...(state.stores || [])]
        .sort((a, b) => {
            const dr = getStoreRatingValue(b) - getStoreRatingValue(a);
            if (dr) return dr;
            const dc = getStoreRatingCount(b) - getStoreRatingCount(a);
            if (dc) return dc;
            return Number(b.is_online || 0) - Number(a.is_online || 0);
        })
        .slice(0, 6);

    state.topRatedStores = list;
    if (!list.length) {
        section.style.display = "none";
        grid.innerHTML = "";
        updateDiscoveryZoneVisibility();
        return;
    }
    section.style.display = "";
    grid.innerHTML = list.map((s, idx) => {
        const rating = getStoreRatingValue(s);
        const count = getStoreRatingCount(s);
        const openNow = Number(s.is_online || 0) === 1;
        return `
          <div class="top-rated-item" onclick="openStore(${s.id})">
            <div class="r-rank">#${idx + 1}</div>
            <div class="r-head">
              <div class="r-name">${s.store_name || "Store"}</div>
              <span class="r-open ${openNow ? "open" : "closed"}">${openNow ? "Open" : "Closed"}</span>
            </div>
            <div class="r-score">&#9733; ${rating > 0 ? rating.toFixed(1) : "New"} ${count ? `(${count})` : ""}</div>
            <div class="r-meta">${s.business_type || s.category_name || s.category || "General Store"}</div>
            <div class="r-meta">Pin: ${s.pincode || "-"}</div>
            <button class="r-cta" type="button" onclick="event.stopPropagation();openStore(${s.id})">View Store</button>
          </div>
        `;
    }).join("");
    updateDiscoveryZoneVisibility();
}

function renderTopProductsLoading() {
    const section = dom.topProductsSection();
    const row = dom.topProductsRow();
    if (!section || !row) return;
    section.style.display = "none";
    row.innerHTML = "";
    updateDiscoveryZoneVisibility();
}

function renderTopProducts(list = null) {
    const section = dom.topProductsSection();
    const row = dom.topProductsRow();
    if (!section || !row) return;
    section.style.display = "none";
    row.innerHTML = "";
    updateDiscoveryZoneVisibility();
}

function updateDiscoveryZoneVisibility() {
    const zone = dom.discoveryZone();
    const rated = dom.topRatedSection();
    const products = dom.topProductsSection();
    if (!zone || !rated || !products) return;
    const anyVisible = rated.style.display !== "none" || products.style.display !== "none";
    zone.style.display = anyVisible ? "grid" : "none";
}

async function fetchProductsForStoreCached(storeId) {
    const sid = Number(storeId || 0);
    if (!sid) return [];
    if (Array.isArray(state.storeProductsCache[sid])) return state.storeProductsCache[sid];
    try {
        const data = await fetchApiJson(`/products?storeId=${encodeURIComponent(sid)}`);
        const products = Array.isArray(data?.products) ? data.products : [];
        state.storeProductsCache[sid] = products;
        return products;
    } catch {
        state.storeProductsCache[sid] = [];
        return [];
    }
}

async function refreshTopProducts() {
    const stores = Array.isArray(state.stores) ? [...state.stores] : [];
    if (!stores.length) {
        state.topProducts = [];
        renderTopProducts([]);
        return;
    }

    const candidateStores = stores
        .sort((a, b) => {
            const r = getStoreRatingValue(b) - getStoreRatingValue(a);
            if (r) return r;
            return Number(b.is_online || 0) - Number(a.is_online || 0);
        })
        .slice(0, 8);

    const productLists = await Promise.all(candidateStores.map((s) => fetchProductsForStoreCached(s.id)));
    const flattened = [];
    candidateStores.forEach((store, idx) => {
        const list = Array.isArray(productLists[idx]) ? productLists[idx] : [];
        list.forEach((p) => {
            const price = Number(p.price || 0);
            const mrp = Number(p.mrp || 0);
            const avg = Number(p.avg_rating || 0);
            const count = Number(p.rating_count || 0);
            const stock = Number(p.stock || 0);
            const discount = mrp > price && mrp > 0 ? ((mrp - price) / mrp) * 100 : 0;
            const score = (count * 2.2) + (avg * 7) + (discount * 0.35) + (stock > 0 ? 4 : -8);
            flattened.push({
                ...p,
                store_id: store.id,
                store_name: store.store_name,
                score
            });
        });
    });

    const ranked = flattened
        .filter((p) => Number(p.stock || 0) > 0)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .slice(0, 10);

    state.topProducts = ranked;
    renderTopProducts(ranked);
}

function openStore(storeId) {
    const store = state.stores.find(s => Number(s.id) === Number(storeId));
    if (store) rememberRecentStore(store);
    window.location.href = `${welcomePath("customer/store/store.html")}?id=${storeId}`;
}

function rememberRecentStore(store) {
    const id = Number(store?.id || 0);
    if (!id) return;
    const snapshot = {
        id,
        store_name: store.store_name || "Store",
        store_photo: store.store_photo || "",
        business_type: store.business_type || store.category_name || store.category || "General Store",
        pincode: store.pincode || "",
        is_online: Number(store.is_online) ? 1 : 0,
        rating: Number(getStoreRating(store)?.value || 0),
        rating_count: Number(getStoreRating(store)?.count || 0)
    };
    const old = Array.isArray(state.recentStores) ? state.recentStores : [];
    const next = [snapshot, ...old.filter(s => Number(s?.id) !== id)].slice(0, 8);
    state.recentStores = next;
    localStorage.setItem("lbRecentStores", JSON.stringify(next));
    renderRecentStores();
}

function renderRecentStores() {
    const section = dom.recentStoresSection();
    const grid = dom.recentStoresGrid();
    if (!section || !grid) return;
    const list = Array.isArray(state.recentStores) ? state.recentStores : [];
    if (!list.length) {
        section.style.display = "none";
        grid.innerHTML = "";
        return;
    }
    section.style.display = "";
    grid.innerHTML = list.map(store => `
        <div class="store-card" onclick="window.location.href='${welcomePath("customer/store/store.html")}?id=${store.id}'">
            <div class="store-img-wrap">
                <img class="store-img" src="${resolveImageUrl(store.store_photo)}" 
                     alt="${store.store_name}" 
                     onerror="this.src='${CONFIG.DEFAULT_IMG}'">
                <span class="status-badge ${store.is_online ? 'online' : 'offline'}">
                    ${store.is_online ? 'OPEN' : 'CLOSED'}
                </span>
            </div>
            <div class="store-body">
                <h3>${store.store_name}</h3>
                <div class="store-meta">
                    <strong>${formatRecentStoreRating(store)}</strong>
                    <span>&bull;</span>
                    <span>${store.business_type || "General Store"}</span>
                </div>
            </div>
        </div>
    `).join("");
}

function formatRecentStoreRating(store) {
    const rating = getStoreRating(store);
    if (!rating || rating.label === "New") return "\u2B50 New";
    return `\u2B50 ${rating.value.toFixed(1)}`;
}

function renderRatingChip(store) {
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
}

function getStoreRating(store) {
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

    let value = null;
    let count = Number(countCandidates.find(v => v !== null && v !== undefined && v !== "") || 0);

    for (const v of candidates) {
        if (v === null || v === undefined || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) {
            value = n;
            break;
        }
    }

    if (value === null) {
        const reviewList = Array.isArray(store?.reviews) ? store.reviews : (Array.isArray(store?.ratings) ? store.ratings : []);
        if (reviewList.length) {
            const nums = reviewList.map(r => Number(r?.rating ?? r?.stars ?? r?.score)).filter(n => Number.isFinite(n));
            if (nums.length) {
                const sum = nums.reduce((a, b) => a + b, 0);
                value = sum / nums.length;
                count = Math.max(count, nums.length);
            }
        }
    }

    if (value === null || !Number.isFinite(value) || value <= 0) {
        return { label: "New", value: 0, count: 0 };
    }

    const clamped = Math.max(0, Math.min(5, value));
    return { label: "Rated", value: clamped, count };
}

function renderStars(value) {
    const full = Math.floor(value);
    const hasHalf = value - full >= 0.5;
    let stars = "\u2605\u2605\u2605\u2605\u2605".split("").map((s, i) => {
        if (i < full) return "\u2605";
        if (i === full && hasHalf) return "\u2605";
        return "\u2606";
    });
    return stars.join("");
}
/* ============ CATEGORY FILTERS ============ */
function setActiveCategory(category) {
    state.activeCategory = category || "all";
    document.querySelectorAll("#categoryBar .cat-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-category") === state.activeCategory);
    });
    document.querySelectorAll("#mobileCategoryBar .mobile-chip").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-category") === state.activeCategory);
    });
    applyCategoryFilter();
}

function applyCategoryFilter() {
    if (!state.stores.length) {
        renderActiveFilterChips();
        updateStoreMeta(0);
        return;
    }
    let filtered = [...state.stores];
    if (state.activeCategory !== "all") {
        filtered = filtered.filter(s => mapStoreCategory(s) === state.activeCategory);
    }
    if (state.openNowOnly) {
        filtered = filtered.filter(s => Number(s.is_online) === 1);
    }
    if (state.storeSearch) {
        filtered = filtered.filter(s => {
            const hay = `${s.store_name || ""} ${s.business_type || ""} ${s.category_name || ""} ${s.category || ""}`.toLowerCase();
            return hay.includes(state.storeSearch);
        });
    }
    if (state.storeSort === "name") {
        filtered.sort((a, b) => String(a.store_name || "").localeCompare(String(b.store_name || "")));
    } else if (state.storeSort === "rating") {
        filtered.sort((a, b) => Number(getStoreRating(b)?.value || 0) - Number(getStoreRating(a)?.value || 0));
    } else {
        filtered.sort((a, b) => Number(b.is_online || 0) - Number(a.is_online || 0));
    }
    if (filtered.length === 0) {
        dom.storeGrid().innerHTML = `<div class="empty-state">No stores found for selected filters.</div>`;
        updateStoreMeta(0, "No stores match current filters.");
        return;
    }
    updateMobileSortButtons();
    renderStores(filtered);
    updateStoreMeta(filtered.length);
}

function applyViewMode(mode = "comfortable") {
    const next = mode === "compact" ? "compact" : "comfortable";
    state.viewMode = next;
    localStorage.setItem("lbStoreViewMode", next);
    const grid = dom.storeGrid();
    if (grid) {
        grid.classList.toggle("compact", next === "compact");
    }
    document.querySelectorAll("#viewToggle .view-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-view") === next);
    });
}

function renderActiveFilterChips() {
    const box = dom.activeFilters();
    if (!box) return;
    const clean = (v) => String(v || "").replace(/[&<>"']/g, "");
    const chips = [];
    if (state.storeSearch) {
        chips.push(`<button class="filter-chip" type="button" data-filter="search">Search: ${clean(state.storeSearch)}<span class="x">x</span></button>`);
    }
    if (state.activeCategory !== "all") {
        const activeBtn = document.querySelector(`#categoryBar .cat-btn[data-category="${state.activeCategory}"]`);
        const label = (activeBtn?.textContent || state.activeCategory || "Category").trim();
        chips.push(`<button class="filter-chip" type="button" data-filter="category">Category: ${label}<span class="x">x</span></button>`);
    }
    if (state.openNowOnly) {
        chips.push(`<button class="filter-chip" type="button" data-filter="open">Open now<span class="x">x</span></button>`);
    }
    if (state.storeSort && state.storeSort !== "relevance") {
        const label = state.storeSort === "rating" ? "Rating" : "Name A-Z";
        chips.push(`<button class="filter-chip" type="button" data-filter="sort">Sort: ${label}<span class="x">x</span></button>`);
    }
    if (chips.length > 1) {
        chips.push(`<button class="filter-chip clear-all" type="button" data-filter="clear-all">Clear all</button>`);
    }
    box.innerHTML = chips.join("");
}

function updateStoreMeta(filteredCount = 0, forcedHint = "") {
    const total = Array.isArray(state.stores) ? state.stores.length : 0;
    const countEl = dom.storeResultsCount();
    const hintEl = dom.storeResultsHint();
    if (countEl) {
        countEl.innerText = total > 0
            ? `${filteredCount} of ${total} stores`
            : `${filteredCount} stores`;
    }
    if (hintEl) {
        let hint = forcedHint;
        if (!hint) {
            if (!state.location.pincode) {
                hint = "Set your pincode to discover nearby stores";
            } else if (total === 0) {
                hint = "No stores available for this pincode yet";
            } else if (filteredCount === 0) {
                hint = "Try clearing a filter to see more stores";
            } else if (state.openNowOnly) {
                hint = "Showing stores currently open";
            } else {
                hint = "Use search and filters to quickly find your store";
            }
        }
        hintEl.innerText = hint;
    }
    renderActiveFilterChips();
}

function updateHeroInsights() {
    const stores = Array.isArray(state.stores) ? state.stores : [];
    const total = stores.length;
    const ratedValues = stores
        .map((s) => Number(getStoreRating(s)?.value || 0))
        .filter((v) => Number.isFinite(v) && v > 0);
    const ratedCount = ratedValues.length;
    const avgRating = ratedCount
        ? (ratedValues.reduce((sum, n) => sum + n, 0) / ratedCount)
        : 0;
    const onlineCount = stores.filter((s) => Number(s?.is_online) === 1).length;

    const avgValueEl = dom.heroAvgValue();
    const avgLabelEl = dom.heroAvgLabel();
    const avgMetaEl = dom.heroAvgMeta();
    if (avgValueEl) avgValueEl.innerText = ratedCount ? avgRating.toFixed(1) : "--";
    if (avgLabelEl) avgLabelEl.innerText = "Avg Rating";
    if (avgMetaEl) avgMetaEl.innerText = ratedCount ? `${ratedCount} rated` : "No ratings yet";

    const onlineValueEl = dom.heroOnlineValue();
    const onlineLabelEl = dom.heroOnlineLabel();
    const onlineMetaEl = dom.heroOnlineMeta();
    if (onlineValueEl) onlineValueEl.innerText = total ? String(onlineCount) : "--";
    if (onlineLabelEl) onlineLabelEl.innerText = "Sellers Online";
    if (onlineMetaEl) {
        onlineMetaEl.innerText = total
            ? `${Math.round((onlineCount / total) * 100)}% available now`
            : "Set pincode first";
    }

    const storeValueEl = dom.heroStoreValue();
    const storeLabelEl = dom.heroStoreLabel();
    const storeMetaEl = dom.heroStoreMeta();
    if (storeValueEl) storeValueEl.innerText = total ? String(total) : "--";
    if (storeLabelEl) storeLabelEl.innerText = "Stores Found";
    if (storeMetaEl) {
        storeMetaEl.innerText = state.location.pincode
            ? `Pin ${state.location.pincode}`
            : "Nearby";
    }
}

function mapStoreCategory(store) {
    const raw = String(store.category_slug || store.category_name || store.category || store.business_type || "").toLowerCase();
    return slugify(raw || "grocery");
}

/* ============ 6. CART UI ============ */

function updateCartUI() {
    state.cart = loadCart();
    const countEl = dom.cartCount();
    const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
    if (countEl) countEl.innerText = `${count} Items`;
}

function toggleCart(show) {
    const drawer = dom.cartDrawer();
    const overlay = dom.cartOverlay();
    if (!drawer || !overlay) return;

    drawer.classList.toggle("active", show);
    overlay.style.display = show ? "block" : "none";
    if (show) {
        state.cart = loadCart();
        renderCartItems();
    }
}

function renderCartItems() {
    const box = dom.cartItems();
    if (!box) return;
    if (!state.cart.length) {
        box.innerHTML = `<div style="text-align:center;color:#64748b;">Your basket is empty.</div>`;
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

function updateQty(id, change) {
    let cart = loadCart();
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += change;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    saveCart(cart);
    state.cart = cart;
    updateCartUI();
    renderCartItems();
}

/* ============ 7. GLOBAL EXPORTS ============ */
Object.assign(window, {
    switchTab, submitAuth, openAuth, logoutUser, toggleOtpLogin, requestCustomerOtp,
    searchByPincode, toggleCart, getLocation, openStore, toggleTopPick,
    openCategoryPage: () => window.location.href = welcomePath("customer/category.html"),
    viewProfile: () => window.location.href = welcomePath("customer/profile/profile.html"),
    viewOrders: () => window.location.href = welcomePath("customer/order/customer-orders.html")
});


