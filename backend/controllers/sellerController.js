const db = require("../db/connection");
const bcrypt = require("bcrypt");
const { uploadToCloudinary, hasCloudinary } = require("../config/cloudinary");
const { sendOtpSms } = require("../utils/otpSender");
const { sendOtpEmail } = require("../utils/emailOtpSender");
const { buildAuthSession, ROLE_SELLER } = require("../utils/authTokens");
const dbp = db.promise();
const query = dbp.query.bind(dbp);
let sellerColumnsCache = null;
let productColumnsCache = null;
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const sellerOtpStore = new Map();
const sellerPasswordResetOtpStore = new Map();

const getSellerColumns = async () => {
  if (sellerColumnsCache) return sellerColumnsCache;
  const [rows] = await query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'sellers'
    `
  );
  sellerColumnsCache = new Set(rows.map(r => r.COLUMN_NAME));
  return sellerColumnsCache;
};

const pickColumns = (columns, data) => {
  const out = {};
  Object.keys(data).forEach((key) => {
    if (columns.has(key) && data[key] !== undefined) out[key] = data[key];
  });
  return out;
};

const normalizeUploadedFile = (file) => {
  if (!file) return null;
  const out = { ...file };
  out.storedRef = (() => {
    const secureValue = String(out.secure_url || out.url || "").trim();
    if (/^https?:\/\//i.test(secureValue)) return secureValue;
    const pathValue = String(out.path || "").trim();
    if (/^https?:\/\//i.test(pathValue)) return pathValue;
    return "";
  })();
  return out;
};

const getUploadedFile = (req, fieldName) => {
  if (!req) return null;
  if (Array.isArray(req.files)) {
    const f = req.files.find((f) => String(f.fieldname || "").trim() === String(fieldName || "").trim()) || null;
    return normalizeUploadedFile(f);
  }
  if (req.files && Array.isArray(req.files[fieldName])) {
    return normalizeUploadedFile(req.files[fieldName][0] || null);
  }
  if (req.file) {
    if (!fieldName) return normalizeUploadedFile(req.file);
    if (String(req.file.fieldname || "").trim() === String(fieldName).trim()) return normalizeUploadedFile(req.file);
  }
  return null;
};

const getUploadedFilesByNames = (req, fieldNames = []) => {
  const names = new Set(fieldNames.map((n) => String(n || "").trim()));
  if (Array.isArray(req?.files)) {
    return req.files
      .filter((f) => names.has(String(f.fieldname || "").trim()))
      .map(normalizeUploadedFile)
      .filter(Boolean);
  }
  const out = [];
  if (req?.files && typeof req.files === "object") {
    names.forEach((name) => {
      const arr = req.files[name];
      if (Array.isArray(arr)) out.push(...arr.map(normalizeUploadedFile).filter(Boolean));
    });
  }
  return out;
};

const getProductColumns = async () => {
  if (productColumnsCache) return productColumnsCache;
  const [rows] = await query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'products'
    `
  );
  productColumnsCache = new Set(rows.map(r => r.COLUMN_NAME));
  return productColumnsCache;
};

const ensureProductsImagesColumn = async () => {
  const columns = await getProductColumns();
  if (columns.has("images_json")) return columns;
  try {
    await query("ALTER TABLE products ADD COLUMN images_json TEXT NULL AFTER image");
    productColumnsCache = null;
    return getProductColumns();
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      productColumnsCache = null;
      return getProductColumns();
    }
    // If schema migration is not allowed, continue without images_json support.
    return columns;
  }
};

const parseProductImages = (row) => {
  const out = [];
  const pushSafe = (value) => {
    const name = String(value || "").trim();
    if (!name) return;
    if (!out.includes(name)) out.push(name);
  };

  if (row?.images_json) {
    try {
      const parsed = JSON.parse(row.images_json);
      if (Array.isArray(parsed)) parsed.forEach(pushSafe);
    } catch {}
  }

  pushSafe(row?.image);
  return out;
};

