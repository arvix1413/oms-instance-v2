import { test, expect } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:3005'
const API_URL = process.env.API_URL || 'http://127.0.0.1:3001'

async function auth(request: any) {
  const loginResp = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: 'admin@oms.com', password: 'admin123' },
  })
  expect(loginResp.ok()).toBeTruthy()
  return loginResp.json()
}

test('PO print: no header overflow, subtotal/currency no wrap', async ({ page, context, request }) => {
  const loginData = await auth(request)
  const token = loginData.token

  await page.addInitScript((payload) => {
    localStorage.setItem('oms_token', payload.token)
    localStorage.setItem('oms_user', JSON.stringify(payload.user))
    localStorage.setItem('oms_permissions', JSON.stringify([]))
  }, { token, user: loginData.user })

  await page.goto(`${FRONTEND_URL}/dashboard/po`, { waitUntil: 'networkidle' })

  let printCount = await page.locator('button[title="列印"]').count()

  if (printCount === 0) {
    const headers = { Authorization: `Bearer ${token}` }
    const suppliersResp = await request.get(`${API_URL}/api/suppliers`, { headers })
    const bomsResp = await request.get(`${API_URL}/api/bom`, { headers })
    expect(suppliersResp.ok()).toBeTruthy()
    expect(bomsResp.ok()).toBeTruthy()

    const suppliers = await suppliersResp.json()
    const boms = await bomsResp.json()
    const s = suppliers[0]
    const b = boms.find((x: any) => Number(x.company_price || 0) > 0) || boms[0]
    expect(s).toBeTruthy()
    expect(b).toBeTruthy()

    const qty = 3360
    const unitPrice = Number(b.company_price || 880)
    const createResp = await request.post(`${API_URL}/api/po`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: {
        supplier_id: String(s.id),
        supplier_name: s.name,
        currency: 'VND',
        tax_rate: 8,
        remark: 'PW auto-create for print test',
        items: [
          {
            po_ref: `PW-${Date.now()}`,
            bom_id: b.id,
            material_code: b.product_sku || b.material_code || 'MAT',
            material_name: b.product_name || b.material_name || 'ITEM',
            spec: b.spec || '',
            unit: b.unit || 'PCS',
            quantity: qty,
            unit_price: unitPrice,
            total_price: qty * unitPrice,
            currency: 'VND',
            remark: '',
          },
        ],
      },
    })
    expect(createResp.ok()).toBeTruthy()

    await page.reload({ waitUntil: 'networkidle' })
    printCount = await page.locator('button[title="列印"]').count()
  }

  expect(printCount).toBeGreaterThan(0)

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('button[title="列印"]').first().click(),
  ])

  await popup.waitForLoadState('domcontentloaded')
  await popup.waitForTimeout(1200)
  await popup.screenshot({ path: 'test-results/po-print-check.png', fullPage: true })

  const report = await popup.evaluate(() => {
    const table = document.querySelector('table.items')
    if (!table) return { tableExists: false, headerIssues: [], footerIssues: [] }

    const metric = (el: Element) => {
      const node = el as HTMLElement
      return {
        text: (node.textContent || '').trim(),
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        overflow: node.scrollWidth > node.clientWidth + 1,
        lineBreak: /\n/.test(node.textContent || ''),
        whiteSpace: getComputedStyle(node).whiteSpace,
      }
    }

    const headerIssues = Array.from(document.querySelectorAll('table.items thead th'))
      .map(metric)
      .filter(h => h.overflow)

    const footerIssues = Array.from(document.querySelectorAll('table.items tfoot tr.total-row td'))
      .map(metric)
      .filter(f => /vnd|\d/.test(f.text.toLowerCase()) && (f.lineBreak || f.whiteSpace !== 'nowrap' || f.overflow))

    return { tableExists: true, headerIssues, footerIssues }
  })

  expect(report.tableExists).toBeTruthy()
  expect(report.headerIssues, JSON.stringify(report.headerIssues, null, 2)).toEqual([])
  expect(report.footerIssues, JSON.stringify(report.footerIssues, null, 2)).toEqual([])
})
