const express = require("express");
const router = express.Router();

const upload = require("../middlewares/upload");
const db = require("../db/connection");
const { uploadToCloudinary, hasCloudinary } = require("../config/cloudinary");
const { requireSellerAuth, attachSellerId } = require("../middlewares/auth");

/* ================= CONTROLLER ================= */
const sellerController = require("../controllers/sellerController");

const {
  register,
  login,
  requestLoginOtp,
  verifyLoginOtp,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  resubmit,
  addProduct,
  getMyProducts,
  getDashboard,
  updateStatus,
  updateProfile,
  removeStoreImage
} = sellerController;

/* =====================================================
   1️⃣ SELLER AUTH
===================================================== */

// REGISTER SELLER
router.post(
  "/register",
  upload.any(),
  register
);

// LOGIN SELLER
router.post("/login", login);
router.post("/login-otp/request", requestLoginOtp);
router.post("/login-otp/verify", verifyLoginOtp);
router.post("/password-reset/request", requestPasswordResetOtp);
router.post("/password-reset/verify", resetPasswordWithOtp);
router.post("/forgot-password/request", requestPasswordResetOtp);
router.post("/forgot-password/verify", resetPasswordWithOtp);
router.post("/request-otp", requestLoginOtp);
router.post("/otp/request", requestLoginOtp);
router.post("/verify-otp", verifyLoginOtp);
router.post("/otp/verify", verifyLoginOtp);

// RESUBMIT AFTER REJECTION
router.put(
  "/resubmit/:id",
  upload.any(),
  resubmit
);

/* =====================================================
   2️⃣ SELLER ONLINE / OFFLINE
===================================================== */

// PUT /api/seller/status
router.put("/status", requireSellerAuth, attachSellerId, updateStatus);
router.post("/update-profile", requireSellerAuth, attachSellerId, upload.any(), updateProfile);
router.post("/remove-store-image", requireSellerAuth, attachSellerId, removeStoreImage);

/* =====================================================
   3️⃣ PRODUCT MANAGEMENT
===================================================== */

// ADD PRODUCT
router.post(
  "/products",
  requireSellerAuth,
  attachSellerId,
  upload.array("image", 8),
  addProduct
);

// GET SELLER PRODUCTS
// GET /api/seller/products?seller_id=1
router.get("/products", requireSellerAuth, attachSellerId, getMyProducts);

// UPDATE PRODUCT (supports unit + optional image update)
const getUploadedFilesByNames = (req, fieldNames = []) => {
  const names = new Set(fieldNames.map((n) => String(n || "").trim()));
  if (Array.isArray(req?.files)) {
    return req.files.filter((f) => names.has(String(f.fieldname || "").trim()));
  }
  const out = [];
  if (req?.files && typeof req.files === "object") {
    names.forEach((name) => {
      const arr = req.files[name];
      if (Array.isArray(arr)) out.push(...arr);
    });
  }
  return out;
};

