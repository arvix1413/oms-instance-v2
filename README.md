# OMS - Order Management System

訂單管理系統，部署在 VPS 雲端伺服器，使用 Docker 容器化運行。

## 線上地址

- 前端：http://43.133.56.234
- 後端 API：http://43.133.56.234/api
- 預設帳號：`admin@oms.com` / `admin123`

---

## 系統架構

```
用戶瀏覽器
    │
    ▼
Nginx (port 80)          ← oms-frontend 容器
    │
    ├── 靜態文件 (Next.js static export)
    │
    └── /api/* → 反向代理
                    │
                    ▼
            Node.js + Hono (port 3001)   ← oms-backend 容器
                    │
                    ▼
            MySQL 8.0 (port 3306)        ← oms-mysql 容器
```

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | Next.js 14 + TypeScript + Tailwind CSS |
| 後端 | Node.js + Hono framework |
| 資料庫 | MySQL 8.0 |
| 容器 | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Image 倉庫 | Docker Hub (111leo1) |

---

## 功能模塊

- 供應商管理
- 客戶管理
- 物料管理（支援 Excel 批量匯入）
- BOM 管理
- 採購單（PO）
- 客戶訂單
- 報價單
- 出貨單
- 庫存管理
- 用戶管理 + 角色權限
- 操作日誌

---

## CI/CD 自動部署流程

```
git push origin main
        │
        ▼
GitHub Actions 觸發
        │
        ├── 1. Checkout 代碼
        ├── 2. Docker Hub 登入
        ├── 3. Build oms-backend image → push 到 Docker Hub
        ├── 4. Build oms-frontend image → push 到 Docker Hub
        └── 5. SSH 進入伺服器執行 /opt/oms/deploy.sh
                    │
                    ├── docker compose pull  (拉取新 image)
                    ├── docker compose up -d (重啟容器)
                    └── docker image prune   (清理舊 image)
```

整個流程約 3-5 分鐘，部署狀態可在 GitHub Actions 頁面查看：
https://github.com/arvix1413/oms-instance-v2/actions

---

## GitHub Actions Secrets 配置

在 repo Settings → Secrets and variables → Actions 中設定：

| Secret 名稱 | 說明 |
|-------------|------|
| `DOCKER_HUB_USER` | Docker Hub 用戶名 |
| `DOCKER_HUB_TOKEN` | Docker Hub Access Token |
| `SERVER_HOST` | 伺服器 IP |
| `SERVER_USER` | SSH 用戶名 |
| `SERVER_PASSWORD` | SSH 密碼 |
| `SERVER_PORT` | SSH 端口（22） |

---

## 伺服器目錄結構

```
/opt/oms/
├── docker-compose.yml   # 容器編排配置（使用 Docker Hub images）
├── init.sql             # 資料庫初始化 schema + 預設管理員
├── deploy.sh            # 部署腳本（由 GitHub Actions 遠端執行）
└── uploads/             # 上傳文件持久化目錄
```

## Docker Hub Images

- `111leo1/oms-backend:latest`
- `111leo1/oms-frontend:latest`

---

## 本地開發

```bash
# 後端
cd backend
npm install
npm run dev   # port 3001

# 前端
cd frontend
npm install
npm run dev   # port 3000
```

## 手動部署（不走 CI/CD）

```bash
# 從項目根目錄執行
./oms-instance-v2/deploy-local.sh
```

腳本會自動打包代碼、上傳到伺服器、build image、push 到 Docker Hub、重啟容器。
