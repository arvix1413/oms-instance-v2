import { test, expect, Page } from '@playwright/test'

const PROD = process.env.OMS_PRD_URL || 'http://43.160.199.226'
const EMAIL = process.env.OMS_PRD_EMAIL || 'admin@oms.com'
const PASSWORD = process.env.OMS_PRD_PASSWORD || 'Make$45617'

async function login(page: Page) {
  await page.goto(`${PROD}/login`)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 20000 })
  await page.waitForTimeout(800)
}

test('PRD 出貨單：建立批次鎖定訂單', async ({ page }) => {
  await login(page)
  await page.goto(`${PROD}/dashboard/delivery-notes`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  const batchBtn = page.locator('button:has-text("+ 建立批次")').first()
  const batchCount = await page.locator('button:has-text("+ 建立批次")').count()
  console.log(`[delivery-notes] + 建立批次 按鈕數量: ${batchCount}`)

  if (batchCount === 0) {
    test.skip(true, '目前無可建立批次的訂單（已全部出完或無權限）')
  }

  await batchBtn.click()
  await page.waitForTimeout(1200)

  await expect(page.locator('h2:has-text("建立出貨批次")')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('text=本批次已綁定訂單（不可更換）')).toBeVisible()
  await expect(page.locator('select option:has-text("-- 選擇訂單 --")')).toHaveCount(0)
  await expect(page.locator('text=待出貨訂單')).toHaveCount(0)
  await expect(page.locator('text=本次出貨明細（僅顯示剩餘可出）')).toBeVisible()

  console.log('✅ 建立批次彈窗：訂單已鎖定，無訂單下拉')
  await page.locator('button:has-text("關閉")').click()
})

test('PRD 出貨單：新增出貨單仍可選訂單', async ({ page }) => {
  await login(page)
  await page.goto(`${PROD}/dashboard/delivery-notes`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  const newBtn = page.locator('button:has-text("+ 新增出貨單")')
  if ((await newBtn.count()) === 0) {
    test.skip(true, '無新增出貨單權限')
  }

  await newBtn.click()
  await page.waitForTimeout(800)

  await expect(page.locator('h2:has-text("新增出貨單")')).toBeVisible()
  await expect(page.locator('label:has-text("待出貨訂單")')).toBeVisible()
  await expect(page.locator('select option:has-text("-- 選擇訂單 --")')).toHaveCount(1)

  console.log('✅ 新增出貨單彈窗：仍可選客戶與訂單')
})
