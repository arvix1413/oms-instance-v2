'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'
import { StatusFlow, PROD_STEPS, getProdActions } from '@/components/StatusFlow'

type ProdMat = {
  material_code: string; material_name: string; spec: string; unit: string
  planned_qty: number; issued_qty: number; batch_no: string; remark: string
  current_stock?: number; shortage?: number; sufficient?: boolean
}
type Prod = {
  id: number; prod_number: string; product_sku: string; product_name: string
  planned_qty: number; produced_qty: number; status: string
  planned_start: string; planned_end: string; remark: string; created_at: string
  materials?: ProdMat[]
}
type CustomerOrder = { id: number; po_number: string; customer_name: string }
type BOM = { id: number; product_sku: string; product_name: string }

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft:       { label: '待確認',   badge: 'badge-gray'   },
  confirmed:   { label: '已建立',   badge: 'badge-blue'   },
  shortage:    { label: '缺料',     badge: 'badge-red'    },
  ready:       { label: '材料齊',   badge: 'badge-yellow' },
  in_progress: { label: '生產中',   badge: 'badge-purple' },
  completed:   { label: '完工',     badge: 'badge-green'  },
  cancelled:   { label: '作廢',     badge: 'badge-gray'   },
}

export default function ProductionPage() {
  const { toast, confirm: confirmDialog } = useDialog()
  const [prods, setProds] = useState<Prod[]>([])
  const [boms, setBoms] = useState<BOM[]>([])
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [viewing, setViewing] = useState<Prod | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create form
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState({
    customer_order_id: '', bom_id: '', product_sku: '', product_name: '',
    planned_qty: 1, planned_start: '', planned_end: '', remark: ''
  })
  const [stockCheck, setStockCheck] = useState<{ items: ProdMat[]; has_shortage: boolean; status: string } | null>(null)
  const [checking, setChecking] = useState(false)

  const load = () => apiFetch<Prod[]>('/api/production').then(setProds).finally(() => setLoading(false))
  useEffect(() => {
    load()
    apiFetch<BOM[]>('/api/bom').then(setBoms).catch(() => {})
    apiFetch<CustomerOrder[]>('/api/customer-orders').then(setOrders).catch(() => {})
  }, [])

  const onSelectBOM = (bomId: string) => {
    const bom = boms.find(b => String(b.id) === bomId)
    setForm(p => ({ ...p, bom_id: bomId, product_sku: bom?.product_sku || '', product_name: bom?.product_name || '' }))
    setStockCheck(null)
  }

  const checkStock = async () => {
    if (!form.bom_id) { toast('請先選擇 BOM', 'error'); return }
    setChecking(true)
    try {
      const result = await apiFetch<any>('/api/production/check-stock', {
        method: 'POST',
        body: JSON.stringify({ bom_id: form.bom_id, planned_qty: form.planned_qty })
      })
      setStockCheck(result)
      setStep(2)
    } catch (e: any) { toast('庫存檢查失敗：' + e.message, 'error') }
    finally { setChecking(false) }
  }

  const save = async () => {
    if (!form.product_name) { toast('請填寫產品名稱', 'error'); return }
    try {
      const materials = stockCheck?.items.map(i => ({
        material_code: i.material_code, material_name: i.material_name,
        spec: i.spec, unit: i.unit, planned_qty: i.planned_qty,
        issued_qty: 0, batch_no: '', remark: ''
      })) || []
      const initialStatus = stockCheck?.has_shortage ? 'shortage' : 'confirmed'
      await apiFetch('/api/production', {
        method: 'POST',
        body: JSON.stringify({ ...form, materials, initial_status: initialStatus })
      })
      toast('生產單建立成功')
      setCreating(false); setStep(1)
      setForm({ customer_order_id: '', bom_id: '', product_sku: '', product_name: '', planned_qty: 1, planned_start: '', planned_end: '', remark: '' })
      setStockCheck(null)
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
    const btnLabels: Record<string, string> = {
      confirmed: '確認建立', shortage: '標記缺料', ready: '確認齊備',
      in_progress: '開始生產', completed: '確認完工', cancelled: '確認作廢',
    }
    if (!await confirmDialog(labels[status] || `確定切換狀態？`, '', btnLabels[status] || '確認')) return
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

  const filtered = prods.filter(p => !search || p.prod_number.toLowerCase().includes(search.toLowerCase()) || p.product_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)

  const shortageItems = stockCheck?.items.filter(i => !i.sufficient) || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">生產單管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">選擇成品 BOM → 自動展開材料 → 庫存檢查 → 建立生產單</p>
        </div>
        <button onClick={() => { setCreating(true); setStep(1) }} className="btn-primary">+ 建立生產單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`flex items-center gap-2 text-sm font-medium ${step === 1 ? 'text-blue-600' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
              選擇成品 & 數量
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className={`flex items-center gap-2 text-sm font-medium ${step === 2 ? 'text-blue-600' : 'text-slate-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
              庫存檢查 & 確認
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">選擇成品 BOM *</label>
                  <select className="oms-input" value={form.bom_id} onChange={e => onSelectBOM(e.target.value)}>
                    <option value="">-- 選擇要生產的成品 --</option>
                    {boms.map(b => <option key={b.id} value={String(b.id)}>{b.product_sku} — {b.product_name}</option>)}
                  </select>
                  {form.product_name && <p className="text-xs text-blue-600 mt-1">✓ {form.product_name}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">生產數量 *</label>
                  <input type="number" min="1" className="oms-input" value={form.planned_qty}
                    onChange={e => { setForm(p => ({ ...p, planned_qty: Number(e.target.value) })); setStockCheck(null) }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">關聯客戶訂單（選填）</label>
                  <select className="oms-input" value={form.customer_order_id} onChange={e => setForm(p => ({ ...p, customer_order_id: e.target.value }))}>
                    <option value="">-- 選擇客戶訂單 --</option>
                    {orders.map(o => <option key={o.id} value={String(o.id)}>{o.po_number} - {o.customer_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">備註</label>
                  <input className="oms-input" value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">計劃開始</label>
                  <input type="date" className="oms-input" value={form.planned_start} onChange={e => setForm(p => ({ ...p, planned_start: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">計劃完成</label>
                  <input type="date" className="oms-input" value={form.planned_end} onChange={e => setForm(p => ({ ...p, planned_end: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={checkStock} disabled={!form.bom_id || checking} className="btn-primary">
                  {checking ? '檢查中...' : '→ 下一步：檢查庫存'}
                </button>
                <button onClick={() => { setCreating(false); setStep(1) }} className="btn-ghost border border-slate-200">取消</button>
              </div>
            </div>
          )}

          {step === 2 && stockCheck && (
            <div>
              {/* Stock check result */}
              <div className={`mb-4 px-4 py-3 rounded-xl border ${stockCheck.has_shortage ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className={`text-sm font-semibold ${stockCheck.has_shortage ? 'text-red-700' : 'text-emerald-700'}`}>
                  {stockCheck.has_shortage
                    ? `⚠ 庫存不足 — ${shortageItems.length} 項材料缺料，建立後狀態為「缺料」`
                    : '✓ 庫存充足 — 所有材料庫存足夠，建立後狀態為「已建立」'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">成品：{form.product_name} | 生產數量：{form.planned_qty}</div>
              </div>

              {/* Materials table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">料號</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">材料名稱</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">規格</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">單位</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">需用量</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">庫存</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">缺料</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">狀態</th>
                  </tr></thead>
                  <tbody>
                    {stockCheck.items.map((item, i) => (
                      <tr key={i} className={`border-b border-slate-100 last:border-0 ${!item.sufficient ? 'bg-red-50/50' : ''}`}>
                        <td className="px-3 py-2 font-mono text-blue-600">{item.material_code}</td>
                        <td className="px-3 py-2 font-medium text-slate-700">{item.material_name}</td>
                        <td className="px-3 py-2 text-slate-500">{item.spec}</td>
                        <td className="px-3 py-2 text-slate-500">{item.unit}</td>
                        <td className="px-3 py-2 text-right font-medium">{item.planned_qty}</td>
                        <td className={`px-3 py-2 text-right font-medium ${item.sufficient ? 'text-emerald-600' : 'text-red-500'}`}>{item.current_stock}</td>
                        <td className={`px-3 py-2 text-right font-bold ${item.shortage ? 'text-red-600' : 'text-slate-300'}`}>
                          {item.shortage ? `-${item.shortage}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.sufficient
                            ? <span className="badge-green">充足</span>
                            : <span className="badge-red">缺料</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button onClick={save} className="btn-primary">建立生產單</button>
                <button onClick={() => setStep(1)} className="btn-ghost border border-slate-200">← 返回修改</button>
                <button onClick={() => { setCreating(false); setStep(1); setStockCheck(null) }} className="btn-ghost">取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
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
                {viewing.status === 'draft' && <button onClick={() => changeStatus(viewing.id, 'confirmed')} className="btn-primary">✓ 確認</button>}
                {viewing.status === 'confirmed' && <>
                  <button onClick={() => changeStatus(viewing.id, 'shortage')} className="btn-ghost text-red-600">⚠ 缺料</button>
                  <button onClick={() => changeStatus(viewing.id, 'ready')} className="btn-primary">✓ 材料齊</button>
                </>}
                {viewing.status === 'shortage' && <button onClick={() => changeStatus(viewing.id, 'ready')} className="btn-primary">✓ 已補齊</button>}
                {viewing.status === 'ready' && <button onClick={() => changeStatus(viewing.id, 'in_progress')} className="btn-primary">▶ 開始生產</button>}
                {viewing.status === 'in_progress' && <button onClick={() => changeStatus(viewing.id, 'completed', viewing.planned_qty)} className="btn-primary">✓ 完工</button>}
                {!['completed', 'cancelled'].includes(viewing.status) && <button onClick={() => changeStatus(viewing.id, 'cancelled')} className="btn-danger">✕ 作廢</button>}
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
                    <td className="text-slate-400 text-xs">{p.planned_start}{p.planned_end ? ` ~ ${p.planned_end}` : ''}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap items-center">
                        <StatusFlow compact steps={PROD_STEPS} current={p.status}
                          actions={getProdActions(p.status)}
                          onAction={(toStatus) => changeStatus(p.id, toStatus, toStatus === 'completed' ? p.planned_qty : undefined)} />
                        <button onClick={() => viewProd(p.id)} className="btn-ghost ml-1">詳情</button>
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
