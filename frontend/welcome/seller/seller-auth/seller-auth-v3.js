// ================== SELLER AUTH LOGIC ==================
const API_BASE = `${window.API_BASE_URL}/api`;
let isRegister = false;
let isResubmit = false;
let resubmitSellerId = null;
let lastLoginSeller = null;
let rejectedKeys = [];
let otpMode = "none"; // none | login | reset

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

const persistSellerSession = (seller, data, identifier) => {
  const nextSeller = seller && typeof seller === "object" ? { ...seller } : {};
  const token = String(data?.token || data?.auth?.token || "").trim();
  if (token) nextSeller.token = token;
  if (data?.auth?.expires_at) nextSeller.token_expires_at = data.auth.expires_at;
  localStorage.setItem("lbSeller", JSON.stringify(nextSeller));
  if (token) localStorage.setItem("lbSellerToken", token);
  if (identifier) {
    try { localStorage.setItem("lbSellerLastAuthIdentifier", identifier); } catch {}
  }
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
  const stepper = document.getElementById("stepper");
  const registerSteps = Array.from(document.querySelectorAll(".reg-step"));
  const stepNodes = Array.from(document.querySelectorAll(".stepper .step"));
  const nextStepBtn = document.getElementById("nextStepBtn");
  const prevStepBtn = document.getElementById("prevStepBtn");
  const reviewBox = document.getElementById("reviewBox");
  const loginFields = document.getElementById("loginFields");
  const sellerUseOtpBtn = document.getElementById("sellerUseOtpBtn");
  const sellerForgotBtn = document.getElementById("sellerForgotBtn");
  const sellerOtpRow = document.getElementById("sellerOtpRow");
  const sellerRequestOtpBtn = document.getElementById("sellerRequestOtpBtn");
  const sellerNewPasswordWrap = document.getElementById("sellerNewPasswordWrap");
  const sellerNewPassword = document.getElementById("sellerNewPassword");
  const toggleLoginPassword = document.getElementById("toggleLoginPassword");
  const toggleRegisterPassword = document.getElementById("toggleRegisterPassword");
  const toggleSellerOtp = document.getElementById("toggleSellerOtp");
  const toggleSellerNewPassword = document.getElementById("toggleSellerNewPassword");

  const inputs = {
    ownerName: document.getElementById("ownerName"),
    email: document.getElementById("email"),
    category: document.querySelector("select"),
    address: document.getElementById("shopAddress"),
    phone: document.getElementById("phone"),
    password: document.getElementById("password"),
    loginPhone: document.getElementById("loginPhone"),
    loginPassword: document.getElementById("loginPassword"),
    sellerOtp: document.getElementById("sellerOtp"),
    pincode: document.getElementById("pincode"),
    altPhone: document.getElementById("altPhone"),
    ownerId: document.getElementById("ownerId"),
    license: document.getElementById("license"),
    bankPassbook: document.getElementById("bankPassbook"),
    storePhoto: document.getElementById("storePhoto"),
    bankHolder: document.getElementById("bankHolder"),
    bankAccount: document.getElementById("bankAccount"),
    bankIfsc: document.getElementById("bankIfsc"),
    bankName: document.getElementById("bankName"),
    bankBranch: document.getElementById("bankBranch")
  };

  try {
    const saved = String(localStorage.getItem("lbSellerLastAuthIdentifier") || "").trim();
    if (saved && inputs.loginPhone && !String(inputs.loginPhone.value || "").trim()) {
      inputs.loginPhone.value = saved;
    }
  } catch {}

  let currentStep = 1;
  let resendTimer = null;
  let resendRemaining = 0;

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

  const bindVisibilityToggle = (btn, input, labels = {}) => {
    if (!btn || !input) return;
    const showLabel = labels.show || "Show";
    const hideLabel = labels.hide || "Hide";
    const icon = btn.querySelector("i");
    const setState = (visible) => {
      try {
        input.type = visible ? "text" : "password";
      } catch {
        // ignore if browser blocks type switch
      }
      btn.setAttribute("aria-label", visible ? hideLabel : showLabel);
      if (icon) {
        icon.className = `fas ${visible ? "fa-eye-slash" : "fa-eye"}`;
      }
      btn.dataset.visible = visible ? "1" : "0";
    };

    setState(false);
    btn.addEventListener("click", () => {
      const visible = btn.dataset.visible === "1";
      setState(!visible);
    });
  };

  const resetResendButton = () => {
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }
    resendRemaining = 0;
    if (sellerRequestOtpBtn) {
      sellerRequestOtpBtn.disabled = false;
      sellerRequestOtpBtn.textContent = "Send OTP";
    }
  };

  const startResendCooldown = (seconds = 30) => {
    if (!sellerRequestOtpBtn) return;
    if (resendTimer) clearInterval(resendTimer);

    resendRemaining = Math.max(1, Number(seconds) || 30);
    sellerRequestOtpBtn.disabled = true;
    sellerRequestOtpBtn.textContent = `Resend OTP (${resendRemaining}s)`;

    resendTimer = setInterval(() => {
      resendRemaining -= 1;
      if (resendRemaining <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
        sellerRequestOtpBtn.disabled = false;
        sellerRequestOtpBtn.textContent = "Resend OTP";
        return;
      }
      sellerRequestOtpBtn.textContent = `Resend OTP (${resendRemaining}s)`;
    }, 1000);
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
    if (inputs.bankPassbook) updateFileLabel(inputs.bankPassbook, inputs.bankPassbook.closest("label"));
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
    resetResendButton();
    isResubmit = false;
    resubmitSellerId = null;
  };

  const setMode = () => {
    if (isRegister) {
      registerBox.classList.remove("hidden");
      registerBox.classList.add("fade-in");
      if (loginFields) loginFields.classList.add("hidden");
      if (submitBtn) submitBtn.classList.add("hidden");
      pageTitle.textContent = isResubmit ? "Update & Resubmit" : "Register Your Shop";
      toggleBtn.textContent = "Login";
      toggleRegisterFields(true);
      if (inputs.loginPhone) {
        inputs.loginPhone.disabled = true;
        inputs.loginPhone.required = false;
      }
      if (inputs.loginPassword) {
        inputs.loginPassword.disabled = true;
        inputs.loginPassword.required = false;
      }
      currentStep = 1;
      setStep(currentStep);
    } else {
      registerBox.classList.add("hidden");
      if (loginFields) loginFields.classList.remove("hidden");
      if (submitBtn) submitBtn.classList.remove("hidden");
      pageTitle.textContent = "Welcome Back";
      submitBtn.textContent = "Login to Dashboard";
      toggleBtn.textContent = "Register Shop";
      toggleRegisterFields(false);
      if (inputs.loginPhone) {
        inputs.loginPhone.disabled = false;
        inputs.loginPhone.required = true;
      }
      if (inputs.loginPassword) {
        inputs.loginPassword.disabled = false;
        inputs.loginPassword.required = true;
      }
      setOtpMode("none");
    }
    resetForm();
  };

  const setOtpMode = (mode) => {
    otpMode = mode || "none";
    const enabled = otpMode !== "none";
    const isReset = otpMode === "reset";

    resetResendButton();
    if (sellerOtpRow) sellerOtpRow.classList.toggle("active", enabled);
    if (sellerOtpRow) sellerOtpRow.classList.toggle("reset", isReset);

    if (sellerUseOtpBtn) {
      sellerUseOtpBtn.textContent = otpMode === "login" ? "Back to Password Login" : "Login with OTP";
      sellerUseOtpBtn.style.display = isRegister ? "none" : "block";
    }

    if (sellerForgotBtn) {
      sellerForgotBtn.textContent = otpMode === "reset" ? "Back to Password Login" : "Forgot Password";
      sellerForgotBtn.style.display = isRegister ? "none" : "block";
    }

    if (inputs.loginPassword) {
      inputs.loginPassword.disabled = enabled;
      inputs.loginPassword.required = !enabled;
      inputs.loginPassword.closest(".input-wrapper").style.display = enabled ? "none" : "block";
      if (enabled) inputs.loginPassword.value = "";
    }

    if (inputs.sellerOtp) {
      inputs.sellerOtp.required = enabled;
      inputs.sellerOtp.disabled = !enabled;
      if (!enabled) inputs.sellerOtp.value = "";
    }

    if (sellerNewPasswordWrap) sellerNewPasswordWrap.style.display = isReset ? "block" : "none";
    if (sellerNewPassword) {
      sellerNewPassword.required = isReset;
      sellerNewPassword.disabled = !isReset;
      if (!isReset) sellerNewPassword.value = "";
    }

    if (submitBtn && !isRegister) {
      submitBtn.textContent = isReset ? "Reset Password" : "Login to Dashboard";
    }

    if (enabled) {
      setTimeout(() => {
        if (inputs.sellerOtp) inputs.sellerOtp.focus();
        if (isReset && sellerNewPassword) sellerNewPassword.focus();
      }, 0);
    }
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
    if (inputs.bankPassbook) inputs.bankPassbook.disabled = !enable;
    if (inputs.storePhoto) inputs.storePhoto.disabled = !enable;
    if (inputs.bankHolder) inputs.bankHolder.disabled = !enable;
    if (inputs.bankAccount) inputs.bankAccount.disabled = !enable;
    if (inputs.bankIfsc) inputs.bankIfsc.disabled = !enable;
    if (inputs.bankName) inputs.bankName.disabled = !enable;
    if (inputs.bankBranch) inputs.bankBranch.disabled = !enable;
    if (storeName) {
      storeName.disabled = !enable;
      storeName.required = enable;
    }
    if (inputs.phone) {
      inputs.phone.disabled = !enable;
      inputs.phone.required = enable;
    }
    if (inputs.email) {
      inputs.email.disabled = !enable;
      inputs.email.required = enable;
    }
    if (inputs.password) {
      inputs.password.disabled = !enable;
      inputs.password.required = enable;
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
        if (otpMode === "login") {
          await loginSellerWithOtp();
        } else if (otpMode === "reset") {
          await resetSellerPasswordWithOtp();
        } else {
          await loginSeller();
        }
      }
    } catch (err) {
      showToast("Error", err.message || "Server error", "error");
      setMessage(err.message || "Server error", "#ef4444");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? "Register & Continue" : (otpMode === "reset" ? "Reset Password" : "Login to Dashboard");
    }
  });

  if (sellerUseOtpBtn) {
    sellerUseOtpBtn.addEventListener("click", () => {
      if (isRegister) return;
      setOtpMode(otpMode === "login" ? "none" : "login");
      setMessage("");
    });
  }

  if (sellerForgotBtn) {
    sellerForgotBtn.addEventListener("click", () => {
      if (isRegister) return;
      setOtpMode(otpMode === "reset" ? "none" : "reset");
      setMessage("");
    });
  }

  if (sellerRequestOtpBtn) {
    sellerRequestOtpBtn.addEventListener("click", async () => {
      const identifier = String(inputs.loginPhone?.value || "").trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(identifier || "").trim().toLowerCase());
      const isPhone = /^[0-9]{10}$/.test(String(identifier || "").trim());
      if (otpMode === "none") {
        setMessage("Select Login with OTP or Forgot Password first", "#ef4444");
        return;
      }

      // OTP is delivered on email only (not SMS).
      if (!isEmail) {
        setMessage("For OTP, please enter your registered email (OTP comes on email).", "#ef4444");
        try { inputs.loginPhone?.focus?.(); inputs.loginPhone?.select?.(); } catch {}
        return;
      }

      try { localStorage.setItem("lbSellerLastAuthIdentifier", identifier); } catch {}
      sellerRequestOtpBtn.disabled = true;
      sellerRequestOtpBtn.textContent = "Sending...";
      try {
        const endpoint = otpMode === "reset"
          ? `${API_BASE}/seller/password-reset/request`
          : `${API_BASE}/seller/login-otp/request`;
        const attempts = [
          { identifier },
          { email: identifier }
        ];
        let lastErr = null;
        for (let i = 0; i < attempts.length; i += 1) {
          try {
            await fetchJson(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(attempts[i])
            });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (lastErr) throw lastErr;
        showToast("Success", "OTP sent successfully. Please check your registered email/SMS.", "success");
        setMessage(
          otpMode === "reset" ? "OTP sent. Enter OTP + new password to reset." : "OTP sent. Enter OTP to login.",
          "var(--accent)"
        );
        startResendCooldown(30);
      } catch (err) {
        showToast("Error", err.message || "OTP request failed", "error");
        setMessage(err.message || "OTP request failed", "#ef4444");
        resetResendButton();
      } finally {
        if (resendRemaining <= 0 && sellerRequestOtpBtn) {
          sellerRequestOtpBtn.disabled = false;
          sellerRequestOtpBtn.textContent = "Send OTP";
        }
      }
    });
  }

  async function registerSeller() {
    const fd = new FormData();

    fd.append("store_name", storeName.value.trim());
    fd.append("owner_name", inputs.ownerName.value.trim());
    fd.append("email", inputs.email.value.trim().toLowerCase());
    fd.append("category_id", inputs.category.value);
    fd.append("address", inputs.address.value.trim());
    fd.append("phone", normalizeMobile10(inputs.phone.value));
    fd.append("pincode", inputs.pincode.value.trim());
    const alt = normalizeMobile10(inputs.altPhone?.value);
    if (alt) fd.append("alt_phone", alt);
    fd.append("password", inputs.password.value);
    if (inputs.bankHolder?.value?.trim()) fd.append("bank_holder", inputs.bankHolder.value.trim());
    if (inputs.bankAccount?.value?.trim()) fd.append("bank_account", inputs.bankAccount.value.trim());
    if (inputs.bankIfsc?.value?.trim()) fd.append("bank_ifsc", inputs.bankIfsc.value.trim());
    if (inputs.bankName?.value?.trim()) fd.append("bank_name", inputs.bankName.value.trim());
    if (inputs.bankBranch?.value?.trim()) fd.append("bank_branch", inputs.bankBranch.value.trim());

    if (inputs.ownerId?.files?.[0]) {
      fd.append("owner_id_doc", inputs.ownerId.files[0]);
    }
    if (inputs.license?.files?.[0]) {
      fd.append("license_doc", inputs.license.files[0]);
    }
    if (inputs.bankPassbook?.files?.[0]) {
      fd.append("bank_passbook", inputs.bankPassbook.files[0]);
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
    const rawIdentifier = String(inputs.loginPhone?.value || "").trim();
    const phone = rawIdentifier.includes("@") ? rawIdentifier : normalizeMobile10(rawIdentifier);
    const password = String(inputs.loginPassword?.value || "");

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

    // Fallback mapping for backends that only return boolean-like approval flags
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
        persistSellerSession(seller, data, phone);
        window.location.href = "/welcome/seller/seller-dashboard.html";
        break;
      default:
        throw new Error(data.message || "Unable to identify seller account status");
    }
  }

  async function loginSellerWithOtp() {
    const identifier = String(inputs.loginPhone?.value || "").trim();
    const otp = String(inputs.sellerOtp?.value || "").trim();
    try { localStorage.setItem("lbSellerLastAuthIdentifier", identifier); } catch {}

    const attempts = [
      { identifier, otp },
      { phone: identifier, otp },
      { email: identifier, otp }
    ];
    let data = null;
    let lastErr = null;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        data = await fetchJson(`${API_BASE}/seller/login-otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempts[i])
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;

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
        persistSellerSession(seller, data, identifier);
        window.location.href = "/welcome/seller/seller-dashboard.html";
        break;
      default:
        throw new Error(data.message || "Unable to identify seller account status");
    }
  }

  async function resetSellerPasswordWithOtp() {
    const identifier = String(inputs.loginPhone?.value || "").trim();
    const otp = String(inputs.sellerOtp?.value || "").trim();
    const newPassword = String(sellerNewPassword?.value || "").trim();

    const attempts = [
      { identifier, otp, newPassword },
      { phone: identifier, otp, newPassword },
      { email: identifier, otp, newPassword }
    ];
    let data = null;
    let lastErr = null;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        data = await fetchJson(`${API_BASE}/seller/password-reset/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempts[i])
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;

    if (!data?.success) {
      throw new Error(data?.message || "Password reset failed");
    }

    showToast("Success", data.message || "Password reset successful", "success");
    setMessage("Password reset successful. Please login with new password.", "var(--accent)");
    setOtpMode("none");
    resetForm();
  }

  async function resubmitSeller() {
    if (!resubmitSellerId) throw new Error("Seller ID missing for resubmit");

    const fd = new FormData();
    fd.append("store_name", storeName.value.trim());
    fd.append("owner_name", inputs.ownerName.value.trim());
    if (inputs.email?.value?.trim()) fd.append("email", inputs.email.value.trim().toLowerCase());
    const phone = normalizeMobile10(inputs.phone?.value);
    if (phone) fd.append("phone", phone);
    const alt = normalizeMobile10(inputs.altPhone?.value);
    if (alt) fd.append("alt_phone", alt);
    fd.append("category_id", inputs.category.value);
    fd.append("address", inputs.address.value.trim());
    fd.append("pincode", inputs.pincode.value.trim());
    if (inputs.bankHolder?.value?.trim()) fd.append("bank_holder", inputs.bankHolder.value.trim());
    if (inputs.bankAccount?.value?.trim()) fd.append("bank_account", inputs.bankAccount.value.trim());
    if (inputs.bankIfsc?.value?.trim()) fd.append("bank_ifsc", inputs.bankIfsc.value.trim());
    if (inputs.bankName?.value?.trim()) fd.append("bank_name", inputs.bankName.value.trim());
    if (inputs.bankBranch?.value?.trim()) fd.append("bank_branch", inputs.bankBranch.value.trim());

    if (inputs.ownerId?.files?.[0]) {
      fd.append("owner_id_doc", inputs.ownerId.files[0]);
    }
    if (inputs.license?.files?.[0]) {
      fd.append("license_doc", inputs.license.files[0]);
    }
    if (inputs.bankPassbook?.files?.[0]) {
      fd.append("bank_passbook", inputs.bankPassbook.files[0]);
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
    if (inputs.email) inputs.email.value = seller.email || "";
    if (inputs.address) inputs.address.value = seller.address || "";
    if (inputs.pincode) inputs.pincode.value = seller.pincode || "";
    if (inputs.phone) inputs.phone.value = seller.phone || "";
    if (inputs.altPhone) inputs.altPhone.value = seller.alt_phone || "";
    if (inputs.bankHolder) inputs.bankHolder.value = seller.bank_holder || seller.account_holder || "";
    if (inputs.bankAccount) inputs.bankAccount.value = seller.bank_account || seller.account_number || "";
    if (inputs.bankIfsc) inputs.bankIfsc.value = seller.bank_ifsc || seller.ifsc || "";
    if (inputs.bankName) inputs.bankName.value = seller.bank_name || seller.bank || "";
    if (inputs.bankBranch) inputs.bankBranch.value = seller.bank_branch || "";
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
    lockField(inputs.email, "email");
    lockField(inputs.phone, "phone");
    lockField(inputs.altPhone, "alt_phone");
    lockField(inputs.category, "category_id");
    lockField(inputs.address, "address");
    lockField(inputs.pincode, "pincode");
    lockField(inputs.ownerId, "owner_id_doc");
    lockField(inputs.license, "license_doc");
    lockField(inputs.bankPassbook, "bank_passbook");
    lockField(inputs.storePhoto, "store_photo");
    lockField(inputs.bankHolder, "bank_holder");
    lockField(inputs.bankAccount, "bank_account");
    lockField(inputs.bankIfsc, "bank_ifsc");
    lockField(inputs.bankName, "bank_name");
    lockField(inputs.bankBranch, "bank_branch");

    highlightMissingBank();
  }

  function highlightMissingBank() {
    const passbookLabel = inputs.bankPassbook?.closest("label");
    const holder = inputs.bankHolder;
    const account = inputs.bankAccount;
    const ifsc = inputs.bankIfsc;

    const missing = !(String(holder?.value || "").trim() &&
      String(account?.value || "").trim() &&
      String(ifsc?.value || "").trim());

    if (passbookLabel) {
      passbookLabel.classList.toggle("missing", missing);
    }
  }

  const sanitize = (v) => String(v || "").trim();
  const digitsOnly = (v) => String(v || "").replace(/\D/g, "");
  // Accept common formats like "91234 56789", "+91 9123456789", "09123456789"
  // by reducing to last 10 digits for validation/submission.
  const normalizeMobile10 = (v) => {
    const d = digitsOnly(v);
    if (!d) return "";
    if (d.length === 10) return d;
    if (d.length > 10) return d.slice(-10);
    return d; // <10 digits, let validator catch it
  };
  const hasTwoWords = (v) => sanitize(v).split(/\s+/).filter(Boolean).length >= 2;
  const isFullAddress = (v) => {
    const text = sanitize(v);
    if (text.length < 20) return false;
    const parts = text.split(",").map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) return false;
    const hasNumber = /\d/.test(text);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return hasNumber && wordCount >= 5;
  };
  const isValidIfsc = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v || "").trim().toUpperCase());
  const isValidAccount = (v) => /^[0-9]{9,18}$/.test(String(v || "").trim());

  const validateStep = (step) => {
    const editable = (el) => el && !el.disabled;

    if (step === 1) {
      if (editable(inputs.ownerName) && !sanitize(inputs.ownerName.value)) return "Owner name required";
      if (editable(inputs.email)) {
        const email = sanitize(inputs.email.value).toLowerCase();
        if (!email) return "Email required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Enter valid email address";
      }
      if (editable(inputs.phone)) {
        const phone = normalizeMobile10(inputs.phone.value);
        if (!/^[0-9]{10}$/.test(phone)) return "Enter valid 10-digit mobile number";
      }
      if (editable(inputs.altPhone)) {
        const alt = normalizeMobile10(inputs.altPhone.value);
        if (alt && !/^[0-9]{10}$/.test(alt)) return "Enter valid 10-digit alternate mobile number";
      }
      if (editable(inputs.password) && sanitize(inputs.password.value).length < 4) return "Password must be at least 4 characters";
    }

    if (step === 2) {
      if (editable(storeName) && !sanitize(storeName.value)) return "Store name required";
      if (editable(inputs.category) && !sanitize(inputs.category.value)) return "Select shop category";
      if (editable(inputs.pincode)) {
        if (!sanitize(inputs.pincode.value)) return "Pincode required";
        if (!/^[0-9]{6}$/.test(sanitize(inputs.pincode.value))) return "Enter valid 6-digit pincode";
      }
      if (editable(inputs.address)) {
        const address = sanitize(inputs.address.value);
        if (!address) return "Shop address required";
        if (!isFullAddress(address)) {
          return "Enter full address with shop no, area, city, state (use commas)";
        }
      }
    }

    if (step === 3) {
      if (editable(inputs.bankPassbook) && !inputs.bankPassbook?.files?.length) {
        return "Please upload bank passbook/cheque";
      }
    }

    if (step === 4) {
      if (editable(inputs.bankHolder) && !sanitize(inputs.bankHolder?.value)) return "Account holder name required";
      if (editable(inputs.bankAccount)) {
        const acc = sanitize(inputs.bankAccount?.value);
        if (!acc) return "Account number required";
        if (!isValidAccount(acc)) return "Enter valid account number (9-18 digits)";
      }
      if (editable(inputs.bankIfsc)) {
        const ifsc = sanitize(inputs.bankIfsc?.value);
        if (!ifsc) return "IFSC code required";
        if (!isValidIfsc(ifsc)) return "Enter valid IFSC (e.g., HDFC0ABC123)";
      }
      if (editable(inputs.bankName) && !sanitize(inputs.bankName?.value)) return "Bank name required";
    }

    return null;
  };

  function validateForm() {
    if (!isRegister) {
      const raw = sanitize(inputs.loginPhone?.value);
      const identifier = raw.includes("@") ? raw : normalizeMobile10(raw);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(identifier || "").trim().toLowerCase());
      const isPhone = /^[0-9]{10}$/.test(String(identifier || "").trim());
      if (!isEmail && !isPhone) return "Enter registered phone or email";

      if (otpMode === "login") {
        if (!/^[0-9]{6}$/.test(sanitize(inputs.sellerOtp?.value)))
          return "Enter valid 6-digit OTP";
      } else if (otpMode === "reset") {
        if (!/^[0-9]{6}$/.test(sanitize(inputs.sellerOtp?.value)))
          return "Enter valid 6-digit OTP";
        if (sanitize(sellerNewPassword?.value).length < 4)
          return "New password must be at least 4 characters";
      } else {
        if (sanitize(inputs.loginPassword?.value).length < 4)
          return "Password must be at least 4 characters";
      }

      return null;
    }

    for (let step = 1; step <= 4; step += 1) {
      const err = validateStep(step);
      if (err) return err;
    }

    return null;
  }

  const setStep = (step) => {
    currentStep = step;
    registerSteps.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === step));
    stepNodes.forEach(node => {
      const n = Number(node.dataset.step);
      node.classList.toggle("active", n === step);
      node.classList.toggle("done", n < step);
    });

    if (prevStepBtn) prevStepBtn.style.display = step === 1 ? "none" : "inline-flex";
    if (nextStepBtn) nextStepBtn.textContent = step === 5 ? (isResubmit ? "Resubmit" : "Submit") : "Next";
    if (step === 5) populateReview();
  };

  const populateReview = () => {
    if (!reviewBox) return;
    const items = [
      ["Owner Name", sanitize(inputs.ownerName?.value)],
      ["Email", sanitize(inputs.email?.value)],
      ["Mobile", sanitize(inputs.phone?.value)],
      ["Store Name", sanitize(storeName?.value)],
      ["Category", inputs.category?.selectedOptions?.[0]?.textContent || ""],
      ["Pincode", sanitize(inputs.pincode?.value)],
      ["Address", sanitize(inputs.address?.value)],
      ["Bank Holder", sanitize(inputs.bankHolder?.value)],
      ["Account", sanitize(inputs.bankAccount?.value)],
      ["IFSC", sanitize(inputs.bankIfsc?.value)],
      ["Bank", sanitize(inputs.bankName?.value)]
    ];
    reviewBox.innerHTML = items.map(([label, value]) => `
      <div class="review-item">
        <strong>${label}</strong>
        <span>${value || "-"}</span>
      </div>
    `).join("");
  };

  if (nextStepBtn) {
    nextStepBtn.addEventListener("click", async () => {
      const err = validateStep(currentStep);
      if (err) {
        showToast("Error", err, "error");
        setMessage(err, "#ef4444");
        return;
      }
      if (currentStep < 5) {
        setStep(currentStep + 1);
        return;
      }

      const finalErr = validateForm();
      if (finalErr) {
        showToast("Error", finalErr, "error");
        setMessage(finalErr, "#ef4444");
        return;
      }

      submitBtn.disabled = true;
      if (nextStepBtn) {
        nextStepBtn.disabled = true;
        nextStepBtn.textContent = "Processing...";
      }
      try {
        if (isResubmit) {
          await resubmitSeller();
        } else {
          await registerSeller();
        }
      } catch (err) {
        showToast("Error", err.message || "Server error", "error");
        setMessage(err.message || "Server error", "#ef4444");
      } finally {
        if (nextStepBtn) {
          nextStepBtn.disabled = false;
          nextStepBtn.textContent = isResubmit ? "Resubmit" : "Submit";
        }
        submitBtn.disabled = false;
      }
    });
  }

  if (prevStepBtn) {
    prevStepBtn.addEventListener("click", () => {
      if (currentStep > 1) setStep(currentStep - 1);
    });
  }

  setMode();
  bindVisibilityToggle(toggleLoginPassword, inputs.loginPassword, { show: "Show password", hide: "Hide password" });
  bindVisibilityToggle(toggleRegisterPassword, inputs.password, { show: "Show password", hide: "Hide password" });
  bindVisibilityToggle(toggleSellerOtp, inputs.sellerOtp, { show: "Show OTP", hide: "Hide OTP" });
  bindVisibilityToggle(toggleSellerNewPassword, sellerNewPassword, { show: "Show password", hide: "Hide password" });
  initFileLabels();
  loadCategories();
});

