/* ================= CONFIG ================= */
// Note: API_BASE Dashboard se match hona chahiye (/api)
const API_BASE = `${window.API_BASE_URL}/api`; 
const seller = JSON.parse(localStorage.getItem("lbSeller"));
const sellerToken = String(seller?.token || localStorage.getItem("lbSellerToken") || "").trim();
const authFetch = (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (sellerToken && !headers.has("Authorization") && /\/api\/seller(\/|$)/.test(String(url || ""))) {
        headers.set("Authorization", `Bearer ${sellerToken}`);
    }
    return fetch(url, { ...options, headers });
};

if (!seller || !seller.id) {
    window.location.href = "/welcome/seller/seller-auth/seller-auth.html";
}

/* ================= CACHE DOM ================= */
const els = {
    activeList: document.getElementById("activeOrdersList"),
    historyList: document.getElementById("historyOrdersList"),
    activeEmpty: document.getElementById("activeEmpty"),
    historyEmpty: document.getElementById("historyEmpty"),
    countActive: document.getElementById("countActive"),
    countHistory: document.getElementById("countHistory"),
    themeToggle: document.getElementById("themeToggle"),
    sidebar: document.getElementById("sidebar"),
    menuBtn: document.getElementById("menuBtn"),
    overlay: document.getElementById("sidebarOverlay"),
    newOrderNotice: document.getElementById("newOrderNotice"),
    actionModal: document.getElementById("actionModal"),
    actionModalTitle: document.getElementById("actionModalTitle"),
    actionModalMessage: document.getElementById("actionModalMessage"),
    actionModalReason: document.getElementById("actionModalReason"),
    actionModalError: document.getElementById("actionModalError"),
    actionModalOk: document.getElementById("actionModalOk"),
    actionModalCancel: document.getElementById("actionModalCancel"),
    orderSearch: document.getElementById("orderSearch"),
    statusFilter: document.getElementById("statusFilter"),
    paymentFilter: document.getElementById("paymentFilter"),
    sortFilter: document.getElementById("sortFilter"),
    clearFilters: document.getElementById("clearFilters"),
    refreshBtn: document.getElementById("refreshOrdersBtn")
};

let allOrders = [];
let incomingOrderIds = new Set();
let incomingInitDone = false;
let noticeTimer = null;
function normalizeSellerStatus(status) {
    const s = String(status || "").toUpperCase().trim().replace(/\s+/g, "_");
    if (s === "CONFIRMED") return "ACCEPTED";
    if (s === "OUT-FOR-DELIVERY") return "OUT_FOR_DELIVERY";
    if (s === "COLLECT_CASH" || s === "COLLECT-CASH") return "COLLECT_CASH";
    return s;
}

function getSellerStatusRank(status) {
    const order = ["ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "COLLECT_CASH", "DELIVERED"];
    return order.indexOf(normalizeSellerStatus(status));
}

function getPaymentClass(order) {
    const paymentStatus = String(order?.payment_status || "").toUpperCase();
    const paymentMethod = String(order?.payment_method || "").toUpperCase();
    if (paymentStatus === "PAID" || paymentStatus === "SUCCESS") return "pay-paid";
    if (paymentMethod === "COD" && (!paymentStatus || paymentStatus === "PENDING")) return "pay-cod-pending";
    return "pay-pending";
}

function extractArea(address, fallback = "") {
    const raw = String(address || "").trim();
    if (!raw) return String(fallback || "").trim();
    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    if (parts.length) return parts[0];
    return raw;
}

function formatOrderDateTime(ts) {
    const d = new Date(ts);
    if (!d || Number.isNaN(d.getTime())) return "N/A";
    return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function toElapsedMinutes(ts) {
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

function humanizeMinutes(mins) {
    const m = Math.max(0, Number(mins || 0));
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h <= 0) return `${rem}m`;
    return `${h}h ${String(rem).padStart(2, "0")}m`;
}

function getStageTargetMinutes(status) {
    const s = normalizeSellerStatus(status);
    // Simple SLA targets (adjust if needed)
    if (s === "ACCEPTED" || s === "PACKED") return { label: "Prep", mins: 30 };
    if (s === "OUT_FOR_DELIVERY") return { label: "Dispatch", mins: 45 };
    if (s === "COLLECT_CASH") return { label: "Complete", mins: 60 };
    return { label: "Prep", mins: 30 };
}

function showNewOrderNotice(count) {
    if (!els.newOrderNotice || !count) return;

    els.newOrderNotice.textContent =
        count === 1 ? "1 new order request" : `${count} new order requests`;
    els.newOrderNotice.classList.add("show");

    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        els.newOrderNotice?.classList.remove("show");
    }, 6000);
}

