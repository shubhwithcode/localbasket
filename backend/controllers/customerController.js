const db = require("../db/connection");
const bcrypt = require("bcrypt");
const util = require("util");
const https = require("https");
const nodemailer = require("nodemailer");
const { buildAuthSession, readBearerToken, verifyAuthToken, ROLE_CUSTOMER } = require("../utils/authTokens");

const query = util.promisify(db.query).bind(db);
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const customerOtpStore = new Map();

const signToken = (customer) => {
  return buildAuthSession({
    role: ROLE_CUSTOMER,
    id: customer.id,
    phone: customer.phone,
    email: customer.email,
    name: customer.name
  });
};

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const otpKey = (identifier) => String(identifier || "").trim().toLowerCase();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());
const isPhone10 = (value) => /^[0-9]{10}$/.test(String(value || "").trim());
const normalizeLoginIdentifier = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return "";
  if (isEmail(input)) return input.toLowerCase();
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return input;
};
const normalizeWhatsappPhone = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
};

const httpsPostJson = (url, payload, headers = {}) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: parsed
          });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const sendWhatsappOtp = async ({ phone, otp }) => {
  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  const phoneNumberId = String(process.env.PHONE_NUMBER_ID || "").trim();
  const templateName = String(process.env.WHATSAPP_TEMPLATE_NAME || "").trim();
  const templateLang = String(process.env.WHATSAPP_TEMPLATE_LANG || "en").trim();

  if (!token || !phoneNumberId) {
    return { success: false, message: "WhatsApp API config missing" };
  }

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`;
  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: otp }]
            }
          ]
        }
      }
    : {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: `Your LocalBasket OTP is ${otp}. Do not share it.` }
      };

  const res = await httpsPostJson(url, payload, {
    Authorization: `Bearer ${token}`
  });

  if (!res.ok) {
    return {
      success: false,
      message: "WhatsApp OTP delivery failed",
      details: res.body
    };
  }

  return { success: true };
};

const sendEmailOtp = async ({ email, otp }) => {
  const host = String(process.env.EMAIL_HOST || "").trim();
  const port = Number(process.env.EMAIL_PORT || 465);
  const secure = String(process.env.EMAIL_SECURE || "").trim()
    ? String(process.env.EMAIL_SECURE).toLowerCase() === "true"
    : port === 465;
  const user = String(process.env.EMAIL_USER || "").trim();
  const pass = String(process.env.EMAIL_PASS || "").trim();
  const from = String(process.env.EMAIL_FROM || "").trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO || "").trim();

  if (!host || !user || !pass || !from) {
    return {
      success: false,
      message: "Email SMTP config missing",
      details: {
        host_present: !!host,
        user_present: !!user,
        pass_present: !!pass,
        from_present: !!from
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 12000,
    tls: { minVersion: "TLSv1.2" }
  });

  try {
    // Some SMTP providers may fail verify() even though sendMail works; don't hard-fail here.
    try {
      await transporter.verify();
    } catch (err) {
      console.warn("EMAIL SMTP VERIFY FAILED:", err?.message || err);
    }
    await transporter.sendMail({
      from,
      to: email,
      ...(replyTo ? { replyTo } : {}),
      subject: "LocalBasket OTP Verification",
      text: `Your LocalBasket OTP is ${otp}. Do not share it.`
    });
    return { success: true };
  } catch (err) {
    const raw = err || {};
    const errText = String(raw?.message || raw || "");
    const needsVerifyHint =
      /sender|from|domain|verify|verified|unauthorized|forbidden/i.test(errText) ||
      /550|553|554/.test(String(raw?.responseCode || ""));
    return {
      success: false,
      message: "Email OTP delivery failed",
      details: {
        message: errText,
        code: raw?.code || null,
        command: raw?.command || null,
        responseCode: raw?.responseCode || null,
        response: raw?.response || null,
        hint: needsVerifyHint
          ? "Check EMAIL_FROM sender/domain is verified with your SMTP provider (e.g., Resend)."
          : null
      }
    };
  }
};

const isProductionEnv = () => String(process.env.NODE_ENV || "").toLowerCase() === "production";
const isTruthyEnv = (value) => ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
const shouldReturnDebugOtp = () => !isProductionEnv() && isTruthyEnv(process.env.OTP_DEBUG_RETURN);

const issueCustomerOtp = (identifier) => {
  const key = otpKey(identifier);
  const otp = generateOtp();
  customerOtpStore.set(key, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS
  });
  return otp;
};

const verifyCustomerOtp = (identifier, otp) => {
  const key = otpKey(identifier);
  const rec = customerOtpStore.get(key);
  if (!rec) return { ok: false, message: "OTP not requested" };
  if (Date.now() > rec.expiresAt) {
    customerOtpStore.delete(key);
    return { ok: false, message: "OTP expired. Please request again." };
  }
  if (String(rec.otp) !== String(otp || "").trim()) {
    return { ok: false, message: "Invalid OTP" };
  }
  customerOtpStore.delete(key);
  return { ok: true };
};

/* =====================================================
   REGISTER CUSTOMER
   POST /api/customer/register
===================================================== */
exports.register = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone and password are required"
      });
    }
    if (!isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid email address"
      });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid 10-digit phone number"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO customers (name, email, phone, password)
       VALUES (?, ?, ?, ?)`,
      [name, email, phone, hashedPassword]
    );

    const user = {
      id: result.insertId,
      name,
      email,
      phone
    };

    const session = signToken(user);

    res.status(201).json({
      success: true,
      message: "Customer registered successfully",
      token: session.token,
      auth: session,
      user
    });
  } catch (err) {
    console.error("CUSTOMER REGISTER ERROR:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email or phone already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
};

/* =====================================================
   LOGIN CUSTOMER
   POST /api/customer/login
===================================================== */
exports.login = async (req, res) => {
  try {
    const identifierRaw = String(req.body.identifier || "").trim();
    const identifier = normalizeLoginIdentifier(identifierRaw);
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone and password are required"
      });
    }

    const rows = await query(
      `SELECT id, name, email, phone, password
       FROM customers
       WHERE email = ? OR phone = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const customer = rows[0];
    const storedPassword = String(customer.password || "");
    const looksHashed = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedPassword);
    let isMatch = false;

    if (looksHashed) {
      isMatch = await bcrypt.compare(password, storedPassword);
    } else {
      // Backward compatibility for legacy plain-text rows.
      isMatch = storedPassword === password;
      if (isMatch) {
        const upgradedHash = await bcrypt.hash(password, 10);
        await query(
          "UPDATE customers SET password = ? WHERE id = ?",
          [upgradedHash, customer.id]
        );
      }
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const user = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    };

    const session = signToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token: session.token,
      auth: session,
      user
    });
  } catch (err) {
    console.error("CUSTOMER LOGIN ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
};

/* =====================================================
   REQUEST CUSTOMER OTP LOGIN
   POST /api/customer/login-otp/request
===================================================== */
exports.requestLoginOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.email || req.body.phone || req.body.identifier || "");
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Registered email or phone is required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered email or phone"
      });
    }

    const rows = await query(
      `SELECT id, phone, email
       FROM customers
       WHERE email = ? OR phone = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Wrong input. Email/phone is not registered"
      });
    }

    const customer = rows[0];
    const targetEmail = String(customer.email || "").trim().toLowerCase();
    if (!isEmail(targetEmail)) {
      return res.status(400).json({
        success: false,
        message: "Customer email missing or invalid in account"
      });
    }

    const otp = issueCustomerOtp(targetEmail);
    const whatsappPhone = normalizeWhatsappPhone(customer.phone);
    const [mail, whatsapp] = await Promise.all([
      sendEmailOtp({ email: targetEmail, otp }),
      whatsappPhone
        ? sendWhatsappOtp({ phone: whatsappPhone, otp })
        : Promise.resolve({ success: false, message: "Registered phone missing or invalid" })
    ]);

    if (!mail.success) console.error("CUSTOMER EMAIL OTP FAILURE:", mail);
    if (!whatsapp.success) console.error("CUSTOMER WHATSAPP OTP FAILURE:", whatsapp);

    const sentOn = [];
    if (mail.success) sentOn.push("email");
    if (whatsapp.success) sentOn.push("WhatsApp");

    if (!sentOn.length) {
      if (shouldReturnDebugOtp()) {
        console.warn("CUSTOMER OTP DEBUG MODE: returning OTP in response (non-production only).");
        return res.json({
          success: true,
          message: `OTP generated (debug): ${otp}`,
          customer_id: customer.id,
          debug_otp: otp
        });
      }
      return res.status(502).json({
        success: false,
        message: "OTP delivery failed on all channels",
        ...(isProductionEnv() ? {} : { debug: { email: mail, whatsapp } })
      });
    }

    res.json({
      success: true,
      message: `OTP sent to your registered ${sentOn.join(" and ")}`,
      customer_id: customer.id
    });
  } catch (err) {
    console.error("CUSTOMER OTP REQUEST ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Unable to send OTP"
    });
  }
};

