const mysql = require("mysql2");

let PgPool = null;
try {
  ({ Pool: PgPool } = require("pg"));
} catch {}

const connectionUri = String(process.env.DATABASE_URL || "").trim();
const parsedConnectionMeta = {
  protocol: "",
  host: null,
  port: null,
  user: null,
  database: null
};

if (!connectionUri) {
  console.error("DATABASE_URL is not configured");
}

const parseConnectionMeta = () => {
  if (!connectionUri) return;
  try {
    const parsed = new URL(connectionUri);
    parsedConnectionMeta.protocol = String(parsed.protocol || "").replace(":", "").toLowerCase();
    parsedConnectionMeta.host = parsed.hostname || null;
    parsedConnectionMeta.port = Number(parsed.port || (parsedConnectionMeta.protocol.startsWith("postgres") ? 5432 : 3306));
    parsedConnectionMeta.user = decodeURIComponent(parsed.username || "");
    parsedConnectionMeta.database = String(parsed.pathname || "").replace(/^\/+/, "") || null;
  } catch (err) {
    console.error("Invalid DATABASE_URL format", err.message || err);
  }
};

parseConnectionMeta();

const isPostgresUrl = /^postgres(ql)?:\/\//i.test(connectionUri);
const isMysqlUrl = /^mysql:\/\//i.test(connectionUri);

const normalizePgError = (err) => {
  if (!err) return err;
  const codeMap = {
    "23505": "ER_DUP_ENTRY",
    "42701": "ER_DUP_FIELDNAME",
    "42P01": "ER_NO_SUCH_TABLE",
    "42501": "ER_ACCESS_DENIED_ERROR"
  };
  if (codeMap[err.code]) err.code = codeMap[err.code];
  return err;
};

const convertQuestionPlaceholders = (sql) => {
  let index = 0;
  let out = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";

    if (ch === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === "?" && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }
  return out;
};

const stripMysqlKeys = (sql) =>
  sql
    .replace(/^\s*KEY\s+[^(]+\([^)]+\),?\s*$/gim, "")
    .replace(/,\s*\)/g, "\n)")
    .replace(/\)\s*,\s*CONSTRAINT/g, "),\n      CONSTRAINT");

const translateMysqlCreateTableToPostgres = (sql) => {
  let out = stripMysqlKeys(sql);
  out = out.replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, "SERIAL PRIMARY KEY");
  out = out.replace(/\bBIGINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, "BIGSERIAL PRIMARY KEY");
  out = out.replace(/\bTINYINT\s*\(\s*1\s*\)/gi, "SMALLINT");
  out = out.replace(/\bDATETIME\b/gi, "TIMESTAMP");
  out = out.replace(/\bJSON\b/gi, "JSONB");
  out = out.replace(/\s+AFTER\s+\w+/gi, "");
  out = out.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, "");
  return out;
};

