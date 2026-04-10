# OMS - Order Management System

FAN YONG CO., LTD 訂單管理系統，部署在 VPS 雲端伺服器，使用 Docker 容器化運行。

## 線上地址

- 前端：http://43.133.56.234
- 後端 API：http://43.133.56.234/api
- 預設帳號：`admin@oms.com` / `admin123`

## 技術棧

- **前端**：Next.js 14 + TypeScript + Tailwind CSS
- **後端**：Hono + Node.js + MySQL
- **部署**：Docker Compose + GitHub Actions CI/CD
- **測試**：Playwright E2E

## 功能模組

### 業務流程
- 客戶訂單管理（建立 → 出貨 → 完成）
- BOM 材料明細管理
- 採購單管理（草稿 → 核准 → 發送 → 收貨）
- 生產單管理
- 出貨單管理（確認出貨時自動扣減庫存）

### 基礎資料
- 客戶管理
- 供應商管理

### 倉庫管理
- 庫存查詢（BOM 成品庫存）
- 庫存流水帳
- 庫存調整

### 系統管理
- RBAC 動態權限系統（角色：manager / employee）
- 用戶管理（新增/重置密碼）
- 角色權限管理（即時生效）
- 操作日誌
- 個人資料（電子簽名上傳）

## 庫存邏輯

| 操作 | 庫存變化 |
|------|---------|
| 採購單收貨 | +採購數量 |
| 出貨單確認出貨（shipped）| -出貨數量 |
| 生產單完工（有原材料配置）| -原材料用量 |
| 庫存調整核准 | ±差異數量 |

## 部署資訊

- **伺服器**：43.133.56.234
- **自動部署**：push 到 main 分支觸發 GitHub Actions，約 150 秒完成
- **Docker 容器**：oms-frontend, oms-backend, oms-mysql

## 本地開發

```bash
# 後端
cd backend && npm run dev   # http://localhost:3001

# 前端
cd frontend && npm run dev  # http://localhost:3000
```

## 下次開發待辦

- [ ] 報表模組（月度銷售/採購統計）
- [ ] 應收/應付帳款管理
- [ ] 出貨單出貨後更新客戶訂單已到數量
- [ ] 生產單原材料配置與庫存聯動
- [ ] 多語言支援（繁中/越南文）
- [ ] 手機版 RWD 優化
- [ ] 批量匯入客戶/供應商資料
- [ ] 採購單 PDF 匯出（含電子簽名）
