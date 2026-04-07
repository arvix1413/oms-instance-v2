'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type OrderItem = { bom_id?:number|null; item_name:string; material_code:string; spec:string; thickness?:number|null; unit:string; qty:number; unit_price:number; rta_date:string; arrived_qty:number; arrived_date?:string; balance?:number; status?:string; bom_name?:string }
type Order = { id:number; po_date:string; po_number:string; customer_id:number; customer_name:string; customer_code:string; status:string; remark:string; created_at:string; items?:OrderItem[] }
type BOM = { id:number; product_sku:string; product_name:string; version:string }
type Customer = { id:number; customer_code:string; customer_name:string }
const emptyItem = (): OrderItem => ({ bom_id:null, item_name:'', material_code:'', spec:'', unit:'PCS', qty:0, unit_price:0, rta_date:'', arrived_qty:0 })

const STATUS_BADGE: Record<string,string> = { pending:'badge-yellow', completed:'badge-green', delay:'badge-red', partial:'badge-blue' }
const STATUS_LABEL: Record<string,string> = { pending:'待出貨', completed:'已完成', delay:'延遲', partial:'部分到貨' }

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
  const [boms, setBoms] = useState<BOM[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loadedItems, setLoadedItems] = useState<Record<number, OrderItem[]>>({})
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ po_date:'', po_number:'', customer_id:'', remark:'', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Order[]>('/api/customer-orders').then(setOrders).finally(()=>setLoading(false))
  useEffect(()=>{
    load()
    apiFetch<BOM[]>('/api/bom').then(setBoms).catch(()=>{})
    apiFetch<Customer[]>('/api/customers').then(setCustomers).catch(()=>{})
  },[])

  const toggleExpand = async (id: number) => {
    const next = new Set(expanded)
    if (next.has(id)) { next.delete(id); setExpanded(next) }
    else {
      next.add(id); setExpanded(next)
      if (!loadedItems[id]) {
        const data = await apiFetch<Order>(`/api/customer-orders/${id}`)
        setLoadedItems(p => ({ ...p, [id]: data.items || [] }))
      }
    }
  }

  const save = async () => {
    if (!form.po_number) { toast('請填寫採購單號', 'error'); return }
    if (!form.customer_id) { toast('請選擇客戶', 'error'); return }
    try {
      await apiFetch('/api/customer-orders', { method:'POST', body:JSON.stringify(form) })
      toast('建立成功'); setCreating(false)
      setForm({ po_date:'', po_number:'', customer_id:'', remark:'', items:[emptyItem()] }); load()
    } catch(e:any){ toast('錯誤：'+e.message, 'error') }
  }

  const del = async (id:number) => {
    if (!await confirmDialog('確定刪除？')) return
    await apiFetch(`/api/customer-orders/${id}`, { method:'DELETE' }); load()
  }

  const addItem = () => setForm(p=>({...p, items:[...p.items, emptyItem()]}))
  const removeItem = (i:number) => setForm(p=>({...p, items:p.items.filter((_,idx)=>idx!==i)}))
  const updateItem = (i:number, f:keyof OrderItem, v:any) => setForm(p=>({...p, items:p.items.map((item,idx)=>idx===i?{...item,[f]:v}:item)}))

  const selectBOM = async (i:number, bomId:string) => {
    if (!bomId) { updateItem(i, 'bom_id', null); return }
    const bom = boms.find(b => String(b.id) === bomId)
    if (!bom) return
    // Fetch BOM detail to get spec/unit from first item
    try {
      const detail = await apiFetch<any>(`/api/bom/${bomId}`)
      const firstItem = detail.items?.[0]
      setForm(p=>({...p, items: p.items.map((item,idx) => idx===i ? {
        ...item,
        bom_id: Number(bomId),
        item_name: bom.product_name,
        material_code: bom.product_sku,
        spec: firstItem?.spec || '',
        unit: firstItem?.unit || 'PCS',
      } : item)}))
    } catch {
      setForm(p=>({...p, items: p.items.map((item,idx) => idx===i ? {
        ...item, bom_id: Number(bomId), item_name: bom.product_name, material_code: bom.product_sku,
      } : item)}))
    }
  }

  const filtered = orders.filter(o => !search ||
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    (o.customer_name||'').toLowerCase().includes(search.toLowerCase()))
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
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">採購日期</label>
              <input type="date" className={inp} value={form.po_date} onChange={e=>setForm(p=>({...p,po_date:e.target.value}))} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">採購單號 *</label>
              <input className={inp} value={form.po_number} onChange={e=>setForm(p=>({...p,po_number:e.target.value}))} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">客戶 *</label>
              <select className={inp} value={form.customer_id} onChange={e=>setForm(p=>({...p,customer_id:e.target.value}))}>
                <option value="">-- 選擇客戶 --</option>
                {customers.map(c=>(
                  <option key={c.id} value={String(c.id)}>{c.customer_name}{c.customer_code ? ` (${c.customer_code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">備註</label>
              <input className={inp} value={form.remark} onChange={e=>setForm(p=>({...p,remark:e.target.value}))} />
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">訂單明細</span>
            <button onClick={addItem} className="btn-ghost text-blue-600">+ 新增品項</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200">
                {['品名（選BOM）','物料編號','規格','厚度mm','單位','數量','單價','出貨日期',''].map(h=>(
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.items.map((item,i)=>(
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1 min-w-[220px]">
                      <select className={inp} style={{width:'100%'}} value={item.bom_id ? String(item.bom_id) : ''}
                        onChange={e => selectBOM(i, e.target.value)}>
                        <option value="">-- 選擇成品 BOM --</option>
                        {boms.map(b=>(
                          <option key={b.id} value={String(b.id)}>{b.product_sku} — {b.product_name}</option>
                        ))}
                      </select>
                      {item.item_name && <div className="text-[10px] text-blue-600 mt-0.5 px-1">{item.item_name}</div>}
                    </td>
                    <td className="p-1"><input className={inp} style={{width:100}} value={item.material_code} onChange={e=>updateItem(i,'material_code',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:80}} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:55}} value={item.thickness||''} onChange={e=>updateItem(i,'thickness',e.target.value?Number(e.target.value):null)} /></td>
                    <td className="p-1"><input className={inp} style={{width:45}} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.qty||''} onChange={e=>updateItem(i,'qty',Number(e.target.value))} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:75}} value={item.unit_price||''} onChange={e=>updateItem(i,'unit_price',Number(e.target.value))} /></td>
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
                  const items = loadedItems[o.id]
                  return (
                    <>
                      <tr key={o.id}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        onClick={() => toggleExpand(o.id)}>
                        <td className="pl-4 py-3"><span className="text-slate-500"><ChevronIcon open={isOpen} /></span></td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">{o.po_number}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium max-w-[220px] truncate" title={o.customer_name}>{o.customer_name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{o.po_date}</td>
                        <td className="px-4 py-3"><span className={STATUS_BADGE[o.status]||'badge-gray'}>{STATUS_LABEL[o.status]||o.status}</span></td>
                        <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>del(o.id)} className="btn-danger">刪除</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${o.id}-items`} className="border-b border-slate-100">
                          <td colSpan={6} className="px-0 py-0">
                            <div className="bg-slate-50/50 border-t border-slate-100">
                              {items === undefined ? (
                                <div className="px-8 py-4 text-xs text-slate-400 flex items-center gap-2">
                                  <div className="w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin"/>載入中...
                                </div>
                              ) : items.length === 0 ? (
                                <div className="px-8 py-4 text-xs text-slate-400">尚無品項</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs" style={{minWidth:800}}>
                                    <thead><tr className="border-b border-slate-100">
                                      {['品名','物料編號','規格','厚度mm','單位','訂單數量','單價','RTA','已到數量','到貨日期','結餘','狀態'].map(h=>(
                                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                                      ))}
                                    </tr></thead>
                                    <tbody>
                                      {items.map((item,i)=>(
                                        <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[160px] truncate" title={item.item_name}>{item.item_name}</td>
                                          <td className="px-3 py-2 font-mono text-blue-600 whitespace-nowrap">{item.material_code}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.spec}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.thickness??'—'}</td>
                                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.unit}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.qty?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{item.unit_price?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.rta_date}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{item.arrived_qty?.toLocaleString()??'—'}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.arrived_date??'—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.balance?.toLocaleString()??'—'}</td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            {item.status ? <span className={STATUS_BADGE[item.status]||'badge-gray'}>{STATUS_LABEL[item.status]||item.status}</span> : <span className="text-slate-300">—</span>}
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