const isValidIfsc = (value) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || "").trim().toUpperCase());
const isValidAccount = (value) => /^[0-9]{9,18}$/.test(String(value || "").trim());
const isFullAddress = (value) => {
  const text = String(value || "").trim();
  if (text.length < 20) return false;
  const parts = text.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  const hasNumber = /\d/.test(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return hasNumber && wordCount >= 5;
};

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const sellerOtpKey = (phone) => String(phone || "").trim();

const issueSellerOtp = (phone) => {
  const key = sellerOtpKey(phone);
  const otp = generateOtp();
  sellerOtpStore.set(key, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS
  });
  return otp;
};

const verifySellerOtp = (phone, otp) => {
  const key = sellerOtpKey(phone);
  const rec = sellerOtpStore.get(key);
  if (!rec) return { ok: false, message: "OTP not requested" };
  if (Date.now() > rec.expiresAt) {
    sellerOtpStore.delete(key);
    return { ok: false, message: "OTP expired. Please request again." };
  }
  if (String(rec.otp) !== String(otp || "").trim()) {
    return { ok: false, message: "Invalid OTP" };
  }
  sellerOtpStore.delete(key);
  return { ok: true };
};

const issueSellerPasswordResetOtp = (phone) => {
  const key = sellerOtpKey(phone);
  const otp = generateOtp();
  sellerPasswordResetOtpStore.set(key, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS
  });
  return otp;
};

const verifySellerPasswordResetOtp = (phone, otp) => {
  const key = sellerOtpKey(phone);
  const rec = sellerPasswordResetOtpStore.get(key);
  if (!rec) return { ok: false, message: "OTP not requested" };
  if (Date.now() > rec.expiresAt) {
    sellerPasswordResetOtpStore.delete(key);
    return { ok: false, message: "OTP expired. Please request again." };
  }
  if (String(rec.otp) !== String(otp || "").trim()) {
    return { ok: false, message: "Invalid OTP" };
  }
  sellerPasswordResetOtpStore.delete(key);
  return { ok: true };
};

const isProdEnv = () => String(process.env.NODE_ENV || "").toLowerCase() === "production";
const shouldReturnDebugOtp = () =>
  !isProdEnv() &&
  ["1", "true", "yes", "y", "on"].includes(String(process.env.OTP_DEBUG_RETURN || "").trim().toLowerCase());

const listRequestFiles = (req) => {
  if (!req) return [];
  if (Array.isArray(req.files)) return req.files.filter(Boolean);
  if (req.files && typeof req.files === "object") {
    return Object.values(req.files).flat().filter(Boolean);
  }
  if (req.file) return [req.file];
  return [];
};

const hydrateRequestFilesWithCloudinary = async (req) => {
  if (!hasCloudinary) return;
  const files = listRequestFiles(req);
  await Promise.all(files.map(async (file) => {
    const uploaded = await uploadToCloudinary(file, { folder: "localbasket" });
    if (!uploaded?.secure_url) return;
    file.secure_url = uploaded.secure_url;
    file.url = uploaded.secure_url;
    file.path = uploaded.secure_url;
    if (uploaded.public_id) file.filename = uploaded.public_id;
  }));
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());
const isPhone10 = (value) => /^[0-9]{10}$/.test(String(value || "").trim());
const normalizeLoginIdentifier = (value) => String(value || "").trim().toLowerCase();

