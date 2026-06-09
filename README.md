# OMS Instance V2

OMS 是 FAN YONG CO., LTD 的订单管理系统，覆盖从客户订单、BOM、采购、入库、出货，到库存、利润追踪、权限和审计日志的一整条业务链。

这份 README 不是对客户的简介，而是给新接手的工程师或 AI 的项目地图。目标是让接手者在 5 分钟内知道：项目做什么、关键逻辑在哪、如何本地启动、如何部署、改动后怎么验证。

## 1. Current Environment

### Environment
- 仅保留 PRD，服务器 `43.160.199.226`
- 发布分支: **`main`**（`git push origin main` 自动部署）

### Online URLs
- 前端: `http://43.160.199.226`
- 后端: `http://43.160.199.226:3001`

### Account Access
- 请使用个人账号登录
- PRD 共享排查账号: `admin@oms.com`
- PRD 当前密码: `Make$45617`
- 上述共享账号仅限内部排查、回归测试、紧急部署验证
- 如需开通或重置账号，请由管理员处理

## 2. Tech Stack

### Frontend
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- 原生 `fetch` + 本地封装 API 层

### Backend
- Hono
- Node.js
- MySQL 8
- TypeScript

### Deployment
- Docker Compose
- GitHub Actions
- Docker Hub 镜像发布
- Telegram 部署通知

### Testing
- Playwright E2E
- 若干一次性排查脚本和 CRUD sweep 脚本

## 3. Repository Layout

```text
oms-instance-v2/
├── frontend/                   # Next.js 前端
│   ├── app/dashboard/          # 各业务页面
│   ├── components/             # UI 组件、黏性表头桥接等
│   ├── lib/                    # API、权限、打印、通用逻辑
│   └── Dockerfile
├── backend/                    # Hono API
│   ├── src/index.ts            # 核心业务入口，大量 API 和运行时 migration 在这里
│   ├── src/db.ts               # MySQL 连接
│   └── src/auth.ts             # JWT、密码、时间工具
├── scripts/                    # 一些自动化脚本
├── docker-compose.yml          # 服务器部署入口
├── deploy-local.sh             # 旧的本地触发式部署脚本
├── verify-deployment.sh        # 部署后检查脚本
└── init.sql                    # 初始化数据库
```

## 4. Frontend Entry Points

### Main Dashboard Pages
- [frontend/app/dashboard/bom/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/bom/page.tsx)
- [frontend/app/dashboard/customer-orders/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/customer-orders/page.tsx)
- [frontend/app/dashboard/po/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/po/page.tsx)
- [frontend/app/dashboard/goods-receipts/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/goods-receipts/page.tsx)
- [frontend/app/dashboard/delivery-notes/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/delivery-notes/page.tsx)
- [frontend/app/dashboard/delivery-sheets/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/delivery-sheets/page.tsx)
- [frontend/app/dashboard/inventory/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/inventory/page.tsx)
- [frontend/app/dashboard/stock-ledger/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/stock-ledger/page.tsx)
- [frontend/app/dashboard/stock-adjustments/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/stock-adjustments/page.tsx)
- [frontend/app/dashboard/quotations/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/quotations/page.tsx)
- [frontend/app/dashboard/production/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/production/page.tsx)
- [frontend/app/dashboard/profit-tracking/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/profit-tracking/page.tsx)
- [frontend/app/dashboard/reports/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/reports/page.tsx)
- [frontend/app/dashboard/users/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/users/page.tsx)
- [frontend/app/dashboard/roles/page.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/roles/page.tsx)

### Frontend Shell
- [frontend/app/dashboard/layout.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/layout.tsx)
  - 负责侧边栏、权限可见性、页面级刷新反馈、全局 sticky table header host。
- [frontend/lib/api.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/lib/api.ts)
  - 所有页面都应该优先走这里，而不是自己裸写 `fetch`。
  - 统一做了 token 注入、错误信息翻译、日期字符串规范化、mutation 事件派发。
- [frontend/components/StickyTableHeaderBridge.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/components/StickyTableHeaderBridge.tsx)
  - 页面纵向滚动时，让表头悬浮跟随。

## 5. Backend Entry Points

### Core Files
- [backend/src/index.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/backend/src/index.ts)
- [backend/src/db.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/backend/src/db.ts)
- [backend/src/auth.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/backend/src/auth.ts)

