'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'
import { MaterialSelect } from '@/components/MaterialSelect'

type BomItem = { material_code:string; material_name:string; spec:string; unit:string; quantity:number|string; color:string; lt:string; moq:number|string; supplier_name:string; supplier_price:number; company_price:number; currency:string; remark:string }
type Bom = { id:number; product_sku:string; product_name:string; version:string; status:string; created_at:string; items?:BomItem[] }
const emptyItem = (): BomItem => ({ material_code:'', material_name:'', spec:'', unit:'PCS', quantity:'', color:'', lt:'', moq:'', supplier_name:'', supplier_price:0, company_price:0, currency:'VND', remark:'' })

export default function BomPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Bom|null>(null)
  const [viewing, setViewing] = useState<Bom|null>(null)
  const [form, setForm] = useState({ product_sku:'', product_name:'', version:'V1', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Bom[]>('/api/bom').then(setBoms).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  const showMsg = (m:string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const viewBom = async (id:number) => {
    const data = await apiFetch<Bom>(`/api/bom/${id}`)
    setViewing(data)
  }

  const startEdit = async (id:number) => {
    const data = await apiFetch<Bom>(`/api/bom/${id}`)
    setEditing(data)
    setForm({
      product_sku: data.product_sku,
      product_name: data.product_name,
      version: data.version,
      items: (data.items||[]).map(i => ({ ...i, quantity: i.quantity ?? '', moq: i.moq ?? '', color: i.color||'', lt: i.lt||'' }))
    })
  }

  const save = async () => {
    try {
      const payload = { ...form, items: form.items.map(i => ({ ...i, quantity: i.quantity === '' ? null : Number(i.quantity), moq: i.moq === '' ? null : Number(i.moq) })) }
      if (editing) {
        await apiFetch(`/api/bom/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        showMsg('BOM 更新成功')
        setEditing(null)
      } else {
        await apiFetch('/api/bom', { method: 'POST', body: JSON.stringify(payload) })
        showMsg('BOM 建立成功')
        setCreating(false)
      }
      setForm({ product_sku:'', product_name:'', version:'V1', items:[emptyItem()] })
      load()
    } catch (e:any) { showMsg('錯誤：' + e.message) }
  }

  const del = async (id:number) => {
    if (!confirm('確定刪除此 BOM？')) return
    await apiFetch(`/api/bom/${id}`, { method: 'DELETE' }); load()
  }

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, emptyItem()] }))
  const removeItem = (i:number) => setForm(p => ({ ...p, items: p.items.filter((_,idx) => idx !== i) }))
  const updateItem = (i:number, field:keyof BomItem, val:any) => setForm(p => ({
    ...p, items: p.items.map((item,idx) => idx === i ? { ...item, [field]: val } : item)
  }))
  const selectMaterial = (i:number, mat:any) => {
    if (!mat) return
    setForm(p => ({ ...p, items: p.items.map((item,idx) => idx === i ? {
      ...item, material_code:mat.material_code, material_name:mat.material_name,
      spec:mat.spec||'', unit:mat.unit||'PCS', supplier_name:mat.supplier_name||'',
      supplier_price:mat.supplier_price||0, company_price:mat.company_price||0, currency:mat.currency||'VND',
    } : item) }))
  }

  const printBom = (bom: Bom) => {
    const items = bom.items || []
    const html = `<html><head><title>BOM - ${bom.product_name}</title>
    <style>body{font-family:sans-serif;font-size:12px;padding:20px}h2{margin-bottom:4px}p{color:#666;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}.num{text-align:right}</style>
    </head><body>
    <h2>BOM 表 - ${bom.product_name}</h2>
    <p>SKU: ${bom.product_sku} | 版本: ${bom.version}</p>
    <table><thead><tr><th>料號</th><th>材料名稱</th><th>規格</th><th>顏色</th><th>單位</th><th class="num">數量</th><th class="num">MOQ</th><th>LT</th><th>供應商</th><th class="num">供應商單價</th><th class="num">公司售價</th><th>幣別</th><th>備註</th></tr></thead>
    <tbody>${items.map(i=>`<tr><td>${i.material_code}</td><td>${i.material_name}</td><td>${i.spec}</td><td>${i.color||''}</td><td>${i.unit}</td><td class="num">${i.quantity??''}</td><td class="num">${i.moq??''}</td><td>${i.lt||''}</td><td>${i.supplier_name}</td><td class="num">${Number(i.supplier_price).toLocaleString()}</td><td class="num">${Number(i.company_price).toLocaleString()}</td><td>${i.currency}</td><td>${i.remark}</td></tr>`).join('')}
    </tbody></table></body></html>`
    const w = window.open('','_blank'); w?.document.write(html); w?.document.close(); w?.print()
  }

  const filtered = boms.filter(b => !search || b.product_sku.toLowerCase().includes(search.toLowerCase()) || b.product_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)
  const inp = 'oms-input text-xs py-1.5'
  const isOpen = creating || !!editing

  const FormModal = () => (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-6xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{editing ? '編輯 BOM 表' : '建立 BOM 表'}</h2>
          <button onClick={() => { setCreating(false); setEditing(null); setForm({ product_sku:'', product_name:'', version:'V1', items:[emptyItem()] }) }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div><label className="block text-xs font-medium text-slate-600 mb-1.5">產品 SKU *</label>
              <input className="oms-input" value={form.product_sku} onChange={e=>setForm(p=>({...p,product_sku:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1.5">產品名稱 *</label>
              <input className="oms-input" value={form.product_name} onChange={e=>setForm(p=>({...p,product_name:e.target.value}))} /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1.5">版本</label>
              <input className="oms-input" value={form.version} onChange={e=>setForm(p=>({...p,version:e.target.value}))} /></div>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-700">BOM 明細</span>
            <button onClick={addItem} className="btn-ghost">+ 新增料號</button>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['料號','材料名稱','規格','顏色','單位','數量','MOQ','LT','供應商','供應商單價','公司售價','幣別','備註',''].map(h=>(
                  <th key={h} className="px-2 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.items.map((item,i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="p-1.5 min-w-[160px]">
                      <MaterialSelect value={item.material_code}
                        onChange={(mat,code) => { if(mat) selectMaterial(i,mat); else updateItem(i,'material_code',code) }}
                        placeholder="搜尋料號..." className="text-xs py-1.5" />
                    </td>
                    <td className="p-1.5 min-w-[110px]"><input className={inp} value={item.material_name} onChange={e=>updateItem(i,'material_name',e.target.value)} /></td>
                    <td className="p-1.5 min-w-[80px]"><input className={inp} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} /></td>
                    <td className="p-1.5 w-20"><input className={inp} value={item.color} onChange={e=>updateItem(i,'color',e.target.value)} placeholder="顏色" /></td>
                    <td className="p-1.5 w-14"><input className={inp} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} /></td>
                    <td className="p-1.5 w-16"><input type="number" className={inp} value={item.quantity} placeholder="數量" onChange={e=>updateItem(i,'quantity',e.target.value)} /></td>
                    <td className="p-1.5 w-16"><input type="number" className={inp} value={item.moq} placeholder="MOQ" onChange={e=>updateItem(i,'moq',e.target.value)} /></td>
                    <td className="p-1.5 w-16"><input className={inp} value={item.lt} placeholder="LT" onChange={e=>updateItem(i,'lt',e.target.value)} /></td>
                    <td className="p-1.5 min-w-[90px]"><input className={inp} value={item.supplier_name} onChange={e=>updateItem(i,'supplier_name',e.target.value)} /></td>
                    <td className="p-1.5 w-24"><input type="number" className={inp} value={item.supplier_price||""} onChange={e=>updateItem(i,'supplier_price',Number(e.target.value))} /></td>
                    <td className="p-1.5 w-24"><input type="number" className={inp} value={item.company_price||""} onChange={e=>updateItem(i,'company_price',Number(e.target.value))} /></td>
                    <td className="p-1.5 w-16">
                      <select className={inp} value={item.currency} onChange={e=>updateItem(i,'currency',e.target.value)}>
                        <option>VND</option><option>TWD</option><option>CNY</option><option>USD</option>
                      </select>
                    </td>
                    <td className="p-1.5 min-w-[80px]"><input className={inp} value={item.remark} onChange={e=>updateItem(i,'remark',e.target.value)} /></td>
                    <td className="p-1.5 text-center"><button onClick={()=>removeItem(i)} className="text-slate-300 hover:text-red-500 transition-colors text-base leading-none">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={() => { setCreating(false); setEditing(null) }} className="btn-ghost">取消</button>
          <button onClick={save} className="btn-primary">{editing ? '儲存修改' : '建立 BOM'}</button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">BOM 表管理</h1>
          <p className="text-xs text-slate-500 mt-0.5">產品物料清單</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">+ 建立 BOM</button>
      </div>

      {msg && <div className="mb-4 px-4 py-2.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{msg}</div>}
      {isOpen && <FormModal />}

      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 max-w-5xl w-full max-h-[80vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">{viewing.product_name}</h2>
                <div className="text-xs text-slate-500 mt-0.5">SKU: {viewing.product_sku} · 版本: {viewing.version}</div>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => printBom(viewing)} className="btn-ghost text-xs">🖨 列印</button>
                <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600 text-xl ml-2">✕</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  {['料號','材料名稱','規格','顏色','單位','數量','MOQ','LT','供應商','供應商單價','公司售價','幣別','備註'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(viewing.items||[]).map((item,i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-blue-600">{item.material_code}</td>
                      <td className="px-3 py-2 text-slate-700">{item.material_name}</td>
                      <td className="px-3 py-2 text-slate-500">{item.spec}</td>
                      <td className="px-3 py-2 text-slate-600">{item.color}</td>
                      <td className="px-3 py-2 text-slate-600">{item.unit}</td>
                      <td className="px-3 py-2 text-right text-slate-700 font-medium">{item.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{item.moq ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{item.lt}</td>
                      <td className="px-3 py-2 text-slate-500">{item.supplier_name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{Number(item.supplier_price).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-800 font-semibold">{Number(item.company_price).toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-500">{item.currency}</td>
                      <td className="px-3 py-2 text-slate-400">{item.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <input className="oms-input w-64" placeholder="搜尋產品 SKU 或名稱..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <div className="oms-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : (
          <>
            <table className="oms-table">
              <thead><tr>
                <th>產品 SKU</th><th>產品名稱</th><th>版本</th><th>狀態</th><th>建立時間</th><th>操作</th>
              </tr></thead>
              <tbody>
                {paged.map(b => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs text-blue-600">{b.product_sku}</td>
                    <td className="font-medium">{b.product_name}</td>
                    <td>{b.version}</td>
                    <td><span className={b.status==='active'?'badge-green':'badge-gray'}>{b.status==='active'?'啟用':'停用'}</span></td>
                    <td className="text-slate-400 text-xs">{b.created_at?.slice(0,10)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => viewBom(b.id)} className="btn-ghost">詳情</button>
                        <button onClick={() => startEdit(b.id)} className="btn-ghost text-blue-600">編輯</button>
                        <button onClick={() => del(b.id)} className="btn-danger">刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-400">尚無 BOM 表</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
    </div>
  )
}
