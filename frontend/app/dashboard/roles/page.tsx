'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ROLE_LABELS, ROLE_COLORS, PERMISSIONS, getUser, type Role } from '@/lib/permissions'
import { useRouter } from 'next/navigation'

type PermDef = { key: string; label: string }
type PermMap = Record<string, Record<string, boolean>>

const EDITABLE_ROLES: Role[] = ['manager', 'purchaser', 'viewer']

export default function RolesPage() {
  const router = useRouter()
  const [permMap, setPermMap] = useState<PermMap>({})
  const [allPerms, setAllPerms] = useState<PermDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const me = getUser()
    if (!me || !PERMISSIONS.canManageUsers(me.role)) {
      router.replace('/dashboard')
      return
    }
    load()
  }, [router])

  const load = async () => {
    try {
      const data = await apiFetch<{ permissions: PermMap; allPermissions: PermDef[] }>('/api/role-permissions')
      setPermMap(data.permissions)
      setAllPerms(data.allPermissions)
    } catch (e: any) {
      setMsg({ text: '載入失敗：' + e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3000)
  }

  const toggle = async (role: Role, permission: string, current: boolean) => {
    const key = `${role}:${permission}`
    setSaving(key)
    try {
      await apiFetch('/api/role-permissions', {
        method: 'PUT',
        body: JSON.stringify({ role, permission, allowed: !current })
      })
      setPermMap(prev => ({
        ...prev,
        [role]: { ...prev[role], [permission]: !current }
      }))
      showMsg(`已更新「${ROLE_LABELS[role]}」的「${allPerms.find(p=>p.key===permission)?.label}」權限`)
    } catch (e: any) {
      showMsg('更新失敗：' + e.message, 'error')
    } finally { setSaving(null) }
  }

  // Group permissions by category
  const groups = [
    { label: '料號管理', perms: allPerms.filter(p => p.key.startsWith('material.')) },
    { label: '供應商管理', perms: allPerms.filter(p => p.key.startsWith('supplier.')) },
    { label: 'BOM 表', perms: allPerms.filter(p => p.key.startsWith('bom.')) },
    { label: '採購單', perms: allPerms.filter(p => p.key.startsWith('po.')) },
    { label: '系統管理', perms: allPerms.filter(p => p.key.startsWith('user.')) },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">角色權限管理</h1>
        <p className="text-xs text-slate-400 mt-0.5">設定各角色可執行的操作，管理員角色擁有全部權限且不可修改</p>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-xs font-medium ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="oms-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-slate-200">
                <th className="px-5 py-4 text-left font-semibold text-slate-600 w-48">功能權限</th>
                {/* Admin - read only */}
                <th className="px-4 py-4 text-center w-32">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS['admin']}`}>{ROLE_LABELS['admin']}</span>
                    <span className="text-xs text-slate-300">全部權限</span>
                  </div>
                </th>
                {EDITABLE_ROLES.map(role => (
                  <th key={role} className="px-4 py-4 text-center w-32">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</span>
                      <span className="text-xs text-slate-300">可自訂</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={group.label} className="bg-slate-50">
                    <td colSpan={5} className="px-5 py-2 text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-t border-slate-200">
                      {group.label}
                    </td>
                  </tr>
                  {group.perms.map(perm => (
                    <tr key={perm.key} className="border-b hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-600">{perm.label}</td>
                      {/* Admin always checked */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      </td>
                      {EDITABLE_ROLES.map(role => {
                        const allowed = permMap[role]?.[perm.key] ?? false
                        const isSaving = saving === `${role}:${perm.key}`
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <div className="flex justify-center">
                              {isSaving ? (
                                <div className="w-5 h-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                              ) : (
                                <button
                                  onClick={() => toggle(role, perm.key, allowed)}
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                    allowed
                                      ? 'bg-blue-500 border-blue-500 hover:bg-blue-600'
                                      : 'bg-slate-50 border-white/20 hover:border-blue-400'
                                  }`}
                                  title={allowed ? '點擊取消此權限' : '點擊授予此權限'}
                                >
                                  {allowed && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-300 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-blue-500" />
              <span>已授權</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border-2 border-white/20" />
              <span>未授權</span>
            </div>
            <span className="ml-auto">點擊方格即時切換，變更立即生效</span>
          </div>
        </div>
      )}
    </div>
  )
}
