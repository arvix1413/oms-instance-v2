'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import Link from 'next/link'

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const now = new Date()
  const monthLabel = `${now.getFullYear()}年${now.getMonth()+1}月`

  useEffect(() => {
    apiFetch<any>('/api/stats').then(setStats).catch(() => {})
  }, [])

  const fmt = (n: number) => {
    if (!n) return '0'
    if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(2)+'B'
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M'
    if (n >= 1000) return (n/1000).toFixed(0)+'K'
    return n.toLocaleString()
  }

  const kpis = [
    { label: '客戶數', value: stats?.customers ?? '—', icon: '👥', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200' },
    { label: '料號數', value: stats?.materials ?? '—', icon: '🔩', color: 'text-violet-700', bg: 'bg-violet-100', border: 'border-violet-200' },
    { label: '供應商', value: stats?.suppliers ?? '—', icon: '🏭', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
    { label: '客戶訂單', value: stats?.orders_count ?? '—', icon: '📦', color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  ]

  const quick = [
    { href: '/dashboard/materials', label: '新增料號', desc: '建立物料主檔' },
    { href: '/dashboard/bom', label: '建立 BOM', desc: '產品物料清單' },
    { href: '/dashboard/po', label: '建立採購單', desc: '向供應商採購' },
    { href: '/dashboard/customer-orders', label: '新增客戶訂單', desc: '記錄客戶需求' },
  ]

  // Determine what to show in the sales card
  const hasMonthSales = stats?.month_sales > 0
  const salesValue = hasMonthSales ? stats.month_sales : stats?.total_sales
  const salesLabel = hasMonthSales ? `${monthLabel} 銷售金額` : '累計銷售金額'
  const salesSub = hasMonthSales
    ? `本月共 ${stats.month_orders} 筆訂單`
    : stats?.sales_date_range ? `訂單期間：${stats.sales_date_range}` : `共 ${stats?.orders_count ?? 0} 筆訂單`

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">系統總覽</h1>
        <p className="text-sm text-slate-500 mt-0.5">FAN YONG CO., LTD · 歡迎回來</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 rounded-xl p-6 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm">
          <div className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-1">{salesLabel}</div>
          <div className="text-4xl font-bold mb-1">
            {stats ? fmt(salesValue || 0) : '—'}
            <span className="text-lg font-normal text-blue-200 ml-2">VND</span>
          </div>
          <div className="text-sm text-blue-200">{stats ? salesSub : '載入中...'}</div>
          <div className="mt-4 pt-4 border-t border-blue-500/40 flex items-center justify-between text-xs text-blue-200">
            <span>已收貨採購額：{stats ? fmt(stats.po_total || 0) : '—'} VND</span>
            <Link href="/dashboard/customer-orders" className="hover:text-white transition-colors">查看訂單 →</Link>
          </div>
        </div>
        <div className="oms-card p-5 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">採購概況</div>
          <div>
            <div className="text-3xl font-bold text-slate-800 mb-0.5">{stats?.po_count ?? '—'}</div>
            <div className="text-sm text-slate-600">已確認採購單</div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500 font-medium">採購總額</div>
            <div className="text-lg font-bold text-slate-800">{stats ? fmt(stats.po_total || 0) : '—'} <span className="text-xs font-normal text-slate-500">VND</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {kpis.map(c => (
          <div key={c.label} className={`oms-card p-4 border ${c.border}`}>
            <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center text-lg mb-3`}>{c.icon}</div>
            <div className={`text-2xl font-bold ${c.color} mb-0.5`}>{c.value}</div>
            <div className="text-xs text-slate-600 font-semibold">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="oms-card p-5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">快速操作</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quick.map(a => (
            <Link key={a.href} href={a.href}
              className="group p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all">
              <div className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 mb-1">{a.label}</div>
              <div className="text-xs text-slate-500">{a.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
