const db = require("../db/connection");
const fs = require("fs");
const path = require("path");
const {
  sendOrderPlacedEmail,
  sendOrderDeliveredEmail
} = require("../utils/customerNotificationEmails");
let QRCode;
try {
  QRCode = require("qrcode");
} catch {
  QRCode = null;
}

const getInvoiceBrand = () => {
  const brand = {
    name: process.env.INVOICE_BRAND_NAME || "Local Basket",
    gstin: process.env.INVOICE_GSTIN || "",
    support: process.env.INVOICE_SUPPORT || "localbasket.helpdesk@gmail.com",
    address: process.env.INVOICE_ADDRESS || "",
    logoPath: process.env.INVOICE_LOGO_PATH || path.join(__dirname, "..", "public", "logo2.png")
  };
  if (brand.logoPath && !fs.existsSync(brand.logoPath)) {
    brand.logoPath = "";
  }
  return brand;
};

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Rs. 0.00";
  return `Rs. ${n.toFixed(2)}`;
};

const round2 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

const safeText = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

const formatInvoiceDate = (value) => {
  if (!value) return "-";
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleString("en-IN", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
};

const generateDeliveryOtp = () => String(Math.floor(1000 + Math.random() * 9000));
const normalizeOtp4 = (value) => {
  const digits = String(value == null ? "" : value).replace(/\D/g, "");
  if (digits.length !== 4) return "";
  return digits;
};
const isTruthy = (value) => ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
const notifyOrderPlaced = async ({
  orderId,
  customerId,
  customerName,
  address,
  pincode,
  cart,
  totalAmount,
  paymentMethod,
  paymentStatus,
  fallbackPhone,
  sellerId
}) => {
  try {
    const [rows] = await db.promise().query(
      `
      SELECT c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, s.store_name
      FROM customers c
      LEFT JOIN sellers s ON s.id = ?
      WHERE c.id = ?
      LIMIT 1
      `,
      [sellerId, customerId]
    );
    const row = rows && rows[0];
    if (!row) {
      console.warn("ORDER PLACED EMAIL SKIPPED: customer/store lookup returned no row", { orderId, customerId, sellerId });
      return;
    }
    if (!row.customer_email) {
      console.warn("ORDER PLACED EMAIL SKIPPED: customer email missing", { orderId, customerId });
      return;
    }

    const mail = await sendOrderPlacedEmail({
      customerName: row.customer_name || customerName,
      customerEmail: row.customer_email,
      orderId,
      storeName: row.store_name || "",
      totalAmount,
      paymentMethod,
      paymentStatus,
      address,
      pincode,
      cart,
      phone: row.customer_phone || fallbackPhone
    });

    if (!mail?.success) {
      console.error("ORDER PLACED EMAIL FAILED:", mail);
    }
  } catch (err) {
    console.error("ORDER PLACED EMAIL ERROR:", err?.sqlMessage || err?.message || err);
  }
};

const notifyOrderDelivered = async ({ orderId, paymentStatusOverride }) => {
  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        o.id,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        c.name AS customer_name,
        c.email AS customer_email,
        s.store_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN sellers s ON s.id = o.seller_id
      WHERE o.id = ?
      LIMIT 1
      `,
      [orderId]
    );
    const row = rows && rows[0];
    if (!row) {
      console.warn("ORDER DELIVERED EMAIL SKIPPED: order lookup returned no row", { orderId });
      return;
    }
    if (!row.customer_email) {
      console.warn("ORDER DELIVERED EMAIL SKIPPED: customer email missing", { orderId });
      return;
    }

    const mail = await sendOrderDeliveredEmail({
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      orderId: row.id,
      storeName: row.store_name,
      totalAmount: row.total_amount,
      paymentMethod: row.payment_method,
      paymentStatus: paymentStatusOverride || row.payment_status
    });

    if (!mail?.success) {
      console.error("ORDER DELIVERED EMAIL FAILED:", mail);
    }
  } catch (err) {
    console.error("ORDER DELIVERED EMAIL ERROR:", err?.sqlMessage || err?.message || err);
  }
};

let deliveryOtpSchemaReady = false;
let deliveryOtpSchemaEnsuring = null;
const ensureDeliveryOtpSchema = async () => {
  if (deliveryOtpSchemaReady) return;
  if (deliveryOtpSchemaEnsuring) return deliveryOtpSchemaEnsuring;

  deliveryOtpSchemaEnsuring = (async () => {
    const [rows] = await db.promise().query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'orders'
        AND COLUMN_NAME IN ('delivery_otp', 'delivery_otp_verified_at', 'delivered_at')
      `
    );
    const present = new Set((rows || []).map(r => String(r.COLUMN_NAME || "").trim()));

    const stmts = [];
    if (!present.has("delivery_otp")) stmts.push("ALTER TABLE orders ADD COLUMN delivery_otp VARCHAR(4) NULL");
    if (!present.has("delivery_otp_verified_at")) stmts.push("ALTER TABLE orders ADD COLUMN delivery_otp_verified_at DATETIME NULL");
    if (!present.has("delivered_at")) stmts.push("ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL");

    for (const sql of stmts) {
      try {
        await db.promise().query(sql);
      } catch (err) {
        if (err && err.code === "ER_DUP_FIELDNAME") continue;
        throw err;
      }
    }

    deliveryOtpSchemaReady = true;
  })().finally(() => {
    deliveryOtpSchemaEnsuring = null;
  });

  return deliveryOtpSchemaEnsuring;
};

