const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "localbasket_dev_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const ROLE_CUSTOMER = "customer";
const ROLE_SELLER = "seller";
const ROLE_ADMIN = "admin";

const getExpiryDate = () => {
  const raw = String(JWT_EXPIRES_IN || "").trim();
  const now = Date.now();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);

  const amount = Number(match[1] || 0);
  const unit = String(match[2] || "d").toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return new Date(now + amount * (multipliers[unit] || multipliers.d));
};

const signAuthToken = ({ role, id, phone = null, email = null, name = null }) => {
  return jwt.sign(
    {
      id,
      role,
      phone: phone || null,
      email: email || null,
      name: name || null
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const verifyAuthToken = (token) => jwt.verify(token, JWT_SECRET);

const readBearerToken = (headerValue) => {
  const header = String(headerValue || "").trim();
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

const buildAuthSession = ({ role, id, phone = null, email = null, name = null }) => {
  const token = signAuthToken({ role, id, phone, email, name });
  const expiresAt = getExpiryDate();
  return {
    token,
    token_type: "Bearer",
    expires_at: expiresAt.toISOString(),
    expires_in: JWT_EXPIRES_IN,
    role
  };
};

module.exports = {
  ROLE_ADMIN,
  ROLE_CUSTOMER,
  ROLE_SELLER,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  buildAuthSession,
  readBearerToken,
  signAuthToken,
  verifyAuthToken
};
