// ================== SELLER AUTH LOGIC ==================
const API_BASE = `${window.API_BASE_URL}/api`;
let isRegister = false;
let isResubmit = false;
let resubmitSellerId = null;
let lastLoginSeller = null;
let rejectedKeys = [];

const getReadableRejectReason = (rejectReasonRaw) => {
  if (!rejectReasonRaw) return "Please update the highlighted details.";
  if (typeof rejectReasonRaw !== "string") return String(rejectReasonRaw);

  const text = rejectReasonRaw.trim();
  if (!text) return "Please update the highlighted details.";

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const messages = Object.values(parsed)
        .map(v => String(v || "").trim())
        .filter(Boolean);
      if (messages.length) return messages.join(" | ");
    }
  } catch {
    // plain text reason
  }

  return text;
};

const fetchJson = async (url, options) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText || "Request failed");
  return data;
};

const persistSellerSession = (seller, data) => {
  const nextSeller = seller && typeof seller === "object" ? { ...seller } : {};
  const token = String(data?.token || data?.auth?.token || "").trim();
  if (token) nextSeller.token = token;
  if (data?.auth?.expires_at) nextSeller.token_expires_at = data.auth.expires_at;
  localStorage.setItem("lbSeller", JSON.stringify(nextSeller));
  if (token) localStorage.setItem("lbSellerToken", token);
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("authForm");
  const toggleBtn = document.getElementById("toggleBtn");
  const pageTitle = document.getElementById("pageTitle");
  const submitBtn = document.getElementById("submitBtn");
  const registerBox = document.getElementById("registerFields");
  const msg = document.getElementById("msg");
  const toast = document.getElementById("toast");
  const toastTitle = toast?.querySelector("h4");
  const toastText = toast?.querySelector("p");
  const toastIcon = toast?.querySelector("i");

  const storeName = document.getElementById("storeName");
  const statusPanel = document.getElementById("statusPanel");
  const statusTitle = document.getElementById("statusTitle");
  const statusText = document.getElementById("statusText");
  const statusReason = document.getElementById("statusReason");
  const editResubmitBtn = document.getElementById("editResubmitBtn");
  const backToLoginBtn = document.getElementById("backToLoginBtn");

  const inputs = {
    ownerName: document.getElementById("ownerName"),
    category: document.querySelector("select"),
    address: document.getElementById("shopAddress"),
    phone: document.getElementById("phone"),
    password: document.getElementById("password"),
    pincode: document.getElementById("pincode"),
    altPhone: document.getElementById("altPhone"),
    ownerId: document.getElementById("ownerId"),
    license: document.getElementById("license"),
    storePhoto: document.getElementById("storePhoto")
  };

  const showToast = (title, message, type = "success") => {
    if (!toast) return;
    if (toastTitle) toastTitle.textContent = title;
    if (toastText) toastText.textContent = message;
    if (toastIcon) {
      toastIcon.className = `fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`;
      toastIcon.style.color = type === "success" ? "var(--accent)" : "#ef4444";
    }
    toast.classList.add("active");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("active"), 2500);
  };

  const setMessage = (text, color = "#6b7280") => {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = color;
  };

  const updateFileLabel = (inputEl, label) => {
    if (!inputEl) return;
    const span = label?.querySelector("span");
    inputEl.addEventListener("change", () => {
      if (!span) return;
      span.textContent = inputEl.files?.[0]?.name || span.textContent;
    });
  };

  const initFileLabels = () => {
    if (inputs.ownerId) updateFileLabel(inputs.ownerId, inputs.ownerId.closest("label"));
    if (inputs.license) updateFileLabel(inputs.license, inputs.license.closest("label"));
    if (inputs.storePhoto) updateFileLabel(inputs.storePhoto, inputs.storePhoto.closest("label"));
  };

  const loadCategories = async () => {
    if (!inputs.category) return;
    const placeholder = inputs.category.querySelector("option")?.outerHTML ||
      '<option value="" disabled selected>Select Category</option>';

    const tryEndpoints = [
      `${API_BASE}/admin/categories`,
      `${API_BASE}/categories`
    ];

    for (const url of tryEndpoints) {
      try {
        const data = await fetchJson(url);
        const list = data.categories || data.data || [];
        if (Array.isArray(list) && list.length) {
          inputs.category.innerHTML = placeholder + list
            .filter(c => c.is_active === undefined || c.is_active === 1 || c.is_active === true)
            .map(c => `<option value="${c.id}">${c.name}</option>`)
            .join("");
          return;
        }
      } catch {
        // try next
      }
    }
  };

  const resetForm = () => {
    form.reset();
    setMessage("");
    isResubmit = false;
    resubmitSellerId = null;
  };

  const setMode = () => {
    if (isRegister) {
      registerBox.classList.remove("hidden");
      registerBox.classList.add("fade-in");
      pageTitle.textContent = isResubmit ? "Update & Resubmit" : "Register Your Shop";
      submitBtn.textContent = isResubmit ? "Resubmit for Approval" : "Register & Continue";
      toggleBtn.textContent = "Login";
      toggleRegisterFields(true);
    } else {
      registerBox.classList.add("hidden");
      pageTitle.textContent = "Welcome Back";
      submitBtn.textContent = "Login to Dashboard";
      toggleBtn.textContent = "Register Shop";
      toggleRegisterFields(false);
    }
    resetForm();
  };

  const toggleRegisterFields = (enable) => {
    if (inputs.ownerName) {
      inputs.ownerName.disabled = !enable;
      inputs.ownerName.required = enable;
    }
    if (inputs.category) {
      inputs.category.disabled = !enable;
      inputs.category.required = enable;
    }
    if (inputs.address) {
      inputs.address.disabled = !enable;
      inputs.address.required = enable;
    }
    if (inputs.pincode) {
      inputs.pincode.disabled = !enable;
      inputs.pincode.required = enable;
    }
    if (inputs.ownerId) inputs.ownerId.disabled = !enable;
    if (inputs.license) inputs.license.disabled = !enable;
    if (inputs.storePhoto) inputs.storePhoto.disabled = !enable;
    if (storeName) {
      storeName.disabled = !enable;
      storeName.required = enable;
    }
  };

  toggleBtn.addEventListener("click", () => {
    isRegister = !isRegister;
    setMode();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const error = validateForm();
    if (error) {
      showToast("Error", error, "error");
      setMessage(error, "#ef4444");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

    try {
      if (isRegister) {
        if (isResubmit) {
          await resubmitSeller();
        } else {
          await registerSeller();
        }
      } else {
        await loginSeller();
      }
    } catch (err) {
      showToast("Error", err.message || "Server error", "error");
      setMessage(err.message || "Server error", "#ef4444");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? "Register & Continue" : "Login to Dashboard";
    }
  });

  async function registerSeller() {
    const fd = new FormData();

    fd.append("store_name", storeName.value.trim());
    fd.append("owner_name", inputs.ownerName.value.trim());
    fd.append("category_id", inputs.category.value);
    fd.append("address", inputs.address.value.trim());
    fd.append("phone", inputs.phone.value.trim());
    fd.append("pincode", inputs.pincode.value.trim());
    if (inputs.altPhone?.value?.trim()) fd.append("alt_phone", inputs.altPhone.value.trim());
    fd.append("password", inputs.password.value);

    if (inputs.ownerId?.files?.[0]) {
      fd.append("owner_id_doc", inputs.ownerId.files[0]);
    }
    if (inputs.license?.files?.[0]) {
      fd.append("license_doc", inputs.license.files[0]);
    }
    if (inputs.storePhoto?.files?.[0]) {
      fd.append("store_photo", inputs.storePhoto.files[0]);
    }

    const data = await fetchJson(`${API_BASE}/seller/register`, {
      method: "POST",
      body: fd
    });

    if (!data.success) {
      throw new Error(data.message || "Registration failed");
    }

    showToast("Success", "Registration successful. Admin verification pending.");
    resetForm();
    toggleBtn.click();
  }

  async function loginSeller() {
    const phone = String(inputs.phone?.value || document.getElementById("phone")?.value || "").trim();
    const password = String(inputs.password?.value || document.getElementById("password")?.value || "");

    const attempts = [
      { identifier: phone, password },
      { phone, password }
    ];

    let data = null;
    let lastError = "Invalid login";

    for (let i = 0; i < attempts.length; i += 1) {
      const payload = attempts[i];
      try {
        const res = await fetch(`${API_BASE}/seller/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const out = await res.json().catch(() => ({}));

        if (res.ok && (out.success !== false)) {
          data = out;
          break;
        }

        // Unauthorized means credentials are wrong; do not keep retrying formats.
        if (res.status === 401) {
          lastError = out.message || "Invalid phone or password";
          break;
        }

        // Some backends validate one identity field name strictly.
        if (res.status === 400 && i < attempts.length - 1) {
          continue;
        }

        lastError = out.message || lastError;
      } catch (e) {
        lastError = e.message || lastError;
      }
    }

    if (!data) {
      throw new Error(lastError || "Invalid login");
    }

    const seller =
      data.seller ||
      data.user ||
      data.data?.seller ||
      data.data ||
      null;

    let status = String(
      data.status ||
      data.seller_status ||
      data.approval_status ||
      seller?.status ||
      ""
    ).toUpperCase();

    if (!status) {
      if (seller?.is_approved === 1 || seller?.is_approved === true || seller?.verified === 1 || seller?.verified === true) {
        status = "APPROVED";
      } else if (seller?.is_rejected === 1 || seller?.is_rejected === true) {
        status = "REJECTED";
      } else {
        status = "PENDING";
      }
    }

    lastLoginSeller = seller;

    switch (status) {
      case "PENDING":
        showStatusPanel("PENDING", seller);
        break;
      case "REJECTED":
        showStatusPanel("REJECTED", seller);
        break;
      case "APPROVED":
        persistSellerSession(seller, data);
        window.location.href = "/welcome/seller/seller-dashboard.html";
        break;
      default:
        throw new Error(data.message || "Unable to identify seller account status");
    }
  }

  async function resubmitSeller() {
    if (!resubmitSellerId) throw new Error("Seller ID missing for resubmit");

    const fd = new FormData();
    fd.append("store_name", storeName.value.trim());
    fd.append("owner_name", inputs.ownerName.value.trim());
    fd.append("category_id", inputs.category.value);
    fd.append("address", inputs.address.value.trim());
    fd.append("pincode", inputs.pincode.value.trim());

    if (inputs.ownerId?.files?.[0]) {
      fd.append("owner_id_doc", inputs.ownerId.files[0]);
    }
    if (inputs.license?.files?.[0]) {
      fd.append("license_doc", inputs.license.files[0]);
    }

    const data = await fetchJson(`${API_BASE}/seller/resubmit/${resubmitSellerId}`, {
      method: "PUT",
      body: fd
    });

    if (!data.success) {
      throw new Error(data.message || "Resubmit failed");
    }

    showToast("Submitted", "Details resubmitted. Await admin verification.");
    isRegister = false;
    setMode();
  }

  function showStatusPanel(status, seller) {
    if (!statusPanel) return;
    statusPanel.classList.remove("hidden");
    statusTitle.textContent = status === "REJECTED" ? "Application Rejected" : "Verification Pending";
    statusText.textContent = status === "REJECTED"
      ? "Please correct the details and resubmit."
      : "Your account is under review. We will notify you once approved.";
    statusReason.textContent = status === "REJECTED"
      ? `Reason: ${getReadableRejectReason(seller?.reject_reason)}`
      : "";

    if (editResubmitBtn) {
      editResubmitBtn.style.display = status === "REJECTED" ? "inline-flex" : "none";
      editResubmitBtn.textContent = status === "REJECTED" ? "Proceed to Update" : "Edit & Resubmit";
    }

    if (editResubmitBtn) {
      editResubmitBtn.onclick = () => {
        if (!seller) return;
        if (status === "REJECTED") {
          localStorage.setItem("lbRejectedSeller", JSON.stringify(seller));
          window.location.href = "/welcome/seller/seller-auth/seller-resubmit.html";
          return;
        }
        isRegister = true;
        isResubmit = true;
        resubmitSellerId = seller.id;
        setMode();
        prefillSeller(seller);
        applyRejectedLocks(seller.reject_reason);
      };
    }

    if (backToLoginBtn) {
      backToLoginBtn.onclick = () => {
        statusPanel.classList.add("hidden");
        isRegister = false;
        isResubmit = false;
        setMode();
      };
    }
  }

  function prefillSeller(seller) {
    if (storeName) storeName.value = seller.store_name || "";
    if (inputs.ownerName) inputs.ownerName.value = seller.owner_name || "";
    if (inputs.address) inputs.address.value = seller.address || "";
    if (inputs.pincode) inputs.pincode.value = seller.pincode || "";
    if (inputs.phone) inputs.phone.value = seller.phone || "";
    if (inputs.category) {
      const opts = Array.from(inputs.category.options);
      const match = opts.find(o => (o.textContent || "").toLowerCase() === String(seller.category || "").toLowerCase());
      if (match) inputs.category.value = match.value;
    }
  }

  function applyRejectedLocks(rejectReasonRaw) {
    let rejected = {};
    try {
      rejected = rejectReasonRaw ? JSON.parse(rejectReasonRaw) : {};
    } catch {
      rejected = {};
    }
    rejectedKeys = Object.keys(rejected || {});

    const isRejectedField = (key) => rejected && Object.prototype.hasOwnProperty.call(rejected, key);

    const lockField = (el, key) => {
      if (!el) return;
      const allow = rejectedKeys.length === 0 ? true : isRejectedField(key);
      el.disabled = !allow;
      if (allow) el.classList.add("fade-in");
    };

    lockField(storeName, "store_name");
    lockField(inputs.ownerName, "owner_name");
    lockField(inputs.category, "category_id");
    lockField(inputs.address, "address");
    lockField(inputs.pincode, "pincode");
    lockField(inputs.ownerId, "owner_id_doc");
    lockField(inputs.license, "license_doc");
    lockField(inputs.storePhoto, "store_photo");
  }

  function validateForm() {
    if (!/^[0-9]{10}$/.test(inputs.phone.value.trim()))
      return "Enter valid 10-digit mobile number";

    if (inputs.password.value.length < 4)
      return "Password must be at least 4 characters";

    if (isRegister) {
      const editable = (el) => el && !el.disabled;
      if (editable(storeName) && !storeName.value.trim()) return "Store name required";
      if (editable(inputs.ownerName) && !inputs.ownerName.value.trim()) return "Owner name required";
      if (editable(inputs.category) && !inputs.category.value) return "Select shop category";
      if (editable(inputs.pincode)) {
        if (!inputs.pincode.value.trim()) return "Pincode required";
        if (!/^[0-9]{6}$/.test(inputs.pincode.value.trim())) return "Enter valid 6-digit pincode";
      }
      if (editable(inputs.address) && !inputs.address.value.trim()) return "Shop address required";
      // Owner ID optional; admin will verify later
    }

    return null;
  }

  setMode();
  initFileLabels();
  loadCategories();
});