function syncIncomingOrderNotification(orders) {
    const incoming = (Array.isArray(orders) ? orders : []).filter(o => {
        const s = String(o?.status || "").toUpperCase();
        return s === "PLACED" || s === "PENDING";
    });

    const nextIds = new Set(incoming.map(o => String(o.id)));

    if (!incomingInitDone) {
        incomingOrderIds = nextIds;
        incomingInitDone = true;
        return;
    }

    let freshCount = 0;
    nextIds.forEach(id => {
        if (!incomingOrderIds.has(id)) freshCount += 1;
    });

    if (freshCount > 0) showNewOrderNotice(freshCount);
    incomingOrderIds = nextIds;
}
function getOrderReason(order) {
    return String(
        order?.customer_reason ||
        order?.seller_reason ||
        order?.status_reason ||
        order?.reason ||
        order?.cancel_reason ||
        order?.rejection_reason ||
        order?.reject_reason ||
        order?.cancellation_reason ||
        order?.note ||
        ""
    ).trim();
}

function getOrderActionLabel(order) {
    const status = String(order?.status || "").toUpperCase();
    const actor = String(
        order?.cancelled_by ||
        order?.cancel_by ||
        order?.cancelledBy ||
        order?.cancel_actor ||
        order?.cancelActor ||
        order?.rejected_by ||
        order?.rejectedBy ||
        order?.rejected_by_role ||
        order?.rejectedByRole ||
        order?.status_updated_by ||
        order?.status_updated_by_role ||
        order?.statusUpdatedByRole ||
        ""
    ).toUpperCase().trim();

    if (status === "CANCELLED") {
        if (["CUSTOMER", "USER", "BUYER"].includes(actor)) return "CANCELLED BY CUSTOMER";
        if (["SELLER", "STORE", "VENDOR", "MERCHANT", "SHOP"].includes(actor)) return "CANCELLED BY SELLER";
        if (actor === "ADMIN") return "CANCELLED BY ADMIN";
    }

    if (status === "REJECTED") {
        if (["SELLER", "STORE", "VENDOR", "MERCHANT", "SHOP"].includes(actor)) return "REJECTED BY SELLER";
        if (actor === "ADMIN") return "REJECTED BY ADMIN";
        if (["CUSTOMER", "USER", "BUYER"].includes(actor)) return "CANCELLED BY CUSTOMER";
    }

    return status;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function getOrderSearchText(order) {
    let cart = [];
    try {
        cart = typeof order.cart === "string" ? JSON.parse(order.cart) : (order.cart || []);
    } catch { cart = []; }
    const itemNames = Array.isArray(cart) ? cart.map(i => `${i.qty} ${i.name}`) : [];
    return [
        order?.id,
        order?.customer_name,
        order?.phone,
        order?.payment_method,
        order?.payment_status,
        order?.status,
        order?.total_amount,
        order?.address,
        ...itemNames
    ].join(" ").toLowerCase();
}

function applyFilters(orders) {
    const query = String(els.orderSearch?.value || "").trim().toLowerCase();
    const statusFilter = String(els.statusFilter?.value || "ALL").toUpperCase();
    const paymentFilter = String(els.paymentFilter?.value || "ALL").toUpperCase();
    const sortFilter = String(els.sortFilter?.value || "NEWEST").toUpperCase();

    let out = Array.isArray(orders) ? [...orders] : [];

    if (query) {
        out = out.filter(o => getOrderSearchText(o).includes(query));
    }

    if (statusFilter !== "ALL") {
        if (statusFilter === "ACTIVE") {
            const activeStatuses = ["PLACED", "PENDING", "ACCEPTED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY"];
            out = out.filter(o => activeStatuses.includes(String(o?.status || "").toUpperCase()));
        } else {
            out = out.filter(o => String(o?.status || "").toUpperCase() === statusFilter);
        }
    }

    if (paymentFilter !== "ALL") {
        out = out.filter(o => String(o?.payment_method || "").toUpperCase() === paymentFilter);
    }

    const toTime = (o) => new Date(o?.created_at || 0).getTime() || 0;
    const toAmount = (o) => Number(o?.total_amount || 0);
    if (sortFilter === "OLDEST") out.sort((a, b) => toTime(a) - toTime(b));
    if (sortFilter === "NEWEST") out.sort((a, b) => toTime(b) - toTime(a));
    if (sortFilter === "AMOUNT_HIGH") out.sort((a, b) => toAmount(b) - toAmount(a));
    if (sortFilter === "AMOUNT_LOW") out.sort((a, b) => toAmount(a) - toAmount(b));

    return out;
}

function showActionModal({
    title,
    message,
    requireReason = false,
    requireCheck = false,
    checkLabel = "I confirm",
    requireOtp = false,
    otpLabel = "Delivery OTP",
    otpPlaceholder = "Enter 4-digit OTP",
    confirmText = "Confirm"
}) {
    return new Promise(resolve => {
        if (!els.actionModal || !els.actionModalOk || !els.actionModalCancel) {
            const ask = window.lbConfirm
                ? window.lbConfirm(message || title || "Confirm?")
                : Promise.resolve(window.confirm(message || title || "Confirm?"));
            ask.then((ok) => {
                if (!ok) {
                    resolve({ confirmed: false, reason: "", checked: false, otp: "" });
                    return;
                }
                if (!requireReason) {
                    resolve({ confirmed: true, reason: "", checked: false, otp: "" });
                    return;
                }
                const fallbackReason = String(window.prompt("Enter reason:") || "").trim();
                resolve({ confirmed: Boolean(fallbackReason), reason: fallbackReason, checked: false, otp: "" });
            });
            return;
        }

        const modal = els.actionModal;
        const titleEl = els.actionModalTitle;
        const msgEl = els.actionModalMessage;
        const reasonEl = els.actionModalReason;
        const otpWrap = document.getElementById("actionModalOtpWrap");
        const otpLabelEl = document.querySelector("#actionModalOtpWrap .action-otp-label");
        const otpInput = document.getElementById("actionModalOtp");
        const otpErrorEl = document.getElementById("actionModalOtpError");
        const checkWrap = document.getElementById("actionModalCheckWrap");
        const checkEl = document.getElementById("actionModalCheck");
        const checkLabelEl = document.getElementById("actionModalCheckLabel");
        const checkErrorEl = document.getElementById("actionModalCheckError");
        const errorEl = els.actionModalError;
        const okBtn = els.actionModalOk;
        const cancelBtn = els.actionModalCancel;

        if (titleEl) titleEl.textContent = title || "Confirm Action";
        if (msgEl) msgEl.textContent = message || "";
        if (okBtn) okBtn.textContent = confirmText;

        if (reasonEl) {
            reasonEl.value = "";
            reasonEl.style.display = requireReason ? "block" : "none";
        }
        if (otpInput) {
            otpInput.value = "";
            otpInput.setAttribute("placeholder", otpPlaceholder || "Enter 4-digit OTP");
        }
        if (otpLabelEl) otpLabelEl.textContent = otpLabel || "Delivery OTP";
        if (otpWrap) otpWrap.style.display = requireOtp ? "block" : "none";
        if (errorEl) errorEl.classList.remove("show");
        if (checkErrorEl) checkErrorEl.classList.remove("show");
        if (otpErrorEl) otpErrorEl.classList.remove("show");
        if (checkLabelEl) checkLabelEl.textContent = checkLabel || "I confirm";
        if (checkEl) checkEl.checked = false;
        if (checkWrap) checkWrap.style.display = requireCheck ? "flex" : "none";

        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");

        const close = (result) => {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            modal.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKeydown);
            if (okBtn) okBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
            resolve(result);
        };

        const onBackdrop = (e) => {
            if (e.target === modal) close({ confirmed: false, reason: "" });
        };

        const onKeydown = (e) => {
            if (e.key === "Escape") close({ confirmed: false, reason: "", checked: false, otp: "" });
        };

        if (okBtn) {
            okBtn.onclick = () => {
                const reason = String(reasonEl?.value || "").trim();
                if (requireReason && !reason) {
                    if (errorEl) errorEl.classList.add("show");
                    reasonEl?.focus();
                    return;
                }
                if (requireCheck && !checkEl?.checked) {
                    if (checkErrorEl) checkErrorEl.classList.add("show");
                    checkEl?.focus();
                    return;
                }
                const otp = String(otpInput?.value || "").replace(/\\D/g, "");
                if (requireOtp && otp.length !== 4) {
                    if (otpErrorEl) otpErrorEl.classList.add("show");
                    otpInput?.focus();
                    return;
                }
                close({ confirmed: true, reason, checked: Boolean(checkEl?.checked), otp });
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => close({ confirmed: false, reason: "", checked: false, otp: "" });
        }

        modal.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKeydown);
        setTimeout(() => (requireOtp ? otpInput?.focus() : (requireReason ? reasonEl?.focus() : okBtn?.focus())), 0);
    });
}


