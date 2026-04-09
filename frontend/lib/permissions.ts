export type Role = 'admin' | 'manager' | 'purchaser' | 'viewer'

export const ROLE_LABELS: Record<Role, string> = {
  admin: '系統管理員',
  manager: '主管（審批）',
  purchaser: '採購員',
  viewer: '只讀',
}

export const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-red-100 text-red-700 border border-red-200',
  manager: 'bg-violet-100 text-violet-700 border border-violet-200',
  purchaser: 'bg-blue-100 text-blue-700 border border-blue-200',
  viewer: 'bg-slate-100 text-slate-600 border border-slate-200',
}

export const PERMISSIONS = {
  // ── 客戶訂單 ──────────────────────────────────────────────────────────────
  canCreateCustomerOrder: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canDeleteCustomerOrder: (role: Role) => ['admin', 'manager'].includes(role),

  // ── BOM 材料明細 ──────────────────────────────────────────────────────────
  canCreateBOM: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canEditBOM:   (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canDeleteBOM: (role: Role) => ['admin', 'manager'].includes(role),

  // ── 採購單 ────────────────────────────────────────────────────────────────
  canCreatePO:  (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canApprovePO: (role: Role) => ['admin', 'manager'].includes(role),
  canDeletePO:  (role: Role) => ['admin', 'manager'].includes(role),

  // ── 生產單 ────────────────────────────────────────────────────────────────
  canCreateProduction: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canDeleteProduction: (role: Role) => ['admin', 'manager'].includes(role),

  // ── 出貨單 ────────────────────────────────────────────────────────────────
  canCreateDelivery: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canDeleteDelivery: (role: Role) => ['admin', 'manager'].includes(role),

  // ── 基礎資料 ──────────────────────────────────────────────────────────────
  canManageCustomers:  (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canManageSuppliers:  (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  // 料號管理暫時隱藏，保留權限定義供未來使用
  canManageMaterials:  (role: Role) => ['admin', 'manager'].includes(role),

  // ── 倉庫管理 ──────────────────────────────────────────────────────────────
  canViewInventory:    (role: Role) => ['admin', 'manager', 'purchaser', 'viewer'].includes(role),
  canAdjustStock:      (role: Role) => ['admin', 'manager'].includes(role),

  // ── 系統管理 ──────────────────────────────────────────────────────────────
  canManageUsers: (role: Role) => role === 'admin',
  canViewAuditLog: (role: Role) => role === 'admin',
}

export function getUser(): { id: number; email: string; name: string; role: Role } | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('oms_user') || 'null') } catch { return null }
}
