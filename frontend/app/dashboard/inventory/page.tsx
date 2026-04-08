'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type Inv = {
  id:number; product_code:string; product_name:string; spec:string; unit:string
  closing_balance:number; category:string; supplier_name:string; currency:string
}

export default function InventoryPage() {
  const [items, setItems] = useState<Inv[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const load = () => {
    setLoading(true)
    apiFetch<Inv[]>('/api/inventory').then(setItems).finally(() => {
      setLoading(false)
      setLastRefresh(new Date())
    })
  }
  useEffect(() => { load() }, [])

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean)))
  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !search || i.product_code.toLowerCase().includes(q) || i.product_name.toLowerCase().includes(q)
    const matchCat = !catFilter || i.category === catFilter
    return matchSearch && matchCat
  })
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 30)

  const totalStock = filtered.reduce((s, i) => s + (Number(i.closing_balance) || 0), 0)
  const lowStock = filtered.filter(i => Number(i.closing_balance) <= 0).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">庫存查詢</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            即時庫存 · 最後更新：{lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button onClick={load} className="btn-ghost border border-slate-200 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          刷新
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="oms-card p-4">
          <div className="text-xs text-slate-400 mb-1">料號總數</div>
          <div className="text-2xl font-bold text-slate-800">{items.length}</div>
        </div>
        <div className="oms-card p-4">
          <div className="text-xs text-slate-400 mb-1">篩選結果庫存總量</div>
          <div className="text-2xl font-bold text-blue-600">{totalStock.toLocaleString()}</div>
        </div>
        <div className="oms-card p-4">
          <div className="text-xs text-slate-400 mb-1">零庫存品項</div>
          <div className={`text-2xl font-bold ${lowStock > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{lowStock}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input className="oms-input w-64" placeholder="搜尋料號或名稱..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="oms-input w-40" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">全部分類</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="oms-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{minWidth:700}}>
                <thead>
                  <tr className="border-b border-slate-200">
                    {['分類','料號','名稱','規格','單位','供應商','庫存量'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map(item => (
                    <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${Number(item.closing_balance) <= 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{item.category||'—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-blue-600 whitespace-nowrap">{item.product_code}</td>
                      <td className="px-3 py-2.5 text-slate-800 font-medium max-w-[200px] truncate" title={item.product_name}>{item.product_name}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap max-w-[120px] truncate" title={item.spec}>{item.spec||'—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.unit}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap max-w-[140px] truncate" title={item.supplier_name}>{item.supplier_name||'—'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className={`font-bold text-base ${Number(item.closing_balance) <= 0 ? 'text-red-500' : Number(item.closing_balance) < 10 ? 'text-orange-500' : 'text-emerald-600'}`}>
                          {Number(item.closing_balance).toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">尚無庫存資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
    </div>
  )
}
