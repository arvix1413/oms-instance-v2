'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api'
import { getUser, normalizeRole } from './permissions'

function getCurrentRole(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const user = JSON.parse(localStorage.getItem('oms_user') || 'null')
    return user?.role ? normalizeRole(user.role) : null
  } catch {
    return null
  }
}

// Get permissions array from localStorage (set at login / refreshed on dashboard)
export function getPermissions(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('oms_permissions') || '[]')
  } catch { return [] }
}

function persistPermissions(permissions: string[]) {
  localStorage.setItem('oms_permissions', JSON.stringify(permissions))
}

// Check if current user has a specific permission
export function can(permission: string): boolean {
  const role = getCurrentRole()
  if (role === 'manager') return true
  return getPermissions().includes(permission)
}

// Hook-style helper for use in components
export function usePermissions() {
  // Keep the server render and the first browser render identical. Reading
  // localStorage during render makes permission-gated navigation and table
  // columns differ during hydration.
  const [ready, setReady] = useState(false)
  const [perms, setPerms] = useState<string[]>([])
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null)

  useEffect(() => {
    setUser(getUser())
    setPerms(getPermissions())
    setReady(true)

    // Refresh from server so permission policy changes apply without re-login
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiFetch<{ user: any; permissions?: string[] }>('/api/auth/me')
        if (cancelled) return
        if (data.user) {
          localStorage.setItem('oms_user', JSON.stringify(data.user))
          setUser(getUser())
        }
        if (Array.isArray(data.permissions)) {
          persistPermissions(data.permissions)
          setPerms(data.permissions)
        }
      } catch {
        // keep cached permissions if refresh fails
      }
    })()
    return () => { cancelled = true }
  }, [])

  const role = user?.role || null
  const canPermission = useCallback((permission: string) => {
    if (!ready) return false
    return role === 'manager' ? true : perms.includes(permission)
  }, [perms, ready, role])

  return {
    can: canPermission,
    perms,
    role,
    user,
    ready,
  }
}
