const express = require("express");
const router = express.Router();

console.log("🔥 Admin Routes Loaded");

/* ================= CONTROLLER ================= */
const adminController = require("../controllers/adminController");
const { requestAdminOtp, verifyAdminOtp } = require("../controllers/adminAuthController");
const upload = require("../middlewares/upload");
const { requireAdminAuth } = require("../middlewares/auth");

const {
  getDashboardStats,
  getFullReport,
  downloadFullReportPdf,
  getPayments,
  releasePayout,
  getAllSellers,
  getPendingSellers,
  approveSeller,
  rejectSeller,
  updateSellerStatus,
  blockSeller,
  updateCommission,
  getAllOrders,
  getOrderDetails,
  saveGlobalCommission,
  savePayoutSettings,
  saveSystemSettings,
  saveDiscoverySettings,
  saveHeroSettings,
  saveMobilePromoSettings,
  saveHeroImage,
  saveHeroImages,
  saveHeroImagesMeta,
  removeHeroImageItem,
  clearHeroImages,
  removeHeroImage,
  getAllSettings,
  getSupportRequests,
  resolveSupportRequest,
  getCustomers,
  blockCustomer,
  unblockCustomer,
  deleteCustomer,
  // ✅ CATEGORY
  getCategories,
  addCategory,
  toggleCategoryStatus,
  deleteCategory
} = adminController;

/* =====================================================
   ADMIN ROUTES
   BASE URL: /api/admin
===================================================== */

/* ================= ADMIN AUTH (EMAIL OTP) ================= */
// POST /api/admin/auth/otp/request
router.post("/auth/otp/request", requestAdminOtp);
// POST /api/admin/auth/otp/verify
router.post("/auth/otp/verify", verifyAdminOtp);

router.use(requireAdminAuth);

/* ================= DASHBOARD ================= */

// GET /api/admin/dashboard
router.get("/dashboard", getDashboardStats);

// GET /api/admin/full-report
router.get("/full-report", getFullReport);
// GET /api/admin/full-report/pdf
router.get("/full-report/pdf", downloadFullReportPdf);

// GET /api/admin/support/requests?status=OPEN|RESOLVED|ALL&limit=200
router.get("/support/requests", getSupportRequests);
// PUT /api/admin/support/requests/:id/resolve
router.put("/support/requests/:id/resolve", resolveSupportRequest);

// GET /api/admin/customers?search=&status=ALL|ACTIVE|BLOCKED&limit=200
router.get("/customers", getCustomers);
// PUT /api/admin/customers/:id/block
router.put("/customers/:id/block", blockCustomer);
// PUT /api/admin/customers/:id/unblock
router.put("/customers/:id/unblock", unblockCustomer);
// DELETE /api/admin/customers/:id
router.delete("/customers/:id", deleteCustomer);

// GET /api/admin/payments
router.get("/payments", getPayments);
// POST /api/admin/payments/release
router.post("/payments/release", releasePayout);

/* ================= SELLER MANAGEMENT ================= */

// MASTER SELLER LIST
// GET /api/admin/sellers
router.get("/sellers", getAllSellers);

// GET /api/admin/sellers/pending
router.get("/sellers/pending", getPendingSellers);

// POST /api/admin/sellers/:id/approve
router.post("/sellers/:id/approve", (req, res) =>
  approveSeller({ ...req, body: { seller_id: req.params.id } }, res)
);

// POST /api/admin/sellers/:id/reject
router.post("/sellers/:id/reject", (req, res) =>
  rejectSeller({
    ...req,
    body: {
      seller_id: req.params.id,
      reason: req.body.reason
    }
  }, res)
);

// GENERIC STATUS UPDATE
// POST /api/admin/sellers/status
router.post("/sellers/status", updateSellerStatus);

// BLOCK / UNBLOCK SELLER
// POST /api/admin/sellers/block
router.post("/sellers/block", blockSeller);

// UPDATE SELLER COMMISSION
// POST /api/admin/sellers/commission
router.post("/sellers/commission", updateCommission);

/* ================= ORDERS ================= */

// GET /api/admin/orders
router.get("/orders", getAllOrders);

// GET /api/admin/orders/:id
router.get("/orders/:id", getOrderDetails);

/* ================= SETTINGS ================= */

// POST /api/admin/settings/commission
router.post("/settings/commission", saveGlobalCommission);
// POST /api/admin/settings/payout
router.post("/settings/payout", savePayoutSettings);
// POST /api/admin/settings/system
router.post("/settings/system", saveSystemSettings);
// POST /api/admin/settings/discovery
router.post("/settings/discovery", saveDiscoverySettings);
// POST /api/admin/settings/hero
router.post("/settings/hero", saveHeroSettings);
// POST /api/admin/settings/mobile-promo
router.post("/settings/mobile-promo", saveMobilePromoSettings);
// POST /api/admin/settings/hero-image
router.post("/settings/hero-image", upload.single("hero_image"), saveHeroImage);
// POST /api/admin/settings/hero-image/remove
router.post("/settings/hero-image/remove", removeHeroImage);
// POST /api/admin/settings/hero-images
router.post("/settings/hero-images", upload.array("hero_images", 200), saveHeroImages);
// POST /api/admin/settings/hero-images/meta
router.post("/settings/hero-images/meta", saveHeroImagesMeta);
// POST /api/admin/settings/hero-images/remove
router.post("/settings/hero-images/remove", removeHeroImageItem);
// POST /api/admin/settings/hero-images/clear
router.post("/settings/hero-images/clear", clearHeroImages);

// GET /api/admin/settings
router.get("/settings", getAllSettings);

/* ================= CATEGORIES ================= */

// GET /api/admin/categories
router.get("/categories", getCategories);

// POST /api/admin/categories
router.post("/categories", addCategory);

// PUT /api/admin/categories/:id/status
router.put("/categories/:id/status", toggleCategoryStatus);

// DELETE /api/admin/categories/:id
router.delete("/categories/:id", deleteCategory);

/* =====================================================
   EXPORT
===================================================== */
module.exports = router;