const getStoredFileRef = (file) => {
  if (!file) return "";
  const secureValue = String(file.secure_url || file.url || "").trim();
  if (/^https?:\/\//i.test(secureValue)) return secureValue;
  const pathValue = String(file.path || "").trim();
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  return "";
};

const hydrateRouteFilesWithCloudinary = async (req) => {
  if (!hasCloudinary) return;
  const files = Array.isArray(req?.files) ? req.files : [];
  await Promise.all(files.map(async (file) => {
    const uploaded = await uploadToCloudinary(file, { folder: "localbasket" });
    if (!uploaded?.secure_url) return;
    file.secure_url = uploaded.secure_url;
    file.url = uploaded.secure_url;
    file.path = uploaded.secure_url;
    if (uploaded.public_id) file.filename = uploaded.public_id;
  }));
};

router.put("/products/:id", requireSellerAuth, upload.array("image", 8), async (req, res) => {
  const productId = Number(req.params.id);
  const { name, price, stock, mrp, unit } = req.body;
  const sellerId = Number(req.auth?.id || 0);

  if (!productId || !name || price === undefined || stock === undefined || !unit) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  await hydrateRouteFilesWithCloudinary(req);

  const images = getUploadedFilesByNames(req, ["image", "images", "images[]"])
    .map((f) => getStoredFileRef(f))
    .filter(Boolean);
  const hasImages = images.length > 0;
  let hasImagesJson = false;

  try {
    const [cols] = await db.promise().query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'products'
        AND column_name = 'images_json'
      LIMIT 1
      `
    );
    hasImagesJson = Array.isArray(cols) && cols.length > 0;
  } catch {
    hasImagesJson = false;
  }

  const setCols = ["name = ?", "price = ?", "mrp = ?", "stock = ?", "unit = ?"];
  const params = [name, price, mrp || null, stock, unit];

  if (hasImages) {
    setCols.push("image = ?");
    params.push(images[0]);
    if (hasImagesJson) {
      setCols.push("images_json = ?");
      params.push(JSON.stringify(images));
    }
  }

  const sql = `UPDATE products SET ${setCols.join(", ")} WHERE id = ? AND seller_id = ?`;
  params.push(productId, sellerId);

  try {
    const [result] = await db.promise().query(sql, params);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    res.json({
      success: true,
      message: "Product updated successfully"
    });
  } catch (err) {
    console.error("UPDATE PRODUCT ERROR:", err.sqlMessage || err.message || err);
    return res.status(500).json({
      success: false,
      message: "Database error"
    });
  }
});

// DELETE PRODUCT
router.delete("/products/:id", requireSellerAuth, (req, res) => {
  const productId = Number(req.params.id);
  const sellerId = Number(req.auth?.id || 0);

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Invalid product id"
    });
  }

  db.query(
    "DELETE FROM products WHERE id = ? AND seller_id = ?",
    [productId, sellerId],
    (err, result) => {
      if (err) {
        console.error("❌ DELETE PRODUCT ERROR:", err.sqlMessage);
        return res.status(500).json({
          success: false,
          message: "Database error"
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      res.json({
        success: true,
        message: "Product deleted successfully"
      });
    }
  );
});

/* =====================================================
   4️⃣ SELLER DASHBOARD
===================================================== */

// GET /api/seller/dashboard/:id
router.get("/dashboard/:id", requireSellerAuth, attachSellerId, getDashboard);

/* =====================================================
   5️⃣ SELLER ORDERS (JSON CART SUPPORT)
===================================================== */

// GET /api/seller/orders/:sellerId
router.get("/orders/:sellerId", requireSellerAuth, attachSellerId, (req, res) => {
  const sellerIdNum = Number(req.params.sellerId);
  const sellerIdStr = String(req.params.sellerId);

  const sql = `
    SELECT
      id,
      customer_name,
      phone,
      address,
      pincode,
      total_amount,
      payment_method,
      payment_status,
      status,
      cancelled_by,
      cancelled_by_role,
      cancel_actor,
      rejected_by,
      rejected_by_role,
      status_updated_by,
      reason,
      cancel_reason,
      customer_reason,
      seller_reason,
      status_reason,
      reject_reason,
      rejection_reason,
      cancellation_reason,
      created_at,
      cart
    FROM orders
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(cart::jsonb, '[]'::jsonb)) AS item
      WHERE item->>'seller_id' = ?
         OR item->>'storeId' = ?
    )
    ORDER BY created_at DESC
  `;

  db.query(sql, [String(sellerIdNum), sellerIdStr], (err, rows) => {
    if (err) {
      console.error("❌ SELLER ORDERS ERROR:", err.sqlMessage);
      return res.status(500).json({
        success: false,
        message: "Database error"
      });
    }

    const orders = rows.map(order => ({
      ...order,
      cart: typeof order.cart === "string"
        ? JSON.parse(order.cart)
        : order.cart,
      status: order.status || "PENDING"
    }));

    res.json({
      success: true,
      orders
    });
  });
});

/* =====================================================
   6️⃣ ORDER STATUS UPDATE
===================================================== */

// PUT /api/seller/orders/:orderId/status
router.put("/orders/:orderId/status", requireSellerAuth, (req, res) => {
  const orderId = Number(req.params.orderId);
  const sellerId = Number(req.auth?.id || 0);
  const {
    status,
    status_updated_by,
    cancelled_by,
    cancelled_by_role,
    cancel_actor,
    rejected_by,
    rejected_by_role,
    reason,
    cancel_reason,
    customer_reason,
    seller_reason,
    status_reason,
    reject_reason,
    rejection_reason,
    cancellation_reason,
    delivery_otp,
    cod_paid,
    collect_cash
  } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({
      success: false,
      message: "Order ID and status required"
    });
  }

  const sql = `
    UPDATE orders
    SET
      status = ?,
      status_updated_by = COALESCE(?, status_updated_by),
      cancelled_by = COALESCE(?, cancelled_by),
      cancelled_by_role = COALESCE(?, cancelled_by_role),
      cancel_actor = COALESCE(?, cancel_actor),
      rejected_by = COALESCE(?, rejected_by),
      rejected_by_role = COALESCE(?, rejected_by_role),
      reason = COALESCE(?, reason),
      cancel_reason = COALESCE(?, cancel_reason),
      customer_reason = COALESCE(?, customer_reason),
      seller_reason = COALESCE(?, seller_reason),
      status_reason = COALESCE(?, status_reason),
      reject_reason = COALESCE(?, reject_reason),
      rejection_reason = COALESCE(?, rejection_reason),
      cancellation_reason = COALESCE(?, cancellation_reason)
    WHERE id = ? AND seller_id = ?
  `;

  const normalizedStatus = String(status).toUpperCase();
  const inferredStatusReason = status_reason || reason || null;
  const inferredCancelReason =
    cancel_reason ||
    (normalizedStatus === "CANCELLED"
      ? (customer_reason || cancellation_reason || inferredStatusReason || null)
      : null);
  const inferredCustomerReason =
    customer_reason ||
    (normalizedStatus === "CANCELLED" ? (inferredCancelReason || inferredStatusReason || null) : null);
  const inferredSellerReason =
    seller_reason ||
    (normalizedStatus === "REJECTED" ? (reject_reason || rejection_reason || inferredStatusReason || null) : null);
  const inferredRejectReason =
    reject_reason ||
    (normalizedStatus === "REJECTED" ? (inferredSellerReason || rejection_reason || inferredStatusReason || null) : null);
  const inferredRejectionReason =
    rejection_reason ||
    (normalizedStatus === "REJECTED" ? (inferredSellerReason || inferredRejectReason || inferredStatusReason || null) : null);
  const inferredCancellationReason =
    cancellation_reason ||
    (normalizedStatus === "CANCELLED" ? (inferredCancelReason || inferredCustomerReason || inferredStatusReason || null) : null);

  const isTruthy = (v) => ["1", "true", "yes", "y", "on"].includes(String(v ?? "").trim().toLowerCase());

  if (isTruthy(collect_cash)) {
    return db.query(
      "SELECT status, payment_method, payment_status FROM orders WHERE id = ? AND seller_id = ? LIMIT 1",
      [orderId, sellerId],
      (err0, rows0) => {
        if (err0) {
          console.error("âŒ COLLECT CASH FETCH ERROR:", err0.sqlMessage || err0.message || err0);
          return res.status(500).json({ success: false, message: "Status update failed" });
        }
        const current = rows0 && rows0[0];
        if (!current) return res.status(404).json({ success: false, message: "Order not found" });

        const currentStatus = String(current.status || "").trim().toUpperCase();
        const paymentMethod = String(current.payment_method || "COD").trim().toUpperCase();
        const paymentStatus = String(current.payment_status || "PENDING").trim().toUpperCase();
        if (paymentMethod !== "COD") {
          return res.status(400).json({ success: false, message: "Collect cash is only allowed for COD orders" });
        }
        if (currentStatus && currentStatus !== "OUT_FOR_DELIVERY" && currentStatus !== "COLLECT_CASH") {
          return res.status(400).json({ success: false, message: "Collect cash is allowed after Out for Delivery" });
        }
        if (paymentStatus === "PAID" || paymentStatus === "SUCCESS") {
          const alreadyStatus = currentStatus === "COLLECT_CASH" ? "COLLECT_CASH" : currentStatus || "OUT_FOR_DELIVERY";
          return res.json({ success: true, message: "COD payment already marked as PAID", payment_status: paymentStatus, status: alreadyStatus });
        }

        return db.query(
          "UPDATE orders SET status = 'COLLECT_CASH', payment_status = 'PAID', status_updated_by = COALESCE(?, status_updated_by) WHERE id = ? AND seller_id = ?",
          [status_updated_by || "SELLER", orderId, sellerId],
          (err1, result) => {
            if (err1) {
              console.error("âŒ COLLECT CASH UPDATE ERROR:", err1.sqlMessage || err1.message || err1);
              return res.status(500).json({ success: false, message: "Status update failed" });
            }
            if (!result || result.affectedRows === 0) {
              return res.status(404).json({ success: false, message: "Order not found" });
            }
            return res.json({ success: true, message: "COD payment marked as PAID", payment_status: "PAID", status: "COLLECT_CASH" });
          }
        );
      }
    );
  }

  if (normalizedStatus === "DELIVERED") {
    const providedOtp = String(delivery_otp == null ? "" : delivery_otp).replace(/\D/g, "");
    if (providedOtp.length !== 4) {
      return res.status(400).json({ success: false, message: "delivery_otp (4 digit) is required to mark DELIVERED" });
    }

    return db.query(
      "SELECT delivery_otp, payment_method, payment_status FROM orders WHERE id = ? AND seller_id = ? LIMIT 1",
      [orderId, sellerId],
      (err0, rows0) => {
        if (err0) {
          console.error("❌ DELIVERY OTP FETCH ERROR:", err0.sqlMessage || err0.message || err0);
          return res.status(500).json({ success: false, message: "Status update failed" });
        }
        const current = rows0 && rows0[0];
        if (!current) return res.status(404).json({ success: false, message: "Order not found" });

        const expectedOtp = String(current.delivery_otp == null ? "" : current.delivery_otp).replace(/\D/g, "");
        if (!expectedOtp || expectedOtp.length !== 4 || expectedOtp !== providedOtp) {
          return res.status(400).json({ success: false, message: "Invalid delivery OTP" });
        }

        const paymentMethod = String(current.payment_method || "COD").trim().toUpperCase();
        const wantsPaid = isTruthy(cod_paid);
        const nextPaymentStatus =
          paymentMethod === "COD"
            ? (wantsPaid ? "PAID" : (String(current.payment_status || "PENDING").trim().toUpperCase() || "PENDING"))
            : (String(current.payment_status || "PENDING").trim().toUpperCase() || "PENDING");

        const deliveredSql = `
          UPDATE orders
          SET
            status = ?,
            status_updated_by = COALESCE(?, status_updated_by),
            cancelled_by = COALESCE(?, cancelled_by),
            cancelled_by_role = COALESCE(?, cancelled_by_role),
            cancel_actor = COALESCE(?, cancel_actor),
            rejected_by = COALESCE(?, rejected_by),
            rejected_by_role = COALESCE(?, rejected_by_role),
            reason = COALESCE(?, reason),
            cancel_reason = COALESCE(?, cancel_reason),
            customer_reason = COALESCE(?, customer_reason),
            seller_reason = COALESCE(?, seller_reason),
            status_reason = COALESCE(?, status_reason),
            reject_reason = COALESCE(?, reject_reason),
            rejection_reason = COALESCE(?, rejection_reason),
            cancellation_reason = COALESCE(?, cancellation_reason),
            payment_status = ?,
            delivered_at = NOW(),
            delivery_otp_verified_at = NOW(),
            delivery_otp = NULL
          WHERE id = ? AND seller_id = ?
        `;

        return db.query(
          deliveredSql,
          [
            normalizedStatus,
            status_updated_by || null,
            cancelled_by || null,
            cancelled_by_role || null,
            cancel_actor || null,
            rejected_by || null,
            rejected_by_role || null,
            reason || inferredStatusReason || null,
            inferredCancelReason,
            inferredCustomerReason,
            inferredSellerReason,
            inferredStatusReason,
            inferredRejectReason,
            inferredRejectionReason,
            inferredCancellationReason,
            nextPaymentStatus,
            orderId,
            sellerId
          ],
          (err1, result) => {
            if (err1) {
              console.error("❌ DELIVERED STATUS UPDATE ERROR:", err1.sqlMessage || err1.message || err1);
              return res.status(500).json({ success: false, message: "Status update failed" });
            }
            if (!result || result.affectedRows === 0) {
              return res.status(404).json({ success: false, message: "Order not found" });
            }
            return res.json({ success: true, message: "Order marked as DELIVERED", payment_status: nextPaymentStatus });
          }
        );
      }
    );
  }

  db.query(
    sql,
    [
      normalizedStatus,
      status_updated_by || null,
      cancelled_by || null,
      cancelled_by_role || null,
      cancel_actor || null,
      rejected_by || null,
      rejected_by_role || null,
      reason || inferredStatusReason || null,
      inferredCancelReason,
      inferredCustomerReason,
      inferredSellerReason,
      inferredStatusReason,
      inferredRejectReason,
      inferredRejectionReason,
      inferredCancellationReason,
      orderId,
      sellerId
    ],
    (err, result) => {
    if (err) {
      console.error("❌ ORDER STATUS UPDATE ERROR:", err.sqlMessage);
      return res.status(500).json({
        success: false,
        message: "Status update failed"
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`
    });
    }
  );
});

// GET /api/seller/feedback/:sellerId
router.get("/feedback/:sellerId", requireSellerAuth, attachSellerId, (req, res) => {
  const sellerId = Number(req.params.sellerId);
  if (!sellerId) {
    return res.status(400).json({ success: false, feedback: [], message: "Invalid seller id" });
  }

  const sql = `
    SELECT
      sr.rating,
      sr.comment,
      sr.created_at
    FROM store_ratings sr
    INNER JOIN orders o ON o.id = sr.order_id
    WHERE o.seller_id = ?
    ORDER BY sr.created_at DESC
    LIMIT 100
  `;

  db.query(sql, [sellerId], (err, rows) => {
    if (err) {
      console.error("❌ SELLER FEEDBACK ERROR:", err.sqlMessage || err.message);
      return res.status(500).json({ success: false, feedback: [], message: "Database error" });
    }
    res.json({ success: true, feedback: rows || [] });
  });
});

/* =====================================================
   ✅ EXPORT ROUTER
===================================================== */
module.exports = router;