const fetchSellerByIdentifier = async (identifierRaw) => {
  const identifier = normalizeLoginIdentifier(identifierRaw);
  if (!identifier) return null;

  const isMail = isEmail(identifier);
  const isPhone = isPhone10(identifier);
  if (!isMail && !isPhone) return null;

  const where = isMail ? "s.email = ?" : "s.phone = ?";
  const [rows] = await query(
    `SELECT s.*, c.name AS category
     FROM sellers s
     JOIN categories c ON s.category_id = c.id
     WHERE ${where} LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
};

const fetchSellerByPhone = async (phone) => {
  const [rows] = await query(
    `SELECT s.*, c.name AS category
     FROM sellers s
     JOIN categories c ON s.category_id = c.id
     WHERE s.phone=? LIMIT 1`,
    [phone]
  );
  return rows[0] || null;
};

const buildSellerLoginPayload = (seller) => {
  if (!seller) {
    return {
      statusCode: 401,
      payload: { success: false, message: "Invalid credentials" }
    };
  }

  if (seller.account_status === "BLOCKED") {
    return {
      statusCode: 403,
      payload: { success: false, message: "Your account is blocked by admin" }
    };
  }

  if (seller.status !== "APPROVED") {
    return {
      statusCode: 200,
      payload: {
        success: true,
        status: seller.status,
      seller: {
        id: seller.id,
        store_name: seller.store_name,
        owner_name: seller.owner_name,
        phone: seller.phone,
        address: seller.address,
        category: seller.category,
        reject_reason: seller.reject_reason,
        bank_holder: seller.bank_holder || null,
        bank_account: seller.bank_account || null,
        bank_ifsc: seller.bank_ifsc || null,
        bank_name: seller.bank_name || null,
        bank_branch: seller.bank_branch || null
      }
    }
  };
  }

  const session = buildAuthSession({
    role: ROLE_SELLER,
    id: seller.id,
    phone: seller.phone,
    email: seller.email,
    name: seller.owner_name || seller.store_name
  });

  return {
    statusCode: 200,
    payload: {
      success: true,
      status: "APPROVED",
      token: session.token,
      auth: session,
      seller: {
        id: seller.id,
        store_name: seller.store_name,
        owner_name: seller.owner_name,
        email: seller.email,
        phone: seller.phone,
        category: seller.category,
        address: seller.address,
        pincode: seller.pincode,
        store_photo: seller.store_photo,
        is_online: seller.is_online,
        minimum_order: Number(seller.minimum_order || 100),
        bank_holder: seller.bank_holder || null,
        bank_account: seller.bank_account || null,
        bank_ifsc: seller.bank_ifsc || null,
        bank_name: seller.bank_name || null,
        bank_branch: seller.bank_branch || null
      }
    }
  };
};

/* =====================================================
   SELLER REGISTER
===================================================== */
exports.register = async (req, res) => {
  try {
    await hydrateRequestFilesWithCloudinary(req);
    const {
      store_name,
      owner_name,
      email,
      phone,
      address,
      pincode,
      password,
      category_id,
      alt_phone,
      bank_holder,
      bank_account,
      bank_ifsc,
      bank_name,
      bank_branch
    } = req.body;
    const normalizedPhone = String(phone || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase() || null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!store_name || !owner_name || !normalizedEmail || !normalizedPhone || !pincode || !password || !category_id) {
      return res.status(400).json({
        success: false,
        message: "Store name, owner name, email, phone, pincode, password and category are required"
      });
    }
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid email address"
      });
    }
    if (!address || !isFullAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "Full shop address required"
      });
    }
    if (!bank_holder || !bank_account || !bank_ifsc || !bank_name) {
      return res.status(400).json({
        success: false,
        message: "Bank details required"
      });
    }
    if (!getUploadedFile(req, "bank_passbook")?.storedRef) {
      return res.status(400).json({
        success: false,
        message: "Bank passbook/cheque required"
      });
    }
    if (!isValidAccount(bank_account)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account number"
      });
    }
    if (!isValidIfsc(bank_ifsc)) {
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC code"
      });
    }

    // Early duplicate check: return user-friendly message instead of raw SQL duplicate error.
    const duplicateSql = normalizedEmail
      ? "SELECT id, phone, email, status FROM sellers WHERE phone = ? OR email = ? LIMIT 1"
      : "SELECT id, phone, email, status FROM sellers WHERE phone = ? LIMIT 1";
    const duplicateParams = normalizedEmail ? [normalizedPhone, normalizedEmail] : [normalizedPhone];
    const [existingRows] = await query(duplicateSql, duplicateParams);
    const existing = existingRows?.[0];
    if (existing) {
      const isRejected = String(existing.status || "").toUpperCase() === "REJECTED";
      return res.status(409).json({
        success: false,
        code: "SELLER_ALREADY_EXISTS",
        status: String(existing.status || "PENDING").toUpperCase(),
        message: isRejected
          ? "This phone/email is already registered and was rejected. Please login and proceed to update."
          : "Phone or email already registered. Please login to continue."
      });
    }

    /* ✅ CHECK CATEGORY (ACTIVE ONLY) */
    const [cat] = await query(
      "SELECT id FROM categories WHERE id=? AND is_active=1",
      [category_id]
    );

    if (cat.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive category"
      });
    }

    const owner_id_doc = getUploadedFile(req, "owner_id_doc")?.storedRef || null;
    const license_doc  = getUploadedFile(req, "license_doc")?.storedRef || null;
    const bank_passbook = getUploadedFile(req, "bank_passbook")?.storedRef || null;
    const store_photo  = getUploadedFile(req, "store_photo")?.storedRef || null;

    // Owner ID optional; admin will verify later

    /* 🔐 HASH PASSWORD */
    const hashedPassword = await bcrypt.hash(password, 10);

    const columns = await getSellerColumns();
    const data = pickColumns(columns, {
      store_name,
      owner_name,
      email: normalizedEmail,
      phone: normalizedPhone,
      address,
      pincode,
      password: hashedPassword,
      owner_id_doc,
      license_doc,
      bank_passbook,
      store_photo,
      category_id,
      alt_phone: alt_phone || null,
      bank_holder,
      bank_account,
      bank_ifsc: String(bank_ifsc || "").trim().toUpperCase(),
      bank_name,
      // DB column is NOT NULL in current schema, keep empty string when optional input is missing.
      bank_branch: bank_branch ? String(bank_branch).trim() : "",
      status: "PENDING",
      reject_reason: null,
      is_online: 0,
      account_status: "ACTIVE"
    });

    const cols = Object.keys(data);
    const placeholders = cols.map(() => "?").join(",");
    const sql = `INSERT INTO sellers (${cols.join(",")}) VALUES (${placeholders})`;
    await query(sql, cols.map(k => data[k]));

    res.status(201).json({
      success: true,
      status: "PENDING",
      message: "Registration successful. Waiting for admin approval."
    });

  } catch (err) {
    console.error("❌ SELLER REGISTER ERROR:", err.sqlMessage || err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Phone or email already registered"
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
};

/* =====================================================
   SELLER LOGIN
===================================================== */
exports.login = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.phone || req.body.email || req.body.identifier || "");
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone/email and password required"
      });
    }

    const seller = await fetchSellerByIdentifier(identifier);
    if (!seller) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const storedPassword = String(seller.password || "");
    const looksHashed = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedPassword);
    let match = false;

    if (looksHashed) {
      match = await bcrypt.compare(password, storedPassword);
    } else {
      // Backward compatibility for legacy plain-text rows.
      match = storedPassword === password;
      if (match) {
        const upgradedHash = await bcrypt.hash(password, 10);
        await query(
          "UPDATE sellers SET password = ? WHERE id = ?",
          [upgradedHash, seller.id]
        );
      }
    }
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const out = buildSellerLoginPayload(seller);
    return res.status(out.statusCode).json(out.payload);

  } catch (err) {
    console.error("SELLER LOGIN ERROR:", err);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   REQUEST SELLER OTP LOGIN
   POST /api/seller/login-otp/request
===================================================== */
exports.requestLoginOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.phone || req.body.email || req.body.identifier || "");
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Registered phone or email is required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered phone or email"
      });
    }

    const seller = await fetchSellerByIdentifier(identifier);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller account not found"
      });
    }

    const phone = String(seller.phone || "").trim();
    const otp = issueSellerOtp(phone);
    const email = String(seller.email || "").trim().toLowerCase();
    const [mail, sms] = await Promise.all([
      sendOtpEmail({ to: email, otp }),
      sendOtpSms({ phone, otp })
    ]);

    const sentOn = [];
    if (mail.success) sentOn.push("email");
    if (sms.success) sentOn.push("SMS");

    if (!sentOn.length) {
      if (shouldReturnDebugOtp()) {
        console.warn("SELLER OTP DEBUG MODE: returning OTP in response (non-production only).", { mail, sms });
        return res.json({
          success: true,
          message: `OTP generated (debug): ${otp}`,
          debug_otp: otp
        });
      }
      return res.status(502).json({
        success: false,
        message: "OTP delivery failed on all channels",
        ...(isProdEnv() ? {} : { debug: { email: mail, sms } })
      });
    }

    return res.json({
      success: true,
      message: `OTP sent to your registered ${sentOn.join(" and ")}`
    });
  } catch (err) {
    console.error("SELLER OTP REQUEST ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Unable to send OTP"
    });
  }
};

/* =====================================================
   REQUEST SELLER PASSWORD RESET OTP
   POST /api/seller/password-reset/request
===================================================== */
exports.requestPasswordResetOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.phone || req.body.email || req.body.identifier || "");
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Registered phone or email is required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered phone or email"
      });
    }

    const seller = await fetchSellerByIdentifier(identifier);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller account not found"
      });
    }

    const phone = String(seller.phone || "").trim();
    const otp = issueSellerPasswordResetOtp(phone);
    const email = String(seller.email || "").trim().toLowerCase();
    const [mail, sms] = await Promise.all([
      sendOtpEmail({ to: email, otp }),
      sendOtpSms({ phone, otp })
    ]);

    const sentOn = [];
    if (mail.success) sentOn.push("email");
    if (sms.success) sentOn.push("SMS");

    if (!sentOn.length) {
      if (shouldReturnDebugOtp()) {
        console.warn("SELLER PASSWORD RESET OTP DEBUG MODE: returning OTP in response (non-production only).", { mail, sms });
        return res.json({
          success: true,
          message: `OTP generated (debug): ${otp}`,
          debug_otp: otp
        });
      }
      return res.status(502).json({
        success: false,
        message: "OTP delivery failed on all channels",
        ...(isProdEnv() ? {} : { debug: { email: mail, sms } })
      });
    }

    return res.json({
      success: true,
      message: `OTP sent to your registered ${sentOn.join(" and ")}`
    });
  } catch (err) {
    console.error("SELLER PASSWORD RESET OTP REQUEST ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to send OTP"
    });
  }
};

/* =====================================================
   RESET SELLER PASSWORD WITH OTP
   POST /api/seller/password-reset/verify
===================================================== */
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.phone || req.body.email || req.body.identifier || "");
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || req.body.password || "").trim();

    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Phone/email, OTP and new password are required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered phone or email"
      });
    }
    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid 6-digit OTP"
      });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 4 characters"
      });
    }

    const seller = await fetchSellerByIdentifier(identifier);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller account not found"
      });
    }

    const check = verifySellerPasswordResetOtp(String(seller.phone || "").trim(), otp);
    if (!check.ok) {
      return res.status(401).json({
        success: false,
        message: check.message
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query("UPDATE sellers SET password = ? WHERE id = ?", [hashedPassword, seller.id]);

    return res.json({
      success: true,
      message: "Password reset successful. Please login with new password."
    });
  } catch (err) {
    console.error("SELLER PASSWORD RESET VERIFY ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Password reset failed"
    });
  }
};

/* =====================================================
   VERIFY SELLER OTP LOGIN
   POST /api/seller/login-otp/verify
===================================================== */
exports.verifyLoginOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.phone || req.body.email || req.body.identifier || "");
    const otp = String(req.body.otp || "").trim();

    if (!identifier || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone/email and OTP are required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered phone or email"
      });
    }

    const seller = await fetchSellerByIdentifier(identifier);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller account not found"
      });
    }

    const check = verifySellerOtp(String(seller.phone || "").trim(), otp);
    if (!check.ok) {
      return res.status(401).json({
        success: false,
        message: check.message
      });
    }

    const out = buildSellerLoginPayload(seller);
    return res.status(out.statusCode).json(out.payload);
  } catch (err) {
    console.error("SELLER OTP VERIFY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "OTP login failed"
    });
  }
};

/* =====================================================
   SELLER RESUBMIT (AFTER REJECTION)
===================================================== */
exports.resubmit = async (req, res) => {
  try {
    await hydrateRequestFilesWithCloudinary(req);
    const sellerId = req.params.id;
    const {
      store_name,
      owner_name,
      email,
      phone,
      alt_phone,
      address,
      category_id,
      pincode,
      bank_holder,
      bank_account,
      bank_ifsc,
      bank_name,
      bank_branch
    } = req.body;

    if (!sellerId || !category_id) {
      return res.status(400).json({
        success: false,
        message: "Seller ID or category missing"
      });
    }

    const owner_id_doc = getUploadedFile(req, "owner_id_doc")?.storedRef || null;
    const license_doc  = getUploadedFile(req, "license_doc")?.storedRef || null;
    const bank_passbook = getUploadedFile(req, "bank_passbook")?.storedRef || null;
    const store_photo  = getUploadedFile(req, "store_photo")?.storedRef || null;

    if (address && !isFullAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "Full shop address required"
      });
    }
    if (bank_ifsc && !isValidIfsc(bank_ifsc)) {
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC code"
      });
    }
    if (bank_account && !isValidAccount(bank_account)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account number"
      });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").trim();
    const normalizedAltPhone = String(alt_phone || "").trim();

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
    }
    if (normalizedPhone && !/^[0-9]{10}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid 10-digit phone number"
      });
    }
    if (normalizedAltPhone && !/^[0-9]{10}$/.test(normalizedAltPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid 10-digit alternate phone number"
      });
    }

    if (normalizedPhone) {
      const [phoneDup] = await query(
        "SELECT id FROM sellers WHERE phone = ? AND id <> ? LIMIT 1",
        [normalizedPhone, sellerId]
      );
      if (Array.isArray(phoneDup) && phoneDup.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Phone already in use"
        });
      }
    }
    if (normalizedEmail) {
      const [emailDup] = await query(
        "SELECT id FROM sellers WHERE email = ? AND id <> ? LIMIT 1",
        [normalizedEmail, sellerId]
      );
      if (Array.isArray(emailDup) && emailDup.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already in use"
        });
      }
    }

    const columns = await getSellerColumns();
    const data = pickColumns(columns, {
      store_name,
      owner_name,
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      alt_phone: normalizedAltPhone || null,
      address,
      pincode: pincode || null,
      category_id,
      store_photo,
      owner_id_doc,
      license_doc,
      bank_passbook,
      bank_holder,
      bank_account,
      bank_ifsc: bank_ifsc ? String(bank_ifsc).trim().toUpperCase() : null,
      bank_name,
      bank_branch,
      status: "PENDING",
      reject_reason: null
    });

    const setSql = Object.keys(data).map(k => `${k} = COALESCE(?, ${k})`).join(", ");
    const sql = `UPDATE sellers SET ${setSql} WHERE id = ?`;
    const values = Object.keys(data).map(k => data[k]).concat([sellerId]);
    const [result] = await query(sql, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Seller not found"
      });
    }

    res.json({
      success: true,
      message: "Details resubmitted. Await admin verification."
    });

  } catch (err) {
    console.error("❌ SELLER RESUBMIT ERROR:", err);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   ADD PRODUCT
===================================================== */
exports.addProduct = async (req, res) => {
  const { seller_id, name, category, unit, price, stock, mrp } = req.body;

  if (!seller_id || !name || !category || !unit || !price || !stock) {
    return res.status(400).json({
      success: false,
      message: "All product fields are required"
    });
  }

  try {
    await hydrateRequestFilesWithCloudinary(req);
    const columns = await ensureProductsImagesColumn();
    const singleImage = getUploadedFile(req, "image")?.storedRef || null;
    const multiImages = getUploadedFilesByNames(req, ["image", "images", "images[]"])
      .map((f) => f.storedRef)
      .filter(Boolean);
    const allImages = [...new Set([singleImage, ...multiImages].filter(Boolean))];
    const primaryImage = allImages[0] || null;
    const subCategory = String(req.body.sub_category || "").trim();
    const description = String(req.body.description || subCategory || "").trim();

    const data = pickColumns(columns, {
      seller_id,
      name,
      category,
      unit,
      price,
      mrp: mrp || null,
      stock,
      image: primaryImage,
      images_json: allImages.length ? JSON.stringify(allImages) : null,
      sub_category: subCategory || null,
      description: description || null
    });

    const insertColumns = Object.keys(data);
    const placeholders = insertColumns.map(() => "?").join(", ");
    const sql = `
      INSERT INTO products (${insertColumns.join(", ")})
      VALUES (${placeholders})
    `;

    await query(sql, insertColumns.map((k) => data[k]));
    res.json({ success: true, message: "Product added successfully" });
  } catch (err) {
    console.error("❌ ADD PRODUCT ERROR:", err.sqlMessage || err.message || err);
    res.status(500).json({ success: false, message: "Database error" });
  }
};

/* =====================================================
   GET SELLER PRODUCTS
===================================================== */
exports.getMyProducts = (req, res) => {
  const { seller_id } = req.query;

  if (!seller_id) {
    return res.status(400).json({
      success: false,
      message: "Seller ID required"
    });
  }

  (async () => {
    try {
      const columns = await getProductColumns();
      const selectCols = [
        "id",
        "name",
        "category",
        "unit",
        "price",
        "mrp",
        "stock",
        "image",
        "created_at"
      ];

      if (columns.has("images_json")) selectCols.push("images_json");
      if (columns.has("description")) selectCols.push("description");
      if (columns.has("sub_category")) selectCols.push("sub_category");

      const sql = `
        SELECT ${selectCols.join(", ")}
        FROM products
        WHERE seller_id=?
        ORDER BY created_at DESC
      `;
      const [rows] = await query(sql, [seller_id]);
      const products = rows.map((row) => ({
        ...row,
        images: parseProductImages(row)
      }));
      res.json({ success: true, products });
    } catch (err) {
      console.error("❌ GET PRODUCTS ERROR:", err.sqlMessage || err.message || err);
      res.status(500).json({ success: false, products: [] });
    }
  })();
};

/* =====================================================
   SELLER ONLINE / OFFLINE
===================================================== */
exports.updateStatus = (req, res) => {
  const { seller_id, is_online } = req.body;

  if (!seller_id) {
    return res.status(400).json({
      success: false,
      message: "Seller ID missing"
    });
  }

  db.query(
    "UPDATE sellers SET is_online=? WHERE id=?",
    [is_online ? 1 : 0, seller_id],
    err => {
      if (err) {
        console.error("❌ SELLER STATUS ERROR:", err.sqlMessage);
        return res.status(500).json({ success: false });
      }
      res.json({ success: true, message: "Status updated successfully" });
    }
  );
};

/* =====================================================
   SELLER PROFILE UPDATE
===================================================== */
exports.updateProfile = async (req, res) => {
  try {
    await hydrateRequestFilesWithCloudinary(req);
    const sellerId = Number(req.body.seller_id);
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "Seller ID missing" });
    }

    const {
      owner_name,
      store_name,
      phone,
      email,
      address,
      bank_holder,
      bank_account,
      bank_ifsc,
      bank_name,
      bank_branch
    } = req.body;
    const minOrderRaw = req.body.minimum_order;
    const minimumOrder =
      minOrderRaw === undefined || minOrderRaw === null || String(minOrderRaw).trim() === ""
        ? null
        : Number(minOrderRaw);

    if (minimumOrder !== null && (!Number.isFinite(minimumOrder) || minimumOrder < 0)) {
      return res.status(400).json({
        success: false,
        message: "Minimum order must be a valid amount"
      });
    }

    const normalizedPhone = String(phone || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (normalizedPhone) {
      const [dupRows] = await query(
        "SELECT id FROM sellers WHERE phone = ? AND id <> ? LIMIT 1",
        [normalizedPhone, sellerId]
      );
      if (dupRows.length) {
        return res.status(409).json({
          success: false,
          message: "Phone already used by another seller"
        });
      }
    }
    if (normalizedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format"
        });
      }
      const [dupEmail] = await query(
        "SELECT id FROM sellers WHERE email = ? AND id <> ? LIMIT 1",
        [normalizedEmail, sellerId]
      );
      if (dupEmail.length) {
        return res.status(409).json({
          success: false,
          message: "Email already used by another seller"
        });
      }
    }

    if (bank_account && !isValidAccount(bank_account)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account number"
      });
    }
    if (bank_ifsc && !isValidIfsc(bank_ifsc)) {
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC code"
      });
    }

    const storePhoto = getUploadedFile(req, "store_photo")?.storedRef || null;
    const columns = await getSellerColumns();
    const data = pickColumns(columns, {
      owner_name: owner_name || null,
      store_name: store_name || null,
      phone: normalizedPhone || null,
      email: normalizedEmail || null,
      address: address || null,
      store_photo: storePhoto,
      minimum_order: minimumOrder === null ? null : Number(minimumOrder.toFixed(2)),
      bank_holder: bank_holder ? String(bank_holder).trim() : null,
      bank_account: bank_account ? String(bank_account).trim() : null,
      bank_ifsc: bank_ifsc ? String(bank_ifsc).trim().toUpperCase() : null,
      bank_name: bank_name ? String(bank_name).trim() : null,
      bank_branch: bank_branch ? String(bank_branch).trim() : null
    });

    const keys = Object.keys(data);
    if (!keys.length) {
      return res.status(400).json({ success: false, message: "No profile fields to update" });
    }

    const setSql = keys.map((k) => `${k} = COALESCE(?, ${k})`).join(", ");
    const sql = `UPDATE sellers SET ${setSql} WHERE id = ?`;
    const values = keys.map((k) => data[k]).concat([sellerId]);
    const [result] = await query(sql, values);

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    const [rows] = await query(
      "SELECT store_photo, minimum_order, email FROM sellers WHERE id = ? LIMIT 1",
      [sellerId]
    );
    const row = rows[0] || {};

    res.json({
      success: true,
      message: "Profile updated successfully",
      store_photo: row.store_photo || null,
      minimum_order: Number(row.minimum_order || 100),
      email: row.email || null
    });
  } catch (err) {
    console.error("❌ SELLER UPDATE PROFILE ERROR:", err.sqlMessage || err.message || err);
    res.status(500).json({ success: false, message: "Profile update failed" });
  }
};

/* =====================================================
   SELLER REMOVE STORE IMAGE
===================================================== */
exports.removeStoreImage = async (req, res) => {
  try {
    const sellerId = Number(req.body.seller_id);
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "Seller ID missing" });
    }

    const [result] = await query(
      "UPDATE sellers SET store_photo = NULL WHERE id = ?",
      [sellerId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    res.json({ success: true, message: "Store image removed" });
  } catch (err) {
    console.error("❌ SELLER REMOVE IMAGE ERROR:", err.sqlMessage || err.message || err);
    res.status(500).json({ success: false, message: "Failed to remove image" });
  }
};

/* =====================================================
   SELLER DASHBOARD
===================================================== */
exports.getDashboard = async (req, res) => {
  const sellerIdNum = Number(req.params.id);
  const sellerIdStr = String(req.params.id);

  if (!sellerIdNum) {
    return res.status(400).json({
      success: false,
      message: "Seller ID required"
    });
  }

  const getProductsCount = () =>
    new Promise((resolve, reject) => {
      db.query(
        "SELECT COUNT(*) AS total FROM products WHERE seller_id=?",
        [sellerIdNum],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows[0].total);
        }
      );
    });

  const getOrdersCount = () =>
    new Promise((resolve, reject) => {
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM orders
        WHERE
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(cart::jsonb, '[]'::jsonb)) AS item
            WHERE item->>'seller_id' = ?
               OR item->>'storeId' = ?
          )
        `,
        [String(sellerIdNum), sellerIdStr],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows[0].total);
        }
      );
    });

  try {
    const [totalProducts, totalOrders] = await Promise.all([
      getProductsCount(),
      getOrdersCount()
    ]);

    res.json({
      success: true,
      stats: { totalProducts, totalOrders }
    });
  } catch (err) {
    console.error("❌ SELLER DASHBOARD ERROR:", err.sqlMessage || err);
    res.status(500).json({
      success: false,
      message: "Dashboard failed"
    });
  }
};