/* ================= INITIALIZATION ================= */
document.addEventListener("DOMContentLoaded", () => {
    // Theme Init
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
        if(els.themeToggle) els.themeToggle.checked = true;
    }
    
    // Sidebar Logic
    if(els.menuBtn) {
        els.menuBtn.onclick = () => {
            els.sidebar.classList.add("open");
            els.overlay.style.display = "block";
        };
    }

    if(els.overlay) {
        els.overlay.onclick = () => {
            els.sidebar.classList.remove("open");
            els.overlay.style.display = "none";
        };
    }

    // Fetch Initial Data
    fetchOrders();
    
    // Auto Refresh every 20 seconds
    setInterval(fetchOrders, 20000);

    // Manual refresh button
    if (els.refreshBtn) {
        els.refreshBtn.addEventListener("click", async () => {
            try {
                els.refreshBtn.disabled = true;
                els.refreshBtn.style.opacity = "0.7";
                await fetchOrders();
            } finally {
                els.refreshBtn.disabled = false;
                els.refreshBtn.style.opacity = "";
            }
        });
    }

    // Filters
    [els.orderSearch, els.statusFilter, els.paymentFilter, els.sortFilter].forEach(el => {
        if (!el) return;
        el.addEventListener("input", renderOrders);
        el.addEventListener("change", renderOrders);
    });
    if (els.clearFilters) {
        els.clearFilters.onclick = () => {
            if (els.orderSearch) els.orderSearch.value = "";
            if (els.statusFilter) els.statusFilter.value = "ALL";
            if (els.paymentFilter) els.paymentFilter.value = "ALL";
            if (els.sortFilter) els.sortFilter.value = "NEWEST";
            renderOrders();
        };
    }
});

