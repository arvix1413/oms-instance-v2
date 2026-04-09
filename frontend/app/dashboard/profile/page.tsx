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
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      })
      toast('密碼已更新，請重新登入')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e: any) {
      toast(e.message || '更新失敗', 'error')
    } finally { setSaving(false) }
  }

  if (!me) return null

  const inp = 'oms-input'

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">個人資料</h1>
        <p className="text-xs text-slate-400 mt-0.5">查看帳號資訊及修改密碼</p>
      </div>

      {/* Profile card */}
      <div className="oms-card p-6 mb-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl font-bold select-none">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-800">{me.name}</div>
            <div className="text-sm text-slate-400">{me.email}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 mb-1">角色</div>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[me.role as Role]}`}>
              {ROLE_LABELS[me.role as Role] || me.role}
            </span>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 mb-1">帳號 Email</div>
            <div className="text-slate-700 font-mono text-xs truncate">{me.email}</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="oms-card p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">修改密碼</h2>
        <form onSubmit={handleChangePw} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">目前密碼</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                className={`${inp} pr-10`}
                value={pwForm.currentPassword}
                onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                placeholder="輸入目前密碼"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showCurrent ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">新密碼</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className={`${inp} pr-10`}
                value={pwForm.newPassword}
                onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                placeholder="至少6個字元"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">確認新密碼</label>
            <input
              type="password"
              className={inp}
              value={pwForm.confirmPassword}
              onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="再次輸入新密碼"
              autoComplete="new-password"
            />
          </div>
          <div className="pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? '更新中...' : '更新密碼'}
            </button>
          </div>
        </form>
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
