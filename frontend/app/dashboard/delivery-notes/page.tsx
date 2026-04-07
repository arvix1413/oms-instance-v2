'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type DNItem = { item_name:string; material_code:string; spec:string; unit:string; qty:number; remark:string; po_ref:string; thickness:number|string }
type DN = { id:number; dn_number:string; customer_name:string; delivery_date:string; status:string; remark:string; created_at:string; items?:DNItem[] }
const emptyItem = (): DNItem => ({ item_name:'', material_code:'', spec:'', unit:'PCS', qty:1, remark:'', po_ref:'', thickness:'' })
const STATUS_MAP: Record<string,{label:string;badge:string}> = {
  draft:{label:'草稿',badge:'badge-gray'},
  confirmed:{label:'已確認',badge:'badge-blue'},
  shipped:{label:'已出貨',badge:'badge-green'},
}

export default function DeliveryNotesPage() {
  const { toast, confirm: confirmDialog } = useDialog()

  const [items, setItems] = useState<DN[]>([])
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<DN|null>(null)
  const [form, setForm] = useState({ customer_name:'', delivery_date:'', remark:'', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<DN[]>('/api/delivery-notes').then(setItems).finally(()=>setLoading(false))
  useEffect(()=>{ load() },[])

  const viewDN = async (id:number) => { const d = await apiFetch<DN>(`/api/delivery-notes/${id}`); setViewing(d) }
  const changeStatus = async (id:number, status:string) => {
    await apiFetch(`/api/delivery-notes/${id}/status`,{method:'PATCH',body:JSON.stringify({status})})
    toast('狀態已更新'); load(); if(viewing?.id===id) viewDN(id)
  }
  const del = async (id:number) => {
    if (!await confirmDialog('確定刪除？')) return
    await apiFetch(`/api/delivery-notes/${id}`,{method:'DELETE'}); load()
  }
  const save = async () => {
    try {
      await apiFetch('/api/delivery-notes',{method:'POST',body:JSON.stringify(form)})
      toast('出貨單建立成功'); setCreating(false); setForm({customer_name:'',delivery_date:'',remark:'',items:[emptyItem()]}); load()
    } catch(e:any){ toast('錯誤：'+e.message) }
  }

  const printDN = (dn: DN) => {
    const items = dn.items || []
    const html = `<html><head><title>出貨單 ${dn.dn_number}</title>
    <style>body{font-family:sans-serif;font-size:12px;padding:20px}h2{margin-bottom:4px}p{color:#666;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.num{text-align:right}</style>
    </head><body>
    <h2>出貨單 ${dn.dn_number}</h2>
    <p>客戶：${dn.customer_name} | 出貨日期：${dn.delivery_date||'—'} | FAN YONG CO., LTD</p>
    <table><thead><tr><th>PO訂單編號</th><th>品名</th><th>物料編號</th><th>規格</th><th class="num">厚度</th><th>單位</th><th class="num">數量</th><th>備註</th></tr></thead>
    <tbody>${items.map(i=>`<tr><td>${i.po_ref||''}</td><td>${i.item_name}</td><td>${i.material_code}</td><td>${i.spec}</td><td class="num">${i.thickness??''}</td><td>${i.unit}</td><td class="num">${i.qty?.toLocaleString()}</td><td>${i.remark}</td></tr>`).join('')}
    </tbody></table></body></html>`
    const w = window.open('','_blank'); w?.document.write(html); w?.document.close(); w?.print()
  }
  const addItem = () => setForm(p=>({...p,items:[...p.items,emptyItem()]}))
  const removeItem = (i:number) => setForm(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}))
  const updateItem = (i:number, f:keyof DNItem, v:any) => setForm(p=>({...p,items:p.items.map((item,idx)=>idx===i?{...item,[f]:v}:item)}))

  const filtered = items.filter(d => !search || d.dn_number.toLowerCase().includes(search.toLowerCase()) || d.customer_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)
  const inp = 'oms-input text-xs py-1.5'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">出貨單</h1>
        <button onClick={()=>setCreating(true)} className="btn-primary">+ 新增出貨單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          <h2 className="font-semibold mb-4">新增出貨單</h2>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div><label className="block text-[11px] text-slate-500 mb-1.5">客戶名稱 *</label><input className="oms-input" value={form.customer_name} onChange={e=>setForm(p=>({...p,customer_name:e.target.value}))} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1.5">出貨日期</label><input type="date" className="oms-input" value={form.delivery_date} onChange={e=>setForm(p=>({...p,delivery_date:e.target.value}))} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1.5">備註</label><input className="oms-input" value={form.remark} onChange={e=>setForm(p=>({...p,remark:e.target.value}))} /></div>
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">出貨明細</h3>
            <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-800">+ 新增品項</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="border-b border-slate-200">{['PO訂單編號','品名','物料編號','規格','厚度','單位','數量','備註',''].map(h=><th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {form.items.map((item,i)=>(
                  <tr key={i}>
                    <td className="border p-1"><input className={inp} value={item.po_ref} placeholder="PO編號" onChange={e=>updateItem(i,'po_ref',e.target.value)} style={{width:90}} /></td>
                    <td className="border p-1"><input className={inp} value={item.item_name} onChange={e=>updateItem(i,'item_name',e.target.value)} /></td>
                    <td className="border p-1"><input className={inp} value={item.material_code} onChange={e=>updateItem(i,'material_code',e.target.value)} style={{width:100}} /></td>
                    <td className="border p-1"><input className={inp} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} style={{width:80}} /></td>
                    <td className="border p-1"><input type="number" className={inp} value={item.thickness||""} placeholder="厚度" onChange={e=>updateItem(i,'thickness',e.target.value)} style={{width:60}} /></td>
                    <td className="border p-1"><input className={inp} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} style={{width:50}} /></td>
                    <td className="border p-1"><input type="number" className={inp} value={item.qty || ""} onChange={e=>updateItem(i,'qty',Number(e.target.value))} style={{width:70}} /></td>
                    <td className="border p-1"><input className={inp} value={item.remark} onChange={e=>updateItem(i,'remark',e.target.value)} /></td>
                    <td className="border p-1 text-center"><button onClick={()=>removeItem(i)} className="text-red-600 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="btn-primary">建立出貨單</button>
            <button onClick={()=>setCreating(false)} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">{viewing.dn_number}</h2>
                <div className="text-xs text-slate-500">客戶：{viewing.customer_name} | 出貨日期：{viewing.delivery_date}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={STATUS_MAP[viewing.status]?.badge}>{STATUS_MAP[viewing.status]?.label}</span>
                <button onClick={() => printDN(viewing)} className="btn-ghost text-xs">🖨 列印</button>
                <button onClick={()=>setViewing(null)} className="text-slate-400 hover:text-slate-600 text-xl ml-2 z-10">✕</button>
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              {viewing.status==='draft' && <button onClick={()=>changeStatus(viewing.id,'confirmed')} className="btn-primary">✓ 確認</button>}
              {viewing.status==='confirmed' && <button onClick={()=>changeStatus(viewing.id,'shipped')} className="btn-primary">🚚 出貨</button>}
            </div>
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-slate-200">{['PO訂單編號','品名','物料編號','規格','厚度','單位','數量','備註'].map(h=><th key={h} className="border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {(viewing.items||[]).map((item,i)=>(
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-3 py-2 text-slate-500">{item.po_ref}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-600">{item.item_name}</td>
                    <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-blue-600">{item.material_code}</td>
                    <td className="border px-3 py-2 text-slate-500">{item.spec}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right text-slate-500">{item.thickness ?? '—'}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-600">{item.unit}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right text-slate-800 font-medium">{item.qty?.toLocaleString()}</td>
                    <td className="border px-3 py-2 text-slate-400">{item.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-4"><input className="oms-input w-64" placeholder="搜尋出貨單號或客戶..." value={search} onChange={e=>setSearch(e.target.value)} /></div>

      <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
          <>
            <div className="overflow-x-auto">
              <table className="oms-table" style={{minWidth:600}}>
                <thead className="bg-transparent text-xs text-slate-400 uppercase">
                  <tr>
                    <th className="px-3 py-3 text-left whitespace-nowrap">出貨單號</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">客戶名稱</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">出貨日期</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">備註</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">狀態</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {paged.map(dn=>(
                    <tr key={dn.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">{dn.dn_number}</td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap max-w-[200px] truncate" title={dn.customer_name}>{dn.customer_name}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{dn.delivery_date}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap max-w-[150px] truncate" title={dn.remark}>{dn.remark}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={STATUS_MAP[dn.status]?.badge}>{STATUS_MAP[dn.status]?.label}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button onClick={()=>viewDN(dn.id)} className="btn-ghost">詳情</button>
                          <button onClick={()=>del(dn.id)} className="btn-danger">刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length===0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">尚無出貨單</td></tr>}
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
