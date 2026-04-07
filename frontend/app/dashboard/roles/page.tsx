'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { getUser } from '@/lib/permissions'
import { useRouter } from 'next/navigation'

type PermDef = { key: string; label: string }
type PermMap = Record<string, Record<string, boolean>>

const SYSTEM_ROLES = ['admin', 'manager', 'purchaser', 'viewer']
const ROLE_LABELS: Record<string, string> = {
  admin: '系統管理員', manager: '主管', purchaser: '採購員', viewer: '查看者'
}
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-violet-100 text-violet-700',
  purchaser: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
}

const PERM_GROUPS = [
  { label: '料號管理', prefix: 'material.' },
  { label: '供應商管理', prefix: 'supplier.' },
  { label: 'BOM 表', prefix: 'bom.' },
  { label: '採購單', prefix: 'po.' },
  { label: '系統管理', prefix: 'user.' },
]

export default function RolesPage() {
  const router = useRouter()
  const { toast, confirm: confirmDialog } = useDialog()

  const [permMap, setPermMap] = useState<PermMap>({})
  const [allPerms, setAllPerms] = useState<PermDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Create role form
  const [creating, setCreating] = useState(false)
  const [newRole, setNewRole] = useState({ name: '', label: '', perms: {} as Record<string, boolean> })

  useEffect(() => {
    const me = getUser()
    if (!me || me.role !== 'admin') { router.replace('/dashboard'); return }
    load()
  }, [router])

  const load = async () => {
    try {
      const data = await apiFetch<{ permissions: PermMap; allPermissions: PermDef[] }>('/api/role-permissions')
      setPermMap(data.permissions)
      setAllPerms(data.allPermissions)
    } catch (e: any) {
      toast('載入失敗：' + e.message, 'error')
    } finally { setLoading(false) }
  }

  const toggle = async (role: string, permission: string, current: boolean) => {
    const key = `${role}:${permission}`
    setSaving(key)
    try {
      await apiFetch('/api/role-permissions', {
        method: 'PUT',
        body: JSON.stringify({ role, permission, allowed: !current })
      })
      setPermMap(prev => ({ ...prev, [role]: { ...prev[role], [permission]: !current } }))
    } catch (e: any) {
      toast('更新失敗：' + e.message, 'error')
    } finally { setSaving(null) }
  }

  const saveNewRole = async () => {
    if (!newRole.name || !newRole.label) return toast('請填寫角色代碼和名稱', 'error')
    if (SYSTEM_ROLES.includes(newRole.name)) return toast('不能使用系統保留角色名稱', 'error')
    try {
      // Save all selected permissions for the new role
      for (const [perm, allowed] of Object.entries(newRole.perms)) {
        if (allowed) {
          await apiFetch('/api/role-permissions', {
            method: 'PUT',
            body: JSON.stringify({ role: newRole.name, permission: perm, allowed: true })
          })
        }
      }
      toast(`角色「${newRole.label}」建立成功`)
      setCreating(false)
      setNewRole({ name: '', label: '', perms: {} })
      load()
    } catch (e: any) { toast('建立失敗：' + e.message, 'error') }
  }

  const editableRoles = Object.keys(permMap).filter(r => r !== 'admin')
  const allRoles = ['admin', ...editableRoles]

  const groups = PERM_GROUPS.map(g => ({
    ...g,
    perms: allPerms.filter(p => p.key.startsWith(g.prefix))
  })).filter(g => g.perms.length > 0)

  const CheckBox = ({ checked, saving: isSaving, onClick }: { checked: boolean; saving: boolean; onClick: () => void }) => (
    <div className="flex justify-center">
      {isSaving ? (
        <div className="w-5 h-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      ) : (
        <button onClick={onClick}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            checked ? 'bg-blue-500 border-blue-500 hover:bg-blue-600' : 'bg-white border-slate-300 hover:border-blue-400'
          }`}>
          {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
        </button>
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">角色管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">建立角色並設定各角色的操作權限</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">+ 建立角色</button>
      </div>

      {/* Create role modal */}
      {creating && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">建立新角色</h2>
              <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">角色代碼 *（英文）</label>
                  <input className="oms-input" placeholder="例：sales" value={newRole.name}
                    onChange={e => setNewRole(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s/g,'') }))} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">角色名稱 *</label>
                  <input className="oms-input" placeholder="例：業務人員" value={newRole.label}
                    onChange={e => setNewRole(p => ({ ...p, label: e.target.value }))} />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-2">選擇權限</div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {groups.map(g => (
                    <div key={g.label}>
                      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 flex items-center justify-between">
                        <span>{g.label}</span>
                        <button className="text-blue-500 text-[10px]" onClick={() => {
                          const allChecked = g.perms.every(p => newRole.perms[p.key])
                          const update: Record<string, boolean> = {}
                          g.perms.forEach(p => { update[p.key] = !allChecked })
                          setNewRole(prev => ({ ...prev, perms: { ...prev.perms, ...update } }))
                        }}>全選/取消</button>
                      </div>
                      {g.perms.map(p => (
                        <label key={p.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                          <input type="checkbox" className="w-4 h-4 accent-blue-600"
                            checked={!!newRole.perms[p.key]}
                            onChange={e => setNewRole(prev => ({ ...prev, perms: { ...prev.perms, [p.key]: e.target.checked } }))} />
                          <span className="text-sm text-slate-600">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={saveNewRole} className="btn-primary flex-1 justify-center">建立角色</button>
              <button onClick={() => setCreating(false)} className="btn-ghost flex-1 justify-center border border-slate-200">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="oms-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-5 py-4 text-left font-semibold text-slate-600 w-44 whitespace-nowrap">功能權限</th>
                {allRoles.map(role => (
                  <th key={role} className="px-4 py-4 text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'}`}>
                        {ROLE_LABELS[role] || role}
                      </span>
                      {role === 'admin' && <span className="text-[10px] text-slate-300">全部權限</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={group.label} className="bg-slate-50 border-y border-slate-200">
                    <td colSpan={allRoles.length + 1} className="px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {group.label}
                    </td>
                  </tr>
                  {group.perms.map(perm => (
                    <tr key={perm.key} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-600 text-sm">{perm.label}</td>
                      {/* Admin always checked */}
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                          </div>
                        </div>
                      </td>
                      {editableRoles.map(role => {
                        const allowed = permMap[role]?.[perm.key] ?? false
                        const isSaving = saving === `${role}:${perm.key}`
                        return (
                          <td key={role} className="px-4 py-3">
                            <CheckBox checked={allowed} saving={isSaving} onClick={() => toggle(role, perm.key, allowed)} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-4">
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-blue-500" /><span>已授權</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded border-2 border-slate-300" /><span>未授權</span></div>
            <span className="ml-auto">點擊方格即時切換</span>
          </div>
        </div>
      )}
    </div>
  )
}