### Critical Backend Characteristic
OMS 后端不是“路由拆很细”的结构，核心逻辑基本都在 `backend/src/index.ts` 一个文件里。新 AI 接手时要默认接受这件事，不要先急着重构。

同时，这个后端大量依赖“运行时自动补表结构”的模式：
- 启动后或 API 请求前，会执行 `ensure*` 系列函数
- 这些函数会自动创建表、补列、补索引
- 常见例子：软删除字段、BOM MOQ 阶梯价、利润追踪表、材料引用字段等

这意味着：
- 改 schema 时不能只看 `init.sql`
- 必须同步搜索 `ensure`、`ALTER TABLE`、`CREATE TABLE IF NOT EXISTS`
- 很多“为什么线上有这个列、本地 init.sql 却没有”的答案就在 `backend/src/index.ts`

## 6. Business Modules And Logic

### 6.1 Customer Orders
- 客户订单是业务主线入口
- 订单项支持 BOM 选择、数量、价格、备注等
- 与出货、利润、采购、库存都会产生关联

### 6.2 BOM / Materials
- `materials` 是原材料主档
- `bom` 是产品规格 / 成品结构
- BOM 支持图片、MOQ 阶梯价、材料明细
- 多处单据会通过 `material_id` / `bom_id` 做关联，而不是只靠名称

### 6.3 Purchase Orders
- PO 从 BOM/材料链路进入采购
- 收货后会影响库存
- 权限和状态流转要特别注意

### 6.4 Goods Receipts / Delivery Notes / Delivery Sheets
- 入库单和出货单都带库存影响
- 出货相关页面与客户订单数量追踪联动
- 打印格式有参考模板，且已存在真实打印逻辑

### 6.5 Inventory / Stock Ledger / Stock Adjustments
- 库存查询、流水、调整是独立模块，但本质上都依赖业务单据回写
- 软删除后要注意列表查询是否排除了 `deleted_at`

### 6.6 Quotations / Production / Profit Tracking
- 报价单支持 MOQ 阶梯价
- 生产单与 BOM、库存联动
- 利润追踪依赖 `order_profit_entries` 及公司比例配置

### 6.7 RBAC And Users
- 角色被归一化为 `manager` / `employee`
- 页面可见性和接口权限是两层控制
- 后端通过 `requirePerm(...)` 做动态校验
- 用户重置密码默认回到 `admin123`

## 7. UI/UX Conventions Already In Use

### Table Behavior
这个项目近期已经统一过一批表格行为，新 AI 不要再按老写法倒回去。

现有约定包括：
- 表格支持横向滚动
- 纵向滚动时表头可悬浮跟随
- 某些宽表使用冻结列逻辑
- 页面尽量保持和客户订单、BOM、PO 这些主页面一致的视觉节奏

### Data Formatting
- API 层会把 `YYYY-MM-DDT00:00:00.000Z` 这种日期自动规范成 `YYYY-MM-DD`
- 改日期字段时，优先复用现有格式，而不是引入新格式

## 8. Local Development

### Install
```bash
cd oms-instance-v2/frontend && npm install
cd ../backend && npm install
```

### Run Frontend
```bash
cd frontend
npm run dev
```
- 默认地址: `http://localhost:3000`

### Run Backend
```bash
cd backend
npm run dev
```
- 默认地址: `http://localhost:3001`

### Production Builds
```bash
cd frontend && npm run build
cd ../backend && npm run build
```

## 9. Deployment

### Source Of Truth
主部署链路以 GitHub Actions 为准，不是本地 `deploy-local.sh`。

### Workflow
- 文件: [/.github/workflows/deploy.yml](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/.github/workflows/deploy.yml)
- 触发条件: push 到 **`main`**
- 流程:
  1. checkout
  2. 登录 Docker Hub
  3. 构建并推送 `oms-backend:<branch>`
  4. 构建并推送 `oms-frontend:<branch>`
  5. 上传 `docker-compose.yml` 到目标服务器 `/opt/oms/`
  6. SSH 到服务器执行 `/opt/oms/deploy.sh`
  7. 成功或失败都发 Telegram 通知

### Docker Compose Runtime
- 文件: [docker-compose.yml](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/docker-compose.yml)
- 容器:
  - `oms-mysql`
  - `oms-backend`
  - `oms-frontend`

### Environment Variables Used On Server
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `JWT_SECRET`
- `DOCKER_HUB_USER`
- `IMAGE_TAG`

