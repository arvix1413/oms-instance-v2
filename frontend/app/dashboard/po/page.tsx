'use client'
import { useDialog } from '@/components/Dialog'
import { useEffect, useState, useRef } from 'react'
import { apiFetch } from '@/lib/api'
import { usePagination, Pagination } from '@/lib/usePagination'
import { StatusFlow, PO_STEPS, getPOActions } from '@/components/StatusFlow'

type PoItem = { material_code:string; material_name:string; spec:string; unit:string; quantity:number; unit_price:number; total_price:number; currency:string; remark:string; po_ref:string; thickness:number|string; image_url?:string; bom_id?:number }
type Po = { id:number; po_number:string; supplier_name:string; status:string; total_amount:number; currency:string; remark:string; created_at:string; approved_at?:string; items?:PoItem[] }
type Supplier = { id: number; name: string; currency: string; supplier_code: string }
type BOM = { id: number; product_sku: string; product_name: string; spec: string; unit: string; supplier_price: number; company_price: number; currency: string; image_url?: string; material_name?: string; supplier_id?: number }

const STATUS_MAP: Record<string,{label:string;badge:string}> = {
  draft:     { label:'草稿',   badge:'badge-gray'   },
  approved:  { label:'已核准', badge:'badge-green'  },
  sent:      { label:'已發送', badge:'badge-blue'   },
  received:  { label:'已收貨', badge:'badge-purple' },
  cancelled: { label:'已取消', badge:'badge-red'    },
}

