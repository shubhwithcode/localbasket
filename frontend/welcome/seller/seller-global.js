/* ================= AUTH ================= */
const seller = JSON.parse(localStorage.getItem("lbSeller"));
if (!seller || !seller.id) {
  window.location.href = "/welcome/seller/seller-auth/seller-auth.html";
}
const sellerToken = String(seller?.token || localStorage.getItem("lbSellerToken") || "").trim();
const authFetch = (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (sellerToken && !headers.has("Authorization") && /\/api\/seller(\/|$)/.test(String(url || ""))) {
    headers.set("Authorization", `Bearer ${sellerToken}`);
  }
  return fetch(url, { ...options, headers });
};

/* ================= THEME ================= */
const theme = localStorage.getItem("theme") || "light";
document.body.classList.toggle("dark", theme === "dark");

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

/* ================= FETCH DASHBOARD DATA ================= */
async function loadSellerDashboard() {
  try {
    const res = await authFetch(
      `${window.API_BASE_URL}/api/seller/dashboard/${seller.id}`
    );
    const data = await res.json();
    if (!data.success) return;

    // GLOBAL INFO (used everywhere)
    window.SELLER_DATA = data;

    // OPTIONAL AUTO BINDING
    bindIfExists("sellerName", data.seller.store_name);
    bindIfExists("sellerId", "#" + data.seller.id);
    bindIfExists("totalOrders", data.totalOrders);
    bindIfExists("totalProducts", data.totalProducts);
    bindIfExists("totalPayments", "Rs. " + data.totalPayments);

    // Recent orders list
    const list = document.getElementById("recentOrders");
    if (list) {
      list.innerHTML = "";
      data.recentOrders.forEach(o => {
        list.innerHTML += `
          <li>
            Order #${o.id} – Rs. ${o.total}
            <span>${o.status}</span>
          </li>`;
      });
    }

  } catch (err) {
    console.error("Dashboard load failed", err);
  }
}

function bindIfExists(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

/* ================= LOGOUT ================= */
function sellerLogout() {
  localStorage.removeItem("lbSeller");
  localStorage.removeItem("lbSellerToken");
  window.location.href = "/welcome/seller/seller-auth/seller-auth.html";
}

loadSellerDashboard();

