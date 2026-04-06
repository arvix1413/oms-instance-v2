'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type Inv = { id:number; product_code:string; product_name:string; spec:string; unit:string; opening_balance:number; inbound_qty:number; outbound_qty:number; closing_balance:number; warehouse_location:string; remark:string }
const empty = (): Partial<Inv> => ({ product_code:'', product_name:'', spec:'', unit:'PCS', opening_balance:0, inbound_qty:0, outbound_qty:0, closing_balance:0, warehouse_location:'', remark:'' })

function DetailModal({ item, onClose, onEdit }: { item: Inv; onClose: () => void; onEdit: () => void }) {
  const row = (label: string, val: any, cls = '') => (
    <div className="flex gap-2 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-slate-400 w-24 shrink-0">{label}</span>
      <span className={`text-sm text-gray-800 ${cls}`}>{val ?? '—'}</span>
    </div>
  )
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">{item.product_name}</h2>
            <span className="text-xs text-slate-400">{item.product_code}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl ml-4">✕</button>
        </div>
        <div className="mb-4">
          {row('產品編號', item.product_code, 'font-mono text-blue-600')}
          {row('規格', item.spec)}
          {row('單位', item.unit)}
          {row('期初庫存', item.opening_balance?.toLocaleString())}
          {row('本期入庫', '+' + item.inbound_qty?.toLocaleString(), 'text-green-600')}
          {row('本期出庫', '-' + item.outbound_qty?.toLocaleString(), 'text-red-500')}
          {row('期末庫存', item.closing_balance?.toLocaleString(), item.closing_balance <= 0 ? 'font-bold text-red-600' : 'font-bold')}
          {row('儲位', item.warehouse_location)}
          {row('備註', item.remark)}
        </div>
        <button onClick={onEdit} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700">編輯</button>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const [items, setItems] = useState<Inv[]>([])
  const [editing, setEditing] = useState<Partial<Inv>|null>(null)
  const [detail, setDetail] = useState<Inv|null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Inv[]>('/api/inventory').then(setItems).finally(()=>setLoading(false))
  useEffect(()=>{ load() },[])
  const showMsg = (m:string) => { setMsg(m); setTimeout(()=>setMsg(''),3000) }

  const save = async () => {
    if (!editing) return
    try {
      if (editing.id) await apiFetch(`/api/inventory/${editing.id}`,{method:'PUT',body:JSON.stringify(editing)})
      else await apiFetch('/api/inventory',{method:'POST',body:JSON.stringify(editing)})
      showMsg('儲存成功'); setEditing(null); load()
    } catch(e:any){ showMsg('錯誤：'+e.message) }
  }
  const del = async (id:number) => {
    if (!confirm('確定刪除？')) return
    await apiFetch(`/api/inventory/${id}`,{method:'DELETE'}); load()
  }

  const filtered = items.filter(i => !search || i.product_code.toLowerCase().includes(search.toLowerCase()) || i.product_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)
  const totalClosing = items.reduce((s,i)=>s+i.closing_balance,0)
  const inp = 'oms-input'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">庫存管理</h1>
        <button onClick={()=>setEditing(empty())} className="btn-primary">+ 新增庫存</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="oms-card p-4"><div className="text-xs text-slate-400 mb-1">品項數量</div><div className="text-2xl font-bold text-blue-600">{items.length}</div></div>
        <div className="oms-card p-4"><div className="text-xs text-slate-400 mb-1">期末庫存總量</div><div className="text-2xl font-bold text-green-600">{totalClosing.toLocaleString()}</div></div>
        <div className="oms-card p-4"><div className="text-xs text-slate-400 mb-1">低庫存警示</div><div className="text-2xl font-bold text-red-500">{items.filter(i=>i.closing_balance<=0).length}</div></div>
      </div>

      {msg && <div className="mb-4 px-4 py-2.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{msg}</div>}
      {detail && <DetailModal item={detail} onClose={()=>setDetail(null)} onEdit={()=>{ setEditing(detail); setDetail(null) }} />}

      {editing && (
        <div className="oms-card p-6 mb-5">
          <h2 className="font-semibold mb-4">{editing.id?'編輯庫存':'新增庫存'}</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div><label className="block text-xs font-medium mb-1">產品編號 *</label><input className={inp} value={editing.product_code||''} onChange={e=>setEditing(p=>({...p,product_code:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium mb-1">產品名稱 *</label><input className={inp} value={editing.product_name||''} onChange={e=>setEditing(p=>({...p,product_name:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium mb-1">規格</label><input className={inp} value={editing.spec||''} onChange={e=>setEditing(p=>({...p,spec:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium mb-1">單位</label><input className={inp} value={editing.unit||'PCS'} onChange={e=>setEditing(p=>({...p,unit:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium mb-1">期初庫存</label><input type="number" className={inp} value={editing.opening_balance || ""} onChange={e=>setEditing(p=>({...p,opening_balance:Number(e.target.value)}))} /></div>
            <div><label className="block text-xs font-medium mb-1">本期入庫</label><input type="number" className={inp} value={editing.inbound_qty || ""} onChange={e=>setEditing(p=>({...p,inbound_qty:Number(e.target.value)}))} /></div>
            <div><label className="block text-xs font-medium mb-1">本期出庫</label><input type="number" className={inp} value={editing.outbound_qty || ""} onChange={e=>setEditing(p=>({...p,outbound_qty:Number(e.target.value)}))} /></div>
            <div><label className="block text-xs font-medium mb-1">儲位</label><input className={inp} value={editing.warehouse_location||''} onChange={e=>setEditing(p=>({...p,warehouse_location:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium mb-1">備註</label><input className={inp} value={editing.remark||''} onChange={e=>setEditing(p=>({...p,remark:e.target.value}))} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="btn-primary">儲存</button>
            <button onClick={()=>setEditing(null)} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
      )}

      <div className="mb-4"><input className="oms-input w-64" placeholder="搜尋產品編號或名稱..." value={search} onChange={e=>setSearch(e.target.value)} /></div>

      <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
          <>
            <div className="overflow-x-auto">
              <table className="oms-table">
                <thead className="bg-transparent text-xs text-slate-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">產品編號</th>
                    <th className="px-4 py-3 text-left">產品名稱</th>
                    <th className="px-4 py-3 text-left">規格</th>
                    <th className="px-4 py-3 text-right">入庫</th>
                    <th className="px-4 py-3 text-right">出庫</th>
                    <th className="px-4 py-3 text-right">期末庫存</th>
                    <th className="px-4 py-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {paged.map(inv=>(
                    <tr key={inv.id} className={`hover:bg-slate-50 ${inv.closing_balance<=0?'bg-red-50/30':''}`}>
                      <td className="px-4 py-2 font-mono text-xs text-blue-600">{inv.product_code}</td>
                      <td className="px-4 py-2 text-slate-800 font-medium">{inv.product_name}</td>
                      <td className="px-4 py-2 text-slate-500">{inv.spec}</td>
                      <td className="px-4 py-2 text-right text-green-600">+{inv.inbound_qty.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-red-500">-{inv.outbound_qty.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right font-bold ${inv.closing_balance<=0?'text-red-600':'text-gray-900'}`}>{inv.closing_balance.toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button onClick={()=>setDetail(inv)} className="btn-ghost">詳情</button>
                          <button onClick={()=>setEditing(inv)} className="btn-ghost">編輯</button>
                          <button onClick={()=>del(inv.id)} className="btn-danger">刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length===0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">尚無庫存資料</td></tr>}
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
