import { test, expect, Page } from '@playwright/test'

const BASE = 'http://43.133.56.234'

async function login(p: Page) {
  await p.goto(`${BASE}/login`)
  await p.fill('input[type="email"]', 'admin@oms.com')
  await p.fill('input[type="password"]', 'admin123')
  await p.click('button[type="submit"]')
  await p.waitForURL(`${BASE}/dashboard**`, { timeout: 15000 })
}

async function waitMsg(p: Page) {
  await p.waitForSelector('text=/成功|已更新|已核准|已建立/', { timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(600)
}

// ── 1. Login ──────────────────────────────────────────────────────────────────
test('01. Login', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/dashboard/)
  console.log('✅ Login OK')
})

// ── 2. Suppliers ──────────────────────────────────────────────────────────────
test('02. Suppliers CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/suppliers`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: '新增供應商' }).click()
  await page.waitForTimeout(400)
  // Fill 供應商名稱 field (label-based)
  await page.locator('input.oms-input').nth(1).fill('E2E 測試供應商')
  await page.locator('button', { hasText: '儲存' }).click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'E2E 測試供應商' }).first()).toBeVisible({ timeout: 5000 })

  // Edit via 詳情 → 編輯
  await page.locator('button', { hasText: '詳情' }).first().click()
  await page.waitForTimeout(400)
  // 編輯 button inside the detail modal
  await page.locator('.rounded-2xl button', { hasText: '編輯' }).click()
  await page.waitForTimeout(400)
  const nameInput = page.locator('input.oms-input').nth(1)
  await nameInput.fill('E2E 供應商 Updated')
  await page.locator('button', { hasText: '儲存' }).first().click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'E2E 供應商 Updated' }).first()).toBeVisible({ timeout: 5000 })

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Suppliers CRUD OK')
})

// ── 3. Customers ──────────────────────────────────────────────────────────────
test('03. Customers CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/customers`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: /新增客戶|建立/ }).first().click()
  await page.waitForTimeout(400)
  const inputs = page.locator('input.oms-input')
  await inputs.nth(0).fill('E2E-CUST-001')
  await inputs.nth(1).fill('E2E 測試客戶')
  await page.locator('button', { hasText: '儲存' }).click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'E2E 測試客戶' }).first()).toBeVisible({ timeout: 5000 })

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Customers CRUD OK')
})

// ── 4. Materials ──────────────────────────────────────────────────────────────
test('04. Materials CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/materials`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: '新增料號' }).click()
  await page.waitForTimeout(400)
  const inputs = page.locator('input.oms-input')
  await inputs.nth(0).fill('E2E-MAT-001')
  await inputs.nth(1).fill('E2E 測試物料')
  await page.locator('button', { hasText: '儲存' }).first().click()
  await waitMsg(page)
  await page.waitForTimeout(500)
  await expect(page.locator('td', { hasText: 'E2E-MAT-001' }).first()).toBeVisible({ timeout: 8000 })

  // Edit
  await page.locator('button', { hasText: '詳情' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('.rounded-2xl button', { hasText: '編輯' }).click()
  await page.waitForTimeout(400)
  await page.locator('input.oms-input').nth(1).fill('E2E 物料 Updated')
  await page.locator('button', { hasText: '儲存' }).first().click()
  await waitMsg(page)

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Materials CRUD OK')
})

// ── 5. BOM ────────────────────────────────────────────────────────────────────
test('05. BOM CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/bom`)
  await page.waitForLoadState('networkidle')

  // Create - click the header button (not inside modal)
  await page.locator('div.flex button.btn-primary').click()
  await page.waitForTimeout(600)
  // Modal is open - [0]=product_sku, [1]=product_name, [2]=version
  await page.locator('input.oms-input').nth(0).fill('E2E-SKU-001')
  await page.locator('input.oms-input').nth(1).fill('E2E BOM 產品')
  // Click 建立 BOM inside modal footer
  await page.locator('.rounded-b-2xl button.btn-primary').click()
  await waitMsg(page)
  await page.waitForTimeout(500)
  await expect(page.locator('td', { hasText: 'E2E-SKU-001' }).first()).toBeVisible({ timeout: 8000 })

  // View detail
  await page.locator('button', { hasText: '詳情' }).first().click()
  await page.waitForTimeout(400)
  await expect(page.locator('h2', { hasText: 'E2E BOM 產品' })).toBeVisible()
  await page.locator('button').filter({ hasText: '✕' }).first().click()
  await page.waitForTimeout(300)

  // Edit
  await page.locator('button', { hasText: '編輯' }).first().click()
  await page.waitForTimeout(600)
  await page.locator('input.oms-input').nth(1).fill('E2E BOM Updated')
  await page.locator('.rounded-b-2xl button.btn-primary').click()
  await waitMsg(page)

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ BOM CRUD OK')
})

// ── 6. Purchase Orders ────────────────────────────────────────────────────────
test('06. Purchase Orders CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/po`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: '建立採購單' }).click()
  await page.waitForTimeout(400)
  // supplier name is first input in the form card
  await page.locator('.oms-card input.oms-input').first().fill('E2E 供應商')
  // fill item row: po_ref, material_code, material_name, spec, thickness, unit, qty, unit_price
  const row = page.locator('tbody tr').first()
  await row.locator('input').nth(1).fill('E2E-MAT')   // material_code
  await row.locator('input').nth(2).fill('E2E 物料')  // material_name
  await row.locator('input[type="number"]').nth(0).fill('100') // qty
  await row.locator('input[type="number"]').nth(1).fill('1000') // unit_price
  await page.locator('button', { hasText: '建立採購單' }).last().click()
  await waitMsg(page)

  // Expand row to see items
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(1000)

  // Approve
  await page.locator('button', { hasText: '核准' }).first().click()
  await waitMsg(page)

  // Print
  await page.locator('button', { hasText: '🖨' }).first().click()
  await page.waitForTimeout(500)

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Purchase Orders CRUD OK')
})

