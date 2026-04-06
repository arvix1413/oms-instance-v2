'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ROLE_LABELS, ROLE_COLORS, PERMISSIONS, getUser, type Role } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { usePagination, Pagination } from '@/lib/usePagination'

type User = { id: number; email: string; name: string; role: Role; created_at: string }
const empty = (): Partial<User> & { password?: string } => ({ email:'', name:'', role:'purchaser', password:'' })

export default function UsersPage() {
  const router = useRouter()
  const { toast, confirm: confirmDialog } = useDialog()

  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<(Partial<User> & { password?: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [changingRole, setChangingRole] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const me = getUser()
    if (!me || !PERMISSIONS.canManageUsers(me.role)) {
      router.replace('/dashboard')
      return
    }
    load()
  }, [router])

  const load = () => apiFetch<User[]>('/api/users').then(setUsers).finally(() => setLoading(false))

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3000)
  }

  const save = async () => {
    if (!editing) return
    try {
      if (editing.id) {
        await apiFetch(`/api/users/${editing.id}`, { method: 'PUT', body: JSON.stringify(editing) })
      } else {
        if (!editing.password) { toast('新用戶需要設定密碼', 'error'); return }
        await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(editing) })
      }
      toast('儲存成功'); setEditing(null); load()
    } catch (e: any) { toast('錯誤：' + e.message, 'error') }
  }

  // Quick role change directly from table
  const changeRole = async (userId: number, newRole: Role) => {
    setChangingRole(userId)
    try {
      const user = users.find(u => u.id === userId)
      if (!user) return
      await apiFetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify({ name: user.name, role: newRole }) })
      toast(`已將 ${user.name} 的角色更新為「${ROLE_LABELS[newRole]}」`)
      load()
    } catch (e: any) { toast('更新失敗：' + e.message, 'error') }
    finally { setChangingRole(null) }
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`確定刪除用戶「${name}」？此操作無法復原。`)) return
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
      toast('用戶已刪除'); load()
    } catch (e: any) { toast('刪除失敗：' + e.message, 'error') }
  }

  const inp = 'oms-input'
  const me = getUser()
  const filtered = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">用戶管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">管理系統用戶及其權限角色</p>
        </div>
        <button onClick={() => setEditing(empty())} className="btn-primary">+ 新增用戶</button>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([role, label]) => (
          <div key={role} className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${ROLE_COLORS[role].replace('text-', 'border-').split(' ')[0]}`}>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${ROLE_COLORS[role]}`}>{label}</span>
            <div className="text-xs text-slate-400 leading-relaxed">
              {role === 'admin' && '全部權限 + 用戶管理'}
              {role === 'manager' && '審批採購單、刪除資料'}
              {role === 'purchaser' && '建立/編輯料號、BOM、採購單'}
              {role === 'viewer' && '只能查看，不能修改'}
            </div>
            <div className="text-xs font-semibold mt-2" style={{color: 'inherit'}}>
              {users.filter(u => u.role === role).length} 人
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {/* Create/Edit Form */}
      {editing && (
        <div className="oms-card p-6 mb-5 shadow-sm">
          <h2 className="font-semibold mb-4 text-lg">{editing.id ? '編輯用戶資料' : '新增用戶'}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">Email *</label>
              <input type="email" className={inp} value={editing.email||''} onChange={e=>setEditing(p=>({...p,email:e.target.value}))}
                disabled={!!editing.id} placeholder="user@company.com" />
              {editing.id && <p className="text-xs text-slate-300 mt-1">Email 不可修改</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">姓名 *</label>
              <input className={inp} value={editing.name||''} onChange={e=>setEditing(p=>({...p,name:e.target.value}))} placeholder="用戶姓名" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">角色 *</label>
              <select className={inp} value={editing.role||'purchaser'} onChange={e=>setEditing(p=>({...p,role:e.target.value as Role}))}>
                {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([r, l]) => (
                  <option key={r} value={r}>{l}</option>
                ))}
              </select>
              <p className="text-xs text-slate-300 mt-1">
                {editing.role === 'admin' && '⚠️ 管理員擁有全部權限'}
                {editing.role === 'manager' && '可審批採購單及刪除資料'}
                {editing.role === 'purchaser' && '可建立及編輯料號、BOM、採購單'}
                {editing.role === 'viewer' && '只能查看，無法修改任何資料'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                {editing.id ? '新密碼（留空不修改）' : '密碼 *'}
              </label>
              <input type="password" className={inp} value={editing.password||''} onChange={e=>setEditing(p=>({...p,password:e.target.value}))}
                placeholder={editing.id ? '留空則不修改密碼' : '至少 6 個字元'} />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={save} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              {editing.id ? '儲存變更' : '建立用戶'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost border border-slate-200 px-6 py-2">取消</button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="oms-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">共 {users.length} 位用戶</span>
          <div className="flex items-center gap-3">
            <input className="oms-input w-48" placeholder="搜尋姓名或Email..." value={search} onChange={e=>setSearch(e.target.value)} />
            <span className="text-xs text-slate-300">點擊角色標籤可快速修改</span>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : (
          <>
            <table className="oms-table">
              <thead className="bg-transparent text-xs text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">用戶</th>
                  <th className="px-4 py-3 text-left">角色權限</th>
                  <th className="px-4 py-3 text-left">建立時間</th>
                  <th className="px-4 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {paged.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: u.role === 'admin' ? '#DC2626' : u.role === 'manager' ? '#7C3AED' : u.role === 'purchaser' ? '#2563EB' : '#6B7280' }}>
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {me?.id !== u.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            onChange={e => changeRole(u.id, e.target.value as Role)}
                            disabled={changingRole === u.id}
                            className={`text-xs px-2 py-1 rounded-lg border font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/50 ${ROLE_COLORS[u.role]}`}
                          >
                            {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([r, l]) => (
                              <option key={r} value={r}>{l}</option>
                            ))}
                          </select>
                          {changingRole === u.id && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />}
                        </div>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]} (自己)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{u.created_at?.slice(0,10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setEditing({...u, password:''})}
                          className="btn-ghost">
                          編輯
                        </button>
                        {me?.id !== u.id && (
                          <button onClick={() => del(u.id, u.name)}
                            className="btn-danger">
                            刪除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">尚無用戶</td></tr>
                )}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
    </div>
  )
}
