'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'

type ProdMat = { material_code: string; material_name: string; spec: string; unit: string; planned_qty: number; issued_qty: number; batch_no: string; remark: string }
type Prod = { id: number; prod_number: string; product_sku: string; product_name: string; planned_qty: number; produced_qty: number; status: string; planned_start: string; planned_end: string; remark: string; created_at: string; materials?: ProdMat[] }
type BOM = { id: number; product_sku: string; product_name: string; items?: any[] }
type CustomerOrder = { id: number; po_number: string; customer_name: string }

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft:       { label: '待確認',   badge: 'badge-gray'   },
  confirmed:   { label: '已建立',   badge: 'badge-blue'   },
  shortage:    { label: '缺料',     badge: 'badge-red'    },
  ready:       { label: '材料齊',   badge: 'badge-yellow' },
  in_progress: { label: '生產中',   badge: 'badge-purple' },
  completed:   { label: '完工',     badge: 'badge-green'  },
  cancelled:   { label: '作廢',     badge: 'badge-gray'   },
}

const emptyMat = (): ProdMat => ({ material_code: '', material_name: '', spec: '', unit: 'PCS', planned_qty: 0, issued_qty: 0, batch_no: '', remark: '' })

export default function ProductionPage() {
  const { toast, confirm: confirmDialog } = useDialog()
  const [prods, setProds] = useState<Prod[]>([])
  const [boms, setBoms] = useState<BOM[]>([])
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [viewing, setViewing] = useState<Prod | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ customer_order_id: '', bom_id: '', product_sku: '', product_name: '', planned_qty: 1, planned_start: '', planned_end: '', remark: '', materials: [emptyMat()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Prod[]>('/api/production').then(setProds).finally(() => setLoading(false))
  useEffect(() => {
    load()
    apiFetch<BOM[]>('/api/bom').then(setBoms).catch(() => {})
    apiFetch<CustomerOrder[]>('/api/customer-orders').then(setOrders).catch(() => {})
  }, [])

  const onSelectBOM = async (bomId: string) => {
    const bom = boms.find(b => String(b.id) === bomId)
    if (!bom) { setForm(p => ({ ...p, bom_id: '', product_sku: '', product_name: '', materials: [emptyMat()] })); return }
    try {
      const data = await apiFetch<BOM>(`/api/bom/${bomId}`)
      const mats = (data.items || []).map((i: any) => ({
        material_code: i.material_code, material_name: i.material_name,
        spec: i.spec || '', unit: i.unit || 'PCS',
        planned_qty: i.quantity || 0, issued_qty: 0, batch_no: '', remark: ''
      }))
      setForm(p => ({ ...p, bom_id: bomId, product_sku: bom.product_sku, product_name: bom.product_name, materials: mats.length ? mats : [emptyMat()] }))
    } catch { setForm(p => ({ ...p, bom_id: bomId, product_sku: bom.product_sku, product_name: bom.product_name })) }
  }

  const save = async () => {
    if (!form.product_name) { toast('請填寫產品名稱', 'error'); return }
    try {
      await apiFetch('/api/production', { method: 'POST', body: JSON.stringify(form) })
      toast('生產單建立成功'); setCreating(false)
      setForm({ customer_order_id: '', bom_id: '', product_sku: '', product_name: '', planned_qty: 1, planned_start: '', planned_end: '', remark: '', materials: [emptyMat()] })
      load()
    } catch (e: any) { toast('錯誤：' + e.message, 'error') }
  }

  const changeStatus = async (id: number, status: string, producedQty?: number) => {
    const labels: Record<string, string> = {
      confirmed:   '確認建立此生產單？',
      shortage:    '標記為缺料狀態？',
      ready:       '確認材料已齊備？',
      in_progress: '開始生產（將進入生產中狀態）？',
      completed:   '確認完工？完工後將扣減材料庫存',
      cancelled:   '確定作廢此生產單？此操作不可撤銷',
    }
    if (!await confirmDialog(labels[status] || `確定切換狀態為 ${status}？`)) return
    try {
      await apiFetch(`/api/production/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, produced_qty: producedQty }) })
      toast('狀態已更新'); load()
      if (viewing?.id === id) { const d = await apiFetch<Prod>(`/api/production/${id}`); setViewing(d) }
    } catch (e: any) { toast(e.message, 'error') }
  }

  const del = async (id: number) => {
    if (!await confirmDialog('確定刪除此生產單？')) return
    try { await apiFetch(`/api/production/${id}`, { method: 'DELETE' }); load() }
    catch (e: any) { toast(e.message, 'error') }
  }

  const viewProd = async (id: number) => { const d = await apiFetch<Prod>(`/api/production/${id}`); setViewing(d) }
  const addMat = () => setForm(p => ({ ...p, materials: [...p.materials, emptyMat()] }))
  const removeMat = (i: number) => setForm(p => ({ ...p, materials: p.materials.filter((_, idx) => idx !== i) }))
  const updateMat = (i: number, f: keyof ProdMat, v: any) => setForm(p => ({ ...p, materials: p.materials.map((m, idx) => idx === i ? { ...m, [f]: v } : m) }))

  const filtered = prods.filter(p => !search || p.prod_number.toLowerCase().includes(search.toLowerCase()) || p.product_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)
  const inp = 'oms-input text-xs py-1.5'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">生產單管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">生產領料，完成後自動扣減材料庫存</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">+ 建立生產單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          <h2 className="text-sm font-semibold mb-4">建立生產單</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">關聯 BOM（選填）</label>
              <select className={inp} value={form.bom_id} onChange={e => onSelectBOM(e.target.value)}>
                <option value="">-- 選擇 BOM --</option>
                {boms.map(b => <option key={b.id} value={String(b.id)}>{b.product_sku} - {b.product_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">關聯客戶訂單（選填）</label>
              <select className={inp} value={form.customer_order_id} onChange={e => setForm(p => ({ ...p, customer_order_id: e.target.value }))}>
                <option value="">-- 選擇客戶訂單 --</option>
                {orders.map(o => <option key={o.id} value={String(o.id)}>{o.po_number} - {o.customer_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">產品名稱 *</label>
              <input className={inp} value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">計劃數量 *</label>
              <input type="number" className={inp} value={form.planned_qty} onChange={e => setForm(p => ({ ...p, planned_qty: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">計劃開始</label>
              <input type="date" className={inp} value={form.planned_start} onChange={e => setForm(p => ({ ...p, planned_start: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">計劃完成</label>
              <input type="date" className={inp} value={form.planned_end} onChange={e => setForm(p => ({ ...p, planned_end: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">領料清單</span>
            <button onClick={addMat} className="btn-ghost text-blue-600">+ 新增材料</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200">
                {['料號','材料名稱','規格','單位','計劃用量','批次號','備註',''].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.materials.map((mat, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1"><input className={inp} style={{width:90}} value={mat.material_code} onChange={e => updateMat(i, 'material_code', e.target.value)} /></td>
                    <td className="p-1"><input className={inp} value={mat.material_name} onChange={e => updateMat(i, 'material_name', e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:80}} value={mat.spec} onChange={e => updateMat(i, 'spec', e.target.value)} /></td>
                    <td className="p-1"><input className={inp} style={{width:45}} value={mat.unit} onChange={e => updateMat(i, 'unit', e.target.value)} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:70}} value={mat.planned_qty || ''} onChange={e => updateMat(i, 'planned_qty', Number(e.target.value))} /></td>
                    <td className="p-1"><input className={inp} style={{width:80}} value={mat.batch_no} placeholder="批次號" onChange={e => updateMat(i, 'batch_no', e.target.value)} /></td>
                    <td className="p-1"><input className={inp} value={mat.remark} onChange={e => updateMat(i, 'remark', e.target.value)} /></td>
                    <td className="p-1 text-center"><button onClick={() => removeMat(i)} className="text-slate-300 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">建立生產單</button>
            <button onClick={() => setCreating(false)} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold">{viewing.prod_number}</h2>
                <div className="text-xs text-slate-500">{viewing.product_name} | 計劃：{viewing.planned_qty} | 已產：{viewing.produced_qty}</div>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <span className={STATUS_MAP[viewing.status]?.badge}>{STATUS_MAP[viewing.status]?.label}</span>
                {viewing.status === 'draft' && (
                  <button onClick={() => changeStatus(viewing.id, 'confirmed')} className="btn-primary">✓ 確認建立</button>
                )}
                {viewing.status === 'confirmed' && (
                  <>
                    <button onClick={() => changeStatus(viewing.id, 'shortage')} className="btn-ghost text-red-600">⚠ 標記缺料</button>
                    <button onClick={() => changeStatus(viewing.id, 'ready')} className="btn-primary">✓ 材料齊備</button>
                  </>
                )}
                {viewing.status === 'shortage' && (
                  <button onClick={() => changeStatus(viewing.id, 'ready')} className="btn-primary">✓ 材料已補齊</button>
                )}
                {viewing.status === 'ready' && (
                  <button onClick={() => changeStatus(viewing.id, 'in_progress')} className="btn-primary">▶ 開始生產</button>
                )}
                {viewing.status === 'in_progress' && (
                  <button onClick={() => changeStatus(viewing.id, 'completed', viewing.planned_qty)} className="btn-primary">✓ 完工</button>
                )}
                {!['completed', 'cancelled'].includes(viewing.status) && (
                  <button onClick={() => changeStatus(viewing.id, 'cancelled')} className="btn-danger">✕ 作廢</button>
                )}
                <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600 text-xl ml-2">✕</button>
              </div>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-slate-200">
                {['料號','材料名稱','規格','單位','計劃用量','實際領料','批次號'].map(h => (
                  <th key={h} className="border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-400">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(viewing.materials || []).map((mat, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-blue-600">{mat.material_code}</td>
                    <td className="border border-slate-200 px-3 py-2">{mat.material_name}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-500">{mat.spec}</td>
                    <td className="border border-slate-200 px-3 py-2">{mat.unit}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right">{mat.planned_qty}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right font-semibold text-emerald-600">{mat.issued_qty}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-400">{mat.batch_no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-4"><input className="oms-input w-64" placeholder="搜尋生產單號或產品名稱..." value={search} onChange={e => setSearch(e.target.value)} /></div>

      <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div> : (
          <>
            <table className="oms-table">
              <thead><tr>
                <th>生產單號</th><th>產品名稱</th><th>計劃數量</th><th>已完成</th><th>計劃日期</th><th>狀態</th><th>操作</th>
              </tr></thead>
              <tbody>
                {paged.map(p => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs text-blue-600">{p.prod_number}</td>
                    <td className="font-medium">{p.product_name}</td>
                    <td className="text-right">{p.planned_qty}</td>
                    <td className="text-right text-emerald-600">{p.produced_qty}</td>
                    <td className="text-slate-400 text-xs">{p.planned_start} ~ {p.planned_end}</td>
                    <td><span className={STATUS_MAP[p.status]?.badge}>{STATUS_MAP[p.status]?.label}</span></td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => viewProd(p.id)} className="btn-ghost">詳情</button>
                        {p.status === 'draft' && <button onClick={() => changeStatus(p.id, 'confirmed')} className="btn-ghost text-blue-600">確認</button>}
                        {p.status === 'confirmed' && <button onClick={() => changeStatus(p.id, 'ready')} className="btn-ghost text-emerald-600">材料齊</button>}
                        {p.status === 'shortage' && <button onClick={() => changeStatus(p.id, 'ready')} className="btn-ghost text-emerald-600">補齊</button>}
                        {p.status === 'ready' && <button onClick={() => changeStatus(p.id, 'in_progress')} className="btn-ghost text-blue-600">開始</button>}
                        {p.status === 'in_progress' && <button onClick={() => changeStatus(p.id, 'completed', p.planned_qty)} className="btn-ghost text-emerald-600">完工</button>}
                        {p.status === 'draft' && <button onClick={() => del(p.id)} className="btn-danger">刪除</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-slate-400">尚無生產單</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
    </div>
  )
}
