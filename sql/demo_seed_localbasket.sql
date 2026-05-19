CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  icon VARCHAR(255) DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS store_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  store_id INT NOT NULL,
  customer_id INT NOT NULL,
  rating DECIMAL(3,2) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_store (store_id)
);

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
);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_phone_email (phone, email),
  KEY idx_expires (expires_at)
);

INSERT INTO settings (
  id, global_commission_enabled, global_commission_percent,
  payout_cycle, min_payout, system_mode,
  hero_title, hero_highlight, hero_subtitle, hero_image
)
VALUES (
  1, 1, 10, 'Weekly', 0, 'active',
  'Freshness from your {{highlight}}, to your doorstep.',
  'Local Market',
  'Discover trusted neighborhood stores and connect directly with local sellers in minutes.',
  NULL
)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO categories (name, slug, icon, is_active)
VALUES
  ('Grocery', 'grocery', 'fa-store', 1),
  ('Fruits & Vegetables', 'fruits-vegetables', 'fa-apple-whole', 1),
  ('Dairy', 'dairy', 'fa-cheese', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  icon = VALUES(icon),
  is_active = VALUES(is_active);

INSERT INTO sellers (
  store_name, owner_name, email, phone, address, pincode, password,
  category_id, alt_phone, bank_holder, bank_account, bank_ifsc, bank_name, bank_branch,
  status, is_online, account_status, minimum_order
)
SELECT
  seed.store_name, seed.owner_name, seed.email, seed.phone, seed.address, seed.pincode, '123456',
  c.id, seed.alt_phone, seed.owner_name, seed.bank_account, seed.bank_ifsc, 'State Bank of India', 'Main Branch',
  'APPROVED', 1, 'ACTIVE', seed.minimum_order
FROM (
  SELECT 'Fresh Mart Grocery' AS store_name, 'Amit Sharma' AS owner_name, 'freshmart@localbasket.demo' AS email, '9000001001' AS phone, 'Shop 1, Sai Market, Mira Road East' AS address, '401105' AS pincode, '9000002001' AS alt_phone, '100000000001' AS bank_account, 'SBIN0001001' AS bank_ifsc, 149.00 AS minimum_order, 'grocery' AS category_slug
  UNION ALL SELECT 'Daily Needs Grocery', 'Pooja Verma', 'dailyneeds@localbasket.demo', '9000001002', 'Shop 8, Shanti Nagar, Mira Road East', '401105', '9000002002', '100000000002', 'SBIN0001002', 99.00, 'grocery'
  UNION ALL SELECT 'Budget Basket Grocery', 'Rahul Singh', 'budgetbasket@localbasket.demo', '9000001003', 'Station Lane, Naya Nagar, Mira Road', '401105', '9000002003', '100000000003', 'SBIN0001003', 129.00, 'grocery'
  UNION ALL SELECT 'Green Valley Fruits', 'Neha Patel', 'greenvalley@localbasket.demo', '9000001101', 'Sector 4, Kanakia Road, Mira Road', '401105', '9000002101', '100000000004', 'SBIN0001101', 89.00, 'fruits-vegetables'
  UNION ALL SELECT 'Farm Fresh Veggies', 'Rakesh Jain', 'farmfresh@localbasket.demo', '9000001102', 'Poonam Sagar Complex, Mira Road', '401105', '9000002102', '100000000005', 'SBIN0001102', 79.00, 'fruits-vegetables'
  UNION ALL SELECT 'Hariyali Produce', 'Kavita Gupta', 'hariyali@localbasket.demo', '9000001103', 'Silver Park, Mira Bhayandar', '401105', '9000002103', '100000000006', 'SBIN0001103', 69.00, 'fruits-vegetables'
  UNION ALL SELECT 'Pure Milk Dairy', 'Suresh Yadav', 'puremilk@localbasket.demo', '9000001201', 'Jangid Circle, Mira Road East', '401105', '9000002201', '100000000007', 'SBIN0001201', 120.00, 'dairy'
  UNION ALL SELECT 'Creamline Dairy', 'Meena Joshi', 'creamline@localbasket.demo', '9000001202', 'Sheetal Nagar, Mira Road', '401105', '9000002202', '100000000008', 'SBIN0001202', 110.00, 'dairy'
  UNION ALL SELECT 'Shree Dairy Hub', 'Vikas Tiwari', 'shreedairy@localbasket.demo', '9000001203', 'Srishti Road, Mira Road East', '401105', '9000002203', '100000000009', 'SBIN0001203', 99.00, 'dairy'
) AS seed
JOIN categories c ON c.slug = seed.category_slug
LEFT JOIN sellers existing ON existing.phone = seed.phone
WHERE existing.id IS NULL;

UPDATE sellers s
JOIN (
  SELECT '9000001001' AS phone, 'Shop 1, Sai Market, Mira Road East' AS address, '401105' AS pincode
  UNION ALL SELECT '9000001002', 'Shop 8, Shanti Nagar, Mira Road East', '401105'
  UNION ALL SELECT '9000001003', 'Station Lane, Naya Nagar, Mira Road', '401105'
  UNION ALL SELECT '9000001101', 'Sector 4, Kanakia Road, Mira Road', '401105'
  UNION ALL SELECT '9000001102', 'Poonam Sagar Complex, Mira Road', '401105'
  UNION ALL SELECT '9000001103', 'Silver Park, Mira Bhayandar', '401105'
  UNION ALL SELECT '9000001201', 'Jangid Circle, Mira Road East', '401105'
  UNION ALL SELECT '9000001202', 'Sheetal Nagar, Mira Road', '401105'
  UNION ALL SELECT '9000001203', 'Srishti Road, Mira Road East', '401105'
) seed ON seed.phone = s.phone
SET s.address = seed.address,
    s.pincode = seed.pincode,
    s.status = 'APPROVED',
    s.is_online = 1,
    s.account_status = 'ACTIVE';

INSERT INTO products (seller_id, name, category, unit, price, mrp, stock, sub_category, description)
SELECT s.id, p.name, p.category, p.unit, p.price, p.mrp, p.stock, p.sub_category, p.description
FROM sellers s
JOIN (
  SELECT '9000001001' AS phone, 'Atta Gold' AS name, 'Grocery' AS category, '5 kg' AS unit, 265.00 AS price, 290.00 AS mrp, 40 AS stock, 'Staples' AS sub_category, 'Premium wheat flour for daily use.' AS description
  UNION ALL SELECT '9000001001', 'Basmati Rice', 'Grocery', '10 kg', 799.00, 860.00, 28, 'Staples', 'Long grain basmati rice.'
  UNION ALL SELECT '9000001001', 'Toor Dal', 'Grocery', '1 kg', 145.00, 160.00, 55, 'Pulses', 'Clean and unpolished arhar dal.'
  UNION ALL SELECT '9000001002', 'Fortune Oil', 'Grocery', '1 L', 168.00, 180.00, 34, 'Cooking Oil', 'Refined sunflower oil.'
  UNION ALL SELECT '9000001002', 'Sugar Pack', 'Grocery', '1 kg', 48.00, 52.00, 80, 'Staples', 'Sulphur-free crystal sugar.'
  UNION ALL SELECT '9000001002', 'Tea Premium', 'Grocery', '500 g', 210.00, 235.00, 22, 'Beverages', 'Strong blended tea leaves.'
  UNION ALL SELECT '9000001003', 'Besan' , 'Grocery', '1 kg', 92.00, 100.00, 38, 'Flours', 'Fresh gram flour.'
  UNION ALL SELECT '9000001003', 'Poha Thick', 'Grocery', '1 kg', 68.00, 75.00, 31, 'Breakfast', 'Thick poha for breakfast dishes.'
  UNION ALL SELECT '9000001003', 'Masala Combo', 'Grocery', '6 pcs', 185.00, 210.00, 17, 'Spices', 'Kitchen masala essentials combo.'

  UNION ALL SELECT '9000001101', 'Banana' , 'Fruits & Vegetables', '1 dozen', 58.00, 70.00, 45, 'Fruits', 'Fresh yellow bananas.'
  UNION ALL SELECT '9000001101', 'Apple Shimla', 'Fruits & Vegetables', '1 kg', 165.00, 185.00, 25, 'Fruits', 'Crisp Shimla apples.'
  UNION ALL SELECT '9000001101', 'Pomegranate', 'Fruits & Vegetables', '1 kg', 145.00, 160.00, 19, 'Fruits', 'Juicy fresh pomegranates.'
  UNION ALL SELECT '9000001102', 'Tomato Hybrid', 'Fruits & Vegetables', '1 kg', 34.00, 40.00, 62, 'Vegetables', 'Red farm tomatoes.'
  UNION ALL SELECT '9000001102', 'Potato', 'Fruits & Vegetables', '1 kg', 28.00, 32.00, 70, 'Vegetables', 'Table potatoes for daily use.'
  UNION ALL SELECT '9000001102', 'Onion', 'Fruits & Vegetables', '1 kg', 30.00, 36.00, 58, 'Vegetables', 'Medium size onions.'
  UNION ALL SELECT '9000001103', 'Palak Bunch', 'Fruits & Vegetables', '1 bunch', 20.00, 25.00, 36, 'Leafy Greens', 'Fresh spinach bunch.'
  UNION ALL SELECT '9000001103', 'Coriander', 'Fruits & Vegetables', '100 g', 12.00, 15.00, 50, 'Leafy Greens', 'Aromatic coriander leaves.'
  UNION ALL SELECT '9000001103', 'Capsicum', 'Fruits & Vegetables', '500 g', 38.00, 45.00, 24, 'Vegetables', 'Green capsicum.'

  UNION ALL SELECT '9000001201', 'Cow Milk', 'Dairy', '1 L', 64.00, 68.00, 42, 'Milk', 'Fresh toned cow milk.'
  UNION ALL SELECT '9000001201', 'Paneer Fresh', 'Dairy', '200 g', 86.00, 95.00, 18, 'Paneer', 'Soft fresh paneer.'
  UNION ALL SELECT '9000001201', 'Curd Cup', 'Dairy', '400 g', 36.00, 40.00, 33, 'Curd', 'Thick fresh curd.'
  UNION ALL SELECT '9000001202', 'Butter Salted', 'Dairy', '100 g', 58.00, 64.00, 27, 'Butter', 'Creamy salted butter.'
  UNION ALL SELECT '9000001202', 'Cheese Slices', 'Dairy', '10 pcs', 122.00, 135.00, 21, 'Cheese', 'Processed cheese slices.'
  UNION ALL SELECT '9000001202', 'Lassi Sweet', 'Dairy', '750 ml', 48.00, 55.00, 26, 'Beverages', 'Chilled sweet lassi.'
  UNION ALL SELECT '9000001203', 'Ghee Pure', 'Dairy', '500 ml', 315.00, 340.00, 14, 'Ghee', 'Rich pure desi ghee.'
  UNION ALL SELECT '9000001203', 'Buttermilk', 'Dairy', '1 L', 42.00, 48.00, 29, 'Beverages', 'Refreshing masala chaas.'
  UNION ALL SELECT '9000001203', 'Flavoured Yogurt', 'Dairy', '200 g', 32.00, 38.00, 31, 'Yogurt', 'Mango flavoured yogurt.'
) AS p ON p.phone = s.phone
LEFT JOIN products existing ON existing.seller_id = s.id AND existing.name = p.name
WHERE existing.id IS NULL;

SELECT 'categories' AS entity, COUNT(*) AS total FROM categories
UNION ALL
SELECT 'sellers', COUNT(*) FROM sellers
UNION ALL
SELECT 'products', COUNT(*) FROM products;
