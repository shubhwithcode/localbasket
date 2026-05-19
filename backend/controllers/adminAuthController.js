const db = require("../db/connection");
const util = require("util");
const { sendOtpEmail } = require("../utils/emailOtpSender");
const { buildAuthSession, ROLE_ADMIN } = require("../utils/authTokens");

const query = util.promisify(db.query).bind(db);

const OTP_TTL_MINUTES = 5;
const ADMIN_OTP_PHONE_KEY = "ADMIN";
const ADMIN_EMAIL = String(process.env.ADMIN_OTP_EMAIL || "localbasket.helpdesk@gmail.com").trim().toLowerCase();

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim().toLowerCase());
const isProductionEnv = () => String(process.env.NODE_ENV || "").toLowerCase() === "production";
const isTruthyEnv = (value) => ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
const shouldReturnDebugOtp = () => !isProductionEnv() && isTruthyEnv(process.env.OTP_DEBUG_RETURN);
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

exports.requestAdminOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!ADMIN_EMAIL || !isEmail(ADMIN_EMAIL)) {
      return res.status(500).json({ success: false, message: "Admin OTP email is not configured" });
    }
    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: "valid email is required" });
    }
    if (email !== ADMIN_EMAIL) {
      return res.status(403).json({ success: false, message: "Unauthorized admin email" });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const mail = await sendOtpEmail({
      to: ADMIN_EMAIL,
      otp,
      subject: "LocalBasket Admin OTP",
      text: `Your LocalBasket Admin OTP is ${otp}. It will expire in ${OTP_TTL_MINUTES} minutes. Do not share it.`
    });

    if (!mail?.success) {
      if (shouldReturnDebugOtp()) {
        return res.json({ success: true, message: `OTP generated (debug): ${otp}`, debug_otp: otp });
      }
      return res.status(502).json({ success: false, message: mail?.message || "Email OTP delivery failed" });
    }

    await query("DELETE FROM otp_verifications WHERE expires_at < NOW()");
    await query(
      `INSERT INTO otp_verifications (phone, email, otp, expires_at)
       VALUES (?, ?, ?, ?)`,
      [ADMIN_OTP_PHONE_KEY, ADMIN_EMAIL, otp, expiresAt]
    );

    return res.json({
      success: true,
      message: `OTP sent to ${ADMIN_EMAIL}`,
      expires_in_seconds: OTP_TTL_MINUTES * 60
    });
  } catch (err) {
    console.error("ADMIN OTP REQUEST ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to send admin OTP" });
  }
};

exports.verifyAdminOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }
    if (!isEmail(email) || email !== ADMIN_EMAIL) {
      return res.status(403).json({ success: false, message: "Unauthorized admin email" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: "6-digit otp is required" });
    }

    const rows = await query(
      `SELECT id, expires_at
       FROM otp_verifications
       WHERE phone = ? AND email = ? AND otp = ?
       ORDER BY id DESC
       LIMIT 1`,
      [ADMIN_OTP_PHONE_KEY, ADMIN_EMAIL, otp]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    const record = rows[0];
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await query("DELETE FROM otp_verifications WHERE id = ?", [record.id]);
      return res.status(401).json({ success: false, message: "OTP expired" });
    }

    await query("DELETE FROM otp_verifications WHERE id = ?", [record.id]);

    const session = buildAuthSession({
      role: ROLE_ADMIN,
      id: "admin",
      email: ADMIN_EMAIL,
      name: "Admin"
    });

    return res.json({
      success: true,
      message: "Admin OTP verified",
      admin_email: ADMIN_EMAIL,
      token: session.token,
      auth: session
    });
  } catch (err) {
    console.error("ADMIN OTP VERIFY ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to verify admin OTP" });
  }
};
