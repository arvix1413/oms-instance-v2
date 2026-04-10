'use client'

// Get permissions array from localStorage (set at login)
export function getPermissions(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('oms_permissions') || '[]')
  } catch { return [] }
}

// Check if current user has a specific permission
export function can(permission: string): boolean {
  return getPermissions().includes(permission)
}

// Hook-style helper for use in components
export function usePermissions() {
  const perms = getPermissions()
  return {
    can: (permission: string) => perms.includes(permission),
    perms,
  }
}
