export type Role = 'admin' | 'manager' | 'employee' | 'purchaser' | 'viewer'

export const ROLE_LABELS: Record<string, string> = {
  admin: '系統管理者',
  manager: '主管',
  employee: '員工',
  // Legacy roles (kept for backward compatibility)
  purchaser: '採購員',
  viewer: '唯讀',
}

export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 border border-red-200',
  manager: 'bg-violet-100 text-violet-700 border border-violet-200',
  employee: 'bg-blue-100 text-blue-700 border border-blue-200',
  purchaser: 'bg-blue-100 text-blue-700 border border-blue-200',
  viewer: 'bg-slate-100 text-slate-600 border border-slate-200',
}

// Legacy hardcoded permissions (kept for backward compatibility)
// New system uses dynamic permissions from role_permissions table via usePermissions hook
export const PERMISSIONS = {
  canCreateCustomerOrder: (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canDeleteCustomerOrder: (role: Role) => ['admin', 'manager'].includes(role),
  canCreateBOM: (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canEditBOM:   (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canDeleteBOM: (role: Role) => ['admin', 'manager'].includes(role),
  canCreatePO:  (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canApprovePO: (role: Role) => ['admin', 'manager'].includes(role),
  canDeletePO:  (role: Role) => ['admin', 'manager'].includes(role),
  canCreateProduction: (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canDeleteProduction: (role: Role) => ['admin', 'manager'].includes(role),
  canCreateDelivery: (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canDeleteDelivery: (role: Role) => ['admin', 'manager'].includes(role),
  canManageCustomers:  (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canManageSuppliers:  (role: Role) => ['admin', 'manager', 'purchaser', 'employee'].includes(role),
  canManageMaterials:  (role: Role) => ['admin', 'manager'].includes(role),
  canViewInventory:    (role: Role) => true,
  canAdjustStock:      (role: Role) => ['admin', 'manager'].includes(role),
  canManageUsers: (role: Role) => role === 'admin',
  canViewAuditLog: (role: Role) => role === 'admin',
}

export function getUser(): { id: number; email: string; name: string; role: Role; signature_url?: string } | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('oms_user') || 'null') } catch { return null }
}
