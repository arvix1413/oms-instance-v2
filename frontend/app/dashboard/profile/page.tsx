'use client'
import { useDialog } from '@/components/Dialog'
import { useState, useRef } from 'react'
import { apiFetch, API } from '@/lib/api'
import { getUser, ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/permissions'

export default function ProfilePage() {
  const { toast } = useDialog()
  const me = getUser()

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  // Signature state - read from localStorage user
  const storedUser = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('oms_user') || 'null')
    : null
  const [signatureUrl, setSignatureUrl] = useState<string>(storedUser?.signature_url || '')
  const [uploadingSign, setUploadingSign] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      toast('密碼已更新')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e: any) {
      toast(e.message || '更新失敗', 'error')
    } finally { setSaving(false) }
  }

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('請上傳圖片檔案', 'error'); return }
    if (file.size > 2 * 1024 * 1024) { toast('圖片大小不能超過 2MB', 'error'); return }

    setUploadingSign(true)
    try {
      // Upload file
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch<{ url: string }>('/api/upload', {
        method: 'POST',
        body: form,
        headers: {} // let browser set multipart boundary
      })

      // Save signature URL to user profile
      const result = await apiFetch<{ ok: boolean; user: any }>('/api/auth/signature', {
        method: 'POST',
        body: JSON.stringify({ signature_url: res.url })
      })

      setSignatureUrl(res.url)
      // Update localStorage
      if (result.user) {
        localStorage.setItem('oms_user', JSON.stringify(result.user))
      }
      toast('簽名已儲存')
    } catch (e: any) {
      toast(e.message || '上傳失敗', 'error')
    } finally {
      setUploadingSign(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveSignature = async () => {
    try {
      const result = await apiFetch<{ ok: boolean; user: any }>('/api/auth/signature', {
        method: 'POST',
        body: JSON.stringify({ signature_url: null })
      })
      setSignatureUrl('')
      if (result.user) localStorage.setItem('oms_user', JSON.stringify(result.user))
      toast('簽名已移除')
    } catch (e: any) { toast(e.message, 'error') }
  }

  if (!me) return null
  const inp = 'oms-input'

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">個人資料</h1>
        <p className="text-xs text-slate-400 mt-0.5">帳號資訊、電子簽名及密碼管理</p>
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

      {/* Signature */}
      <div className="oms-card p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">電子簽名</h2>
        <p className="text-xs text-slate-400 mb-4">上傳您的簽名圖片，將自動顯示在採購單、出貨單等文件的簽名欄位</p>

        {signatureUrl ? (
          <div className="space-y-3">
            {/* Preview */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex items-center justify-center" style={{ minHeight: 80 }}>
              <img
                src={signatureUrl.startsWith('http') ? signatureUrl : `${API}${signatureUrl}`}
                alt="簽名預覽"
                className="max-h-20 max-w-full object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingSign}
                className="btn-ghost border border-slate-200 text-xs">
                更換簽名
              </button>
              <button onClick={handleRemoveSignature}
                className="btn-ghost text-red-500 hover:bg-red-50 border border-red-100 text-xs">
                移除簽名
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            {uploadingSign ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-xs text-slate-400">上傳中...</span>
              </div>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-slate-300 mx-auto mb-2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p className="text-sm text-slate-500 font-medium">點擊上傳簽名圖片</p>
                <p className="text-xs text-slate-400 mt-1">支援 PNG、JPG，建議使用白底透明背景，最大 2MB</p>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSignatureUpload}
        />
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