const translateOnDuplicateKey = (sql) => {
  let out = sql;

  out = out.replace(
    /INSERT INTO settings\s*\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)\s*ON DUPLICATE KEY UPDATE id\s*=\s*id/gi,
    "INSERT INTO settings ($1) VALUES ($2) ON CONFLICT (id) DO NOTHING"
  );

  out = out.replace(
    /INSERT INTO categories\s*\(([\s\S]+?)\)\s*VALUES\s*([\s\S]+?)\s*ON DUPLICATE KEY UPDATE[\s\S]*?is_active\s*=\s*VALUES\(is_active\)/gi,
    "INSERT INTO categories ($1) VALUES $2 ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, is_active = EXCLUDED.is_active"
  );

  out = out.replace(
    /INSERT INTO seller_payouts\s*\(\s*seller_id\s*,\s*last_paid_at\s*\)\s*VALUES\s*\((.+?),\s*NOW\(\)\)\s*ON DUPLICATE KEY UPDATE\s+last_paid_at\s*=\s*NOW\(\)/gi,
    "INSERT INTO seller_payouts (seller_id, last_paid_at) VALUES ($1, NOW()) ON CONFLICT (seller_id) DO UPDATE SET last_paid_at = NOW()"
  );

  out = out.replace(
    /INSERT INTO store_ratings\s*\(\s*order_id\s*,\s*store_id\s*,\s*customer_id\s*,\s*rating\s*,\s*comment\s*\)\s*VALUES\s*\(([\s\S]+?)\)\s*ON DUPLICATE KEY UPDATE[\s\S]*?created_at\s*=\s*CURRENT_TIMESTAMP/gi,
    "INSERT INTO store_ratings (order_id, store_id, customer_id, rating, comment) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (order_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = CURRENT_TIMESTAMP"
  );

  out = out.replace(
    /INSERT INTO site_visits\s*\(\s*session_id\s*,\s*is_admin\s*,\s*first_seen_at\s*,\s*last_seen_at\s*,\s*max_elapsed_ms\s*,\s*pageviews\s*,\s*last_path\s*,\s*referrer\s*,\s*user_agent\s*\)\s*VALUES\s*\(([\s\S]+?)\)\s*ON DUPLICATE KEY UPDATE[\s\S]*?user_agent\s*=\s*VALUES\(user_agent\)/gi,
    "INSERT INTO site_visits (session_id, is_admin, first_seen_at, last_seen_at, max_elapsed_ms, pageviews, last_path, referrer, user_agent) VALUES ($1, $2, NOW(), NOW(), $3, $4, $5, $6, $7) ON CONFLICT (session_id) DO UPDATE SET is_admin = EXCLUDED.is_admin, last_seen_at = NOW(), max_elapsed_ms = GREATEST(site_visits.max_elapsed_ms, EXCLUDED.max_elapsed_ms), pageviews = site_visits.pageviews + $8, last_path = EXCLUDED.last_path, referrer = EXCLUDED.referrer, user_agent = EXCLUDED.user_agent"
  );

  return out;
};

