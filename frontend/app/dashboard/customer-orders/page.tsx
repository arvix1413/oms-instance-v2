'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type OrderItem = { id?:number; item_name:string; material_code:string; spec:string; thickness?:number|null; unit:string; qty:number; unit_price:number; rta_date:string; arrived_qty:number; arrived_date?:string; balance?:number; status?:string }
type Order = { id:number; po_date:string; po_number:string; customer_name:string; status:string; remark:string; created_at:string; items?:OrderItem[] }
const emptyItem = (): OrderItem => ({ item_name:'', material_code:'', spec:'', unit:'PCS', qty:0, unit_price:0, rta_date:'', arrived_qty:0 })

const STATUS_BADGE: Record<string,string> = {
  pending:'badge-yellow', completed:'badge-green', delay:'badge-red', partial:'badge-blue'
}
const STATUS_LABEL: Record<string,string> = {
  pending:'待出貨', completed:'已完成', delay:'延遲', partial:'部分到貨'
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function CustomerOrdersPage() {
  const { toast, confirm: confirmDialog } = useDialog()

  const [orders, setOrders] = useState<Order[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loadedItems, setLoadedItems] = useState<Record<number, OrderItem[]>>({})
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ po_date:'', po_number:'', customer_name:'', remark:'', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Order[]>('/api/customer-orders').then(setOrders).finally(()=>setLoading(false))
  useEffect(()=>{ load() },[])

  const toggleExpand = async (id: number) => {
    const next = new Set(expanded)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
      if (!loadedItems[id]) {
        const data = await apiFetch<Order>(`/api/customer-orders/${id}`)
        setLoadedItems(p => ({ ...p, [id]: data.items || [] }))
      }
    }
    setExpanded(next)
  }

  const save = async () => {
    try {
      await apiFetch('/api/customer-orders',{method:'POST',body:JSON.stringify(form)})
      toast('建立成功'); setCreating(false)
      setForm({po_date:'',po_number:'',customer_name:'',remark:'',items:[emptyItem()]}); load()
    } catch(e:any){ toast('錯誤：'+e.message) }
  }

  const del = async (id:number) => {
    if (!await confirmDialog('確定刪除？')) return
    await apiFetch(`/api/customer-orders/${id}`,{method:'DELETE'}); load()
  }

  const addItem = () => setForm(p=>({...p,items:[...p.items,emptyItem()]}))
  const removeItem = (i:number) => setForm(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}))
  const updateItem = (i:number, f:keyof OrderItem, v:any) => setForm(p=>({...p,items:p.items.map((item,idx)=>idx===i?{...item,[f]:v}:item)}))

  const filtered = orders.filter(o => !search || o.po_number.toLowerCase().includes(search.toLowerCase()) || o.customer_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)
  const inp = 'oms-input text-xs py-1.5'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">客戶訂單明細</h1>
          <p className="text-xs text-slate-400 mt-0.5">點擊訂單列展開查看品項明細</p>
        </div>
        <button onClick={()=>setCreating(true)} className="btn-primary">+ 新增訂單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">新增客戶訂單</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[['採購日期','po_date','date'],['採購單號 *','po_number','text'],['客戶名稱 *','customer_name','text'],['備註','remark','text']].map(([label,key,type])=>(
              <div key={key}>
                <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
                <input type={type} className={inp} value={(form as any)[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">訂單明細</span>
            <button onClick={addItem} className="btn-ghost text-blue-600">+ 新增品項</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200">
                {['品名','物料編號','規格','厚度mm','單位','數量','單價','出貨日期',''].map(h=>(
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.items.map((item,i)=>(
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1"><input className={inp} value={item.item_name} onChange={e=>updateItem(i,'item_name',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:90}} value={item.material_code} onChange={e=>updateItem(i,'material_code',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:80}} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:55}} value={item.thickness||''} onChange={e=>updateItem(i,'thickness',e.target.value?Number(e.target.value):null)} /></td>
                    <td className="p-1"><input className={inp} style={{width:45}} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.qty || ""} onChange={e=>updateItem(i,'qty',Number(e.target.value))} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:75}} value={item.unit_price || ""} onChange={e=>updateItem(i,'unit_price',Number(e.target.value))} /></td>
                    <td className="p-1"><input type="date" className={inp} value={item.rta_date} onChange={e=>updateItem(i,'rta_date',e.target.value)} /></td>
                    <td className="p-1 text-center"><button onClick={()=>removeItem(i)} className="text-slate-300 hover:text-red-600 transition-colors">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">建立訂單</button>
            <button onClick={()=>setCreating(false)} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
      )}

      <div className="mb-4"><input className="oms-input w-64" placeholder="搜尋採購單號或客戶..." value={search} onChange={e=>setSearch(e.target.value)} /></div>

      <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-8" />
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PO No.</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">客戶</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PO Date</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">狀態</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(o => {
                  const isOpen = expanded.has(o.id)
                  const items = loadedItems[o.id] || []
                  return (
                    <>
                      <tr key={o.id}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        onClick={() => toggleExpand(o.id)}>
                        <td className="pl-4 py-3">
                          <span className="text-slate-500"><ChevronIcon open={isOpen} /></span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">{o.po_number}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium max-w-[220px] truncate" title={o.customer_name}>{o.customer_name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{o.po_date}</td>
                        <td className="px-4 py-3">
                          <span className={STATUS_BADGE[o.status] || 'badge-gray'}>
                            {STATUS_LABEL[o.status] || o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => del(o.id)} className="btn-danger">刪除</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${o.id}-items`} className="border-b border-slate-100">
                          <td colSpan={6} className="px-0 py-0">
                            <div className="bg-slate-50/50 border-t border-slate-100">
                              {items.length === 0 ? (
                                <div className="px-8 py-4 text-xs text-slate-400">載入中...</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs" style={{minWidth:800}}>
                                    <thead>
                                      <tr className="border-b border-slate-100">
                                        {['品名','物料編號','規格','厚度mm','單位','訂單數量','單價','RTA','已到數量','到貨日期','結餘','狀態'].map(h=>(
                                          <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((item, i) => (
                                        <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[160px] truncate" title={item.item_name}>{item.item_name}</td>
                                          <td className="px-3 py-2 font-mono text-blue-600 whitespace-nowrap">{item.material_code}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.spec}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.thickness ?? '—'}</td>
                                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.unit}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.qty?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{item.unit_price?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.rta_date}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{item.arrived_qty?.toLocaleString() ?? '—'}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.arrived_date ?? '—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.balance?.toLocaleString() ?? '—'}</td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            {item.status ? <span className={STATUS_BADGE[item.status] || 'badge-gray'}>{STATUS_LABEL[item.status] || item.status}</span> : <span className="text-slate-300">—</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {paged.length===0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">尚無訂單</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
    </div>
  )
}
