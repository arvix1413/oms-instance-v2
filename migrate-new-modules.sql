-- ── 進貨單 (Goods Receipts) ──────────────────────────────────────────────────
-- 採購單收貨時建立，更新材料庫存
CREATE TABLE IF NOT EXISTS goods_receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gr_number VARCHAR(50) NOT NULL UNIQUE,
  po_id INT,
  po_number VARCHAR(100),
  supplier_id INT,
  supplier_name TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',  -- draft, confirmed
  received_date DATE,
  remark TEXT,
  created_by INT,
  created_at VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gr_id INT NOT NULL,
  po_item_id INT,
  material_code VARCHAR(100) NOT NULL,
  material_name TEXT NOT NULL,
  spec TEXT,
  unit VARCHAR(50) DEFAULT 'PCS',
  ordered_qty DECIMAL(15,2) DEFAULT 0,
  received_qty DECIMAL(15,2) NOT NULL,
  unit_price DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(20) DEFAULT 'VND',
  batch_no VARCHAR(100),
  remark TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 生產單 (Production Orders) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prod_number VARCHAR(50) NOT NULL UNIQUE,
  customer_order_id INT,
  bom_id INT,
  product_sku VARCHAR(100),
  product_name TEXT NOT NULL,
  planned_qty DECIMAL(15,2) NOT NULL,
  produced_qty DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',  -- draft, in_progress, completed, cancelled
  planned_start DATE,
  planned_end DATE,
  actual_start DATE,
  actual_end DATE,
  remark TEXT,
  created_by INT,
  created_at VARCHAR(50),
  approved_by INT,
  approved_at VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 生產領料記錄
CREATE TABLE IF NOT EXISTS production_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prod_id INT NOT NULL,
  material_code VARCHAR(100) NOT NULL,
  material_name TEXT NOT NULL,
  spec TEXT,
  unit VARCHAR(50) DEFAULT 'PCS',
  planned_qty DECIMAL(15,2) DEFAULT 0,
  issued_qty DECIMAL(15,2) DEFAULT 0,
  batch_no VARCHAR(100),
  remark TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 庫存流水 (Stock Ledger) ───────────────────────────────────────────────────
-- 所有庫存變動的流水帳
CREATE TABLE IF NOT EXISTS stock_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_code VARCHAR(100) NOT NULL,
  material_name TEXT,
  transaction_type VARCHAR(30) NOT NULL,
  -- types: GR_IN(進貨), PROD_OUT(生產領料), PROD_IN(生產入庫), 
  --        DN_OUT(出貨), ADJ_IN(調整增加), ADJ_OUT(調整減少), INIT(初始)
  ref_type VARCHAR(30),   -- goods_receipt, production, delivery_note, adjustment
  ref_id INT,
  ref_number VARCHAR(100),
  qty_change DECIMAL(15,2) NOT NULL,  -- 正數=增加, 負數=減少
  qty_before DECIMAL(15,2) DEFAULT 0,
  qty_after DECIMAL(15,2) DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'PCS',
  batch_no VARCHAR(100),
  remark TEXT,
  created_by INT,
  created_at VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 庫存調整 (Stock Adjustments) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  adj_number VARCHAR(50) NOT NULL UNIQUE,
  adj_type VARCHAR(20) DEFAULT 'count',  -- count(盤點), scrap(報廢), other
  status VARCHAR(20) DEFAULT 'draft',
  adj_date DATE,
  remark TEXT,
  created_by INT,
  created_at VARCHAR(50),
  approved_by INT,
  approved_at VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  adj_id INT NOT NULL,
  material_code VARCHAR(100) NOT NULL,
  material_name TEXT,
  unit VARCHAR(50) DEFAULT 'PCS',
  system_qty DECIMAL(15,2) DEFAULT 0,   -- 系統庫存
  actual_qty DECIMAL(15,2) DEFAULT 0,   -- 實際盤點
  diff_qty DECIMAL(15,2) DEFAULT 0,     -- 差異 = actual - system
  batch_no VARCHAR(100),
  remark TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 更新 materials 表加庫存欄位 ───────────────────────────────────────────────
ALTER TABLE materials ADD COLUMN current_stock DECIMAL(15,2) DEFAULT 0;
ALTER TABLE materials ADD COLUMN min_stock DECIMAL(15,2) DEFAULT 0;
ALTER TABLE materials ADD COLUMN max_stock DECIMAL(15,2) DEFAULT 0;

-- ── 更新 purchase_orders 加部分到貨追蹤 ──────────────────────────────────────
ALTER TABLE po_items ADD COLUMN received_qty DECIMAL(15,2) DEFAULT 0;

-- ── 更新 delivery_notes 加部分出貨追蹤 ───────────────────────────────────────
ALTER TABLE delivery_note_items ADD COLUMN shipped_qty DECIMAL(15,2) DEFAULT 0;
