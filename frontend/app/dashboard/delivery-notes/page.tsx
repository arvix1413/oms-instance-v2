'use client'
import { generateDeliveryNoteHTML } from '@/lib/printDeliveryNote'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState } from 'react'
import { apiFetch, getSignatureUrl } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'
import { StatusFlow, DN_STEPS, getDNActions } from '@/components/StatusFlow'
import { can } from '@/lib/usePermissions'
import { getCompany } from '@/lib/useCompany'

type DNItem = { bom_id?:number|null; item_name:string; material_code:string; qty:number; shipped_qty:number; remark:string; po_ref?: string; spec?: string; unit?: string }
type DN = { id:number; dn_number:string; customer_name:string; delivery_date:string; status:string; remark:string; created_at:string; items?:DNItem[]; order_po_number?:string }
type Customer = { id:number; customer_name:string; customer_code:string }
type PendingOrder = { id:number; po_number:string; po_date:string; items_summary:string }
type OrderItem = { id:number; bom_id:number|null; qty:number; arrived_qty:number; remaining_qty:number; unit_price:number; product_name:string; product_sku:string }
type DNBatch = { id:number; dn_number:string; customer_name:string; delivery_date:string; status:string; remark:string; created_at:string; batch_qty:number }
type OrderDeliveryRow = {
  customer_order_id:number
  customer_id:number|null
  order_po_number:string
  customer_name:string
  order_status:string
  order_qty:number
  shipped_qty:number
  remaining_qty:number
  shipping_ratio:number
  progress_status:'pending'|'partial'|'completed'
  notes: DNBatch[]
}

const STATUS_MAP: Record<string,{label:string;badge:string}> = {
  draft:     { label:'草稿',   badge:'badge-gray'  },
  confirmed: { label:'已確認', badge:'badge-blue'  },
  shipped:   { label:'已出貨', badge:'badge-green' },
}
const ORDER_PROGRESS_MAP: Record<string, { label: string; badge: string }> = {
  pending: { label: '未出貨', badge: 'badge-gray' },
  partial: { label: '部分出貨', badge: 'badge-yellow' },
  completed: { label: '已完成', badge: 'badge-green' },
}

