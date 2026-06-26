import { chromium } from 'playwright'
import fs from 'fs'

const WEB = process.env.PW_WEB || 'http://43.160.199.226'
const API = process.env.PW_API || WEB
const TAG = `PW${Date.now().toString().slice(-8)}`
const OUT_DIR = `/tmp/oms-ui-crud-${TAG}`
const REPORT = `${OUT_DIR}/report.json`
fs.mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function api(method, token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : undefined,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data }
}

async function uiLogin(page) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', 'admin@oms.com')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("登入")')
  await page.waitForURL('**/dashboard**', { timeout: 20000 })
}

async function confirmDialog(page) {
  const btn = page.locator('div.fixed.inset-0.z-\\[9998\\] button.bg-red-500').last()
  await btn.waitFor({ state: 'visible', timeout: 10000 })
  await btn.click()
}

async function main() {
  const report = { tag: TAG, base: WEB, created: {}, checks: [], screenshots: [], errors: [] }

  const login = await api('POST', null, '/api/auth/login', { email: 'admin@oms.com', password: 'admin123' })
  if (!login.ok) throw new Error(`API login failed: ${login.status}`)
  const token = login.data.token

  // setup data
  const supplierCode = `${TAG}-SUP`
  const supplierName = `${TAG}-SUPPLIER`
  const customerCode = `${TAG}-CUS`
  const customerName = `${TAG}-CUSTOMER`
  const materialCode = `${TAG}-MAT`
  const bomSku = `${TAG}-SKU`
  const orderNo = `${TAG}-CO`

  const s = await api('POST', token, '/api/suppliers', { name: supplierName, supplier_code: supplierCode, currency: 'VND', status: 'active' })
  if (!s.ok) throw new Error(`create supplier failed: ${JSON.stringify(s.data)}`)
  const supplierId = Number(s.data.id)

  const c = await api('POST', token, '/api/customers', { customer_code: customerCode, customer_name: customerName, status: 'active' })
  if (!c.ok) throw new Error(`create customer failed: ${JSON.stringify(c.data)}`)
  const customerId = Number(c.data.id)

  const m = await api('POST', token, '/api/materials', {
    material_code: materialCode, material_name: `${TAG}-MATNAME`, unit: 'PCS', currency: 'VND', supplier_id: supplierId,
  })
  if (!m.ok) throw new Error(`create material failed: ${JSON.stringify(m.data)}`)

  const b = await api('POST', token, '/api/bom', {
    product_sku: bomSku, product_name: `${TAG}-BOM`, unit: 'PCS', supplier_id: supplierId,
    supplier_price: 88, company_price: 99, currency: 'VND', items: [],
  })
  if (!b.ok) throw new Error(`create bom failed: ${JSON.stringify(b.data)}`)
  const bomId = Number(b.data.id)

  const co = await api('POST', token, '/api/customer-orders', {
    po_number: orderNo, customer_id: customerId, customer_name: customerName, currency: 'VND',
    items: [{ bom_id: bomId, qty: 6, unit_price: 120 }],
  })
  if (!co.ok) throw new Error(`create customer-order failed: ${JSON.stringify(co.data)}`)
  report.created.customer_order_id = Number(co.data.id)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 980 } })
  await uiLogin(page)

  // ===== PO CRUD (UI) =====
  await page.goto(`${WEB}/dashboard/po`, { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("+ 建立採購單")')
  const poModal = page.locator('div.fixed.inset-0.z-50').last()
  await poModal.waitFor({ state: 'visible', timeout: 10000 })
  await poModal.locator('label:has-text("供應商")').locator('..').locator('select').selectOption(String(supplierId))
  const bomInput = poModal.locator('input[placeholder="-- 選擇 BOM --"]').first()
  await bomInput.click()
  await bomInput.fill(bomSku)
  await page.locator('div[style*="z-index: 9999"] div', { hasText: bomSku }).first().click()
  const row = poModal.locator('table tbody tr').first()
  await row.locator('input[type="number"]').first().fill('2')
  await poModal.locator('button:has-text("建立採購單")').click()
  await poModal.waitFor({ state: 'hidden', timeout: 10000 })

  await page.fill('input[placeholder*="搜尋採購單號或供應商"]', supplierName)
  await sleep(1200)
  const poRow = page.locator('tr', { hasText: supplierName }).first()
  await poRow.waitFor({ state: 'visible', timeout: 20000 })
  const poNo = (await poRow.locator('td.font-mono').first().innerText()).trim()
  report.created.po_number = poNo
  await poRow.click()
  await sleep(500)
  report.checks.push({ page: 'po', step: 'read_expand', ok: await page.locator('tr', { hasText: bomSku }).count() > 0 })
  await poRow.locator('button:has-text("編輯")').click()
  const poEditModal = page.locator('div.fixed.inset-0.z-50').last()
  await poEditModal.waitFor({ state: 'visible', timeout: 10000 })
  await poEditModal.locator('textarea').first().fill(`${TAG}-PO-UPDATED`)
  await poEditModal.locator('button:has-text("儲存修改")').click()
  await poEditModal.waitFor({ state: 'hidden', timeout: 10000 })

  await page.fill('input[placeholder*="搜尋採購單號或供應商"]', poNo)
  await sleep(800)
  const poRow2 = page.locator('tr', { hasText: poNo }).first()
  await poRow2.locator('button:has-text("刪除")').click()
  await confirmDialog(page)
  await sleep(1200)

  await page.screenshot({ path: `${OUT_DIR}/po.png`, fullPage: true })
  report.screenshots.push(`${OUT_DIR}/po.png`)

  // ===== Delivery Notes CRUD (UI, 3 layers) =====
  await page.goto(`${WEB}/dashboard/delivery-notes`, { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("+ 新增出貨單")')
  const dnModal = page.locator('div.fixed.inset-0.z-50').last()
  await dnModal.waitFor({ state: 'visible', timeout: 10000 })
  await dnModal.locator('label:has-text("客戶")').locator('..').locator('select').selectOption(String(customerId))
  await dnModal.locator('label:has-text("待出貨訂單")').locator('..').locator('select').selectOption(String(report.created.customer_order_id))
  await dnModal.locator('textarea').first().fill(`${TAG}-DN-UI`)
  await dnModal.locator('button:has-text("建立出貨單")').click()
  await dnModal.waitFor({ state: 'hidden', timeout: 10000 })

  await page.fill('input[placeholder*="搜尋訂單號"]', orderNo)
  await sleep(1000)
  const orderRow = page.locator('tr', { hasText: orderNo }).first()
  await orderRow.click()
  await sleep(800)
  const dnBatchRow = page.locator('tr', { hasText: `${TAG}-DN-UI` })
    .filter({ has: page.locator('button:has-text(\"編輯\")') })
    .first()
  await dnBatchRow.waitFor({ state: 'visible', timeout: 15000 })
  const dnNo = (await dnBatchRow.locator('td.font-mono').first().innerText()).trim()
  report.created.dn_number = dnNo
  await dnBatchRow.click()
  await sleep(500)
  report.checks.push({ page: 'delivery-notes', step: 'read_expand', ok: await page.locator('tr', { hasText: bomSku }).count() > 0 })

  await dnBatchRow.locator('button:has-text("編輯")').first().click()
  const dnEditModal = page.locator('div.fixed.inset-0.z-50').last()
  await dnEditModal.waitFor({ state: 'visible', timeout: 10000 })
  await dnEditModal.locator('input').last().fill(`${TAG}-DN-UPDATED`)
  await dnEditModal.locator('button:has-text("儲存修改")').click()
  await dnEditModal.waitFor({ state: 'hidden', timeout: 10000 })

  await page.fill('input[placeholder*="搜尋訂單號"]', orderNo)
  await sleep(800)
  const orderRow2 = page.locator('tr', { hasText: orderNo }).first()
  await orderRow2.click()
  await sleep(600)
  let dnRowForDel = page.locator('tr', { hasText: dnNo })
    .filter({ has: page.locator('button:has-text(\"刪除\")') })
    .first()
  if (await dnRowForDel.count() === 0) {
    await orderRow2.click()
    await sleep(600)
    dnRowForDel = page.locator('tr', { hasText: dnNo })
      .filter({ has: page.locator('button:has-text(\"刪除\")') })
      .first()
  }
  await dnRowForDel.locator('button:has-text("刪除")').first().click()
  await confirmDialog(page)
  await sleep(1200)

  await page.screenshot({ path: `${OUT_DIR}/delivery-notes.png`, fullPage: true })
  report.screenshots.push(`${OUT_DIR}/delivery-notes.png`)

  // ===== Delivery Sheets CRUD (UI) =====
  await page.goto(`${WEB}/dashboard/delivery-sheets`, { waitUntil: 'domcontentloaded' })
  await page.click('button:has-text("+ 新增送貨單")')
  const dsModal = page.locator('div.fixed.inset-0.z-50').last()
  await dsModal.waitFor({ state: 'visible', timeout: 10000 })
  await dsModal.locator('label:has-text("客戶")').locator('..').locator('select').selectOption(String(customerId))
  await dsModal.locator('label:has-text("待出貨訂單")').locator('..').locator('select').selectOption(String(report.created.customer_order_id))
  await dsModal.locator('textarea').first().fill(`${TAG}-DS-UI`)
  await dsModal.locator('button:has-text("建立送貨單")').click()
  await dsModal.waitFor({ state: 'hidden', timeout: 10000 })

  await page.fill('input[placeholder*="搜尋送貨單號或客戶"]', customerName)
  await sleep(1000)
  const dsRow = page.locator('tr', { hasText: orderNo })
    .filter({ hasText: customerName })
    .filter({ has: page.locator('button:has-text(\"編輯\")') })
    .first()
  await dsRow.waitFor({ state: 'visible', timeout: 15000 })
  const dsNo = (await dsRow.locator('td.font-mono').first().innerText()).trim()
  report.created.ds_number = dsNo
  await dsRow.click()
  await sleep(500)
  report.checks.push({ page: 'delivery-sheets', step: 'read_expand', ok: await page.locator('tr', { hasText: bomSku }).count() > 0 })

  await dsRow.locator('button:has-text("編輯")').click()
  const dsEditModal = page.locator('div.fixed.inset-0.z-50').last()
  await dsEditModal.waitFor({ state: 'visible', timeout: 10000 })
  await dsEditModal.locator('input').last().fill(`${TAG}-DS-UPDATED`)
  await dsEditModal.locator('button:has-text("儲存修改")').click()
  await dsEditModal.waitFor({ state: 'hidden', timeout: 10000 })

  await page.fill('input[placeholder*="搜尋送貨單號或客戶"]', dsNo)
  await sleep(800)
  const dsRowDel = page.locator('tr', { hasText: dsNo }).first()
  await dsRowDel.locator('button:has-text("刪除")').click()
  await confirmDialog(page)
  await sleep(1200)

  await page.screenshot({ path: `${OUT_DIR}/delivery-sheets.png`, fullPage: true })
  report.screenshots.push(`${OUT_DIR}/delivery-sheets.png`)

  // cleanup seed data by API best-effort
  try { await api('DELETE', token, `/api/customer-orders/${report.created.customer_order_id}`) } catch {}
  try {
    const bomRow = await api('GET', token, '/api/bom')
    const hit = (bomRow.data || []).find((x) => x.product_sku === bomSku)
    if (hit?.id) await api('DELETE', token, `/api/bom/${hit.id}`)
  } catch {}
  try {
    const matRow = await api('GET', token, '/api/materials')
    const hit = (matRow.data || []).find((x) => x.material_code === materialCode)
    if (hit?.id) await api('DELETE', token, `/api/materials/${hit.id}`)
  } catch {}
  try { await api('DELETE', token, `/api/customers/${customerId}`) } catch {}
  try { await api('DELETE', token, `/api/suppliers/${supplierId}`) } catch {}

  await browser.close()
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8')
  console.log(`REPORT ${REPORT}`)
}

main().catch((e) => {
  const out = { error: String(e?.stack || e) }
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(REPORT, JSON.stringify(out, null, 2), 'utf8')
  } catch {}
  console.error(e)
  process.exit(1)
})
