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
  // Products & Materials
  canCreateProduct: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canEditProduct: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canDeleteProduct: (role: Role) => ['admin', 'manager'].includes(role),
  // BOM
  canCreateBOM: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canDeleteBOM: (role: Role) => ['admin', 'manager'].includes(role),
  // Purchase Orders
  canCreatePO: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  canApprovePO: (role: Role) => ['admin', 'manager'].includes(role),
  canDeletePO: (role: Role) => ['admin', 'manager'].includes(role),
  // Suppliers
  canManageSuppliers: (role: Role) => ['admin', 'manager', 'purchaser'].includes(role),
  // Users
  canManageUsers: (role: Role) => role === 'admin',
}

export function getUser(): { id: number; email: string; name: string; role: Role } | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('oms_user') || 'null') } catch { return null }
}