export default function DeliveryNotesPage() {
  const { toast, confirm: confirmDialog } = useDialog()

  const [orderRows, setOrderRows] = useState<OrderDeliveryRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DN|null>(null)
  const [editForm, setEditForm] = useState({ delivery_date: '', remark: '', items: [] as DNItem[] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set())
  const [expandedDns, setExpandedDns] = useState<Set<number>>(new Set())
  const [loadedItems, setLoadedItems] = useState<Record<number, DNItem[]>>({})
  const canWrite = can('delivery.create')
  const canDel = can('delivery.delete')

  // Create form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [shippedQtys, setShippedQtys] = useState<Record<number, number>>({})
  const [deliveryDate, setDeliveryDate] = useState('')
  const [remark, setRemark] = useState('')

  const load = () => apiFetch<OrderDeliveryRow[]>('/api/delivery-notes/overview').then(setOrderRows).finally(() => setLoading(false))
  useEffect(() => {
    load()
    apiFetch<Customer[]>('/api/customers').then(setCustomers).catch(() => {})
  }, [])

  const onSelectCustomer = async (customerId: string) => {
    setSelectedCustomerId(customerId)
    setSelectedOrderId('')
    setOrderItems([])
    setShippedQtys({})
    if (!customerId) { setPendingOrders([]); return }
    const orders = await apiFetch<PendingOrder[]>(`/api/customer-orders/pending?customer_id=${customerId}`)
    setPendingOrders(orders)
  }

  const onSelectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId)
    setOrderItems([])
    setShippedQtys({})
    if (!orderId) return
    const data = await apiFetch<any>(`/api/customer-orders/${orderId}`)
    const items: OrderItem[] = (data.items || []).map((i: any) => ({
      id: i.id, bom_id: i.bom_id, qty: Number(i.qty),
      arrived_qty: Number(i.arrived_qty || 0),
      remaining_qty: Math.max(0, Number(i.qty || 0) - Number(i.arrived_qty || 0)),
      unit_price: Number(i.unit_price),
      product_name: i.product_name || '',
      product_sku: i.product_sku || '',
    }))
    setOrderItems(items)
    // Default shipped qty = remaining qty
    const qtys: Record<number, number> = {}
    items.forEach(i => { qtys[i.id] = i.remaining_qty })
    setShippedQtys(qtys)
  }

  const save = async () => {
    if (!selectedCustomerId) { toast('請選擇客戶', 'error'); return }
    if (!selectedOrderId) { toast('請選擇訂單', 'error'); return }
    const items = orderItems.map(i => ({
      bom_id: i.bom_id,
      item_name: i.product_name,
      material_code: i.product_sku,
      qty: Math.min(i.remaining_qty, Math.max(0, Number(shippedQtys[i.id] || 0))),
      remark: '',
    })).filter(i => i.qty > 0)
    if (!items.length) { toast('請填寫本次出貨數量', 'error'); return }
    try {
      await apiFetch('/api/delivery-notes', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: Number(selectedCustomerId),
          customer_order_id: Number(selectedOrderId),
          delivery_date: deliveryDate,
          remark,
          items,
        })
      })
      toast('出貨單建立成功')
      setCreating(false)
      resetForm()
      await load()
      setLoadedItems({})
    } catch (e: any) { toast('錯誤：' + e.message, 'error') }
  }

  const resetForm = () => {
    setSelectedCustomerId(''); setSelectedOrderId('')
    setPendingOrders([]); setOrderItems([]); setShippedQtys({})
    setDeliveryDate(''); setRemark('')
  }

  const toggleOrderExpand = (orderId: number) => {
    setExpandedOrders(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const toggleDnExpand = async (dnId: number) => {
    setExpandedDns(prev => {
      const next = new Set(prev)
      if (next.has(dnId)) next.delete(dnId)
      else next.add(dnId)
      return next
    })
    if (!loadedItems[dnId]) {
      const d = await apiFetch<DN>(`/api/delivery-notes/${dnId}`)
      setLoadedItems(p => ({ ...p, [dnId]: d.items || [] }))
    }
  }

  const startEditDN = async (dn: Pick<DN, 'id' | 'delivery_date' | 'remark'>) => {
    const d = await apiFetch<DN>(`/api/delivery-notes/${dn.id}`)
    setEditForm({
      delivery_date: dn.delivery_date ? String(dn.delivery_date).slice(0,10) : '',
      remark: dn.remark || '',
      items: d.items || []
    })
    setEditing(d)
  }

  const saveEditDN = async () => {
    if (!editing) return
    try {
      await apiFetch(`/api/delivery-notes/${editing.id}`, { method: 'PUT', body: JSON.stringify(editForm) })
      toast('出貨單已更新')
      const editedId = editing.id
      setEditing(null)
      await load()
      setLoadedItems({})
      if (expandedDns.has(editedId)) {
        const d = await apiFetch<DN>(`/api/delivery-notes/${editedId}`)
        setLoadedItems(p => ({ ...p, [editedId]: d.items || [] }))
      }
    } catch (e: any) { toast('更新失敗：' + e.message, 'error') }
  }

  const changeStatus = async (id: number, status: string) => {
    const labels: Record<string, string> = {
      confirmed: '確認此出貨單？',
      shipped: '確認出貨？出貨後狀態不可撤銷，並將自動扣減庫存',
    }
    const btnLabels: Record<string, string> = { confirmed: '確認', shipped: '確認出貨' }
    if (!await confirmDialog(labels[status] || '確認變更狀態？', '', btnLabels[status] || '確認')) return
    setActionLoading(id)
    try {
      await apiFetch(`/api/delivery-notes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast('狀態已更新')
      await load()
      setLoadedItems({})
      if (expandedDns.has(id)) {
        const d = await apiFetch<DN>(`/api/delivery-notes/${id}`)
        setLoadedItems(p => ({ ...p, [id]: d.items || [] }))
      }
    } catch (e: any) { toast('操作失敗：' + e.message, 'error') }
    finally { setActionLoading(null) }
  }

  const del = async (id: number) => {
    if (!await confirmDialog('確定刪除？')) return
    try {
      await apiFetch(`/api/delivery-notes/${id}`, { method: 'DELETE' })
      await load()
      setExpandedDns(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setLoadedItems(p => {
        const next = { ...p }
        delete next[id]
        return next
      })
    } catch (e: any) { toast('刪除失敗：' + e.message, 'error') }
  }

  const printDN = async (dn: Pick<DN, 'id' | 'dn_number' | 'customer_name' | 'delivery_date' | 'remark' | 'order_po_number'>) => {
    const detail = await apiFetch<DN & { po_ref?: string; address?: string }>(`/api/delivery-notes/${dn.id}`)
    const company = await getCompany()
    const html = generateDeliveryNoteHTML({
      dn_number: dn.dn_number,
      customer_name: dn.customer_name,
      delivery_date: dn.delivery_date,
      po_ref: detail.po_ref || dn.order_po_number || '',
      address: detail.address || '',
      remark: dn.remark,
      items: detail.items || []
    }, getSignatureUrl() || undefined, company)
    const w = window.open('', '_blank', 'width=800,height=1000')
    if (!w) {
      toast('瀏覽器已封鎖彈出視窗，請允許後再列印', 'error')
      return
    }
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  const filtered = orderRows.filter(o => {
    if (!search) return true
    const key = search.toLowerCase()
    const hitOrder = (o.order_po_number || '').toLowerCase().includes(key) || (o.customer_name || '').toLowerCase().includes(key)
    const hitBatch = (o.notes || []).some(n => (n.dn_number || '').toLowerCase().includes(key))
    return hitOrder || hitBatch
  })
  const { page, setPage, totalPages, paged, total } = usePagination(filtered, 20)
  const inp = 'oms-input text-xs py-1.5'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">出貨單</h1>
        {canWrite && <button onClick={() => setCreating(true)} className="btn-primary">+ 新增出貨單</button>}
      </div>

      {creating && canWrite && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] px-4 py-6 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto oms-card p-6">
          <h2 className="font-semibold text-slate-800 mb-5">新增出貨單</h2>

          {/* Step 1: Select customer then order */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">客戶</label>
              <select className="oms-input" value={selectedCustomerId} onChange={e => onSelectCustomer(e.target.value)}>
                <option value="">-- 選擇客戶 --</option>
                {customers.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.customer_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">
                待出貨訂單 *
                {selectedCustomerId && pendingOrders.length === 0 && (
                  <span className="text-orange-500 ml-1">（無待出貨訂單）</span>
                )}
              </label>
              <select className="oms-input" value={selectedOrderId} onChange={e => onSelectOrder(e.target.value)}
                disabled={pendingOrders.length === 0}>
                <option value="">-- 選擇訂單 --</option>
                {pendingOrders.map(o => (
                  <option key={o.id} value={String(o.id)}>{o.po_number}{o.items_summary ? ` (${o.items_summary.slice(0,25)})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">出貨日期</label>
              <input type="date" className="oms-input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">備註（交易條件、特殊要求等）</label>
              <textarea className="oms-input" rows={3} value={remark} onChange={e => setRemark(e.target.value)} placeholder="可輸入交易條件、付款方式、交貨要求等資訊..." />
            </div>
          </div>

          {/* Step 2: Order items with shipped qty */}
          {orderItems.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-600 mb-2">出貨明細（可修改實際出貨數量）</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">品名</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">物料編號</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">訂單數量</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">已出數量</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">剩餘可出</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">本次出貨</th>
                  </tr></thead>
                  <tbody>
                    {orderItems.map(item => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-700 font-medium">{item.product_name}</td>
                        <td className="px-3 py-2 font-mono text-blue-600">{item.product_sku}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{item.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{item.arrived_qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-700 font-semibold">{item.remaining_qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" className={`${inp} w-24 text-right`}
                            min={0} max={item.remaining_qty}
                            value={shippedQtys[item.id] ?? item.remaining_qty}
                            onChange={e => setShippedQtys(p => ({ ...p, [item.id]: Number(e.target.value) }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} className="btn-primary" disabled={!selectedOrderId || orderItems.length === 0}>建立出貨單</button>
            <button onClick={() => { setCreating(false); resetForm() }} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
        </div>
      )}

      {editing && canWrite && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] px-4 py-6 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto oms-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">編輯出貨單 {editing.dn_number}</h2>
              <button onClick={() => setEditing(null)} className="btn-ghost border border-slate-200">返回列表</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5">出貨日期</label>
                <input type="date" className="oms-input" value={editForm.delivery_date} onChange={e => setEditForm(p => ({ ...p, delivery_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5">備註</label>
                <input className="oms-input" value={editForm.remark} onChange={e => setEditForm(p => ({ ...p, remark: e.target.value }))} />
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">品名</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">物料編號</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase">數量</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">備註</th>
                </tr></thead>
                <tbody>
                  {editForm.items.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-700">{item.item_name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-600">{item.material_code}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" className="oms-input text-xs py-1 w-20 text-right" min={0}
                          value={item.qty}
                          onChange={e => setEditForm(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, qty: Number(e.target.value) } : it) }))} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="oms-input text-xs py-1" value={item.remark || ''}
                          onChange={e => setEditForm(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, remark: e.target.value } : it) }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEditDN} className="btn-primary">儲存修改</button>
              <button onClick={() => setEditing(null)} className="btn-ghost border border-slate-200">取消</button>
            </div>
        </div>
        </div>
      )}

      {
        <>
          <div className="mb-4">
            <input className="oms-input w-72" placeholder="搜尋訂單號、客戶、出貨單號..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-8" />
                  {['訂單號','客戶名稱','訂單總量','已出貨','剩餘','出貨比率','進度'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(order => {
                  const isOrderOpen = expandedOrders.has(order.customer_order_id)
                  const progress = ORDER_PROGRESS_MAP[order.progress_status] || ORDER_PROGRESS_MAP.pending
                  return (
                    <>
                      <tr key={order.customer_order_id}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${isOrderOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        onClick={() => toggleOrderExpand(order.customer_order_id)}>
                        <td className="pl-3 py-2.5">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOrderOpen ? 'rotate-90' : ''}`}>
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-blue-600 whitespace-nowrap">{order.order_po_number || '—'}</td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap max-w-[240px] truncate" title={order.customer_name}>{order.customer_name || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{Number(order.order_qty).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">{Number(order.shipped_qty).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-amber-700 font-medium">{Number(order.remaining_qty).toLocaleString()}</td>
                        <td className="px-3 py-2.5 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, order.shipping_ratio || 0))}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-12 text-right">{(order.shipping_ratio || 0).toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={progress.badge}>{progress.label}</span>
                            {canWrite && (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  setCreating(true)
                                  setSelectedCustomerId(order.customer_id ? String(order.customer_id) : '')
                                  if (order.customer_id) onSelectCustomer(String(order.customer_id))
                                  setTimeout(() => {
                                    setSelectedOrderId(String(order.customer_order_id))
                                    onSelectOrder(String(order.customer_order_id))
                                  }, 0)
                                }}
                                className="btn-ghost text-blue-600"
                              >
                                + 建立批次
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOrderOpen && (
                        <tr key={`${order.customer_order_id}-items`} className="border-b border-slate-100">
                          <td colSpan={8} className="px-0 py-0">
                            <div className="expand-row-wrap">
                              {(order.notes || []).length === 0 ? (
                                <div className="px-5 py-6 text-xs text-slate-400">此訂單尚無出貨批次</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs" style={{minWidth:900}}>
                                    <thead><tr className="border-b border-slate-100">
                                      <th className="w-8" />
                                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">出貨單號</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">出貨日期</th>
                                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">批次數量</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">備註</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">狀態</th>
                                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">操作</th>
                                    </tr></thead>
                                    <tbody>
                                      {(order.notes || []).map((dn) => {
                                        const isDnOpen = expandedDns.has(dn.id)
                                        const items = loadedItems[dn.id] || []
                                        return (
                                          <>
                                            <tr key={dn.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => toggleDnExpand(dn.id)}>
                                              <td className="pl-3 py-2">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isDnOpen ? 'rotate-90' : ''}`}>
                                                  <polyline points="9 18 15 12 9 6" />
                                                </svg>
                                              </td>
                                              <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">{dn.dn_number}</td>
                                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dn.delivery_date ? String(dn.delivery_date).slice(0, 10) : '—'}</td>
                                              <td className="px-3 py-2 text-right text-slate-700 font-medium">{Number(dn.batch_qty || 0).toLocaleString()}</td>
                                              <td className="px-3 py-2 text-slate-400 max-w-[220px] truncate" title={dn.remark || ''}>{dn.remark || '—'}</td>
                                              <td className="px-3 py-2 whitespace-nowrap"><span className={STATUS_MAP[dn.status]?.badge}>{STATUS_MAP[dn.status]?.label || dn.status}</span></td>
                                              <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                <div className="flex gap-1 items-center">
                                                  <StatusFlow compact steps={DN_STEPS} current={dn.status}
                                                    actions={actionLoading === dn.id ? [] : getDNActions(dn.status)}
                                                    onAction={(toStatus) => changeStatus(dn.id, toStatus)} />
                                                  {actionLoading === dn.id && <span className="text-xs text-slate-400 px-1">處理中...</span>}
                                                  <button onClick={e => { e.stopPropagation(); printDN(dn) }} className="btn-ghost" title="列印">🖨 列印</button>
                                                  {canWrite && dn.status === 'draft' && <button onClick={e => { e.stopPropagation(); startEditDN(dn) }} className="btn-ghost text-blue-600">✏ 編輯</button>}
                                                  {canDel && <button onClick={e => { e.stopPropagation(); del(dn.id) }} className="btn-danger">刪除</button>}
                                                </div>
                                              </td>
                                            </tr>
                                            {isDnOpen && (
                                              <tr key={`${dn.id}-items`} className="border-b border-slate-100">
                                                <td colSpan={7} className="px-0 py-0 bg-slate-50/50">
                                                  {items.length === 0 ? (
                                                    <div className="expand-row-loading">
                                                      <div className="w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin"/>載入中...
                                                    </div>
                                                  ) : (
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full text-xs" style={{minWidth:600}}>
                                                        <thead><tr className="border-b border-slate-100">
                                                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">品名</th>
                                                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">物料編號</th>
                                                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">規格</th>
                                                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">單位</th>
                                                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">數量</th>
                                                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">備註</th>
                                                        </tr></thead>
                                                        <tbody>
                                                          {items.map((item, i) => (
                                                            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                              <td className="px-3 py-2 text-slate-700">{item.item_name}</td>
                                                              <td className="px-3 py-2 font-mono text-xs text-blue-600 whitespace-nowrap">{item.material_code}</td>
                                                              <td className="px-3 py-2 text-slate-400">{(item as any).spec || '—'}</td>
                                                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.unit || 'PCS'}</td>
                                                              <td className="px-3 py-2 text-right font-medium">{Number(item.qty).toLocaleString()}</td>
                                                              <td className="px-3 py-2 text-slate-400">{item.remark}</td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  )}
                                                </td>
                                              </tr>
                                            )}
                                          </>
                                        )
                                      })}
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
                {paged.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">尚無訂單出貨資料</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
      </>
      }
    </div>
  )
}