### Legacy Scripts
- [deploy-local.sh](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/deploy-local.sh)
- [verify-deployment.sh](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/verify-deployment.sh)

这些脚本可以帮助理解历史部署方式，但不应作为首选发布路径。

## 10. Verification After Changes

### Minimum Checks
```bash
cd frontend && npm run build
cd ../backend && npm run build
```

### Recommended UI Checks
优先检查这些页面，因为它们最容易连带回归：
- 登录页
- 客户订单
- BOM
- PO
- 入库单
- 出货单
- 库存
- 用户 / 权限

### Existing Test Assets
项目里已有大量 Playwright 和排查脚本，例如：
- `test-full-flow.spec.ts`
- `test-prod-crud-sweep.spec.ts`
- `test-po-print-layout.spec.ts`
- `test-quotation-crud.spec.ts`
- `test-rbac.spec.ts`

如果你改的是主流程，不要只看 build，至少补一次对应页面的真实点击验证。

## 11. Common Pitfalls

### 运行时 migration
很多字段不是靠一次性 migration 管，而是靠后端请求时 `ensure*` 补齐。修改表结构时要全局搜索。

### 单文件后端
`backend/src/index.ts` 很大，但里面包含真实业务规则。先理解，再改。

### 不要绕过 `frontend/lib/api.ts`
自己散写 `fetch` 很容易漏 token、漏错误翻译、漏日期规范化、漏 mutation 刷新事件。

### 打印功能不是演示代码
采购单、出货单、报价单等打印链路都是真实业务需求，不要轻易破坏。

## 12. Daily Patrol (每日巡檢)

OMS 每天早上 **7:00（Asia/Taipei）** 自动巡检 PRD 数据，并通过 Telegram 发送日报。报告标题带项目标识 `【ERP 每日巡檢報告 · OMS】`，与 Rubber-MES 的报告在同一 Telegram 群可区分。

### Architecture
- **GitHub Actions**: [/.github/workflows/daily-patrol.yml](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/.github/workflows/daily-patrol.yml)
- **Runner script**: [scripts/daily-patrol.mjs](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/scripts/daily-patrol.mjs)
- **Backend API**: `GET /api/daily-patrol-report`（需登录 token，直接查 MySQL 业务表）

流程：GitHub Actions 定时触发 → 脚本登录 PRD → 调用后端巡检 API → 按客户模板格式化 → 发到 Telegram 群。

### GitHub Secrets
| Secret | 说明 |
|--------|------|
| `TELEGRAM_PATROL_BOT_TOKEN` | DailyPatrolBot token（可与 Rubber-MES 共用） |
| `TELEGRAM_PATROL_CHAT_ID` | 目标 Telegram 群 chat_id |
| `OMS_PATROL_EMAIL` | 巡检登录账号，默认 `admin@oms.com` |
| `OMS_PATROL_PASSWORD` | 巡检登录密码 |

### Manual Run
```bash
PATROL_PROJECT_NAME=OMS \
OMS_PATROL_PASSWORD='...' \
TELEGRAM_PATROL_BOT_TOKEN='...' \
TELEGRAM_PATROL_CHAT_ID='...' \
node scripts/daily-patrol.mjs
```

或在 GitHub Actions 页面手动触发 `Daily Patrol (OMS)` workflow。

### Patrol Scope (v1)
- 订单 vs 出货数量不一致 / 超量出货
- 订单缺品项、品项缺 BOM
- BOM 缺材料、材料数量为 0
- 负库存 / 零库存提醒
- 订单、采购单、出货单、生产单流程卡住

### Related Code
- `buildDailyPatrolReport()` in [backend/src/index.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/backend/src/index.ts)

## 13. AI Handoff Checklist

新 AI 接手时，建议按这个顺序读：
1. [README.md](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/README.md)
2. [frontend/app/dashboard/layout.tsx](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/app/dashboard/layout.tsx)
3. [frontend/lib/api.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/frontend/lib/api.ts)
4. [backend/src/index.ts](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/backend/src/index.ts)
5. 目标业务页面对应的 `page.tsx`
6. 相关 Playwright 脚本
7. [/.github/workflows/deploy.yml](/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/.github/workflows/deploy.yml)

如果要动部署、表结构、权限、库存联动、打印，请默认这是高风险改动，先做最小闭环验证再提交。