const emptyItem = (): PoItem => ({ material_code:'', material_name:'', spec:'', unit:'PCS', quantity:1, unit_price:0, total_price:0, currency:'VND', remark:'', po_ref:'', thickness:'' })

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// Searchable Select Component
function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder = '-- 選擇 --',
  renderOption,
  filterFn,
  disabled = false
}: { 
  options: any[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  renderOption: (opt: any) => string
  filterFn: (opt: any, search: string) => boolean
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Calculate dropdown position when opening
  const handleToggle = () => {
    if (!disabled && !isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const dropdownHeight = 280 // max-h-64 + padding + search box
      
      // Calculate position for fixed positioning
      const position: { top?: number; bottom?: number; left: number; width: number } = {
        left: rect.left,
        width: rect.width
      }
      
      // If not enough space below but more space above, open upward
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        position.bottom = window.innerHeight - rect.top + 4
      } else {
        position.top = rect.bottom + 4
      }
      
      setDropdownPosition(position)
    }
    setIsOpen(!isOpen)
  }

  const filtered = searchTerm ? options.filter(opt => filterFn(opt, searchTerm.toLowerCase())) : options
  const selected = options.find(opt => String(opt.id) === value)

  return (
    <>
      <div className="relative" ref={containerRef}>
        <div 
          className={`oms-input cursor-pointer flex items-center justify-between ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
          onClick={handleToggle}
        >
          <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
            {selected ? renderOption(selected) : placeholder}
          </span>
          <ChevronIcon open={isOpen} />
        </div>
      </div>
      
      {/* Render dropdown in a portal-like fixed position */}
      {isOpen && !disabled && (
        <div 
          className="fixed bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-hidden"
          style={{
            zIndex: 9999,
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
            left: dropdownPosition.left,
            width: dropdownPosition.width
          }}
        >
          <div className="p-2 border-b border-slate-100 bg-white sticky top-0">
            <input
              type="text"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="搜尋..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">無符合結果</div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt.id}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 ${String(opt.id) === value ? 'bg-blue-100 text-blue-700' : 'text-slate-700'}`}
                  onClick={() => {
                    onChange(String(opt.id))
                    setIsOpen(false)
                    setSearchTerm('')
                  }}
                >
                  {renderOption(opt)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}


export default function PoPage() {
  const { toast, confirm: confirmDialog } = useDialog()

  const [pos, setPos] = useState<Po[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [boms, setBoms] = useState<BOM[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loadedItems, setLoadedItems] = useState<Record<number, PoItem[]>>({})
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ supplier_id: '', supplier_name:'', currency:'VND', remark:'', items:[emptyItem()] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => apiFetch<Po[]>('/api/po').then(setPos).finally(() => setLoading(false))
  useEffect(() => {
    load()
    apiFetch<Supplier[]>('/api/suppliers').then(setSuppliers).catch(() => {})
    apiFetch<BOM[]>('/api/bom').then(setBoms).catch(() => {})
  }, [])

  const onSelectSupplier = async (supplierId: string) => {
    const sup = suppliers.find(s => String(s.id) === supplierId)
    setForm(p => ({ ...p, supplier_id: supplierId, supplier_name: sup?.name || '', currency: sup?.currency || 'VND', items: [emptyItem()] }))
  }

  // Get filtered BOMs based on selected supplier
  const getFilteredBoms = () => {
    if (!form.supplier_id) return boms
    return boms.filter(b => !b.supplier_id || String(b.supplier_id) === form.supplier_id)
  }

  const selectBOM = (i: number, bomId: string) => {
    const bom = getFilteredBoms().find(b => String(b.id) === bomId)
    if (!bom) return
    
    setForm(p => ({
      ...p,
      items: p.items.map((item, idx) => idx !== i ? item : {
        ...item,
        bom_id: Number(bomId),
        material_code: bom.product_sku,
        material_name: bom.product_name,
        spec: bom.spec || '',
        unit: bom.unit || 'PCS',
        unit_price: bom.supplier_price || 0,
        currency: bom.currency || form.currency,
        image_url: bom.image_url || '',
        total_price: (item.quantity || 0) * (bom.supplier_price || 0),
      })
    }))
  }

  const toggleExpand = async (id: number) => {
    const next = new Set(expanded)
    if (next.has(id)) {
      next.delete(id)
      setExpanded(next)
    } else {
      next.add(id)
      setExpanded(next)
      if (!loadedItems[id]) {
        const data = await apiFetch<Po>(`/api/po/${id}`)
        setLoadedItems(p => ({ ...p, [id]: data.items || [] }))
      }
    }
  }

  const approve = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await apiFetch(`/api/po/${id}/approve`, { method: 'PATCH' })
    toast('已核准')
    setLoadedItems(p => { const n = { ...p }; delete n[id]; return n })
    load()
  }

  const confirmReceipt = async (po: Po, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!await confirmDialog('確認收貨？', '確認後將更新材料庫存，此操作不可撤銷', '確認收貨')) return
    try {
      await apiFetch(`/api/po/${po.id}/receive`, { method: 'PATCH' })
      toast('收貨完成，庫存已更新')
      setLoadedItems(p => { const n = { ...p }; delete n[po.id]; return n })
      load()
    } catch (e: any) { toast('收貨失敗：' + e.message, 'error') }
  }

  const changeStatus = async (id: number, status: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const labels: Record<string, string> = { sent: '確認發送此採購單？' }
    const btnLabels: Record<string, string> = { sent: '確認發送' }
    if (!await confirmDialog(labels[status] || '確認變更狀態？', '', btnLabels[status] || '確認')) return
    await apiFetch(`/api/po/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    toast('狀態已更新')
      await load()
    // refresh items if expanded
    if (expanded.has(id)) {
      const data = await apiFetch<Po>(`/api/po/${id}`)
      setLoadedItems(p => ({ ...p, [id]: data.items || [] }))
    }
  }

  const del = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!await confirmDialog('確定刪除此採購單？')) return
    await apiFetch(`/api/po/${id}`, { method: 'DELETE' })
      await load()
  }

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, emptyItem()] }))
  const removeItem = (i: number) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }))
  const updateItem = (i: number, field: keyof PoItem, val: any) => {
    setForm(p => ({
      ...p,
      items: p.items.map((item, idx) => {
        if (idx !== i) return item
        const u = { ...item, [field]: val }
        if (field === 'quantity' || field === 'unit_price') u.total_price = u.quantity * u.unit_price
        return u
      })
    }))
  }

  const save = async () => {
    try {
      await apiFetch('/api/po', { method: 'POST', body: JSON.stringify(form) })
      toast('採購單建立成功'); setCreating(false)
      setForm({ supplier_id: '', supplier_name:'', currency:'VND', remark:'', items:[emptyItem()] })
      await load()
    } catch (e: any) { toast('錯誤：' + e.message) }
  }

  const printPo = async (id: number, poNumber: string, supplierName: string) => {
    const data = await apiFetch<Po>(`/api/po/${id}`)
    const items = data.items || []
    const html = `<html><head><title>採購單 ${poNumber}</title>
    <style>body{font-family:sans-serif;font-size:12px;padding:20px}h2{margin-bottom:4px}p{color:#666;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.num{text-align:right}tfoot td{font-weight:bold;background:#f9f9f9}</style>
    </head><body>
    <h2>採購單 ${poNumber}</h2>
    <p>供應商：${supplierName} | FAN YONG CO., LTD</p>
    <table><thead><tr><th>PO訂單編號</th><th>物料編號</th><th>材料名稱</th><th>規格</th><th>重量</th><th>單位</th><th class="num">數量</th><th class="num">單價</th><th class="num">小計</th><th>幣別</th><th>備註</th></tr></thead>
    <tbody>${items.map(i=>`<tr><td>${i.po_ref||''}</td><td>${i.material_code}</td><td>${i.material_name}</td><td>${i.spec}</td><td class="num">${i.thickness??''}</td><td>${i.unit}</td><td class="num">${i.quantity.toLocaleString()}</td><td class="num">${i.unit_price.toLocaleString()}</td><td class="num">${i.total_price.toLocaleString()}</td><td>${i.currency}</td><td>${i.remark}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="8" style="text-align:right">合計</td><td class="num">${items.reduce((s,i)=>s+i.total_price,0).toLocaleString()}</td><td>${items[0]?.currency||''}</td><td></td></tr></tfoot>
    </table></body></html>`
    const w = window.open('','_blank'); w?.document.write(html); w?.document.close(); w?.print()
  }

  const formTotal = form.items.reduce((s, i) => s + (i.total_price || 0), 0)
  const filteredPos = pos.filter(p => !search || p.po_number.toLowerCase().includes(search.toLowerCase()) || p.supplier_name.toLowerCase().includes(search.toLowerCase()))
  const { page, setPage, totalPages, paged, total } = usePagination(filteredPos, 20)
  const inp = 'oms-input text-xs py-1.5'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">採購單管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">點擊採購單列展開查看料號明細</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">+ 建立採購單</button>
      </div>

      {creating && (
        <div className="oms-card p-6 mb-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">建立採購單</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">供應商 *</label>
              <select className={inp} value={form.supplier_id}
                onChange={e => onSelectSupplier(e.target.value)}>
                <option value="">-- 選擇供應商 --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}{s.supplier_code ? ` (${s.supplier_code})` : ''}</option>
                ))}
              </select>            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">幣別</label>
              <select className={inp} value={form.currency} onChange={e=>setForm(p=>({...p,currency:e.target.value}))}>
                <option>VND</option><option>TWD</option><option>CNY</option><option>USD</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">備註（交易條件、特殊要求等）</label>
              <textarea className={inp} rows={3} value={form.remark} onChange={e=>setForm(p=>({...p,remark:e.target.value}))} placeholder="可輸入交易條件、付款方式、交貨要求等資訊..." />
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">採購明細</span>
            <button onClick={addItem} className="btn-ghost text-blue-600">+ 新增料號</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200">
                {['圖片','PO訂單編號','物料編號（BOM）','材料名稱','規格','重量','單位','數量','單價','小計','幣別','備註',''].map(h=>(
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {form.items.map((item, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-1.5">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded border border-slate-200" onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
                      ) : (
                        <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">無</div>
                      )}
                    </td>
                    <td className="p-1"><input className={inp} style={{width:100}} value={item.po_ref} placeholder="PO編號" onChange={e=>updateItem(i,'po_ref',e.target.value)} /></td>
                    <td className="p-1 min-w-[220px]">
                      <SearchableSelect
                        options={getFilteredBoms()}
                        value={item.bom_id ? String(item.bom_id) : ''}
                        onChange={val => selectBOM(i, val)}
                        placeholder="-- 選擇 BOM --"
                        disabled={!form.supplier_id}
                        renderOption={b => `${b.product_sku} — ${b.product_name}${b.spec ? ` (${b.spec})` : ''}`}
                        filterFn={(b, search) => 
                          b.product_sku.toLowerCase().includes(search) ||
                          b.product_name.toLowerCase().includes(search) ||
                          (b.spec||'').toLowerCase().includes(search) ||
                          (b.material_name||'').toLowerCase().includes(search)
                        }
                      />
                    </td>
                    <td className="p-1"><input className={inp} value={item.material_name} onChange={e=>updateItem(i,'material_name',e.target.value)} readOnly style={{backgroundColor:'#f8fafc'}} /></td>
                    <td className="p-1"><input className={inp} value={item.spec} onChange={e=>updateItem(i,'spec',e.target.value)} readOnly style={{width:80, backgroundColor:'#f8fafc'}} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:60}} value={item.thickness||""} placeholder="重量" onChange={e=>updateItem(i,'thickness',e.target.value)} /></td>
                    <td className="p-1"><input className={inp} value={item.unit} onChange={e=>updateItem(i,'unit',e.target.value)} readOnly style={{width:45, backgroundColor:'#f8fafc'}} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:65}} value={item.quantity || ""} onChange={e=>updateItem(i,'quantity',Number(e.target.value))} /></td>
                    <td className="p-1"><input type="number" className={inp} style={{width:85}} value={item.unit_price || ""} onChange={e=>updateItem(i,'unit_price',Number(e.target.value))} /></td>
                    <td className="p-1 px-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.total_price.toLocaleString()}</td>
                    <td className="p-1">
                      <select className={inp} style={{width:55}} value={item.currency} onChange={e=>updateItem(i,'currency',e.target.value)}>
                        <option>VND</option><option>TWD</option><option>CNY</option><option>USD</option>
                      </select>
                    </td>
                    <td className="p-1"><input className={inp} value={item.remark} onChange={e=>updateItem(i,'remark',e.target.value)} /></td>
                    <td className="p-1 text-center"><button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-600 transition-colors">✕</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={9} className="px-3 py-2 text-right text-[11px] text-slate-400 font-semibold uppercase">合計</td>
                  <td className="px-2 py-2 text-right text-slate-600 font-bold">{formTotal.toLocaleString()}</td>
                  <td colSpan={3} className="px-2 py-2 text-slate-400 text-xs">{form.currency}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="btn-primary">建立採購單</button>
            <button onClick={() => setCreating(false)} className="btn-ghost border border-slate-200">取消</button>
          </div>
        </div>
      )}

      {!creating && (
        <>
          <div className="mb-4"><input className="oms-input w-64" placeholder="搜尋採購單號或供應商..." value={search} onChange={e=>setSearch(e.target.value)} /></div>

          <div className="oms-card overflow-hidden">
        {loading ? <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div> : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-8" />
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">採購單號</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">供應商</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">金額</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">幣別</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">狀態</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">建立時間</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(p => {
                  const isOpen = expanded.has(p.id)
                  const items = loadedItems[p.id] || []
                  const sm = STATUS_MAP[p.status] || { label: p.status, badge: 'badge-gray' }
                  return (
                    <>
                      <tr key={p.id}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        onClick={() => toggleExpand(p.id)}>
                        <td className="pl-4 py-3">
                          <span className="text-slate-500"><ChevronIcon open={isOpen} /></span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">{p.po_number}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium max-w-[200px] truncate" title={p.supplier_name}>{p.supplier_name}</td>
                        <td className="px-4 py-3 text-right text-slate-600 font-medium">{p.total_amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{p.currency}</td>
                        <td className="px-4 py-3"><span className={sm.badge}>{sm.label}</span></td>
                        <td className="px-4 py-3 text-slate-300 text-xs">{p.created_at?.slice(0,10)}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <StatusFlow compact steps={PO_STEPS} current={p.status}
                              actions={getPOActions(p.status)}
                              onAction={async (toStatus) => {
                                if (toStatus === 'approved') await approve(p.id, { stopPropagation: ()=>{} } as any)
                                else if (toStatus === 'received') await confirmReceipt(p, { stopPropagation: ()=>{} } as any)
                                else await changeStatus(p.id, toStatus, { stopPropagation: ()=>{} } as any)
                              }} />
                            <button onClick={e => { e.stopPropagation(); printPo(p.id, p.po_number, p.supplier_name) }} className="btn-ghost ml-1">🖨</button>
                            <button onClick={e => del(p.id, e)} className="btn-danger">刪除</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${p.id}-items`} className="border-b border-slate-100">
                          <td colSpan={8} className="px-0 py-0">
                            <div className="bg-slate-50/50 border-t border-slate-100">
                              {items.length === 0 ? (
                                <div className="px-8 py-4 text-xs text-slate-400">載入中...</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs" style={{minWidth:700}}>
                                    <thead>
                                      <tr className="border-b border-slate-100">
                                        {['PO訂單編號','料號','材料名稱','規格','厚度','單位','數量','單價','小計','幣別','備註'].map(h=>(
                                          <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((item, i) => (
                                        <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.po_ref}</td>
                                          <td className="px-3 py-2 font-mono text-blue-600 whitespace-nowrap">{item.material_code}</td>
                                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[160px] truncate" title={item.material_name}>{item.material_name}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap max-w-[120px] truncate" title={item.spec}>{item.spec}</td>
                                          <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{item.thickness ?? '—'}</td>
                                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.unit}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 font-medium whitespace-nowrap">{item.quantity.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{item.unit_price.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-right text-slate-800 font-semibold whitespace-nowrap">{item.total_price.toLocaleString()}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.currency}</td>
                                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{item.remark}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-slate-200">
                                        <td colSpan={8} className="px-3 py-2 text-right text-[10px] text-slate-300 font-semibold uppercase">合計</td>
                                        <td className="px-3 py-2 text-right text-slate-600 font-bold">{items.reduce((s,i)=>s+i.total_price,0).toLocaleString()}</td>
                                        <td colSpan={2} className="px-3 py-2 text-slate-400 text-xs">{items[0]?.currency}</td>
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
                {paged.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">尚無採購單</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} total={total} />
          </>
        )}
      </div>
      </>
      )}
    </div>
  )
}
