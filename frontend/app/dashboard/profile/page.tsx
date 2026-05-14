'use client'
import { useDialog } from '@/components/Dialog'
import { useState } from 'react'
import { apiFetch } from '@/lib/api'
import { getUser, ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/permissions'

export default function ProfilePage() {
  const { toast } = useDialog()
  const me = getUser()
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwForm.currentPassword || !pwForm.newPassword) { toast('請填寫所有欄位', 'error'); return }
    if (pwForm.newPassword.length < 6) { toast('新密碼至少需要6個字元', 'error'); return }
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast('兩次輸入的新密碼不一致', 'error'); return }
    setSaving(true)
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) })
      toast('密碼已更新')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e: any) { toast(e.message || '更新失敗', 'error') }
    finally { setSaving(false) }
  }

  if (!me) return null
  const inp = 'oms-input'

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-5 mb-8 pb-6 border-b border-slate-200">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/25 select-none">
          {me.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{me.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-400">{me.email}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[me.role as Role]}`}>
              {ROLE_LABELS[me.role as Role] || me.role}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="oms-card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-blue-500">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <h2 className="text-sm font-semibold text-slate-800">修改密碼</h2>
          </div>
          <p className="text-xs text-slate-400 mb-5">定期更換密碼以保護帳號安全</p>
          <form onSubmit={handleChangePw} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">目前密碼</label>
              <div className="relative">
                <input type={showCurrent ? 'text' : 'password'} className={`${inp} pr-10`}
                  value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="輸入目前密碼" autoComplete="current-password" />
                <button type="button" onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showCurrent ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">新密碼</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} className={`${inp} pr-10`}
                  value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="至少 6 個字元" autoComplete="new-password" />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showNew ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">確認新密碼</label>
              <input type="password" className={inp} value={pwForm.confirmPassword}
                onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="再次輸入新密碼" autoComplete="new-password" />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full mt-2">
              {saving ? '更新中...' : '更新密碼'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Eye() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function EyeOff() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}