/* =====================================================
   VERIFY CUSTOMER OTP LOGIN
   POST /api/customer/login-otp/verify
===================================================== */
exports.verifyLoginOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(req.body.email || req.body.phone || req.body.identifier || "");
    const otp = String(req.body.otp || "").trim();

    if (!identifier || !otp) {
      return res.status(400).json({
        success: false,
        message: "Registered email/phone and OTP are required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered email or phone"
      });
    }

    const rows = await query(
      `SELECT id, name, email, phone
       FROM customers
       WHERE email = ? OR phone = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found"
      });
    }

    const customer = rows[0];
    const check = verifyCustomerOtp(customer.email, otp);
    if (!check.ok) {
      return res.status(401).json({
        success: false,
        message: check.message
      });
    }

    const user = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    };
    const session = signToken(user);

    res.json({
      success: true,
      message: "OTP login successful",
      token: session.token,
      auth: session,
      user
    });
  } catch (err) {
    console.error("CUSTOMER OTP VERIFY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "OTP login failed"
    });
  }
};

/* =====================================================
   REQUEST PASSWORD RESET OTP
   POST /api/customer/password-reset/request
===================================================== */
exports.requestPasswordResetOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(
      req.body.email || req.body.phone || req.body.identifier || ""
    );
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Registered email or phone is required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered email or phone"
      });
    }

    const rows = await query(
      `SELECT id, phone, email
       FROM customers
       WHERE email = ? OR phone = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Wrong input. Email/phone is not registered"
      });
    }

    const customer = rows[0];
    const targetEmail = String(customer.email || "").trim().toLowerCase();
    if (!isEmail(targetEmail)) {
      return res.status(400).json({
        success: false,
        message: "Customer email missing or invalid in account"
      });
    }

    const otp = issueCustomerOtp(targetEmail);
    const whatsappPhone = normalizeWhatsappPhone(customer.phone);
    const [mail, whatsapp] = await Promise.all([
      sendEmailOtp({ email: targetEmail, otp }),
      whatsappPhone
        ? sendWhatsappOtp({ phone: whatsappPhone, otp })
        : Promise.resolve({ success: false, message: "Registered phone missing or invalid" })
    ]);

    if (!mail.success) console.error("CUSTOMER PASSWORD RESET EMAIL OTP FAILURE:", mail);
    if (!whatsapp.success) console.error("CUSTOMER PASSWORD RESET WHATSAPP OTP FAILURE:", whatsapp);

    const sentOn = [];
    if (mail.success) sentOn.push("email");
    if (whatsapp.success) sentOn.push("WhatsApp");

    if (!sentOn.length) {
      if (shouldReturnDebugOtp()) {
        console.warn("CUSTOMER PASSWORD RESET OTP DEBUG MODE: returning OTP in response (non-production only).");
        return res.json({
          success: true,
          message: `OTP generated (debug): ${otp}`,
          customer_id: customer.id,
          debug_otp: otp
        });
      }
      const payload = {
        success: false,
        message: "Unable to send OTP right now. Please try again."
      };
      // Provide debug info only in non-production to help setup SMTP/WhatsApp.
      if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        payload.debug = { email: mail, whatsapp };
      }
      return res.status(502).json(payload);
    }

    res.json({
      success: true,
      message: `OTP sent to your registered ${sentOn.join(" and ")}`,
      customer_id: customer.id
    });
  } catch (err) {
    console.error("CUSTOMER PASSWORD RESET OTP REQUEST ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Unable to send OTP"
    });
  }
};

