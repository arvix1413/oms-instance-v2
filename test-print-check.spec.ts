import { test, expect } from '@playwright/test'

const BASE = 'http://43.133.56.234'

test('capture print pages for manual review', async ({ page, context }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'admin@oms.com')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 20000 })

  const targets = [
    { name: 'po', url: `${BASE}/dashboard/po` },
    { name: 'customer-orders', url: `${BASE}/dashboard/customer-orders` },
    { name: 'delivery-notes', url: `${BASE}/dashboard/delivery-notes` },
    { name: 'quotations', url: `${BASE}/dashboard/quotations` },
  ] as const

  for (const t of targets) {
    await page.goto(t.url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)

    const printBtn = page.locator('button[title="列印"]').first()
    const count = await page.locator('button[title="列印"]').count()

    if (!count) {
      await page.screenshot({ path: `test-results/print-check-${t.name}-list-no-print-btn.png`, fullPage: true })
      continue
    }

    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }),
      printBtn.click(),
    ])

    await popup.waitForLoadState('domcontentloaded')
    await popup.waitForTimeout(1500)
    await popup.screenshot({ path: `test-results/print-check-${t.name}.png`, fullPage: true })
    await popup.close()
  }

  expect(true).toBeTruthy()
})
