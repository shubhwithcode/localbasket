const {
  ROLE_ADMIN,
  ROLE_CUSTOMER,
  ROLE_SELLER,
  readBearerToken,
  verifyAuthToken
} = require("../utils/authTokens");

const makeRequireRole = (role, label) => (req, res, next) => {
  const token = readBearerToken(req.headers.authorization || "");
  if (!token) {
    return res.status(401).json({
      success: false,
      message: `Authorization token missing for ${label}`
    });
  }

  try {
    const payload = verifyAuthToken(token);
    if (payload?.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Invalid ${label} token`
      });
    }
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

const requireAdminAuth = makeRequireRole(ROLE_ADMIN, "admin");
const requireSellerAuth = makeRequireRole(ROLE_SELLER, "seller");
const requireCustomerAuth = makeRequireRole(ROLE_CUSTOMER, "customer");

const attachSellerId = (req, res, next) => {
  const sellerId = Number(req.auth?.id || 0);
  if (!sellerId) {
    return res.status(401).json({
      success: false,
      message: "Invalid seller session"
    });
  }

  const candidateValues = [
    req.body?.seller_id,
    req.query?.seller_id,
    req.params?.sellerId,
    req.params?.id
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map((value) => Number(value));

  const mismatch = candidateValues.some((value) => Number.isFinite(value) && value > 0 && value !== sellerId);
  if (mismatch) {
    return res.status(403).json({
      success: false,
      message: "Seller mismatch for authenticated session"
    });
  }

  req.body = { ...(req.body || {}), seller_id: sellerId };
  req.query = { ...(req.query || {}), seller_id: String(sellerId) };
  req.params = { ...(req.params || {}), sellerId: String(sellerId) };
  req.sellerId = sellerId;
  next();
};

module.exports = {
  requireAdminAuth,
  requireCustomerAuth,
  requireSellerAuth,
  attachSellerId
};
