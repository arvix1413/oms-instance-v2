import { expect, test } from '@playwright/test'

const BASE_URL = 'http://43.160.199.226'
const LOGIN_EMAIL = 'admin@oms.com'
const LOGIN_PASSWORD = 'admin123'
const EXPECTED_REMARK = [
  '1. 交易方式：現金轉款',
  '2. 單價確認樣品日期：7-12天，訂單量產時間：12-18天，不包含列假日',
  '3. 以上單價不包含8%VAT',
  '4. 交易方式：越南胡志明本地',
  '5. 如有問題根據樣品報價單',
  '6. 三天內確認打樣費用，請簽回並確認',
  '7. 收到量產訂單出貨後，打樣費將在8天內退還',
].join('\n')

test('verify production quotation manual number and remark text', async ({ page, request }) => {
  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: LOGIN_EMAIL, password: LOGIN_PASSWORD },
  })
  expect(loginRes.ok()).toBeTruthy()
  const loginData = await loginRes.json()
  const token = loginData.token as string
  const user = loginData.user
  const permissions = loginData.permissions || []

  const customersRes = await request.get(`${BASE_URL}/api/customers`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(customersRes.ok()).toBeTruthy()
  const customers = await customersRes.json()
  const customer = customers.find((c: any) => c.customer_name) || customers[0]
  expect(customer).toBeTruthy()

  const bomRes = await request.get(`${BASE_URL}/api/bom`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(bomRes.ok()).toBeTruthy()
  const boms = await bomRes.json()
  const bom = boms.find((b: any) => b.product_name && b.product_sku) || boms[0]
  expect(bom).toBeTruthy()

  const qNum = `QT-PW-${Date.now()}`
  let createdId: number | null = null

  await page.addInitScript(([storedToken, storedUser, storedPermissions]) => {
    localStorage.setItem('oms_token', storedToken)
    localStorage.setItem('oms_user', JSON.stringify(storedUser))
    localStorage.setItem('oms_permissions', JSON.stringify(storedPermissions))
  }, [token, user, permissions])

  await page.goto(`${BASE_URL}/dashboard/quotations`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /新增報價單/ }).click()
  await expect(page.getByRole('heading', { name: /新增報價單/ })).toBeVisible()

  const numberInput = page.locator('input').nth(0)
  await expect(numberInput).toBeVisible()
  const remarkInput = page.locator('input').nth(2)
  await expect(remarkInput).toHaveValue(EXPECTED_REMARK)

  await numberInput.fill(qNum)
  await page.locator('select').nth(0).selectOption(String(customer.id))
  await page.locator('select').nth(2).selectOption(String(bom.id))
  await page.getByRole('button', { name: /建立報價單/ }).click()

  await expect(page.getByText('報價單建立成功')).toBeVisible()
  await expect(page.getByRole('cell', { name: qNum })).toBeVisible({ timeout: 15000 })

  const row = page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: qNum }) }).first()
  await expect(row).toBeVisible()
  await row.click()
  await row.getByRole('button', { name: /編輯/ }).click()
  await expect(page.getByRole('heading', { name: /編輯報價單/ })).toBeVisible()
  await expect(page.locator('input').nth(0)).toHaveValue(qNum)

  await page.getByRole('button', { name: /返回列表/ }).click()
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => {
    ;(window as any).__lastPrintHtml = ''
    window.open = () => {
      const doc = {
        write: (html: string) => { ;(window as any).__lastPrintHtml = html },
        close: () => {},
      }
      return { document: doc, print: () => {} } as any
    }
  })

  const printRow = page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: qNum }) }).first()
  await expect(printRow).toBeVisible()
  await printRow.getByRole('button', { name: /列印/ }).click()

  await expect.poll(async () => {
    return await page.evaluate(() => ((window as any).__lastPrintHtml || '').length)
  }).toBeGreaterThan(0)

  const printHtml = await page.evaluate(() => (window as any).__lastPrintHtml || '')
  expect(printHtml).toContain(qNum)
  expect(printHtml).toContain('2. 單價確認樣品日期：7-12天，訂單量產時間：12-18天，不包含列假日')
  expect(printHtml).toContain('4. 交易方式：越南胡志明本地')

  const listRes = await request.get(`${BASE_URL}/api/quotations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(listRes.ok()).toBeTruthy()
  const quotations = await listRes.json()
  const created = quotations.find((q: any) => q.quotation_number === qNum)
  expect(created).toBeTruthy()
  createdId = created.id

  if (createdId !== null) {
    const delRes = await request.delete(`${BASE_URL}/api/quotations/${createdId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(delRes.ok()).toBeTruthy()
  }
})