const translatePostgresSql = (inputSql) => {
  let sql = String(inputSql || "").trim();

  const showColumnsMatch = sql.match(/^SHOW\s+COLUMNS\s+FROM\s+([a-zA-Z0-9_]+)\s+LIKE\s+\?/i);
  if (showColumnsMatch) {
    return `
      SELECT
        column_name AS "Field",
        data_type AS "Type",
        is_nullable AS "Null",
        column_default AS "Default"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = '${showColumnsMatch[1].toLowerCase()}'
        AND column_name = $1
    `;
  }

  sql = convertQuestionPlaceholders(sql);
  sql = translateOnDuplicateKey(sql);

  if (/^CREATE TABLE IF NOT EXISTS/i.test(sql)) {
    sql = translateMysqlCreateTableToPostgres(sql);
  } else if (/^ALTER TABLE/i.test(sql)) {
    sql = sql
      .replace(/\bTINYINT\s*\(\s*1\s*\)/gi, "SMALLINT")
      .replace(/\bDATETIME\b/gi, "TIMESTAMP")
      .replace(/\s+AFTER\s+\w+/gi, "");
  }

  sql = sql
    .replace(/SELECT\s+COLUMN_NAME\b/gi, 'SELECT column_name AS "COLUMN_NAME"')
    .replace(/IFNULL\s*\(/gi, "COALESCE(")
    .replace(/CURDATE\s*\(\s*\)/gi, "CURRENT_DATE")
    .replace(/DATE_SUB\s*\(\s*NOW\(\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "NOW() - INTERVAL '$1 DAY'")
    .replace(/DATE_SUB\s*\(\s*CURDATE\(\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, "CURRENT_DATE - INTERVAL '$1 DAY'")
    .replace(/table_schema\s*=\s*DATABASE\(\)/gi, "table_schema = current_schema()")
    .replace(/CAST\(([^)]+?)\s+AS\s+CHAR\)/gi, "CAST($1 AS TEXT)");

  return sql;
};

const tablesWithIdInsert = new Set([
  "categories",
  "customers",
  "sellers",
  "products",
  "orders",
  "support_requests",
  "site_visits",
  "store_ratings",
  "product_reviews",
  "otp_verifications"
]);

const shouldReturnInsertedId = (sql) => {
  const match = String(sql || "").match(/^\s*insert\s+into\s+([a-zA-Z0-9_]+)/i);
  if (!match) return false;
  return tablesWithIdInsert.has(String(match[1] || "").toLowerCase());
};

const mapPgResult = (result) => {
  const command = String(result?.command || "").toUpperCase();
  if (command === "SELECT") return result.rows || [];

  const firstRow = result?.rows?.[0] || {};
  const insertId =
    firstRow.id ??
    firstRow.insert_id ??
    firstRow.order_id ??
    null;

  return {
    affectedRows: Number(result?.rowCount || 0),
    insertId
  };
};

const createPostgresAdapter = () => {
  if (!PgPool) {
    throw new Error("PostgreSQL driver missing. Install `pg` to use Supabase/PostgreSQL.");
  }

  const sslValue = String(process.env.PGSSLMODE || "").trim().toLowerCase();
  const sslEnabled = !["disable", "false", "0", ""].includes(sslValue) || /supabase\.co/i.test(connectionUri);
  const pool = new PgPool({
    connectionString: connectionUri,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  });

  const execute = async (sql, params = []) => {
    const translatedSql = translatePostgresSql(sql);
    const needsReturningId =
      /^\s*insert\s+/i.test(translatedSql) &&
      !/\breturning\b/i.test(translatedSql) &&
      shouldReturnInsertedId(translatedSql);
    const finalSql = needsReturningId ? `${translatedSql} RETURNING id` : translatedSql;
    const result = await pool.query(finalSql, params);
    return mapPgResult(result);
  };

  const adapter = {
    _dialect: "postgres",
    query(sql, params, callback) {
      let actualParams = params;
      let actualCallback = callback;

      if (typeof params === "function") {
        actualCallback = params;
        actualParams = [];
      }

      execute(sql, actualParams || [])
        .then((data) => {
          if (typeof actualCallback === "function") actualCallback(null, data);
        })
        .catch((err) => {
          if (typeof actualCallback === "function") actualCallback(normalizePgError(err));
        });
    },
    promise() {
      return {
        query: async (sql, params = []) => {
          const translatedSql = translatePostgresSql(sql);
          const needsReturningId =
            /^\s*insert\s+/i.test(translatedSql) &&
            !/\breturning\b/i.test(translatedSql) &&
            shouldReturnInsertedId(translatedSql);
          const finalSql = needsReturningId ? `${translatedSql} RETURNING id` : translatedSql;
          try {
            const result = await pool.query(finalSql, params);
            return [mapPgResult(result), []];
          } catch (err) {
            throw normalizePgError(err);
          }
        }
      };
    },
    getConnection(callback) {
      pool.connect()
        .then((client) => {
          callback(null, {
            release: () => client.release()
          });
        })
        .catch((err) => callback(normalizePgError(err)));
    },
    on() {},
    end: () => pool.end()
  };

  return adapter;
};

const buildMysqlPoolConfig = () => {
  if (!connectionUri) {
    return {
      waitForConnections: true,
      connectionLimit: 1
    };
  }

  try {
    const parsed = new URL(connectionUri);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: String(parsed.pathname || "").replace(/^\/+/, ""),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };
  } catch (err) {
    console.error("Invalid DATABASE_URL format", err.message || err);
    return {
      waitForConnections: true,
      connectionLimit: 1
    };
  }
};

const pool =
  isPostgresUrl
    ? createPostgresAdapter()
    : mysql.createPool(buildMysqlPoolConfig());

if (!isPostgresUrl) {
  pool.on("connection", () => {
    if (parsedConnectionMeta.host) {
      console.log(
        `MySQL pool connected to ${parsedConnectionMeta.host}:${parsedConnectionMeta.port}/${parsedConnectionMeta.database}`
      );
    }
  });

  pool.on("error", (err) => {
    console.error("MySQL pool error", {
      message: err.message || String(err),
      code: err.code || null,
      errno: err.errno || null,
      address: err.address || parsedConnectionMeta.host || null,
      port: err.port || parsedConnectionMeta.port || null
    });
  });
}

let initStarted = false;

function runQuery(sql) {
  return new Promise((resolve) => {
    pool.query(sql, (err, rows) => resolve({ err, rows }));
  });
}

async function initCoreTables() {
  const statements = isPostgresUrl
    ? [
        `
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(120) NOT NULL UNIQUE,
          slug VARCHAR(140) NOT NULL UNIQUE,
          icon VARCHAR(255) DEFAULT '',
          is_active SMALLINT NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(140) NOT NULL,
          email VARCHAR(190) NOT NULL UNIQUE,
          phone VARCHAR(20) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          is_blocked SMALLINT NOT NULL DEFAULT 0,
          blocked_at TIMESTAMP NULL,
          block_reason TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS sellers (
          id SERIAL PRIMARY KEY,
          store_name VARCHAR(180) NOT NULL,
          owner_name VARCHAR(160) NOT NULL,
          email VARCHAR(190) NULL,
          phone VARCHAR(20) NOT NULL UNIQUE,
          address TEXT NULL,
          pincode VARCHAR(10) NULL,
          password VARCHAR(255) NOT NULL,
          owner_id_doc VARCHAR(255) NULL,
          license_doc VARCHAR(255) NULL,
          bank_passbook VARCHAR(255) NULL,
          store_photo VARCHAR(255) NULL,
          category_id INT NULL REFERENCES categories(id) ON DELETE SET NULL,
          alt_phone VARCHAR(20) NULL,
          bank_holder VARCHAR(160) NULL,
          bank_account VARCHAR(64) NULL,
          bank_ifsc VARCHAR(32) NULL,
          bank_name VARCHAR(160) NULL,
          bank_branch VARCHAR(160) NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          reject_reason TEXT NULL,
          is_online SMALLINT NOT NULL DEFAULT 0,
          account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          minimum_order DECIMAL(10,2) NOT NULL DEFAULT 100.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          seller_id INT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
          name VARCHAR(180) NOT NULL,
          category VARCHAR(120) NOT NULL,
          unit VARCHAR(60) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          mrp DECIMAL(10,2) DEFAULT NULL,
          stock INT NOT NULL DEFAULT 0,
          image VARCHAR(255) DEFAULT NULL,
          images_json TEXT NULL,
          sub_category VARCHAR(160) NULL,
          description TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          customer_id INT NULL,
          seller_id INT NULL,
          customer_name VARCHAR(160) NULL,
          phone VARCHAR(20) NULL,
          address TEXT NULL,
          pincode VARCHAR(10) NULL,
          total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          payment_method VARCHAR(30) DEFAULT 'COD',
          payment_status VARCHAR(30) DEFAULT 'PENDING',
          payment_id VARCHAR(80) NULL,
          delivery_otp VARCHAR(4) NULL,
          delivery_otp_verified_at TIMESTAMP NULL,
          delivered_at TIMESTAMP NULL,
          status VARCHAR(30) DEFAULT 'PLACED',
          cancelled_by VARCHAR(80) NULL,
          cancelled_by_role VARCHAR(30) NULL,
          cancel_actor VARCHAR(80) NULL,
          rejected_by VARCHAR(80) NULL,
          rejected_by_role VARCHAR(30) NULL,
          status_updated_by VARCHAR(80) NULL,
          reason TEXT NULL,
          cancel_reason TEXT NULL,
          customer_reason TEXT NULL,
          seller_reason TEXT NULL,
          status_reason TEXT NULL,
          reject_reason TEXT NULL,
          rejection_reason TEXT NULL,
          cancellation_reason TEXT NULL,
          cart JSONB NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS support_requests (
          id SERIAL PRIMARY KEY,
          customer_id INT NULL,
          name VARCHAR(160) NULL,
          email VARCHAR(190) NULL,
          phone VARCHAR(20) NULL,
          issue_type VARCHAR(60) NULL,
          message TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
          admin_note TEXT NULL,
          resolved_at TIMESTAMP NULL,
          resolved_by VARCHAR(80) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS site_visits (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(64) NOT NULL UNIQUE,
          is_admin SMALLINT NOT NULL DEFAULT 0,
          first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          max_elapsed_ms INT NOT NULL DEFAULT 0,
          pageviews INT NOT NULL DEFAULT 1,
          last_path VARCHAR(255) NULL,
          referrer VARCHAR(255) NULL,
          user_agent VARCHAR(255) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS settings (
          id INT PRIMARY KEY,
          global_commission_enabled SMALLINT NOT NULL DEFAULT 1,
          global_commission_percent DECIMAL(6,2) NOT NULL DEFAULT 10,
          payout_cycle VARCHAR(20) DEFAULT 'Weekly',
          min_payout DECIMAL(10,2) DEFAULT 0,
          system_mode VARCHAR(20) DEFAULT 'active',
          top_products_limit INT DEFAULT 2,
          top_sellers_limit INT DEFAULT 2,
          hero_title VARCHAR(200) DEFAULT 'Freshness from your {{highlight}}, to your doorstep.',
          hero_highlight VARCHAR(120) DEFAULT 'Local Market',
          hero_subtitle VARCHAR(260) DEFAULT 'Discover trusted neighborhood stores and connect directly with local sellers in minutes.',
          hero_image VARCHAR(255) DEFAULT NULL,
          hero_images_json TEXT NULL,
          hero_images_mobile_json TEXT NULL,
          mobile_promo_kicker VARCHAR(80) DEFAULT 'Local fresh picks',
          mobile_promo_title VARCHAR(120) DEFAULT 'Offer Up to',
          mobile_promo_highlight VARCHAR(60) DEFAULT '30% off',
          mobile_promo_cta VARCHAR(40) DEFAULT 'Shop now',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS seller_commission (
          seller_id INT PRIMARY KEY,
          commission_percent DECIMAL(6,2) NOT NULL DEFAULT 10,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        INSERT INTO settings (
          id, global_commission_enabled, global_commission_percent,
          payout_cycle, min_payout, system_mode,
          hero_title, hero_highlight, hero_subtitle, hero_image
        )
        VALUES (1, 1, 10, 'Weekly', 0, 'active',
          'Freshness from your {{highlight}}, to your doorstep.',
          'Local Market',
          'Discover trusted neighborhood stores and connect directly with local sellers in minutes.',
          NULL
        )
        ON CONFLICT (id) DO NOTHING
        `,
        `
        INSERT INTO categories (name, slug, icon, is_active)
        VALUES
          ('Grocery', 'grocery', 'fa-store', 1),
          ('Fruits & Vegetables', 'fruits-vegetables', 'fa-apple-whole', 1),
          ('Dairy', 'dairy', 'fa-cheese', 1)
        ON CONFLICT (slug) DO UPDATE
        SET
          name = EXCLUDED.name,
          icon = EXCLUDED.icon,
          is_active = EXCLUDED.is_active
        `
      ]
    : [
        `
        CREATE TABLE IF NOT EXISTS categories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(120) NOT NULL UNIQUE,
          slug VARCHAR(140) NOT NULL UNIQUE,
          icon VARCHAR(255) DEFAULT '',
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS customers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(140) NOT NULL,
          email VARCHAR(190) NOT NULL UNIQUE,
          phone VARCHAR(20) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS sellers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_name VARCHAR(180) NOT NULL,
          owner_name VARCHAR(160) NOT NULL,
          email VARCHAR(190) NULL,
          phone VARCHAR(20) NOT NULL UNIQUE,
          address TEXT NULL,
          pincode VARCHAR(10) NULL,
          password VARCHAR(255) NOT NULL,
          owner_id_doc VARCHAR(255) NULL,
          license_doc VARCHAR(255) NULL,
          bank_passbook VARCHAR(255) NULL,
          store_photo VARCHAR(255) NULL,
          category_id INT NULL,
          alt_phone VARCHAR(20) NULL,
          bank_holder VARCHAR(160) NULL,
          bank_account VARCHAR(64) NULL,
          bank_ifsc VARCHAR(32) NULL,
          bank_name VARCHAR(160) NULL,
          bank_branch VARCHAR(160) NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          reject_reason TEXT NULL,
          is_online TINYINT(1) NOT NULL DEFAULT 0,
          account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          minimum_order DECIMAL(10,2) NOT NULL DEFAULT 100.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_seller_status (status),
          KEY idx_seller_category (category_id),
          CONSTRAINT fk_seller_category
            FOREIGN KEY (category_id) REFERENCES categories(id)
            ON DELETE SET NULL
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS products (
          id INT AUTO_INCREMENT PRIMARY KEY,
          seller_id INT NOT NULL,
          name VARCHAR(180) NOT NULL,
          category VARCHAR(120) NOT NULL,
          unit VARCHAR(60) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          mrp DECIMAL(10,2) DEFAULT NULL,
          stock INT NOT NULL DEFAULT 0,
          image VARCHAR(255) DEFAULT NULL,
          images_json TEXT NULL,
          sub_category VARCHAR(160) NULL,
          description TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_product_seller (seller_id),
          CONSTRAINT fk_product_seller
            FOREIGN KEY (seller_id) REFERENCES sellers(id)
            ON DELETE CASCADE
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id INT NULL,
          seller_id INT NULL,
          customer_name VARCHAR(160) NULL,
          phone VARCHAR(20) NULL,
          address TEXT NULL,
          pincode VARCHAR(10) NULL,
          total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          payment_method VARCHAR(30) DEFAULT 'COD',
          payment_status VARCHAR(30) DEFAULT 'PENDING',
          payment_id VARCHAR(80) NULL,
          delivery_otp VARCHAR(4) NULL,
          delivery_otp_verified_at DATETIME NULL,
          delivered_at DATETIME NULL,
          status VARCHAR(30) DEFAULT 'PLACED',
          cancelled_by VARCHAR(80) NULL,
          cancelled_by_role VARCHAR(30) NULL,
          cancel_actor VARCHAR(80) NULL,
          rejected_by VARCHAR(80) NULL,
          rejected_by_role VARCHAR(30) NULL,
          status_updated_by VARCHAR(80) NULL,
          reason TEXT NULL,
          cancel_reason TEXT NULL,
          customer_reason TEXT NULL,
          seller_reason TEXT NULL,
          status_reason TEXT NULL,
          reject_reason TEXT NULL,
          rejection_reason TEXT NULL,
          cancellation_reason TEXT NULL,
          cart JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_order_customer (customer_id),
          KEY idx_order_seller (seller_id),
          KEY idx_order_status (status)
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS support_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id INT NULL,
          name VARCHAR(160) NULL,
          email VARCHAR(190) NULL,
          phone VARCHAR(20) NULL,
          issue_type VARCHAR(60) NULL,
          message TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
          admin_note TEXT NULL,
          resolved_at DATETIME NULL,
          resolved_by VARCHAR(80) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_support_status (status),
          KEY idx_support_created (created_at)
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS site_visits (
          id INT AUTO_INCREMENT PRIMARY KEY,
          session_id VARCHAR(64) NOT NULL UNIQUE,
          is_admin TINYINT(1) NOT NULL DEFAULT 0,
          first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          max_elapsed_ms INT NOT NULL DEFAULT 0,
          pageviews INT NOT NULL DEFAULT 1,
          last_path VARCHAR(255) NULL,
          referrer VARCHAR(255) NULL,
          user_agent VARCHAR(255) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_visit_first_seen (first_seen_at),
          KEY idx_visit_last_seen (last_seen_at),
          KEY idx_visit_admin (is_admin)
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS settings (
          id INT PRIMARY KEY,
          global_commission_enabled TINYINT(1) NOT NULL DEFAULT 1,
          global_commission_percent DECIMAL(6,2) NOT NULL DEFAULT 10,
          payout_cycle VARCHAR(20) DEFAULT 'Weekly',
          min_payout DECIMAL(10,2) DEFAULT 0,
          system_mode VARCHAR(20) DEFAULT 'active',
          hero_title VARCHAR(200) DEFAULT 'Freshness from your {{highlight}}, to your doorstep.',
          hero_highlight VARCHAR(120) DEFAULT 'Local Market',
          hero_subtitle VARCHAR(260) DEFAULT 'Discover trusted neighborhood stores and connect directly with local sellers in minutes.',
          hero_image VARCHAR(255) DEFAULT NULL,
          hero_images_json TEXT NULL,
          hero_images_mobile_json TEXT NULL,
          mobile_promo_kicker VARCHAR(80) DEFAULT 'Local fresh picks',
          mobile_promo_title VARCHAR(120) DEFAULT 'Offer Up to',
          mobile_promo_highlight VARCHAR(60) DEFAULT '30% off',
          mobile_promo_cta VARCHAR(40) DEFAULT 'Shop now',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS seller_commission (
          seller_id INT PRIMARY KEY,
          commission_percent DECIMAL(6,2) NOT NULL DEFAULT 10,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        `,
        `
        INSERT INTO settings (
          id, global_commission_enabled, global_commission_percent,
          payout_cycle, min_payout, system_mode,
          hero_title, hero_highlight, hero_subtitle, hero_image
        )
        VALUES (1, 1, 10, 'Weekly', 0, 'active',
          'Freshness from your {{highlight}}, to your doorstep.',
          'Local Market',
          'Discover trusted neighborhood stores and connect directly with local sellers in minutes.',
          NULL
        )
        ON DUPLICATE KEY UPDATE id = id
        `,
        `
        INSERT INTO categories (name, slug, icon, is_active)
        VALUES
          ('Grocery', 'grocery', 'fa-store', 1),
          ('Fruits & Vegetables', 'fruits-vegetables', 'fa-apple-whole', 1),
          ('Dairy', 'dairy', 'fa-cheese', 1)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          icon = VALUES(icon),
          is_active = VALUES(is_active)
        `
      ];

  for (const sql of statements) {
    const { err } = await runQuery(sql);
    if (err) console.error("core schema init failed:", err.message || err);
  }
}

async function ensureColumn(table, column, sql) {
  const checkSql = isPostgresUrl
    ? `
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = '${table}'
        AND column_name = '${column}'
    `
    : `
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${table}'
        AND COLUMN_NAME = '${column}'
    `;

  const { err, rows } = await runQuery(checkSql);
  if (err) {
    console.error(`${column} column check failed:`, err.message || err);
    return;
  }
  if (rows && rows[0] && rows[0].cnt) return;
  const { err: alterErr } = await runQuery(sql);
  if (alterErr) console.error(`${column} column add failed:`, alterErr.message || alterErr);
}

async function initDb() {
  if (initStarted || !connectionUri) return;
  initStarted = true;

  pool.getConnection(async (err, connection) => {
    if (err) {
      console.error("Database connection failed", {
        message: err.message || String(err),
        code: err.code || null,
        address: err.address || parsedConnectionMeta.host || null,
        port: err.port || parsedConnectionMeta.port || null,
        database: parsedConnectionMeta.database || null,
        user: parsedConnectionMeta.user || null
      });
      return;
    }

    console.log(`${isPostgresUrl ? "PostgreSQL" : "MySQL"} Connected`);
    connection.release();

    await initCoreTables();
    await ensureColumn("orders", "payment_id", "ALTER TABLE orders ADD COLUMN payment_id VARCHAR(80) NULL");
    await ensureColumn("orders", "delivery_otp", "ALTER TABLE orders ADD COLUMN delivery_otp VARCHAR(4) NULL");
    await ensureColumn("orders", "delivery_otp_verified_at", "ALTER TABLE orders ADD COLUMN delivery_otp_verified_at TIMESTAMP NULL");
    await ensureColumn("orders", "delivered_at", "ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMP NULL");
    await ensureColumn("products", "mrp", "ALTER TABLE products ADD COLUMN mrp DECIMAL(10,2) DEFAULT NULL");
    await ensureColumn("products", "description", "ALTER TABLE products ADD COLUMN description TEXT NULL");
    await ensureColumn("sellers", "minimum_order", "ALTER TABLE sellers ADD COLUMN minimum_order DECIMAL(10,2) NOT NULL DEFAULT 100.00");
    await ensureColumn("customers", "is_blocked", `ALTER TABLE customers ADD COLUMN is_blocked ${isPostgresUrl ? "SMALLINT" : "TINYINT(1)"} NOT NULL DEFAULT 0`);
    await ensureColumn("customers", "blocked_at", `ALTER TABLE customers ADD COLUMN blocked_at ${isPostgresUrl ? "TIMESTAMP" : "DATETIME"} NULL`);
    await ensureColumn("customers", "block_reason", "ALTER TABLE customers ADD COLUMN block_reason TEXT NULL");

    const extraStatements = isPostgresUrl
      ? [
          `
          CREATE TABLE IF NOT EXISTS store_ratings (
            id SERIAL PRIMARY KEY,
            order_id INT NOT NULL UNIQUE,
            store_id INT NOT NULL,
            customer_id INT NOT NULL,
            rating DECIMAL(3,2) NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
          `,
          `
          CREATE TABLE IF NOT EXISTS product_reviews (
            id SERIAL PRIMARY KEY,
            product_id INT NOT NULL,
            store_id INT NOT NULL,
            customer_id INT NULL,
            customer_name VARCHAR(120) NULL,
            rating DECIMAL(3,2) NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
          `,
          `
          CREATE TABLE IF NOT EXISTS otp_verifications (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) NOT NULL,
            email VARCHAR(255) NOT NULL,
            otp VARCHAR(6) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
          `
        ]
      : [
          `
          CREATE TABLE IF NOT EXISTS store_ratings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL UNIQUE,
            store_id INT NOT NULL,
            customer_id INT NOT NULL,
            rating DECIMAL(3,2) NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_store (store_id)
          )
          `,
          `
          CREATE TABLE IF NOT EXISTS product_reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            store_id INT NOT NULL,
            customer_id INT NULL,
            customer_name VARCHAR(120) NULL,
            rating DECIMAL(3,2) NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_product (product_id),
            KEY idx_store (store_id)
          )
          `,
          `
          CREATE TABLE IF NOT EXISTS otp_verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            phone VARCHAR(20) NOT NULL,
            email VARCHAR(255) NOT NULL,
            otp VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_phone_email (phone, email),
            KEY idx_expires (expires_at)
          )
          `
        ];

    for (const sql of extraStatements) {
      const { err: extraErr } = await runQuery(sql);
      if (extraErr) console.error("table init failed:", extraErr.message || extraErr);
    }
  });
}

initDb();

module.exports = pool;