/* ================= FETCH & SORT ================= */
async function fetchOrders() {
    try {
        // Pull seller orders directly from seller route.
        const res = await authFetch(`${API_BASE}/seller/orders/${seller.id}`);
        const data = await res.json();
        
        if (data.orders) {
            allOrders = Array.isArray(data.orders) ? data.orders : [];
            syncIncomingOrderNotification(allOrders);
            renderOrders();
        }
    } catch (err) {
        console.error("❌ Fetch error:", err);
    }
}

// Make available for legacy inline handlers / debugging
window.fetchOrders = fetchOrders;

function renderOrders() {
    if (!els.activeList || !els.historyList) return;

    // --- LOGIC: Dashboard se Accept hone ke baad status 'ACCEPTED' ho jata hai ---
    // Isliye hum yahan se 'PLACED' ya 'PENDING' ko hata rahe hain.
    const activeStatuses = ["PLACED", "PENDING", "ACCEPTED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "COLLECT_CASH"];
    const historyStatuses = ["DELIVERED", "CANCELLED", "REJECTED"];

    // Filter Logic
    const filtered = applyFilters(allOrders);
    const activeOrders = filtered.filter(o => 
        o.status && activeStatuses.includes(o.status.toUpperCase())
    );
    const historyOrders = filtered.filter(o => 
        o.status && historyStatuses.includes(o.status.toUpperCase())
    );

    // 1. Update Counts (Main Fix)
    if(els.countActive) els.countActive.innerText = activeOrders.length;
    if(els.countHistory) els.countHistory.innerText = historyOrders.length;

    // 2. Render Active Table (Accepted Orders)
    if (activeOrders.length === 0) {
        els.activeList.innerHTML = "";
        els.activeEmpty.style.display = "block";
    } else {
        els.activeEmpty.style.display = "none";
        els.activeList.innerHTML = activeOrders.map(o => createActiveRow(o)).join("");
    }

    // 3. Render History Table (Delivered/Cancelled)
    if (historyOrders.length === 0) {
        els.historyList.innerHTML = "";
        els.historyEmpty.style.display = "block";
    } else {
        els.historyEmpty.style.display = "none";
        els.historyList.innerHTML = historyOrders.map(o => createHistoryRow(o)).join("");
    }
}

/* ================= HTML GENERATORS ================= */
function createActiveRow(order) {
    let cart = [];
    try {
        cart = typeof order.cart === 'string' ? JSON.parse(order.cart) : order.cart;
    } catch(e) { cart = []; }

    const itemText = cart.map(i => `${i.qty}x ${i.name}`).join(", ");
    const status = order.status ? normalizeSellerStatus(order.status) : "ACCEPTED";
    const currentRank = getSellerStatusRank(status);
    const isIncoming = status === "PLACED" || status === "PENDING";
    const isAccepted = getSellerStatusRank(status) >= 0;
    const areaName = extractArea(order.address, order.pincode || "N/A");
    const paymentClass = getPaymentClass(order);
    const paymentMethod = String(order.payment_method || "").trim().toUpperCase();
    const paymentStatus = String(order.payment_status || "").trim().toUpperCase();
    const canCollectCash = paymentMethod === "COD" && paymentStatus !== "PAID" && paymentStatus !== "SUCCESS" && status === "OUT_FOR_DELIVERY";
    const collectCashDisabled = !(canCollectCash || status === "COLLECT_CASH");

    const orderedAt = order.created_at || order.createdAt || order.order_time || order.orderTime || null;
    const elapsedMins = toElapsedMinutes(orderedAt);
    const stage = getStageTargetMinutes(status);
    const delayMins = Math.max(0, elapsedMins - Number(stage.mins || 0));
    const isDelayed = delayMins > 0 && !["DELIVERED", "CANCELLED", "REJECTED"].includes(status);

    return `
    <tr>
        <td data-label="Order ID">
            <b>#${order.id}</b>
            <div class="order-time-meta">
                <div class="order-time-line">Ordered: ${formatOrderDateTime(orderedAt)}</div>
                <div class="order-time-badges">
                    <span class="time-badge">Elapsed: ${humanizeMinutes(elapsedMins)}</span>
                    <span class="time-badge soft">${stage.label}: ${stage.mins}m</span>
                    ${isDelayed ? `<span class="time-badge danger">Delay +${humanizeMinutes(delayMins)}</span>` : ""}
                </div>
            </div>
        </td>
        <td data-label="Customer">
            ${order.customer_name}<br>
            ${
              isAccepted
                ? `<small style="color:var(--text-light)">${order.phone || "N/A"}</small><br>
                   <small style="color:var(--text-light)">${order.address || "Address not available"}</small>`
                : `<small style="color:var(--text-light)">Area: ${areaName || "N/A"}</small>`
            }
        </td>
        <td data-label="Items">
            <div class="item-preview" title="${itemText}">
                ${itemText}
            </div>
            <button class="badge view-all-btn" onclick='showItems(${JSON.stringify(cart)})'>+ View All</button>
        </td>
        <td data-label="Amount"><b>Rs. ${order.total_amount}</b></td>
        <td data-label="Payment"><span class="pay-badge ${paymentClass}">${order.payment_method} - ${order.payment_status || "PENDING"}</span></td>
        <td data-label="Current Status">
            ${isIncoming
                ? `<span class="badge new-order-badge">New Order</span>`
                 : `<select id="status-select-${order.id}" class="status-select" onchange="processUpdate(${order.id}, this.value, '${status}')">
                     <option value="ACCEPTED" ${(status==='ACCEPTED')?'selected':''} ${(currentRank > getSellerStatusRank('ACCEPTED'))?'disabled':''}>Accepted</option>
                     <option value="PACKED" ${(status==='PACKED')?'selected':''} ${(currentRank > getSellerStatusRank('PACKED'))?'disabled':''}>Packed</option>
                     <option value="OUT_FOR_DELIVERY" ${(status==='OUT_FOR_DELIVERY')?'selected':''} ${(currentRank > getSellerStatusRank('OUT_FOR_DELIVERY'))?'disabled':''}>Out for Delivery</option>
                     <option value="COLLECT_CASH" ${(status==='COLLECT_CASH')?'selected':''} ${collectCashDisabled ? "disabled" : ""}>Collect Cash</option>
                     <option value="DELIVERED" ${(status==='DELIVERED')?'selected':''}>Mark Delivered</option>
                 </select>`}
        </td>
        <td data-label="Action">
            <div class="action-wrap">
                ${isIncoming
                    ? `<button class="badge accept-btn" onclick="processUpdate(${order.id}, 'ACCEPTED', '${status}')">Accept</button>`
                    : ""}
                <button class="badge reject-btn" onclick="processUpdate(${order.id}, 'REJECTED', '${status}')">
                    Reject
                </button>
            </div>
        </td>
    </tr>`;
}

function createHistoryRow(order) {
    const date = new Date(order.created_at).toLocaleDateString();
    const status = order.status ? order.status.toUpperCase() : "";
    const statusLabel = getOrderActionLabel(order);
    const color = status === "DELIVERED" ? "#00b894" : "#ff7675";
    const reason = (status === "REJECTED" || status === "CANCELLED") ? getOrderReason(order) : "";
    const normalized = normalizeSellerStatus(status);
    const isAccepted = getSellerStatusRank(normalized) >= 0;
    const areaName = extractArea(order.address, order.pincode || "N/A");
    const paymentClass = getPaymentClass(order);

    return `
    <tr>
        <td data-label="Order ID">#${order.id}</td>
        <td data-label="Date">${date}</td>
        <td data-label="Customer">
          ${order.customer_name || "Customer"}<br>
          ${
            isAccepted
              ? `<small style="color:var(--text-light)">${order.phone || "N/A"}</small><br>
                 <small style="color:var(--text-light)">${order.address || "Address not available"}</small>`
              : `<small style="color:var(--text-light)">Area: ${areaName || "N/A"}</small>`
          }
        </td>
        <td data-label="Total"><b>Rs. ${order.total_amount}</b></td>
        <td data-label="Payment"><span class="pay-badge ${paymentClass}">${order.payment_method} - ${order.payment_status || "PENDING"}</span></td>
        <td data-label="Final Status">
            <span style="color:${color}; font-weight:700;">${statusLabel}</span>
            ${reason ? `<div style="margin-top:6px; color:#b91c1c; font-size:12px;">Reason: ${escapeHtml(reason)}</div>` : ""}
        </td>
    </tr>`;
}

/* ================= ACTIONS ================= */
window.processUpdate = async (orderId, newStatus, currentStatus = "") => {
    const status = normalizeSellerStatus(newStatus);
    const normalizeFlowStatus = (s) => {
        const v = String(s || "").toUpperCase().trim().replace(/\s+/g, "_");
        if (v === "ACCEPTED") return "CONFIRMED";
        if (v === "OUT-FOR-DELIVERY") return "OUT_FOR_DELIVERY";
        return v;
    };

    const fallbackCurrent = normalizeSellerStatus(allOrders.find(o => Number(o.id) === Number(orderId))?.status || "");
    const effectiveCurrent = normalizeSellerStatus(currentStatus || fallbackCurrent);

    const nextRank = getSellerStatusRank(status);
    const currentRank = getSellerStatusRank(effectiveCurrent);

    if (nextRank !== -1 && currentRank !== -1 && nextRank < currentRank) {
        alert("Back status allowed nahi hai. Forward status hi select karein.");
        fetchOrders();
        return;
    }

    const previousStatus = normalizeFlowStatus(effectiveCurrent);

    let reason = "";
    let deliveryOtp = "";
    let codPaid = null;

    if (status === "COLLECT_CASH") {
        const currentOrder = allOrders.find(o => Number(o.id) === Number(orderId)) || null;
        const paymentMethod = String(currentOrder?.payment_method || "").trim().toUpperCase();
        const paymentStatus = String(currentOrder?.payment_status || "").trim().toUpperCase();

        const selectEl = document.getElementById(`status-select-${orderId}`);
        if (selectEl) selectEl.value = "COLLECT_CASH";

        if (paymentMethod !== "COD") {
            alert("Collect Cash option only works for COD orders.");
            if (selectEl) selectEl.value = effectiveCurrent;
            return;
        }
        if (paymentStatus === "PAID" || paymentStatus === "SUCCESS") {
            alert("Payment already marked as PAID.");
            if (selectEl) selectEl.value = effectiveCurrent;
            return;
        }
        if (normalizeFlowStatus(effectiveCurrent) !== "OUT_FOR_DELIVERY") {
            alert("Collect Cash is available after Out for Delivery.");
            if (selectEl) selectEl.value = effectiveCurrent;
            return;
        }

        const result = await showActionModal({
            title: "Collect Cash (COD)",
            message: `Collect amount: Rs. ${Number(currentOrder?.total_amount || 0)}\n\nTick the checkbox to confirm you've collected cash from the customer.`,
            requireReason: false,
            requireCheck: true,
            checkLabel: "I have collected COD cash from the customer",
            confirmText: "Confirm Cash Collected"
        });

        if (!result.confirmed) {
            fetchOrders();
            return;
        }

        try {
            const res = await authFetch(`${API_BASE}/seller/orders/${orderId}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "COLLECT_CASH",
                    status_updated_by: "SELLER",
                    collect_cash: true,
                    cod_paid: true
                })
            });
            const data = await res.json();
            if (!data.success) {
                alert("Update failed: " + (data.message || "Unable to confirm cash"));
            }
        } catch (err) {
            console.error(err);
        } finally {
            fetchOrders();
        }
        return;
    }

    if (status === "DELIVERED") {
        const currentOrder = allOrders.find(o => Number(o.id) === Number(orderId)) || null;
        const paymentMethod = String(currentOrder?.payment_method || "").trim().toUpperCase();
        const paymentStatus = String(currentOrder?.payment_status || "").trim().toUpperCase();
        const needsCodConfirm = paymentMethod === "COD" && paymentStatus !== "PAID" && paymentStatus !== "SUCCESS";

        const result = await showActionModal({
            title: "Verify OTP & Deliver",
            message: needsCodConfirm
                ? "Enter Delivery OTP and confirm COD cash collection to mark delivered."
                : "Enter Delivery OTP to mark delivered.",
            requireReason: false,
            requireOtp: true,
            otpLabel: "Delivery OTP (4-digit)",
            otpPlaceholder: "Enter OTP",
            requireCheck: needsCodConfirm,
            checkLabel: "COD cash collected (customer paid)",
            confirmText: "Verify & Deliver"
        });

        if (!result.confirmed) {
            fetchOrders();
            return;
        }

        deliveryOtp = String(result.otp || "").replace(/\\D/g, "");
        if (deliveryOtp.length !== 4) {
            fetchOrders();
            return;
        }

        if (paymentMethod === "COD") {
            codPaid = paymentStatus === "PAID" || paymentStatus === "SUCCESS"
                ? true
                : Boolean(result.checked);
        }
    }

    if (status === "REJECTED" || status === "CANCELLED") {
        const result = await showActionModal({
            title: status === "REJECTED" ? "Reject Order" : "Cancel Order",
            message: `Please provide reason for ${status.toLowerCase()}.`,
            requireReason: true,
            confirmText: status === "REJECTED" ? "Reject" : "Cancel"
        });

        if (!result.confirmed) {
            fetchOrders();
            return;
        }

        reason = result.reason;
    }

    try {
        const res = await authFetch(`${API_BASE}/seller/orders/${orderId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status,
                status_updated_by: "SELLER",
                ...(status === "DELIVERED" ? {
                    delivery_otp: deliveryOtp,
                    ...(typeof codPaid === "boolean" ? { cod_paid: codPaid } : {})
                } : {}),
                ...(status === "REJECTED" ? {
                    reason,
                    status_reason: reason,
                    seller_reason: reason,
                    reject_reason: reason,
                    rejection_reason: reason,
                    rejected_by: "SELLER",
                    rejected_by_role: "SELLER",
                    previous_status: previousStatus,
                    prev_status: previousStatus,
                    status_before: previousStatus,
                    from_status: previousStatus
                } : {}),
                ...(status === "CANCELLED" ? {
                    reason,
                    status_reason: reason,
                    seller_reason: reason,
                    cancel_reason: reason,
                    cancellation_reason: reason,
                    cancelled_by: "SELLER",
                    cancelled_by_role: "SELLER",
                    previous_status: previousStatus,
                    prev_status: previousStatus,
                    status_before: previousStatus,
                    from_status: previousStatus
                } : {})
            })
        });

        const data = await res.json();
        if (data.success) {
            fetchOrders();
        } else {
            alert("Update failed: " + data.message);
            fetchOrders();
        }
    } catch (err) {
        console.error(err);
    }
};
/* ================= TABS LOGIC ================= */
window.switchTab = (tabName) => {
    document.querySelectorAll('.orders-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    
    const btns = document.querySelectorAll('.tab-btn');
    if(tabName === 'active') btns[0].classList.add('active');
    else btns[1].classList.add('active');
};

/* ================= MODAL LOGIC ================= */
window.showItems = (items) => {
    const modal = document.getElementById("detailModal");
    const list = document.getElementById("modalItemsList");
    
    list.innerHTML = items.map(i => `
        <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border-color)">
            <span>${i.qty} x ${i.name}</span>
            <b>Rs. ${i.price * i.qty}</b>
        </div>
    `).join("");
    
    modal.style.display = "flex";
};

// Close modal logic
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("close-modal") || e.target.id === "detailModal") {
        document.getElementById("detailModal").style.display = "none";
    }
});

/* ================= THEME TOGGLE ================= */
if(els.themeToggle) {
    els.themeToggle.onchange = (e) => {
        document.body.classList.toggle("dark", e.target.checked);
        localStorage.setItem("theme", e.target.checked ? "dark" : "light");
    };
}

function logout() {
    window.lbConfirm("Logout from Seller Panel?").then((ok) => {
        if (!ok) return;
        localStorage.removeItem("lbSeller");
        window.location.href = "/welcome/seller/seller-auth/seller-auth.html";
    });
}

