let PDFDocument;
try {
  PDFDocument = require("pdfkit");
} catch {
  PDFDocument = null;
}

/* =====================================================
   1ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¯ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¸ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ£ CREATE ORDER
===================================================== */
exports.createOrder = async (req, res) => {
  const {
    seller_id,
    customer_id,
    customer_name,
    phone,
    address,
    pincode,
    cart,
    total_amount,
    payment_method,
    payment_status,
    payment_id
  } = req.body;

  if (!seller_id || !customer_id || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order data"
    });
  }

  const doInsert = () => {
  const sql = `
    INSERT INTO orders (
      seller_id,
      customer_id,
      customer_name,
      phone,
      address,
      pincode,
      cart,
      total_amount,
      payment_method,
      payment_status,
      payment_id,
      delivery_otp,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const deliveryOtp = generateDeliveryOtp();
  const values = [
    seller_id,
    customer_id,
    customer_name || null,
    phone || null,
    address || null,
    pincode || null,
    JSON.stringify(cart),
    total_amount,
    payment_method || "COD",
    payment_status || "PENDING",
    payment_id || null,
    deliveryOtp,
    "PLACED"
  ];

  db.query(sql, values, async (err, result) => {
    if (err) {
      console.error("ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ ORDER CREATE ERROR:", err.sqlMessage);
      return res.status(500).json({
        success: false,
        message: "Order creation failed"
      });
    }

    await notifyOrderPlaced({
      orderId: result.insertId,
      customerId: customer_id,
      customerName,
      address,
      pincode,
      cart,
      totalAmount: total_amount,
      paymentMethod: payment_method || "COD",
      paymentStatus: payment_status || "PENDING",
      fallbackPhone: phone,
      sellerId: seller_id
    });

    res.json({
      success: true,
      order_id: result.insertId,
      delivery_otp: deliveryOtp
    });
  });
  };

  return ensureDeliveryOtpSchema()
    .then(doInsert)
    .catch((err) => {
      console.error("DELIVERY OTP SCHEMA CHECK FAILED:", err?.sqlMessage || err?.message || err);
      return res.status(500).json({
        success: false,
        message: "Server schema not ready for delivery OTP. Please restart server and try again."
      });
    });
};

const getInvoiceTerms = () => {
  return process.env.INVOICE_TERMS || "Goods once sold will not be taken back. Please retain invoice for returns/exchanges.";
};

const getInvoiceGstRate = () => {
  const raw = String(process.env.INVOICE_GST_RATE || "0");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const getInvoiceDeliveryConfig = () => {
  const minRaw = String(process.env.INVOICE_FREE_DELIVERY_MIN || process.env.FREE_DELIVERY_MIN || "100").trim();
  const feeRaw = String(process.env.INVOICE_DELIVERY_FEE || process.env.DELIVERY_FEE || "40").trim();

  const min = Number(minRaw);
  const fee = Number(feeRaw);

  return {
    freeMin: Number.isFinite(min) && min >= 0 ? min : 100,
    deliveryFee: Number.isFinite(fee) && fee >= 0 ? fee : 40
  };
};

const calcInvoiceBreakdown = (order, itemsSubtotal) => {
  const gstRate = getInvoiceGstRate();
  const { freeMin, deliveryFee } = getInvoiceDeliveryConfig();

  const chargedTotalRaw = Number(order?.total_amount);
  const chargedTotal = Number.isFinite(chargedTotalRaw) ? round2(chargedTotalRaw) : null;

  const subtotal = round2(itemsSubtotal);
  const delivery = round2(subtotal < freeMin ? deliveryFee : 0);

  let gst = gstRate > 0 ? round2(subtotal * gstRate) : 0;
  let computedTotal = round2(subtotal + delivery + gst);
  const total = chargedTotal == null ? computedTotal : chargedTotal;

  if (!(gstRate > 0)) {
    gst = round2(Math.max(0, total - subtotal - delivery));
    computedTotal = round2(subtotal + delivery + gst);
  }

  const adjustment = round2(total - computedTotal);
  return { subtotal, delivery, gst, gstRate, total, adjustment };
};

const getInvoiceQrText = (order, total) => {
  return process.env.INVOICE_QR_TEXT || `LB-ORDER:${order.id}|AMOUNT:${total.toFixed(2)}`;
};

/* =====================================================
   2ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¯ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¸ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ£ CUSTOMER ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ MY ORDERS (ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ FINAL FIX)
===================================================== */
exports.getCustomerOrders = (req, res) => {
  const { customerId } = req.params;

  const sql = `
    SELECT
      o.*,
      s.store_name,
      s.phone AS store_phone,
      s.address AS store_address
    FROM orders o
    LEFT JOIN sellers s ON o.seller_id = s.id
    WHERE o.customer_id = ?
    ORDER BY o.created_at DESC
  `;

  db.query(sql, [customerId], (err, rows) => {
    if (err) {
      console.error("ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ CUSTOMER ORDERS ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.sqlMessage || err.message || "Unable to load orders"
      });
    }

    const orders = (rows || []).map(o => {
      let parsedCart = [];
      if (Array.isArray(o.cart)) {
        parsedCart = o.cart;
      } else if (typeof o.cart === "string") {
        try {
          parsedCart = JSON.parse(o.cart);
        } catch {
          parsedCart = [];
        }
      }

      return {
        ...o,
        cart: parsedCart
      };
    });

    res.json({
      success: true,
      orders
    });
  });
};







/* =====================================================
   3ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¯ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¸ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ£ SELLER ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ ORDERS DASHBOARD
===================================================== */
exports.getSellerOrders = (req, res) => {
  const { sellerId } = req.params;

  const sql = `
    SELECT
      o.*,
      c.name AS customer_name,
      c.phone AS customer_phone
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.seller_id = ?
    ORDER BY o.created_at DESC
  `;

  db.query(sql, [sellerId], (err, rows) => {
    if (err) {
      console.error("ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ SELLER ORDERS ERROR:", err.sqlMessage);
      return res.status(500).json({
        success: false,
        orders: []
      });
    }

    const orders = (rows || []).map(o => {
      const out = ({
        ...o,
        cart: typeof o.cart === "string" ? JSON.parse(o.cart) : o.cart
      });
      delete out.delivery_otp;
      return out;
    });

    res.json({
      success: true,
      orders
    });
  });
};







/* =====================================================
   4ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¯ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¸ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ£ UPDATE ORDER STATUS
===================================================== */
exports.updateOrderStatus = (req, res) => {
  const {
    order_id,
    status,
    cancelled_by,
    cancelled_by_role,
    cancel_actor,
    rejected_by,
    rejected_by_role,
    status_updated_by,
    cancel_reason,
    customer_reason,
    seller_reason,
    status_reason,
    rejection_reason,
    reject_reason,
    cancellation_reason,
    reason,
    delivery_otp,
    cod_paid,
    collect_cash
  } = req.body || {};

  const ALLOWED = ["PLACED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "COLLECT_CASH", "DELIVERED", "REJECTED", "CANCELLED"];
  if (!order_id || !ALLOWED.includes(status)) {
    return res.status(400).json({ success: false });
  }

  const normalizedStatus = String(status).toUpperCase();
  const inferredStatusReason = status_reason || reason || null;
  const inferredCancelReason =
    cancel_reason ||
    (normalizedStatus === "CANCELLED"
      ? (customer_reason || cancellation_reason || inferredStatusReason || null)
      : null);
  const inferredCustomerReason =
    customer_reason ||
    (normalizedStatus === "CANCELLED" && (inferredCancelReason || inferredStatusReason || null)) ||
    (String(cancelled_by || "").toUpperCase() === "CUSTOMER" && (inferredCancelReason || inferredStatusReason || null)) ||
    null;
  const inferredSellerReason =
    seller_reason ||
    (normalizedStatus === "REJECTED" && (reject_reason || rejection_reason || inferredStatusReason || null)) ||
    null;
  const inferredRejectReason =
    reject_reason ||
    (normalizedStatus === "REJECTED" ? (inferredSellerReason || rejection_reason || inferredStatusReason || null) : null);
  const inferredRejectionReason =
    rejection_reason ||
    (normalizedStatus === "REJECTED" ? (inferredSellerReason || inferredRejectReason || inferredStatusReason || null) : null);
  const inferredCancellationReason =
    cancellation_reason ||
    (normalizedStatus === "CANCELLED" ? (inferredCancelReason || inferredCustomerReason || inferredStatusReason || null) : null);

  const sql = `
    UPDATE orders
    SET
      status = ?,
      cancelled_by = COALESCE(?, cancelled_by),
      cancelled_by_role = COALESCE(?, cancelled_by_role),
      cancel_actor = COALESCE(?, cancel_actor),
      rejected_by = COALESCE(?, rejected_by),
      rejected_by_role = COALESCE(?, rejected_by_role),
      status_updated_by = COALESCE(?, status_updated_by),
      reason = COALESCE(?, reason),
      cancel_reason = COALESCE(?, cancel_reason),
      customer_reason = COALESCE(?, customer_reason),
      seller_reason = COALESCE(?, seller_reason),
      status_reason = COALESCE(?, status_reason),
      rejection_reason = COALESCE(?, rejection_reason),
      reject_reason = COALESCE(?, reject_reason),
      cancellation_reason = COALESCE(?, cancellation_reason)
    WHERE id = ?
  `;

  const params = [
    normalizedStatus,
    cancelled_by || null,
    cancelled_by_role || null,
    cancel_actor || null,
    rejected_by || null,
    rejected_by_role || null,
    status_updated_by || null,
    reason || inferredStatusReason,
    inferredCancelReason,
    inferredCustomerReason,
    inferredSellerReason,
    inferredStatusReason,
    inferredRejectionReason,
    inferredRejectReason,
    inferredCancellationReason,
    order_id
  ];

  if (["1", "true", "yes", "y", "on"].includes(String(collect_cash ?? "").trim().toLowerCase())) {
    return db.query(
      "SELECT status, payment_method, payment_status FROM orders WHERE id = ? LIMIT 1",
      [order_id],
      (err0, rows0) => {
        if (err0) {
          console.error("COLLECT CASH FETCH ERROR:", err0.sqlMessage || err0.message || err0);
          return res.status(500).json({ success: false });
        }
        const current = rows0 && rows0[0];
        if (!current) return res.status(404).json({ success: false, message: "Order not found" });

        const currentStatus = String(current.status || "").trim().toUpperCase();
        const method = String(current.payment_method || "COD").trim().toUpperCase();
        const payStatus = String(current.payment_status || "PENDING").trim().toUpperCase();
        if (method !== "COD") {
          return res.status(400).json({ success: false, message: "Collect cash is only allowed for COD orders" });
        }
        if (currentStatus && currentStatus !== "OUT_FOR_DELIVERY" && currentStatus !== "COLLECT_CASH") {
          return res.status(400).json({ success: false, message: "Collect cash is allowed after Out for Delivery" });
        }
        if (payStatus === "PAID" || payStatus === "SUCCESS") {
          return res.json({ success: true, payment_status: payStatus, status: currentStatus || "OUT_FOR_DELIVERY" });
        }

        return db.query(
          "UPDATE orders SET status = 'COLLECT_CASH', payment_status = 'PAID', status_updated_by = COALESCE(?, status_updated_by) WHERE id = ?",
          [status_updated_by || "SELLER", order_id],
          (err1, result) => {
            if (err1) {
              console.error("COLLECT CASH UPDATE ERROR:", err1.sqlMessage || err1.message || err1);
              return res.status(500).json({ success: false });
            }
            if (!result || result.affectedRows === 0) {
              return res.status(404).json({ success: false, message: "Order not found" });
            }
            return res.json({ success: true, payment_status: "PAID", status: "COLLECT_CASH" });
          }
        );
      }
    );
  }

  if (normalizedStatus === "DELIVERED") {
    const providedOtp = normalizeOtp4(delivery_otp);
    if (!providedOtp) {
      return res.status(400).json({ success: false, message: "delivery_otp (4 digit) is required to mark DELIVERED" });
    }

    return db.query(
      "SELECT delivery_otp, payment_method, payment_status FROM orders WHERE id = ? LIMIT 1",
      [order_id],
      (err0, rows0) => {
        if (err0) {
          console.error("DELIVERY OTP FETCH ERROR:", err0.sqlMessage || err0.message || err0);
          return res.status(500).json({ success: false });
        }
        const current = rows0 && rows0[0];
        if (!current) return res.status(404).json({ success: false, message: "Order not found" });

        const expectedOtp = normalizeOtp4(current.delivery_otp);
        if (!expectedOtp || expectedOtp !== providedOtp) {
          return res.status(400).json({ success: false, message: "Invalid delivery OTP" });
        }

        const paymentMethod = safeText(current.payment_method || "COD").toUpperCase();
        const nextPaymentStatus =
          paymentMethod === "COD"
            ? (isTruthy(cod_paid) ? "PAID" : (safeText(current.payment_status || "PENDING").toUpperCase() || "PENDING"))
            : (safeText(current.payment_status || "PENDING").toUpperCase() || "PENDING");

        const deliveredSql = `
          UPDATE orders
          SET
            status = ?,
            cancelled_by = COALESCE(?, cancelled_by),
            cancelled_by_role = COALESCE(?, cancelled_by_role),
            cancel_actor = COALESCE(?, cancel_actor),
            rejected_by = COALESCE(?, rejected_by),
            rejected_by_role = COALESCE(?, rejected_by_role),
            status_updated_by = COALESCE(?, status_updated_by),
            reason = COALESCE(?, reason),
            cancel_reason = COALESCE(?, cancel_reason),
            customer_reason = COALESCE(?, customer_reason),
            seller_reason = COALESCE(?, seller_reason),
            status_reason = COALESCE(?, status_reason),
            rejection_reason = COALESCE(?, rejection_reason),
            reject_reason = COALESCE(?, reject_reason),
            cancellation_reason = COALESCE(?, cancellation_reason),
            payment_status = ?,
            delivered_at = NOW(),
            delivery_otp_verified_at = NOW(),
            delivery_otp = NULL
          WHERE id = ?
        `;

        const deliveredParams = params
          .slice(0, params.length - 1)
          .concat([nextPaymentStatus, order_id]);

        return db.query(deliveredSql, deliveredParams, async (err1, result) => {
          if (err1) {
            console.error("DELIVERED STATUS UPDATE ERROR:", err1.sqlMessage || err1.message || err1);
            return res.status(500).json({ success: false });
          }
          if (!result || result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Order not found" });
          }
          await notifyOrderDelivered({ orderId: order_id, paymentStatusOverride: nextPaymentStatus });
          return res.json({ success: true, payment_status: nextPaymentStatus });
        });
      }
    );
  }

  db.query(sql, params, err => {
    if (err) {
      console.error("ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ STATUS UPDATE ERROR:", err.sqlMessage);
      return res.status(500).json({ success: false });
    }
    res.json({ success: true });
  });
};







/* =====================================================
   5ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¯ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¸ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ£ CANCEL ORDER (CUSTOMER)
===================================================== */
exports.cancelOrder = (req, res) => {
  const { orderId } = req.params;

  db.query(
    `UPDATE orders
     SET status = 'REJECTED', cancelled_by = 'CUSTOMER'
     WHERE id = ? AND status IN ('PLACED','CONFIRMED')`,
    [orderId],
    (err, result) => {
      if (err) {
        console.error("ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ CANCEL ERROR:", err.sqlMessage);
        return res.status(500).json({ success: false });
      }

      res.json({
        success: result.affectedRows > 0
      });
    }
  );
};







/* =====================================================
   6ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¯ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¸ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ£ ADMIN ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ ALL ORDERS
===================================================== */
exports.getAllOrders = (req, res) => {
  const sql = `
    SELECT
      o.*,
      s.store_name,
      s.phone AS store_phone,
      c.name AS customer_name,
      c.phone AS customer_phone
    FROM orders o
    LEFT JOIN sellers s ON o.seller_id = s.id
    LEFT JOIN customers c ON o.customer_id = c.id
    ORDER BY o.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ ADMIN ORDERS ERROR:", err.sqlMessage);
      return res.status(500).json({ success: false });
    }

    res.json({
      success: true,
      orders: rows || []
    });
  });
};