/* =====================================================
   RESET PASSWORD WITH OTP
   POST /api/customer/password-reset/verify
===================================================== */
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const identifier = normalizeLoginIdentifier(
      req.body.email || req.body.phone || req.body.identifier || ""
    );
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || req.body.password || "").trim();

    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Registered email/phone, OTP and new password are required"
      });
    }
    if (!isEmail(identifier) && !isPhone10(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Wrong input. Enter valid registered email or phone"
      });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 4 characters"
      });
    }

    const rows = await query(
      `SELECT id, email
       FROM customers
       WHERE email = ? OR phone = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found"
      });
    }

    const customer = rows[0];
    const check = verifyCustomerOtp(customer.email, otp);
    if (!check.ok) {
      return res.status(401).json({
        success: false,
        message: check.message
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query("UPDATE customers SET password = ? WHERE id = ?", [
      hashedPassword,
      customer.id
    ]);

    res.json({
      success: true,
      message: "Password reset successful. Please login with new password."
    });
  } catch (err) {
    console.error("CUSTOMER PASSWORD RESET VERIFY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Password reset failed"
    });
  }
};

/* =====================================================
   UPDATE CUSTOMER PROFILE
   PUT /api/customer/profile
===================================================== */
exports.updateProfile = async (req, res) => {
  try {
    const id = Number(req.body.id || req.user?.id);
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    if (!id || !name || !email) {
      return res.status(400).json({
        success: false,
        message: "Customer id, name and email are required"
      });
    }

    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      await query(
        `UPDATE customers
         SET name = ?, email = ?, phone = ?, password = ?
         WHERE id = ?`,
        [name, email, phone || null, hashedPassword, id]
      );

      return res.json({
        success: true,
        message: "Profile and password updated successfully"
      });
    }

    await query(
      `UPDATE customers
       SET name = ?, email = ?, phone = ?
       WHERE id = ?`,
      [name, email, phone || null, id]
    );

    res.json({
      success: true,
      message: "Profile updated successfully"
    });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email or phone already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Profile update failed"
    });
  }
};

/* =====================================================
   AUTH MIDDLEWARE
===================================================== */
exports.requireAuth = (req, res, next) => {
  const token = readBearerToken(req.headers.authorization || "");

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authorization token missing"
    });
  }

  try {
    const payload = verifyAuthToken(token);
    if (payload?.role !== ROLE_CUSTOMER) {
      return res.status(403).json({
        success: false,
        message: "Invalid customer token"
      });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};
