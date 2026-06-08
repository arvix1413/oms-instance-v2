'use client'
import { useEffect, useState } from 'react'
import { apiFetch, setToken } from '@/lib/api'
import { getCompany, getCompanyDisplayName, getCompanyInitial, getLogoUrl, type CompanySettings } from '@/lib/useCompany'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [company, setCompany] = useState<CompanySettings | null>(null)

  useEffect(() => {
    getCompany().then(setCompany).catch(() => {})
  }, [])

  useEffect(() => {
    const name = getCompanyDisplayName(company)
    document.title = name ? `${name} — 登入` : '登入'
  }, [company])

  const companyName = getCompanyDisplayName(company)
  const companyInitial = getCompanyInitial(company)
  const logoUrl = company ? getLogoUrl(company) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const data = await apiFetch<{ token: string; user: any; permissions: string[] }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify(form)
      })
      if (typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur()
      setToken(data.token)
      localStorage.setItem('oms_user', JSON.stringify(data.user))
      localStorage.setItem('oms_permissions', JSON.stringify(data.permissions || []))
      window.location.href = '/dashboard'
    } catch (e: any) {
      setError(e.message || '登入失敗')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          {logoUrl ? (
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white border border-slate-200 mb-4 shadow-sm overflow-hidden">
              <img src={logoUrl} alt={companyName || 'Logo'} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/25">
              <span className="text-xl font-black text-white">{companyInitial || '·'}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-800">{companyName || '載入中...'}</h1>
          <p className="text-sm text-slate-400 mt-1">訂單管理系統</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          {error && (
            <div className="mb-5 px-4 py-2.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Email</label>
              <input type="email" required name="oms-login-email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={form.email}
                onChange={e => setForm(p => ({...p, email: e.target.value}))}
                className="oms-input" placeholder="name@company.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">密碼</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} required name="oms-login-password" autoComplete="new-password" value={form.password}
                  onChange={e => setForm(p => ({...p, password: e.target.value}))}
                  className="oms-input pr-12" placeholder="••••••••" />
                <button type="button" onClick={()=>setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs transition-colors">
                  {showPw ? '隱藏' : '顯示'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
          <p className="text-center text-[11px] text-slate-400 mt-6">請使用個人帳號登入。如未開通，請聯絡管理員。</p>
        </div>
      </div>
    </div>
  )
}
