'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch, getSignatureUrl } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'
import { getCompany } from '@/lib/useCompany'

type QItem = { item_name:string; material_code:string; spec:string; unit:string; qty:number; unit_price:number; total_price:number; remark:string; moq:number|string; image_url?:string }
type Q = { id:number; quotation_number:string; customer_name:string; customer_id?:number; status:string; total_amount:number; currency:string; valid_until:string; remark:string; created_at:string; items?:QItem[] }
type Customer = { id:number; customer_name:string; customer_code:string }
type BOM = { id:number; product_sku:string; product_name:string; spec:string; unit:string; company_price:number; image_url?:string }
const emptyItem = (): QItem => ({ item_name:'', material_code:'', spec:'', unit:'PCS', qty:1, unit_price:0, total_price:0, remark:'', moq:'', image_url:'' })
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
  const [boms, setBoms] = useState<BOM[]>([])
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
    apiFetch<BOM[]>('/api/bom').then(setBoms).catch(()=>{})
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
      items: (data.items || []).map(i => {
        // Match BOM by material_code = product_sku for pre-fill
        const matchedBom = boms.find(b => b.product_sku === i.material_code)
        return {
          item_name: i.item_name || '',
          material_code: i.material_code || '',
          spec: i.spec || '',
          unit: i.unit || 'PCS',
          qty: Number(i.qty) || 0,
          unit_price: Number(i.unit_price) || 0,
          total_price: Number(i.total_price) || 0,
          remark: i.remark || '',
          moq: i.moq ?? '',
          image_url: i.image_url || matchedBom?.image_url || '',
        }
      })
    })
    setEditingId(q.id)
    setCreating(false)
    // Ensure row is expanded
    setExpanded(prev => new Set([...Array.from(prev), q.id]))
  }

  const printQuotation = async (id: number, q: Q) => {
    const [data, company] = await Promise.all([
      apiFetch<Q>(`/api/quotations/${id}`),
      getCompany(),
    ])
    const items = data.items || []
    const signUrl = getSignatureUrl()
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://43.133.56.234'
    const logoUrl = company.logo_url ? (company.logo_url.startsWith('http') ? company.logo_url : `${apiBase}${company.logo_url}`) : null

    const itemRows = items.map((item, idx) => {
      // Find BOM image from loaded data
      const imgUrl = (item as any).image_url
        ? ((item as any).image_url.startsWith('http') ? (item as any).image_url : `${apiBase}${(item as any).image_url}`)
        : ''
      return `
      <tr>
        <td style="text-align:center;font-size:11px">${idx+1}</td>
        <td style="font-size:11px">${item.item_name||''}</td>
        <td style="font-size:10px;color:#444">${item.spec||''}</td>
        <td style="text-align:center;font-size:11px">${item.unit||'PCS'}</td>
        <td style="text-align:center;font-size:11px">${item.moq??''}</td>
        <td style="text-align:right;font-size:11px;font-weight:600">${Number(item.unit_price||0).toLocaleString()}</td>
        <td style="text-align:center;padding:2px">
          ${imgUrl ? `<img src="${imgUrl}" style="max-width:60px;max-height:50px;object-fit:contain" onerror="this.style.display='none'"/>` : ''}
        </td>
        <td style="font-size:10px;color:#555">${item.remark||''}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/>
    <title>報價單 ${q.quotation_number}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:"Microsoft YaHei","PingFang TC",Arial,sans-serif;font-size:11px;color:#000;background:#fff;line-height:1.5}
      .page{padding:10mm 12mm;max-width:210mm;margin:0 auto}
      /* Title */
      .title-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4mm}
      .title-text{font-size:20px;font-weight:700;letter-spacing:1px}
      .logo-box{border:2px solid #000;padding:4px 10px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
      /* Info sections */
      .info-section{border:1px solid #000;margin-bottom:3mm}
      .info-section-title{background:#000;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;letter-spacing:1px}
      .info-grid{display:grid;grid-template-columns:80px 1fr 80px 1fr;gap:0}
      .info-cell{padding:3px 6px;font-size:10px;border-right:1px solid #ccc;border-bottom:1px solid #ccc}
      .info-cell:nth-child(4n){border-right:none}
      .info-label{font-weight:600;color:#333}
      /* Items table */
      table.items{width:100%;border-collapse:collapse;margin-bottom:3mm}
      table.items th{border:1px solid #000;background:#e0e0e0;padding:4px 5px;text-align:center;font-size:10px;font-weight:700;color:#000;white-space:nowrap}
      table.items td{border:1px solid #555;padding:4px 5px;font-size:11px;color:#000;vertical-align:middle}
      table.items tbody tr:nth-child(even){background:#f9f9f9}
      /* Remarks */
      .remarks-box{border:1px solid #000;padding:5px 8px;margin-bottom:3mm;font-size:10px;line-height:1.7}
      .remarks-title{font-weight:700;margin-bottom:2px;font-size:10px}
      /* Signature */
      .sign-row{display:flex;gap:8mm;margin-top:5mm}
      .sign-box{flex:1;border:1px solid #000;padding:6px 8px;text-align:center}
      .sign-label{font-weight:700;font-size:10px;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:3px}
      .sign-area{min-height:45px;display:flex;align-items:center;justify-content:center}
      .sign-name{border-top:1px solid #555;padding-top:3px;font-size:10px;margin-top:3px}
      @media print{body{-webkit-print-color-adjust:exact}@page{size:A4;margin:0}}
    </style></head><body>
    <div class="page">

      <!-- Title -->
      <div class="title-row">
        <div class="title-text">報價單+樣品費 Quotation</div>
        <div>${logoUrl ? `<img src="${logoUrl}" style="max-height:40px;max-width:120px;object-fit:contain" onerror="this.style.display='none'"/>` : `<div class="logo-box">${company.company_name.split(' ')[0]}</div>`}</div>
      </div>

      <!-- Our company info -->
      <div class="info-section">
        <div class="info-section-title">公司名稱 Company Name：${company.company_name_local || company.company_name}</div>
        <div style="padding:3px 6px;font-size:10px;border-bottom:1px solid #ccc">
          地址 Address: ${company.address || '—'}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;padding:3px 6px;font-size:10px;border-bottom:1px solid #ccc">
          <span>電話 Tel: ${company.phone || '—'}</span>
          <span>報價日期 Date Issue: ${String(q.created_at||'').slice(0,10)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;padding:3px 6px;font-size:10px">
          <span>聯繫人 Contact per: ${company.contact_person || '—'}</span>
          <span>報價期限 Date Expire: ${q.valid_until ? String(q.valid_until).slice(0,10) : '1個月/1Month'}</span>
        </div>
      </div>

      <!-- Customer info -->
      <div class="info-section">
        <div class="info-section-title">客戶工廠名稱 Company Name：${q.customer_name||'—'}</div>
        <div style="padding:3px 6px;font-size:10px;border-bottom:1px solid #ccc">
          地址 Address: —
        </div>
        <div style="padding:3px 6px;font-size:10px">
          聯繫人 Contact per: —
        </div>
      </div>

      <!-- Items table -->
      <table class="items">
        <thead><tr>
          <th style="width:28px">項目<br/>Item</th>
          <th>品名<br/>Products</th>
          <th style="width:90px">規格<br/>Specifications</th>
          <th style="width:42px">單位<br/>Unit</th>
          <th style="width:55px">MOQ</th>
          <th style="width:80px">單價<br/>Vnd</th>
          <th style="width:65px">圖片<br/>Image</th>
          <th style="width:80px">備註<br/>Remarks</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Remarks -->
      <div class="remarks-box">
        <div class="remarks-title">備注 Mark:</div>
        <div style="white-space:pre-line">${q.remark || '1.交易方式：現金轉款\n2.樣品日期：8-10天\n3.以上單價不包含8%VAT\n4.交貨方式：越南當地門到門\n5.如有問題根據樣品報價單\n6.三天內確認打樣費用，請簽回並確認3天\n7.收到量產打單出貨後，打樣費將會在8天內退還\n8.樣品數量20片一次，如需增加數量一次開機費用為250萬越盾，一次開機數量最少20片'}</div>
      </div>

      <!-- Signature -->
      <div class="sign-row">
        <div class="sign-box">
          <div class="sign-label">${company.company_name}</div>
          <div class="sign-area">
            ${signUrl ? `<img src="${signUrl}" style="max-height:44px;max-width:150px;object-fit:contain"/>` : ''}
          </div>
          <div class="sign-name">${company.company_name}</div>
        </div>
        <div class="sign-box">
          <div class="sign-label">客戶確認 / Khách hàng xác nhận</div>
          <div class="sign-area"></div>
          <div class="sign-name">${q.customer_name||''}</div>
        </div>
      </div>

    </div>
    </body></html>`
    const w = window.open('','_blank','width=900,height=1200')
    if (w) { w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600) }
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
  const formTotal = form.items.reduce((s,i)=>s+Number(i.total_price),0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">報價單</h1>
          <p className="text-xs text-slate-400 mt-0.5">點擊報價單列展開查看品項明細</p>
        </div>
        <button onClick={()=>{ setCreating(true); setEditingId(null); resetForm() }} className="btn-primary">+ 新增報價單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">新增報價單</h2>
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
                {['選擇BOM','品名','規格','單位','數量','MOQ','單價','小計','備註',''].map(h=>(
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.items.map((item,i)=>(
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1 min-w-[160px]">
                      <select className={inp} value={item.material_code} onChange={e => {
                        const bom = boms.find(b => b.product_sku === e.target.value)
                        if (bom) {
                          setForm(p => ({ ...p, items: p.items.map((it, idx) => idx !== i ? it : {
                            ...it,
                            material_code: bom.product_sku,
                            item_name: bom.product_name,
                            spec: bom.spec || '',
                            unit: bom.unit || 'PCS',
                            unit_price: bom.company_price || 0,
                            total_price: (it.qty || 0) * (bom.company_price || 0),
                            image_url: bom.image_url || '',
                          })}))
                        } else {
                          updateItem(i, 'material_code', e.target.value)
                        }
                      }}>
                        <option value="">-- 選擇 BOM --</option>
                        {boms.map(b => <option key={b.id} value={b.product_sku}>{b.product_sku} — {b.product_name}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input className={inp} value={item.item_name} onChange={e=>updateItem(i,'item_name',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:80}} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:45}} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.qty || ""} onChange={e=>updateItem(i,'qty',Number(e.target.value))} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.moq||""} placeholder="MOQ" onChange={e=>updateItem(i,'moq',e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:85}} value={item.unit_price || ""} onChange={e=>updateItem(i,'unit_price',Number(e.target.value))} /></td>
                    <td className="p-1 px-2 text-right text-slate-600 font-medium whitespace-nowrap">{Number(item.total_price).toLocaleString()}</td>
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
                        <td className="px-4 py-3 text-right text-slate-600 font-medium">{Number(q.total_amount||0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{q.currency}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{q.valid_until ? String(q.valid_until).slice(0,10) : '—'}</td>
                        <td className="px-4 py-3"><span className={sm.badge}>{sm.label}</span></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={e=>{ e.stopPropagation(); printQuotation(q.id, q) }} className="btn-ghost" title="列印">🖨</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${q.id}-items`} className="border-b border-slate-100">
                          <td colSpan={8} className="px-0 py-0">
                            <div className="bg-slate-50/50 border-t border-slate-100">
                              {editingId === q.id ? (
                                /* Inline edit form */
                                <div className="p-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                    <div>
                                      <label className="block text-[11px] text-slate-500 mb-1">客戶</label>
                                      <select className={inp} value={form.customer_id} onChange={e => {
                                        const c = customers.find(c => String(c.id) === e.target.value)
                                        setForm(p => ({ ...p, customer_id: e.target.value, customer_name: c?.customer_name || '' }))
                                      }}>
                                        <option value="">-- 選擇客戶 --</option>
                                        {customers.map(c => <option key={c.id} value={String(c.id)}>{c.customer_name}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-slate-500 mb-1">有效期限</label>
                                      <input type="date" className={inp} value={form.valid_until} onChange={e=>setForm(p=>({...p,valid_until:e.target.value}))} />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-slate-500 mb-1">幣別</label>
                                      <select className={inp} value={form.currency} onChange={e=>setForm(p=>({...p,currency:e.target.value}))}>
                                        <option>VND</option><option>TWD</option><option>USD</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-slate-500 mb-1">備註</label>
                                      <input className={inp} value={form.remark} onChange={e=>setForm(p=>({...p,remark:e.target.value}))} />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-slate-600">報價明細</span>
                                    <button onClick={addItem} className="btn-ghost text-blue-600 text-xs">+ 新增品項</button>
                                  </div>
                                  <div className="overflow-x-auto rounded-lg border border-slate-200 mb-3">
                                    <table className="w-full text-xs">
                                      <thead><tr className="border-b border-slate-200 bg-slate-50">
                                        {['選擇BOM','品名','規格','單位','數量','MOQ','單價','小計','備註',''].map(h=>(
                                          <th key={h} className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                                        ))}
                                      </tr></thead>
                                      <tbody>
                                        {form.items.map((item,i)=>(
                                          <tr key={i} className="border-b border-slate-100">
                                            <td className="p-1 min-w-[150px]">
                                              <select className={inp} value={item.material_code} onChange={e => {
                                                const bom = boms.find(b => b.product_sku === e.target.value)
                                                if (bom) {
                                                  setForm(p => ({ ...p, items: p.items.map((it, idx) => idx !== i ? it : {
                                                    ...it, material_code: bom.product_sku, item_name: bom.product_name,
                                                    spec: bom.spec || '', unit: bom.unit || 'PCS',
                                                    unit_price: bom.company_price || 0,
                                                    total_price: (it.qty || 0) * (bom.company_price || 0),
                                                    image_url: bom.image_url || '',
                                                  })}))
                                                } else { updateItem(i, 'material_code', e.target.value) }
                                              }}>
                                                <option value="">-- 選擇 BOM --</option>
                                                {boms.map(b => <option key={b.id} value={b.product_sku}>{b.product_sku} — {b.product_name}</option>)}
                                              </select>
                                            </td>
                                            <td className="p-1"><input className={inp} value={item.item_name} onChange={e=>updateItem(i,'item_name',e.target.value)} /></td>
                                            <td className="p-1"><input className={inp} style={{width:80}} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} /></td>
                                            <td className="p-1"><input className={inp} style={{width:40}} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} /></td>
                                            <td className="p-1"><input type="number" className={inp} style={{width:60}} value={item.qty || ""} onChange={e=>updateItem(i,'qty',Number(e.target.value))} /></td>
                                            <td className="p-1"><input type="number" className={inp} style={{width:60}} value={item.moq||""} onChange={e=>updateItem(i,'moq',e.target.value)} /></td>
                                            <td className="p-1"><input type="number" className={inp} style={{width:80}} value={item.unit_price || ""} onChange={e=>updateItem(i,'unit_price',Number(e.target.value))} /></td>
                                            <td className="p-1 px-2 text-right text-slate-600 font-medium whitespace-nowrap">{Number(item.total_price).toLocaleString()}</td>
                                            <td className="p-1"><input className={inp} value={item.remark} onChange={e=>updateItem(i,'remark',e.target.value)} /></td>
                                            <td className="p-1 text-center"><button onClick={()=>removeItem(i)} className="text-slate-300 hover:text-red-600">✕</button></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t border-slate-200">
                                          <td colSpan={7} className="px-2 py-1.5 text-right text-[10px] text-slate-400 font-semibold uppercase">合計</td>
                                          <td className="px-2 py-1.5 text-right text-slate-600 font-bold">{formTotal.toLocaleString()}</td>
                                          <td colSpan={2} className="px-2 py-1.5 text-slate-400 text-xs">{form.currency}</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={save} className="btn-primary text-xs">儲存修改</button>
                                    <button onClick={resetForm} className="btn-ghost border border-slate-200 text-xs">取消</button>
                                  </div>
                                </div>
                              ) : qItems.length === 0 ? (
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
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{Number(item.unit_price||0).toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-800 font-semibold whitespace-nowrap">{Number(item.total_price||0).toLocaleString()}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.remark}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-slate-200">
                                        <td colSpan={7} className="px-3 py-2 text-right text-[10px] text-slate-300 font-semibold uppercase">合計</td>
                                        <td className="px-3 py-2 text-right text-slate-600 font-bold">{qItems.reduce((s,i)=>s+Number(i.total_price),0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-slate-400 text-xs">{q.currency}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                              {/* Action bar */}
                              {editingId !== q.id && (
                                <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-2 bg-slate-50/80">
                                  {q.status==='draft' && <button onClick={e=>startEdit(q,e)} className="btn-ghost text-blue-600 text-xs">✏ 編輯</button>}
                                  {q.status==='draft' && <button onClick={e=>changeStatus(q.id,'sent',e)} className="btn-ghost text-xs">發送</button>}
                                  {q.status==='sent' && <>
                                    <button onClick={e=>changeStatus(q.id,'accepted',e)} className="btn-ghost text-emerald-600 text-xs">接受</button>
                                    <button onClick={e=>changeStatus(q.id,'rejected',e)} className="btn-danger text-xs">拒絕</button>
                                  </>}
                                  <button onClick={e=>del(q.id,e)} className="btn-danger text-xs">刪除</button>
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
