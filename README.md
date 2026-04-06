# ERN Projects — 多系統平台

本倉庫包含多個獨立子系統，全部部署在 Cloudflare（Pages + Workers + D1 + R2）。

---

## 系統清單

| 系統 | 前端 URL | 後端 URL | 說明 |
|------|----------|----------|------|
| **OMS** | https://oms-frontend-14y.pages.dev | https://oms-backend.arvix1413.workers.dev | 訂單管理系統（主要） |
| Shopline | https://shopline-frontend.pages.dev | shopline-backend.workers.dev | 電商 SaaS 平台 |
| IMS | https://ims-frontend.pages.dev | ims-backend.workers.dev | 庫存管理 |
| TinyWearhouse | https://tinywearhouse-frontend.pages.dev | tinywearhouse-backend.workers.dev | 服裝電商 |
| MeiErQ | https://meierq-frontend.pages.dev | meierq-backend.workers.dev | 美妝電商 |
| DAF Shoes | https://daf-shoes-frontend.pages.dev | daf-shoes-backend.workers.dev | 鞋類電商 |
| Zenlet | https://zenlet-frontend.pages.dev | zenlet-backend.workers.dev | 錢包品牌 |

---

## OMS 訂單管理系統（重點）

### 系統概述

FAN YONG CO., LTD 的內部訂單管理系統，管理供應商、客戶、料號、BOM、採購單、客戶訂單、報價單、出貨單、庫存。

### 技術架構

```
oms/
├── backend/          # Hono + Cloudflare Workers
│   ├── src/index.ts  # 所有 API 路由（單文件）
│   └── wrangler.toml # Workers 配置
└── frontend/         # Next.js 14 靜態導出
    ├── app/          # App Router 頁面
    ├── components/   # 共用組件（MaterialSelect）
    └── lib/          # API 工具、權限、分頁
```

### 資料庫（Cloudflare D1）

資料庫名稱：`oms-v2-db`

主要表：
- `users` — 用戶（admin/manager/purchaser/viewer）
- `suppliers` — 供應商
- `customers` — 客戶
- `materials` — 料號主檔
- `bom` / `bom_items` — BOM 表
- `purchase_orders` / `po_items` — 採購單
- `customer_orders` / `customer_order_items` — 客戶訂單
- `quotations` / `quotation_items` — 報價單
- `delivery_notes` / `delivery_note_items` — 出貨單
- `inventory` — 庫存
- `audit_logs` — 操作日誌
- `role_permissions` — 角色權限

### 預設帳號

```
Email:    admin@oms.com
Password: admin123
Role:     admin（全部權限）
```

### 角色權限

| 角色 | 說明 |
|------|------|
| admin | 全部權限 + 用戶管理 |
| manager | 審批採購單、刪除資料 |
| purchaser | 建立/編輯料號、BOM、採購單 |
| viewer | 只能查看 |

---

## OMS 部署流程

### 前置條件

- Node.js 18+（建議 v24）
- Cloudflare 帳號 + API Token
- `npx wrangler` 已安裝

### 環境變數

```
Cloudflare Account ID: 51908639511240656e3a5d46a004f299
```

### 後端部署

```bash
cd oms/backend

# 登入 Cloudflare（OAuth，不需要 API Token）
npx wrangler login

# 部署到 production
npx wrangler deploy
```

後端 wrangler.toml 配置：
- Workers 名稱：`oms-backend`
- D1 binding：`DB` → `oms-v2-db`
- R2 binding：`BUCKET` → `oms-v2`
- 環境變數：`JWT_SECRET`、`CDN_DOMAIN`

**首次部署後需初始化資料庫：**

```bash
curl -X POST https://oms-backend.arvix1413.workers.dev/api/init
```

### 前端部署

```bash
cd oms/frontend

# 安裝依賴
npm install

# 建置靜態文件
npm run build
# 輸出到 out/ 目錄

# 部署到 Cloudflare Pages
npx wrangler pages deploy out \
  --project-name oms-frontend \
  --branch main \
  --commit-dirty=true
```

前端 Pages 專案名稱：`oms-frontend`  
生產 URL：`https://oms-frontend-14y.pages.dev`

### API 端點

後端 base URL：`https://oms-backend.arvix1413.workers.dev`

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/auth/login | 登入 |
| GET | /api/suppliers | 供應商列表 |
| GET | /api/customers | 客戶列表 |
| GET | /api/materials | 料號列表 |
| POST | /api/materials/bulk | 批量匯入料號（Excel） |
| GET | /api/bom | BOM 列表 |
| GET | /api/po | 採購單列表 |
| PATCH | /api/po/:id/approve | 核准採購單 |
| GET | /api/customer-orders | 客戶訂單列表 |
| GET | /api/quotations | 報價單列表 |
| GET | /api/delivery-notes | 出貨單列表 |
| GET | /api/inventory | 庫存列表 |
| GET | /api/audit-logs | 操作日誌（admin only） |
| GET | /api/stats | 儀表板統計 |

---

## 其他子系統部署

各子系統結構相同：`{系統名}/backend/` + `{系統名}/frontend/`

```bash
# 後端
cd {系統名}/backend
npx wrangler deploy

# 前端
cd {系統名}/frontend
npm run build
npx wrangler pages deploy out --project-name {系統名}-frontend --branch main
```

---

## 本地開發

```bash
# OMS 後端本地
cd oms/backend
npx wrangler dev

# OMS 前端本地
cd oms/frontend
npm run dev
# 訪問 http://localhost:3000
```

前端 `lib/api.ts` 中的 `API` 常數會自動切換本地/生產環境。

---

## Excel 資料匯入

OMS 支援從 Excel 批量匯入料號：

1. 進入「料號管理」→「Excel 匯入」
2. 文件格式參考：`oms/20250908_KFY ERP-更新內容.xlsx`
3. Sheet 名稱：`材料 BOM 表`
4. 欄位順序：產品分類、產品名稱、物料編號、材料名稱、規格、單位、單位、供應商名稱、供應商單價、公司售價

匯入時若供應商不存在，系統會自動建立。

---

## 注意事項

1. **CORS**：後端已設定允許 `oms-frontend-14y.pages.dev` 和 `localhost:3000`，新增域名需更新 `oms/backend/src/index.ts` 的 CORS 設定
2. **JWT**：Token 有效期 7 天，存在 localStorage
3. **圖片**：上傳到 R2 bucket `oms-v2`，通過 `/images/*` 路由提供
4. **時區**：所有時間戳使用 UTC+8（`now8()` 函數）
5. **操作日誌**：所有 CREATE/UPDATE/DELETE/APPROVE 操作自動記錄到 `audit_logs` 表