/* =====================================================
   7?? CUSTOMER ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ ORDER FEEDBACK
===================================================== */
exports.submitOrderFeedback = (req, res) => {
  const { orderId } = req.params;
  const { rating, comment } = req.body;
  const ratingNum = Number(rating);

  if (!orderId || !Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ success: false, message: "Invalid rating" });
  }

  const sqlOrder = `
    SELECT id, seller_id, customer_id, status
    FROM orders
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sqlOrder, [orderId], (err, rows) => {
    if (err) {
      console.error("? FEEDBACK ORDER LOOKUP ERROR:", err.sqlMessage || err.message);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = rows[0];
    const status = String(order.status || "").toUpperCase();
    const allowed = ["DELIVERED", "DELIVERED_BY_RIDER", "COMPLETED", "SUCCESS"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Feedback allowed only after delivery" });
    }

    const sqlInsert = `
      INSERT INTO store_ratings (order_id, store_id, customer_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        comment = VALUES(comment),
        created_at = CURRENT_TIMESTAMP
    `;

    db.query(sqlInsert, [order.id, order.seller_id, order.customer_id, ratingNum, comment || null], (err2) => {
      if (err2) {
        console.error("? FEEDBACK SAVE ERROR:", err2.sqlMessage || err2.message);
        return res.status(500).json({ success: false, message: "Unable to save feedback" });
      }

      res.json({ success: true });
    });
  });
};


/* =====================================================
   8?? ORDER INVOICE (PDF)
   GET /api/orders/:orderId/invoice
===================================================== */
exports.getOrderInvoice = async (req, res) => {
  const { orderId } = req.params;
  const id = Number(orderId);
  if (!id) {
    return res.status(400).json({ success: false, message: "Invalid order id" });
  }
  if (!PDFDocument) {
    return res.status(500).json({ success: false, message: "PDF generation not available" });
  }

  const sql = `
    SELECT
      o.*,
      s.store_name,
      s.phone AS store_phone,
      s.address AS store_address,
      c.name AS customer_name,
      c.phone AS customer_phone
    FROM orders o
    LEFT JOIN sellers s ON o.seller_id = s.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
    LIMIT 1
  `;

  let rows;
  try {
    const [result] = await db.promise().query(sql, [id]);
    rows = result;
  } catch (err) {
    console.error("INVOICE FETCH ERROR:", err?.sqlMessage || err?.message || err);
    return res.status(500).json({ success: false, message: "Failed to generate invoice" });
  }

  if (!rows || rows.length === 0) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  const order = rows[0];
  let cart = [];
  if (Array.isArray(order.cart)) cart = order.cart;
  else if (typeof order.cart === "string") {
    try { cart = JSON.parse(order.cart); } catch { cart = []; }
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${id}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const brand = getInvoiceBrand();
  doc.pipe(res);

  const ACCENT = "#ff8a1a";
  const ACCENT_SOFT = "#fff7ed";
  const TEXT = "#0f172a";
  const MUTED = "#475569";
  const BORDER = "#e5e7eb";
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const m = doc.page.margins;
  const left = m.left;
  const right = pageW - m.right;
  const top = m.top;
  const bottom = pageH - m.bottom;

  const drawTopBar = () => {
    doc.save();
    doc.rect(0, 0, pageW, 6).fill(ACCENT);
    doc.restore();
  };

  const drawHeader = () => {
    drawTopBar();

    const y = top;
    const logoSize = 56;
    const ringSize = 86;
    const ringX = left;
    const ringY = y + 2;

    doc.save();
    doc.fillColor(ACCENT_SOFT).circle(ringX + ringSize / 2, ringY + ringSize / 2, ringSize / 2).fill();
    doc.lineWidth(1).strokeColor("#fde6d2").circle(ringX + ringSize / 2, ringY + ringSize / 2, ringSize / 2).stroke();
    doc.restore();

    if (brand.logoPath) {
      try {
        const cx = ringX + ringSize / 2;
        const cy = ringY + ringSize / 2;
        const clipR = Math.round(logoSize * 0.48);
        doc.save();
        doc.circle(cx, cy, clipR).clip();
        doc.image(
          brand.logoPath,
          cx - clipR * 1.15,
          cy - clipR * 1.15,
          { width: clipR * 2.3, height: clipR * 2.3 }
        );
        doc.restore();
      } catch {}
    }

    doc.fillColor(TEXT).fontSize(18).text(safeText(brand.name) || "Local Basket", ringX + ringSize + 14, y + 10, { width: right - (ringX + ringSize + 14) - 210 });
    doc.fillColor(MUTED).fontSize(9);
    const addr = safeText(brand.address);
    if (addr) doc.text(addr, ringX + ringSize + 14, y + 34, { width: right - (ringX + ringSize + 14) - 210 });
    const support = safeText(brand.support);
    if (support) doc.text(support, ringX + ringSize + 14, y + 52);
    const gstin = safeText(brand.gstin);
    if (gstin) doc.text(`GSTIN: ${gstin}`, ringX + ringSize + 14, y + 64);

    const metaW = 200;
    const metaX = right - metaW;
    const metaY = y + 10;
    doc.save();
    doc.roundedRect(metaX, metaY, metaW, 78, 12).fillColor("#ffffff").fill();
    doc.roundedRect(metaX, metaY, metaW, 78, 12).strokeColor("#f1f5f9").stroke();
    doc.restore();

    doc.fillColor(TEXT).fontSize(12).text("INVOICE", metaX + 14, metaY + 10);
    doc.fillColor(MUTED).fontSize(9);
    doc.text(`Invoice #: LB-${order.id}`, metaX + 14, metaY + 30);
    doc.text(`Date: ${formatInvoiceDate(order.created_at)}`, metaX + 14, metaY + 44);
    const payLine = `Pay: ${safeText(order.payment_method || "COD")} / ${safeText(order.payment_status || "PENDING")}`;
    doc.text(payLine, metaX + 14, metaY + 58, { width: metaW - 28 });

    doc.moveTo(left, y + 98).lineTo(right, y + 98).strokeColor(BORDER).stroke();
    return y + 112;
  };

  const drawPartyBoxes = (y) => {
    const gap = 14;
    const colW = (right - left - gap) / 2;
    const innerW = colW - 24;

    const measureBoxHeight = (title, lines) => {
      const clean = (lines || []).filter(Boolean);
      const name = clean[0] || "-";
      const rest = clean.slice(1);

      const topPad = 10;
      const bottomPad = 12;
      const titleH = 12;
      const gapAfterTitle = 6;

      doc.fontSize(11);
      const nameH = doc.heightOfString(name, { width: innerW });

      doc.fontSize(9);
      let restH = 0;
      for (const line of rest) {
        restH += doc.heightOfString(String(line), { width: innerW }) + 3;
      }

      const contentH = topPad + titleH + gapAfterTitle + nameH + 6 + restH;
      return Math.max(94, Math.ceil(contentH + bottomPad));
    };

    const box = (x, boxH, title, lines) => {
      doc.save();
      doc.roundedRect(x, y, colW, boxH, 14).fillColor("#ffffff").fill();
      doc.roundedRect(x, y, colW, boxH, 14).strokeColor("#f1f5f9").stroke();
      doc.restore();

      const clean = (lines || []).filter(Boolean);
      const name = clean[0] || "-";
      const rest = clean.slice(1);

      doc.fillColor(MUTED).fontSize(9).text(title, x + 12, y + 10, { width: innerW });
      doc.fillColor(TEXT).fontSize(11).text(name, x + 12, y + 26, { width: innerW });

      let yy = y + 26 + doc.heightOfString(name, { width: innerW }) + 6;
      doc.fillColor(MUTED).fontSize(9);
      for (const line of rest) {
        const text = String(line || "");
        const h = doc.heightOfString(text, { width: innerW });
        doc.text(text, x + 12, yy, { width: innerW });
        yy += h + 3;
      }
    };

    const soldLines = [
      safeText(order.store_name) || "Store",
      order.store_phone ? `Phone: ${safeText(order.store_phone)}` : "",
      order.store_address ? `Address: ${safeText(order.store_address)}` : ""
    ];

    const billLines = [
      safeText(order.customer_name) || "Customer",
      (order.customer_phone || order.phone) ? `Phone: ${safeText(order.customer_phone || order.phone)}` : "",
      order.address ? `Address: ${safeText(order.address)}` : "",
      order.pincode ? `Pincode: ${safeText(order.pincode)}` : ""
    ];

    const boxH = Math.max(
      measureBoxHeight("Sold By", soldLines),
      measureBoxHeight("Bill To", billLines)
    );

    box(left, boxH, "Sold By", soldLines);
    box(left + colW + gap, boxH, "Bill To", billLines);

    return y + boxH + 16;
  };

  const drawItemsHeader = (y) => {
    doc.save();
    doc.roundedRect(left, y, right - left, 22, 10).fillColor(ACCENT_SOFT).fill();
    doc.restore();

    doc.fillColor(TEXT).fontSize(10);
    doc.text("Item", left + 10, y + 6);
    doc.text("Qty", left + 310, y + 6, { width: 40, align: "right" });
    doc.text("Price", left + 360, y + 6, { width: 70, align: "right" });
    doc.text("Total", right - 10 - 80, y + 6, { width: 80, align: "right" });

    doc.moveTo(left, y + 26).lineTo(right, y + 26).strokeColor("#f1f5f9").stroke();
    return y + 32;
  };

  const ensureSpaceOrAddPage = (y, needed) => {
    const reserve = 160;
    if (y + needed <= bottom - reserve) return y;
    doc.addPage();
    drawTopBar();
    return drawItemsHeader(top + 6);
  };

  const drawTotalsAndFooter = async (y, breakdown) => {
    const { subtotal, delivery, gst, gstRate, total, adjustment } = breakdown || {};
    const terms = safeText(getInvoiceTerms());

    // Totals box (bottom-right)
    const boxW = 220;
    const rows = [
      { label: "Items Subtotal", value: money(subtotal) },
      { label: delivery > 0 ? "Delivery" : "Delivery (FREE)", value: delivery > 0 ? money(delivery) : "FREE" },
      { label: gstRate > 0 ? `GST (${(Number(gstRate) * 100).toFixed(0)}%)` : "GST", value: money(gst) }
    ];
    if (Number(adjustment) !== 0) rows.push({ label: "Adjustments", value: money(adjustment) });
    rows.push({ label: "Total", value: money(total), strong: true });

    const rowsH = rows.reduce((sum, r) => sum + (r.strong ? 16 : 14), 0);
    const boxH = 28 + rowsH + 18;
    const boxX = right - boxW;
    const boxY = Math.min(y + 10, bottom - boxH - 90);

    doc.save();
    doc.roundedRect(boxX, boxY, boxW, boxH, 14).fillColor("#ffffff").fill();
    doc.roundedRect(boxX, boxY, boxW, boxH, 14).strokeColor("#f1f5f9").stroke();
    doc.restore();

    doc.fillColor(MUTED).fontSize(9).text("Summary", boxX + 14, boxY + 10);

    let yy = boxY + 28;
    for (const row of rows) {
      doc.fillColor(TEXT).fontSize(row.strong ? 11 : 10);
      doc.text(row.label, boxX + 14, yy, { width: boxW - 28 });
      doc.text(String(row.value), boxX + 14, yy, { width: boxW - 28, align: "right" });
      yy += row.strong ? 16 : 14;
    }

    // Optional QR (bottom-left)
    const qrText = safeText(getInvoiceQrText(order, total));
    let qrUrl = "";
    if (QRCode && qrText) {
      try {
        qrUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 140 });
      } catch {
        qrUrl = "";
      }
    }

    const footerTop = Math.min(boxY + boxH + 16, bottom - 80);
    if (qrUrl) {
      try {
        doc.image(qrUrl, left, footerTop - 6, { width: 88, height: 88 });
        doc.fillColor(MUTED).fontSize(8).text("Scan for order info", left + 96, footerTop + 10);
      } catch {}
    }

    // Terms + thank you
    const termsX = left + (qrUrl ? 96 : 0);
    const termsW = (right - termsX) - (qrUrl ? 0 : 0);
    doc.fillColor(MUTED).fontSize(8).text(terms || "Thank you for shopping with Local Basket!", termsX, footerTop + 26, { width: termsW });
    doc.fillColor(MUTED).fontSize(8).text(`Support: ${safeText(brand.support) || "localbasket.helpdesk@gmail.com"}`, termsX, footerTop + 54, { width: termsW });
  };

  let y = drawHeader();
  y = drawPartyBoxes(y);

  doc.fillColor(TEXT).fontSize(11).text("Items", left, y - 2);
  y = drawItemsHeader(y + 8);

  const nameW = 290;
  const qtyX = left + 310;
  const priceX = left + 360;
  const totalX = right - 10 - 80;

  let subtotal = 0;
  const items = Array.isArray(cart) ? cart : [];
  items.forEach((item, index) => {
    const qty = Number(item?.qty || item?.quantity || 1);
    const price = Number(item?.price || 0);
    const lineTotal = (Number.isFinite(qty) ? qty : 1) * (Number.isFinite(price) ? price : 0);
    subtotal += lineTotal;

    const unit = safeText(item?.unit || "");
    const baseName = safeText(item?.name || item?.product_name || "Item");
    const name = unit ? `${baseName} (${unit})` : baseName;

    const rowHeight = Math.max(18, doc.heightOfString(name, { width: nameW, align: "left" }) + 6);
    y = ensureSpaceOrAddPage(y, rowHeight + 6);

    if (index % 2 === 0) {
      doc.save();
      doc.rect(left, y - 2, right - left, rowHeight + 4).fillColor("#fafafa").fill();
      doc.restore();
    }

    doc.fillColor(TEXT).fontSize(10).text(name, left + 10, y, { width: nameW });
    doc.fillColor(TEXT).fontSize(10).text(String(Number.isFinite(qty) ? qty : 1), qtyX, y, { width: 40, align: "right" });
    doc.fillColor(MUTED).fontSize(10).text(money(price).replace("Rs. ", "Rs. "), priceX, y, { width: 70, align: "right" });
    doc.fillColor(TEXT).fontSize(10).text(money(lineTotal).replace("Rs. ", "Rs. "), totalX, y, { width: 80, align: "right" });

    y += rowHeight + 6;
    doc.moveTo(left, y - 2).lineTo(right, y - 2).strokeColor("#f1f5f9").stroke();
  });

  const breakdown = calcInvoiceBreakdown(order, subtotal);
  await drawTotalsAndFooter(y, breakdown);
  doc.end();
};