// ── 7. Customer Orders ────────────────────────────────────────────────────────
test('07. Customer Orders CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/customer-orders`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: /新增|建立/ }).first().click()
  await page.waitForTimeout(400)
  const inputs = page.locator('input.oms-input')
  // [0]=date, [1]=po_number, [2]=customer_name
  await inputs.nth(1).fill('PO-E2E-001')
  await inputs.nth(2).fill('E2E 客戶')
  await page.locator('button', { hasText: '建立訂單' }).click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'PO-E2E-001' }).first()).toBeVisible({ timeout: 5000 })

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Customer Orders CRUD OK')
})

// ── 8. Quotations ─────────────────────────────────────────────────────────────
test('08. Quotations CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/quotations`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: '新增報價單' }).click()
  await page.waitForTimeout(400)
  await page.locator('input.oms-input').first().fill('E2E 客戶報價')
  const row = page.locator('tbody tr').first()
  await row.locator('input').nth(0).fill('E2E 品項')
  await row.locator('input[type="number"]').nth(0).fill('10')
  await row.locator('input[type="number"]').nth(1).fill('500')
  await page.locator('button', { hasText: '建立報價單' }).click()
  await waitMsg(page)

  // Expand
  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(800)

  // Send
  await page.locator('button', { hasText: '發送' }).first().click()
  await waitMsg(page)

  // Print
  await page.locator('button', { hasText: '🖨' }).first().click()
  await page.waitForTimeout(500)

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Quotations CRUD OK')
})

// ── 9. Delivery Notes ─────────────────────────────────────────────────────────
test('09. Delivery Notes CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/delivery-notes`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: '新增出貨單' }).click()
  await page.waitForTimeout(400)
  await page.locator('input.oms-input').first().fill('E2E 出貨客戶')
  const row = page.locator('tbody tr').first()
  await row.locator('input').nth(1).fill('E2E 品項')
  await row.locator('input[type="number"]').first().fill('5')
  await page.locator('button', { hasText: '建立出貨單' }).click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'E2E 出貨客戶' }).first()).toBeVisible({ timeout: 5000 })

  // View detail
  await page.locator('button', { hasText: '詳情' }).first().click()
  await page.waitForTimeout(400)
  await expect(page.locator('h2').first()).toBeVisible()

  // Confirm status
  await page.locator('button', { hasText: '✓ 確認' }).click()
  await waitMsg(page)

  // Print
  await page.locator('button', { hasText: '🖨 列印' }).click()
  await page.waitForTimeout(500)
  await page.locator('button').filter({ hasText: '✕' }).first().click()
  await page.waitForTimeout(300)

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Delivery Notes CRUD OK')
})

// ── 10. Inventory ─────────────────────────────────────────────────────────────
test('10. Inventory CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/inventory`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: /新增|建立/ }).first().click()
  await page.waitForTimeout(400)
  const inputs = page.locator('input.oms-input')
  await inputs.nth(0).fill('E2E-INV-001')
  await inputs.nth(1).fill('E2E 庫存品')
  await page.locator('button', { hasText: '儲存' }).click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'E2E-INV-001' }).first()).toBeVisible({ timeout: 5000 })

  // Edit
  await page.locator('button', { hasText: '編輯' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: '儲存' }).click()
  await waitMsg(page)

  // Delete
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).first().click()
  await page.waitForTimeout(800)
  console.log('✅ Inventory CRUD OK')
})

// ── 11. Users ─────────────────────────────────────────────────────────────────
test('11. Users CRUD', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/users`)
  await page.waitForLoadState('networkidle')

  // Create
  await page.locator('button', { hasText: /新增|建立/ }).first().click()
  await page.waitForTimeout(400)
  // inputs: [0]=email, [1]=name, [2]=password
  await page.locator('input[type="email"]').fill('e2e-del@oms.com')
  await page.locator('input[placeholder="用戶姓名"]').fill('E2E 刪除用戶')
  await page.locator('input[type="password"]').fill('test123456')
  await page.locator('button', { hasText: '建立用戶' }).click()
  await waitMsg(page)
  await expect(page.locator('td', { hasText: 'e2e-del@oms.com' }).first()).toBeVisible({ timeout: 5000 })

  // Edit
  await page.locator('button', { hasText: '編輯' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: '儲存' }).click()
  await waitMsg(page)

  // Delete (last row to avoid deleting admin)
  page.on('dialog', d => d.accept())
  await page.locator('button', { hasText: '刪除' }).last().click()
  await page.waitForTimeout(800)
  console.log('✅ Users CRUD OK')
})

// ── 12. Roles ─────────────────────────────────────────────────────────────────
test('12. Roles Permissions', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/roles`)
  await page.waitForLoadState('networkidle')
  // Roles uses toggle buttons (div with onClick), not checkboxes
  // Just verify the page loaded with permission rows
  await expect(page.locator('h1', { hasText: '角色權限管理' })).toBeVisible()
  const toggles = page.locator('button[class*="rounded"]').first()
  if (await toggles.isVisible()) {
    await toggles.click()
    await waitMsg(page)
    await toggles.click() // toggle back
    await waitMsg(page)
  }
  console.log('✅ Roles OK')
})

// ── 13. Audit Logs ────────────────────────────────────────────────────────────
test('13. Audit Logs', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/dashboard/audit-logs`)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('h1', { hasText: '操作日誌' })).toBeVisible()
  const rows = page.locator('tbody tr')
  const count = await rows.count()
  expect(count).toBeGreaterThan(0)
  console.log(`✅ Audit Logs OK - ${count} entries`)
})
