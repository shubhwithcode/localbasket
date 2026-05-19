// Load `.env` from `backend/.env` if present.
// Safe in production too: dotenv does not override already-set environment variables.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { hasCloudinary } = require("./config/cloudinary");

const customerRoutes = require("./routes/customerRoutes");
const sellerRoutes = require("./routes/sellerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const storeRoutes = require("./routes/storeRoutes");
const productRoutes = require("./routes/productRoutes");
const locationRoutes = require("./routes/locationRoutes"); 
const orderRoutes = require("./routes/orderRoutes"); 
const paymentRoutes = require("./routes/paymentRoutes"); 
const authRoutes = require("./routes/authRoutes"); 
const systemRoutes = require("./routes/systemRoutes");
const aiRoutes = require("./routes/aiRoutes");
const maintenanceGuard = require("./middlewares/maintenanceGuard");

const app = express();

// CORS: allow configured frontend origins, fallback to all.
const allowedOrigins = String(process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : "*",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend locally from `frontend/` so UI changes reflect without redeploy.
// Disable caching to avoid stale HTML/JS during development and debugging.
// API routes are mounted under `/api/*`, so static assets won't clash.
app.use(express.static(path.join(__dirname, "..", "frontend"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store");
  }
}));

// Serve uploaded files when using local disk storage (non-cloudinary).
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store");
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Quick sanity endpoint to confirm which deployment/code is live on Vercel.
// (Useful when domains/projects are miswired or redeploy didn't pick latest commit.)
app.get("/api/version", (req, res) => {
  res.json({
    success: true,
    node_env: process.env.NODE_ENV || null,
    vercel: !!process.env.VERCEL,
    vercel_env: process.env.VERCEL_ENV || null,
    vercel_url: process.env.VERCEL_URL || null,
    vercel_region: process.env.VERCEL_REGION || null,
    git: {
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null
    }
  });
});

app.get("/api/health/cloudinary", (req, res) => { 
  res.json({ 
    status: "ok", 
    cloudinary: {
      configured: hasCloudinary,
      cloud_name_present: !!String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
      api_key_present: !!String(process.env.CLOUDINARY_API_KEY || "").trim(),
      api_secret_present: !!String(process.env.CLOUDINARY_API_SECRET || "").trim(),
      cloud_name_value: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim() || null
    }
  }); 
}); 

// Maintenance mode guard (blocks most /api routes when enabled).
app.use(maintenanceGuard);
 
app.use("/api/customer", customerRoutes); 
app.use("/api/seller", sellerRoutes); 
app.use("/api/admin", adminRoutes); 
app.use("/api/system", systemRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/stores", storeRoutes); 
app.use("/api/products", productRoutes); 
app.use("/api/location", locationRoutes); 
app.use("/api/orders", orderRoutes); 
app.use("/api/payment", paymentRoutes); 
app.use("/api/auth", authRoutes); 

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "LocalBasket API base",
    endpoints: {
      health: "/api/health",
      customer: [
        "POST /api/customer/login",
        "POST /api/customer/login-otp/request",
        "POST /api/customer/login-otp/verify"
      ],
      seller: [
        "POST /api/seller/login",
        "POST /api/seller/login-otp/request",
        "POST /api/seller/login-otp/verify"
      ],
      auth: [
        "POST /api/auth/send-otp",
        "POST /api/auth/verify-otp"
      ]
    }
  });
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LocalBasket Backend Running"
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found"
  });
});

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  if (err && err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      message: "Unexpected field",
      field: err.field || null,
      path: req.originalUrl || req.url || null
    });
  }

  return res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  const server = app.listen(port, () => {
    console.log(`LocalBasket server listening on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Stop the existing process on port ${port} or start this app with a different PORT value.`
      );
      console.error(
        "This project's frontend currently assumes localhost:5000, so freeing port 5000 is the safer fix."
      );
      process.exit(1);
    }

    throw error;
  });
}

module.exports = app;
