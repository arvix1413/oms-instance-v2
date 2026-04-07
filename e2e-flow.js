/**
 * E2E Flow Test: 水杯生產完整流程
 * BOM → 客戶訂單 → 採購單 → 收貨 → 生產單 → 出貨單
 */
const BASE = 'http://43.133.56.234/api'
let token = ''

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`)
  return data
}

function log(step, msg, data) {
  const id = data?.id || data?.prod_number || data?.po_number || data?.dn_number || ''
  console.log(`✅ [${step}] ${msg}${id ? ` (ID: ${id})` : ''}`)
}

async function main() {
  console.log('\n🚀 開始完整業務流程 E2E 測試\n')

  // ── 1. Login ──────────────────────────────────────────────────────────────
  const auth = await api('POST', '/auth/login', { email: 'admin@oms.com', password: 'admin123' })
  token = auth.token
  log(1, 'Login', auth.user)

  // ── 2. 確認基礎資料存在 ────────────────────────────────────────────────────
  const suppliers = await api('GET', '/suppliers')
  const supplier = suppliers[0]
  if (!supplier) throw new Error('No suppliers found')
  log(2, `供應商: ${supplier.name}`, supplier)

  const materials = await api('GET', '/materials')
  const material = materials[0]
  if (!material) throw new Error('No materials found')
  log(2, `料號: ${material.material_code} - ${material.material_name}`, material)

  // ── 3. 建立 BOM（水杯 = 杯身 + 蓋子）────────────────────────────────────
  const bomSku = `E2E-CUP-${Date.now()}`
  const bom = await api('POST', '/bom', {
    product_sku: bomSku,
    product_name: 'E2E 測試水杯',
    version: 'V1',
    items: [
      {
        material_code: material.material_code,
        material_name: material.material_name,
        spec: material.spec || '',
        unit: material.unit || 'PCS',
        quantity: 2,
        supplier_name: supplier.name,
        supplier_price: material.supplier_price || 100,
        company_price: material.company_price || 150,
        currency: 'VND',
        color: '', lt: '', moq: '', remark: 'E2E test'
      }
    ]
  })
  log(3, `建立 BOM: ${bomSku}`, bom)

  // ── 4. 建立客戶（如果沒有）────────────────────────────────────────────────
  const customers = await api('GET', '/customers')
  let customer = customers.find(c => c.customer_code === 'E2E-CUST')
  if (!customer) {
    customer = await api('POST', '/customers', {
      customer_code: 'E2E-CUST',
      customer_name: 'E2E 測試客戶',
      status: 'active'
    })
    log(4, '建立客戶', customer)
  } else {
    log(4, `使用現有客戶: ${customer.customer_name}`, customer)
  }

  // ── 5. 建立客戶訂單（客戶要 10 個水杯）────────────────────────────────────
  const order = await api('POST', '/customer-orders', {
    po_number: `PO-E2E-${Date.now()}`,
    customer_id: customer.id,
    customer_name: customer.customer_name,    po_date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    remark: 'E2E 測試訂單',
    items: [{
      item_name: 'E2E 測試水杯',
      material_code: bomSku,
      spec: '',
      unit: 'PCS',
      qty: 10,
      unit_price: 500000,
      rta_date: null,
      arrived_qty: 0,
      arrived_date: null,
      status: 'pending'
    }]
  })
  log(5, `建立客戶訂單: ${order.po_number || ''}`, order)

  // ── 6. 建立採購單（向供應商採購材料）────────────────────────────────────
  const po = await api('POST', '/po', {
    supplier_id: String(supplier.id),
    supplier_name: supplier.name,
    currency: supplier.currency || 'VND',
    remark: 'E2E 採購測試',
    items: [{
      material_code: material.material_code,
      material_name: material.material_name,
      spec: material.spec || '',
      unit: material.unit || 'PCS',
      quantity: 20,
      unit_price: material.supplier_price || 100,
      currency: 'VND',
      po_ref: order.po_number || '',
      thickness: null,
      remark: 'E2E test'
    }]
  })
  log(6, `建立採購單: ${po.po_number}`, po)

  // ── 7. 核准採購單 ──────────────────────────────────────────────────────────
  await api('PATCH', `/po/${po.id}/approve`)
  log(7, '採購單已核准', { id: po.id })

  // ── 8. 發送採購單 ──────────────────────────────────────────────────────────
  await api('PATCH', `/po/${po.id}/status`, { status: 'sent' })
  log(8, '採購單已發送', { id: po.id })

  // ── 9. 確認收貨（更新庫存）────────────────────────────────────────────────
  const stockBefore = await api('GET', `/materials?supplier_id=${supplier.id}`)
  const matBefore = stockBefore.find(m => m.material_code === material.material_code)
  const stockBeforeQty = matBefore?.current_stock || 0

  await api('PATCH', `/po/${po.id}/receive`)
  log(9, `確認收貨，庫存更新`, { id: po.id })

  const stockAfter = await api('GET', `/materials?supplier_id=${supplier.id}`)
  const matAfter = stockAfter.find(m => m.material_code === material.material_code)
  const stockAfterQty = matAfter?.current_stock || 0
  console.log(`   📦 庫存變化: ${stockBeforeQty} → ${stockAfterQty} (+${stockAfterQty - stockBeforeQty})`)

  // ── 10. 庫存檢查（為生產單準備）──────────────────────────────────────────
  const stockCheck = await api('POST', '/production/check-stock', {
    bom_id: bom.id,
    planned_qty: 5
  })
  console.log(`   🔍 庫存檢查: ${stockCheck.has_shortage ? '⚠ 缺料' : '✅ 材料充足'} (狀態: ${stockCheck.status})`)
  stockCheck.items.forEach(item => {
    const status = item.sufficient ? '✅' : '❌'
    console.log(`      ${status} ${item.material_code}: 需要 ${item.planned_qty}, 庫存 ${item.current_stock}, 缺 ${item.shortage}`)
  })

  // ── 11. 建立生產單 ────────────────────────────────────────────────────────
  const prod = await api('POST', '/production', {
    customer_order_id: order.id,
    bom_id: bom.id,
    product_sku: bomSku,
    product_name: 'E2E 測試水杯',
    planned_qty: 5,
    planned_start: new Date().toISOString().slice(0, 10),
    planned_end: new Date(Date.now() + 7*24*3600*1000).toISOString().slice(0, 10),
    remark: 'E2E 生產測試',
    materials: stockCheck.items.map(i => ({
      material_code: i.material_code,
      material_name: i.material_name,
      spec: i.spec || '',
      unit: i.unit || 'PCS',
      planned_qty: i.planned_qty,
      issued_qty: 0,
      batch_no: '',
      remark: ''
    })),
    initial_status: stockCheck.status
  })
  log(11, `建立生產單: ${prod.prod_number}`, prod)

  // ── 12. 確認生產單 → 材料齊 → 開始生產 → 完工 ────────────────────────────
  await api('PATCH', `/production/${prod.id}/status`, { status: 'confirmed' })
  log(12, '生產單已確認', { id: prod.id })

  await api('PATCH', `/production/${prod.id}/status`, { status: 'ready' })
  log(12, '材料已齊備', { id: prod.id })

  await api('PATCH', `/production/${prod.id}/status`, { status: 'in_progress' })
  log(12, '開始生產', { id: prod.id })

  await api('PATCH', `/production/${prod.id}/status`, { status: 'completed', produced_qty: 5 })
  log(12, '生產完工（庫存已扣減）', { id: prod.id })

  // 確認庫存扣減
  const stockFinal = await api('GET', `/materials?supplier_id=${supplier.id}`)
  const matFinal = stockFinal.find(m => m.material_code === material.material_code)
  console.log(`   📦 生產後庫存: ${matFinal?.current_stock || 0}`)

  // ── 13. 建立出貨單 ────────────────────────────────────────────────────────
  const dn = await api('POST', '/delivery-notes', {
    customer_id: customer.id,
    customer_name: customer.customer_name,
    customer_order_id: order.id,
    delivery_date: new Date().toISOString().slice(0, 10),
    remark: 'E2E 出貨測試',
    items: [{
      item_name: 'E2E 測試水杯',
      material_code: bomSku,
      spec: '',
      unit: 'PCS',
      qty: 5,
      po_ref: order.po_number || '',
      thickness: null,
      remark: ''
    }]
  })
  log(13, `建立出貨單: ${dn.dn_number}`, dn)

  // ── 14. 確認出貨 → 已出貨 ────────────────────────────────────────────────
  await api('PATCH', `/delivery-notes/${dn.id}/status`, { status: 'confirmed' })
  log(14, '出貨單已確認', { id: dn.id })

  await api('PATCH', `/delivery-notes/${dn.id}/status`, { status: 'shipped' })
  log(14, '已出貨', { id: dn.id })

  // ── 15. 查看庫存流水 ──────────────────────────────────────────────────────
  const ledger = await api('GET', `/stock-ledger?material_code=${material.material_code}&limit=10`)
  console.log(`\n📋 庫存流水記錄 (${material.material_code}):`)
  ledger.slice(0, 5).forEach(l => {
    const sign = l.qty_change > 0 ? '+' : ''
    console.log(`   ${l.transaction_type.padEnd(10)} ${sign}${l.qty_change} → 庫存: ${l.qty_after} | ${l.remark}`)
  })

  // ── 16. 清理測試資料 ──────────────────────────────────────────────────────
  console.log('\n🧹 清理測試資料...')
  try { await api('DELETE', `/delivery-notes/${dn.id}`) } catch(e) { console.log('   ⚠ 出貨單:', e.message) }
  try { await api('DELETE', `/production/${prod.id}`) } catch(e) { console.log('   ⚠ 生產單（已完成，保留）') }
  try { await api('DELETE', `/po/${po.id}`) } catch(e) { console.log('   ⚠ 採購單:', e.message) }
  try { await api('DELETE', `/customer-orders/${order.id}`) } catch(e) { console.log('   ⚠ 客戶訂單:', e.message) }
  try { await api('DELETE', `/bom/${bom.id}`) } catch(e) { console.log('   ⚠ BOM:', e.message) }
  console.log('   ✅ 清理完成')

  console.log('\n🎉 完整業務流程 E2E 測試通過！\n')
  console.log('流程摘要:')
  console.log('  BOM 建立 → 客戶訂單 → 採購單 → 核准 → 發送 → 確認收貨（庫存+）')
  console.log('  → 生產單 → 確認 → 材料齊 → 開始生產 → 完工（庫存-）')
  console.log('  → 出貨單 → 確認 → 已出貨')
}

main().catch(e => {
  console.error('\n❌ 測試失敗:', e.message)
  process.exit(1)
})
