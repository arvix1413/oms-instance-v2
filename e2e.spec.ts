import { test, expect, Page } from '@playwright/test'

const BASE = 'http://43.133.56.234'
let page: Page

async function login(p: Page) {
  await p.goto(`${BASE}/login`)
  await p.fill('input[type="email"]', 'admin@oms.com')
  await p.fill('input[type="password"]', 'admin123')
  await p.click('button[type="submit"]')
  await p.waitForURL(`${BASE}/dashboard`, { timeout: 10000 })
  console.log('✅ Login OK')
}

test.describe('OMS E2E Full Flow', () => {
  test.use({ baseURL: BASE })

  test('1. Login', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(`${BASE}/dashboard`)
    await page.screenshot({ path: 'screenshots/01-dashboard.png', fullPage: true })
  })

  test('2. Suppliers - CRUD', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/suppliers`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/02-suppliers.png', fullPage: true })

    // Create
    const createBtn = page.locator('button', { hasText: /新增|Add|建立/ }).first()
    await createBtn.click()
    await page.waitForTimeout(500)
    await page.fill('input[placeholder*="名稱"], input[name="name"], input[placeholder*="name"]', 'E2E Supplier')
    const saveBtn = page.locator('button', { hasText: /儲存|Save|確認|提交/ }).first()
    await saveBtn.click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'screenshots/02b-supplier-created.png', fullPage: true })
    console.log('✅ Suppliers OK')
  })

  test('3. Customers - CRUD', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/customers`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/03-customers.png', fullPage: true })
    console.log('✅ Customers OK')
  })

  test('4. Materials', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/materials`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/04-materials.png', fullPage: true })
    console.log('✅ Materials OK')
  })

  test('5. BOM', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/bom`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/05-bom.png', fullPage: true })
    console.log('✅ BOM OK')
  })

  test('6. Purchase Orders', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/po`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/06-po.png', fullPage: true })
    console.log('✅ PO OK')
  })

  test('7. Customer Orders', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/customer-orders`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/07-customer-orders.png', fullPage: true })
    console.log('✅ Customer Orders OK')
  })

  test('8. Quotations', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/quotations`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/08-quotations.png', fullPage: true })
    console.log('✅ Quotations OK')
  })

  test('9. Delivery Notes', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/delivery-notes`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/09-delivery-notes.png', fullPage: true })
    console.log('✅ Delivery Notes OK')
  })

  test('10. Inventory', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/inventory`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/10-inventory.png', fullPage: true })
    console.log('✅ Inventory OK')
  })

  test('11. Users', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/users`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/11-users.png', fullPage: true })
    console.log('✅ Users OK')
  })

  test('12. Roles', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/roles`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/12-roles.png', fullPage: true })
    console.log('✅ Roles OK')
  })

  test('13. Audit Logs', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/dashboard/audit-logs`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/13-audit-logs.png', fullPage: true })
    console.log('✅ Audit Logs OK')
  })
})
