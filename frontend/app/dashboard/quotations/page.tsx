'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch, getSignatureUrl } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type QItem = { item_name:string; material_code:string; spec:string; unit:string; qty:number; unit_price:number; total_price:number; remark:string; moq:number|string }
type Q = { id:number; quotation_number:string; customer_name:string; customer_id?:number; status:string; total_amount:number; currency:string; valid_until:string; remark:string; created_at:string; items?:QItem[] }
type Customer = { id:number; customer_name:string; customer_code:string }
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
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loadedItems, setLoadedItems] = useState<Record<number, QItem[]>>({})
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ customer_id: '', customer_name:'', currency:'VND', valid_until:'', remark:'', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Q[]>('/api/quotations').then(setItems).finally(()=>setLoading(false))
  useEffect(()=>{
    load()
    apiFetch<Customer[]>('/api/customers').then(setCustomers).catch(()=>{})
  },[])

  const resetForm = () => { setForm({customer_id:'', customer_name:'',currency:'VND',valid_until:'',remark:'',items:[emptyItem()]}); setCreating(false); setEditingId(null) }

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
    try {
      await apiFetch(`/api/quotations/${id}`,{method:'DELETE'})
      toast('已刪除')
      await load()
    } catch(e:any){ toast('刪除失敗：'+e.message, 'error') }
  }
  const save = async () => {
    if (!form.customer_name) { toast('請選擇客戶', 'error'); return }
    try {
      if (editingId) {
        await apiFetch(`/api/quotations/${editingId}`,{method:'PUT',body:JSON.stringify(form)})
        toast('報價單已更新')
      } else {
        await apiFetch('/api/quotations',{method:'POST',body:JSON.stringify(form)})
        toast('報價單建立成功')
      }
      resetForm()
      await load()
    } catch(e:any){ toast('錯誤：'+e.message, 'error') }
  }

  const startEdit = async (q: Q, e: React.MouseEvent) => {
    e.stopPropagation()
    const data = await apiFetch<Q>(`/api/quotations/${q.id}`)
    const cust = customers.find(c => c.customer_name === q.customer_name)
    setForm({
      customer_id: cust ? String(cust.id) : '',
      customer_name: q.customer_name,
      currency: q.currency,
      valid_until: q.valid_until ? String(q.valid_until).slice(0,10) : '',
      remark: q.remark || '',
      items: (data.items || []).map(i => ({ ...i }))
    })
    setEditingId(q.id)
    setCreating(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const printQuotation = async (id: number, q: Q) => {
    const data = await apiFetch<Q>(`/api/quotations/${id}`)
    const items = data.items || []
    const total = items.reduce((s,i)=>s+(i.total_price||0),0)
    const signUrl = getSignatureUrl()

    const itemRows = items.map((item, idx) => `
      <tr>
        <td style="text-align:center">${idx+1}</td>
        <td>${item.item_name||''}</td>
        <td style="color:#555">${item.spec||''}</td>
        <td style="text-align:center">${item.unit||'PCS'}</td>
        <td style="text-align:center">${item.moq??''}</td>
        <td style="text-align:right;font-weight:600">${(item.unit_price||0).toLocaleString()}</td>
        <td style="text-align:right;font-weight:700">${(item.total_price||0).toLocaleString()}</td>
        <td>${item.remark||''}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/>
    <title>報價單 ${q.quotation_number}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:"Microsoft YaHei","PingFang TC",Arial,sans-serif;font-size:11px;color:#000;padding:12mm 15mm;background:#fff;line-height:1.4}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:5mm;margin-bottom:5mm}
      .company{font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
      .subtitle{font-size:10px;color:#666;margin-top:3px}
      .doc-title{font-size:22px;font-weight:700;color:#1a56db;text-align:right}
      .doc-sub{font-size:10px;color:#666;text-align:right;margin-top:2px}
      .doc-no{font-size:12px;font-weight:600;text-align:right;margin-top:3px}
      .info-table{width:100%;border-collapse:collapse;margin-bottom:5mm}
      .info-table td{border:1px solid #bbb;padding:5px 8px;font-size:11px;vertical-align:middle}
      .info-table .lbl{font-weight:600;background:#f5f5f5;white-space:nowrap;width:110px;color:#333}
      table.items{width:100%;border-collapse:collapse;margin-bottom:5mm}
      table.items th{border:1px solid #555;background:#e8e8e8;padding:5px 6px;text-align:center;font-size:10px;font-weight:600;color:#000}
      table.items td{border:1px solid #bbb;padding:5px 6px;font-size:11px;color:#000}
      table.items tbody tr:nth-child(even){background:#fafafa}
      .total-row td{border:1px solid #555;background:#efefef;font-weight:600;font-size:11px;padding:6px 8px}
      .notes{border:1px solid #bbb;padding:6px 10px;margin-bottom:5mm;font-size:10px}
      .notes-title{font-weight:600;margin-bottom:3px}
      .footer{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:8mm}
      .sign-box{border:1px solid #bbb;padding:8px 10px;text-align:center;display:flex;flex-direction:column}
      .sign-label{font-weight:600;font-size:10px;color:#333;padding-bottom:4px;border-bottom:1px solid #eee}
      .sign-area{flex:1;min-height:50px;display:flex;align-items:center;justify-content:center}
      .sign-line{border-top:1px solid #555;padding-top:4px;font-size:10px;color:#333;margin-top:4px}
      @media print{body{padding:10mm}@page{size:A4;margin:0}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="company">FAN YONG CO., LTD</div>
        <div class="subtitle">CÔNG TY TNHH FAN YONG VIỆT NAM</div>
      </div>
      <div>
        <div class="doc-title">報價單 Quotation</div>
        <div class="doc-no">No. ${q.quotation_number}</div>
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td class="lbl">客戶<br/>Khách hàng</td>
        <td style="font-weight:600;font-size:12px" colspan="3">${q.customer_name||'—'}</td>
        <td class="lbl">報價日期<br/>Ngày báo giá</td>
        <td>${String(q.created_at||'').slice(0,10)}</td>
      </tr>
      <tr>
        <td class="lbl">有效期限<br/>Ngày hết hạn</td>
        <td>${q.valid_until ? String(q.valid_until).slice(0,10) : '—'}</td>
        <td class="lbl">幣別<br/>Loại tiền</td>
        <td>${q.currency||'VND'}</td>
        <td class="lbl">狀態<br/>Trạng thái</td>
        <td>${{draft:'草稿',sent:'已發送',accepted:'已接受',rejected:'已拒絕'}[q.status as string]||q.status}</td>
      </tr>
      ${q.remark ? `<tr><td class="lbl">備註</td><td colspan="5">${q.remark}</td></tr>` : ''}
    </table>

    <table class="items">
      <thead><tr>
        <th style="width:28px">ST</th>
        <th>品名 / Products</th>
        <th style="width:100px">規格 / Spec</th>
        <th style="width:45px">單位</th>
        <th style="width:60px">MOQ</th>
        <th style="width:90px">單價 / Vnd</th>
        <th style="width:90px">小計</th>
        <th style="width:90px">備註</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="6" style="text-align:right">合計 / Total</td>
          <td style="text-align:right;font-size:12px;color:#1a56db">${total.toLocaleString()}</td>
          <td style="text-align:center">${q.currency||'VND'}</td>
        </tr>
      </tfoot>
    </table>

    <div class="notes">
      <div class="notes-title">備註 / Mark：</div>
      <div style="white-space:pre-line">${q.remark||''}</div>
    </div>

    <div class="footer">
      <div class="sign-box">
        <div class="sign-label">FAN YONG 確認 / Xác nhận</div>
        <div class="sign-area">${signUrl ? `<img src="${signUrl}" style="max-height:44px;max-width:150px;object-fit:contain"/>` : ''}</div>
        <div class="sign-line">FAN YONG CO., LTD</div>
      </div>
      <div class="sign-box">
        <div class="sign-label">客戶簽章 / Khách hàng ký</div>
        <div class="sign-area"></div>
        <div class="sign-line">${q.customer_name||''}</div>
      </div>
    </div>
    </body></html>`
    const w = window.open('','_blank','width=900,height=1100')
    if (w) { w.document.write(html); w.document.close(); setTimeout(()=>w.print(),500) }
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
        <button onClick={()=>{ setCreating(true); setEditingId(null); resetForm() }} className="btn-primary">+ 新增報價單</button>
      </div>

      {(creating || editingId !== null) && (
        <div className="oms-card p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{editingId ? '編輯報價單（草稿）' : '新增報價單'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">客戶 *</label>
              <select className={inp} value={form.customer_id} onChange={e => {
                const c = customers.find(c => String(c.id) === e.target.value)
                setForm(p => ({ ...p, customer_id: e.target.value, customer_name: c?.customer_name || '' }))
              }}>
                <option value="">-- 選擇客戶 --</option>
                {customers.map(c => <option key={c.id} value={String(c.id)}>{c.customer_name}{c.customer_code ? ` (${c.customer_code})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">有效期限</label>
              <input type="date" className={inp} value={form.valid_until} onChange={e=>setForm(p=>({...p,valid_until:e.target.value}))} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">備註</label>
              <input className={inp} value={form.remark} onChange={e=>setForm(p=>({...p,remark:e.target.value}))} />
            </div>
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
            <button onClick={save} className="btn-primary">{editingId ? '儲存修改' : '建立報價單'}</button>
            <button onClick={resetForm} className="btn-ghost border border-slate-200">取消</button>
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
                        <td className="px-4 py-3 text-slate-400 text-xs">{q.valid_until ? String(q.valid_until).slice(0,10) : '—'}</td>
                        <td className="px-4 py-3"><span className={sm.badge}>{sm.label}</span></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {q.status==='draft' && <button onClick={e=>startEdit(q,e)} className="btn-ghost text-blue-600">編輯</button>}
                            {q.status==='draft' && <button onClick={e=>changeStatus(q.id,'sent',e)} className="btn-ghost">發送</button>}
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
