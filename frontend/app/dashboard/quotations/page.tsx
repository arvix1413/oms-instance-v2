'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type QItem = { item_name:string; material_code:string; spec:string; unit:string; qty:number; unit_price:number; total_price:number; remark:string; moq:number|string }
type Q = { id:number; quotation_number:string; customer_name:string; status:string; total_amount:number; currency:string; valid_until:string; remark:string; created_at:string; items?:QItem[] }
const emptyItem = (): QItem => ({ item_name:'', material_code:'', spec:'', unit:'PCS', qty:1, unit_price:0, total_price:0, remark:'', moq:'' })
const STATUS_MAP: Record<string,{label:string;badge:string}> = {
  draft:    { label:'草稿',   badge:'badge-gray'  },
  sent:     { label:'已發送', badge:'badge-blue'  },
  accepted: { label:'已接受', badge:'badge-green' },
  rejected: { label:'已拒絕', badge:'badge-red'   },
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function QuotationsPage() {
  const { toast, confirm: confirmDialog } = useDialog()

  const [items, setItems] = useState<Q[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loadedItems, setLoadedItems] = useState<Record<number, QItem[]>>({})
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ customer_name:'', currency:'VND', valid_until:'', remark:'', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Q[]>('/api/quotations').then(setItems).finally(()=>setLoading(false))
  useEffect(()=>{ load() },[])

  const toggleExpand = async (id: number) => {
    const next = new Set(expanded)
    if (next.has(id)) { next.delete(id) } else {
      next.add(id)
      if (!loadedItems[id]) {
        const d = await apiFetch<Q>(`/api/quotations/${id}`)
        setLoadedItems(p => ({ ...p, [id]: d.items || [] }))
      }
    }
    setExpanded(next)
  }

  const changeStatus = async (id:number, status:string, e: React.MouseEvent) => {
    e.stopPropagation()
    await apiFetch(`/api/quotations/${id}/status`,{method:'PATCH',body:JSON.stringify({status})})
    toast('狀態已更新')
      await load()
  }
  const del = async (id:number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!await confirmDialog('確定刪除？')) return
    await apiFetch(`/api/quotations/${id}`,{method:'DELETE'})
      await load()
  }
  const save = async () => {
    try {
      await apiFetch('/api/quotations',{method:'POST',body:JSON.stringify(form)})
      toast('報價單建立成功'); setCreating(false); setForm({customer_name:'',currency:'VND',valid_until:'',remark:'',items:[emptyItem()]})
      await load()
    } catch(e:any){ toast('錯誤：'+e.message) }
  }

  const printQuotation = async (id: number, q: Q) => {
    const data = await apiFetch<Q>(`/api/quotations/${id}`)
    const items = data.items || []
    const html = `<html><head><title>報價單 ${q.quotation_number}</title>
    <style>body{font-family:sans-serif;font-size:12px;padding:20px}h2{margin-bottom:4px}p{color:#666;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.num{text-align:right}tfoot td{font-weight:bold;background:#f9f9f9}</style>
    </head><body>
    <h2>報價單 ${q.quotation_number}</h2>
    <p>客戶：${q.customer_name} | 有效期：${q.valid_until||'—'} | FAN YONG CO., LTD</p>
    <table><thead><tr><th>品名</th><th>物料編號</th><th>規格</th><th>單位</th><th class="num">數量</th><th class="num">MOQ</th><th class="num">單價</th><th class="num">小計</th><th>備註</th></tr></thead>
    <tbody>${items.map(i=>`<tr><td>${i.item_name}</td><td>${i.material_code}</td><td>${i.spec}</td><td>${i.unit}</td><td class="num">${i.qty?.toLocaleString()}</td><td class="num">${i.moq??''}</td><td class="num">${i.unit_price?.toLocaleString()}</td><td class="num">${i.total_price?.toLocaleString()}</td><td>${i.remark}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="7" style="text-align:right">合計</td><td class="num">${items.reduce((s,i)=>s+i.total_price,0).toLocaleString()} ${q.currency}</td><td></td></tr></tfoot>
    </table></body></html>`
    const w = window.open('','_blank'); w?.document.write(html); w?.document.close(); w?.print()
  }
  const addItem = () => setForm(p=>({...p,items:[...p.items,emptyItem()]}))
  const removeItem = (i:number) => setForm(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}))
  const updateItem = (i:number, f:keyof QItem, v:any) => setForm(p=>({...p,items:p.items.map((item,idx)=>{
    if(idx!==i) return item
    const u={...item,[f]:v}
    if(f==='qty'||f==='unit_price') u.total_price=u.qty*u.unit_price
    return u
  })}))

  const filtered = items.filter(q => !search || q.quotation_number.toLowerCase().includes(search.toLowerCase()) || q.customer_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total: filteredTotal } = usePagination(filtered, 20)
  const inp = 'oms-input text-xs py-1.5'
  const formTotal = form.items.reduce((s,i)=>s+i.total_price,0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">報價單</h1>
          <p className="text-xs text-slate-400 mt-0.5">點擊報價單列展開查看品項明細</p>
        </div>
        <button onClick={()=>setCreating(true)} className="btn-primary">+ 新增報價單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">新增報價單</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[['客戶名稱 *','customer_name','text'],['有效期限','valid_until','date'],['備註','remark','text']].map(([label,key,type])=>(
              <div key={key}>
                <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
                <input type={type} className={inp} value={(form as any)[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} />
              </div>
            ))}
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">幣別</label>
              <select className={inp} value={form.currency} onChange={e=>setForm(p=>({...p,currency:e.target.value}))}>
                <option>VND</option><option>TWD</option><option>USD</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">報價明細</span>
            <button onClick={addItem} className="btn-ghost text-blue-600">+ 新增品項</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200">
                {['品名','物料編號','規格','單位','數量','MOQ','單價','小計','備註',''].map(h=>(
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.items.map((item,i)=>(
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1"><input className={inp} value={item.item_name} onChange={e=>updateItem(i,'item_name',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:90}} value={item.material_code} onChange={e=>updateItem(i,'material_code',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:80}} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:45}} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.qty || ""} onChange={e=>updateItem(i,'qty',Number(e.target.value))} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.moq||""} placeholder="MOQ" onChange={e=>updateItem(i,'moq',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:85}} value={item.unit_price || ""} onChange={e=>updateItem(i,'unit_price',Number(e.target.value))} /></td>
                    <td className="p-1 px-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.total_price.toLocaleString()}</td>
                    <td className="p-1"><input className={inp} value={item.remark} onChange={e=>updateItem(i,'remark',e.target.value)} /></td>
                    <td className="p-1 text-center"><button onClick={()=>removeItem(i)} className="text-slate-300 hover:text-red-600 transition-colors">✕</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={7} className="px-3 py-2 text-right text-[11px] text-slate-400 font-semibold uppercase">合計</td>
                  <td className="px-2 py-2 text-right text-slate-600 font-bold">{formTotal.toLocaleString()}</td>
                  <td colSpan={2} className="px-2 py-2 text-slate-400 text-xs">{form.currency}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">建立報價單</button>
            <button onClick={()=>setCreating(false)} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
      )}

      <div className="mb-4"><input className="oms-input w-64" placeholder="搜尋報價單號或客戶..." value={search} onChange={e=>setSearch(e.target.value)} /></div>

      <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-8" />
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">報價單號</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">客戶</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">金額</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">幣別</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">有效期</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">狀態</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(q => {
                  const isOpen = expanded.has(q.id)
                  const qItems = loadedItems[q.id] || []
                  const sm = STATUS_MAP[q.status] || { label: q.status, badge: 'badge-gray' }
                  return (
                    <>
                      <tr key={q.id}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        onClick={() => toggleExpand(q.id)}>
                        <td className="pl-4 py-3"><span className="text-slate-500"><ChevronIcon open={isOpen} /></span></td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">{q.quotation_number}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium max-w-[200px] truncate" title={q.customer_name}>{q.customer_name}</td>
                        <td className="px-4 py-3 text-right text-slate-600 font-medium">{q.total_amount?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{q.currency}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{q.valid_until}</td>
                        <td className="px-4 py-3"><span className={sm.badge}>{sm.label}</span></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {q.status==='draft' && <button onClick={e=>changeStatus(q.id,'sent',e)} className="btn-ghost text-blue-600">發送</button>}
                            {q.status==='sent' && <>
                              <button onClick={e=>changeStatus(q.id,'accepted',e)} className="btn-ghost text-emerald-600">接受</button>
                              <button onClick={e=>changeStatus(q.id,'rejected',e)} className="btn-danger">拒絕</button>
                            </>}
                            <button onClick={e=>{ e.stopPropagation(); printQuotation(q.id, q) }} className="btn-ghost">🖨</button>
                            <button onClick={e=>del(q.id,e)} className="btn-danger">刪除</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${q.id}-items`} className="border-b border-slate-100">
                          <td colSpan={8} className="px-0 py-0">
                            <div className="bg-slate-50/50 border-t border-slate-100">
                              {qItems.length === 0 ? (
                                <div className="px-8 py-4 text-xs text-slate-400">載入中...</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs" style={{minWidth:600}}>
                                    <thead><tr className="border-b border-slate-100">
                                      {['品名','物料編號','規格','單位','數量','MOQ','單價','小計','備註'].map(h=>(
                                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                                      ))}
                                    </tr></thead>
                                    <tbody>
                                      {qItems.map((item, i) => (
                                        <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{item.item_name}</td>
                                          <td className="px-3 py-2 font-mono text-blue-600 whitespace-nowrap">{item.material_code}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.spec}</td>
                                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.unit}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.qty?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{item.moq ?? '—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{item.unit_price?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-800 font-semibold whitespace-nowrap">{item.total_price?.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.remark}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-slate-200">
                                        <td colSpan={7} className="px-3 py-2 text-right text-[10px] text-slate-300 font-semibold uppercase">合計</td>
                                        <td className="px-3 py-2 text-right text-slate-600 font-bold">{qItems.reduce((s,i)=>s+i.total_price,0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-slate-400 text-xs">{q.currency}</td>
                                      </tr>
                                    </tfoot>
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
                {paged.length===0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">尚無報價單</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={filteredTotal} />
          </>
        )}
      </div>
    </div>
  )
}
