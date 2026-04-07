const ExcelJS = require('exceljs')
const mysql = require('mysql2/promise')

// Supplier name mapping: Excel short name → DB supplier id
const SUPPLIER_MAP = {
  'NS':   11,  // CÔNG TY TNHH NEW SHINE
  'LH':   12,  // CÔNG TY CỔ PHẦN DV TM & SX LẠC HƯNG
  'Linki': 14, // CÔNG TY TNHH LINKI VIỆT NAM
  '天碩':  9,  // CÔNG TY TNHH THỰC NGHIỆP VIỆT NAM THIÊN THẠC
  'KY-HT001': 8,
  'KY-TT002': 9,
}

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile('/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/20250908_KFY ERP-更新內容.xlsx')
  const sheet = wb.worksheets[0]

  const rows = []
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    const vals = row.values
    if (!vals || vals.length < 4) continue
    const category = vals[1]?.toString()?.trim() || ''
    const productName = vals[2]?.toString()?.trim() || ''
    const materialCode = vals[3]?.toString()?.trim() || ''
    const materialName = vals[4]?.toString()?.trim() || ''
    const spec = vals[5]?.toString()?.trim() || ''
    const qty = vals[6] || 1
    const unit = vals[7]?.toString()?.trim() || 'PCS'
    const supplierShort = vals[8]?.toString()?.trim() || ''
    const supplierPrice = parseFloat(vals[9]) || 0
    const companyPrice = parseFloat(vals[10]) || 0

    if (!materialCode || !materialName) continue

    const supplierId = SUPPLIER_MAP[supplierShort] || null

    rows.push({
      material_code: materialCode,
      material_name: materialName,
      spec,
      unit,
      category,
      product_category: productName,
      supplier_id: supplierId,
      supplier_name: supplierShort,
      supplier_price: supplierPrice,
      company_price: companyPrice,
      currency: 'VND',
      stock: 0,
      current_stock: 0,
    })
  }

  console.log(`Parsed ${rows.length} materials`)

  const conn = await mysql.createConnection({
    host: '43.133.56.234', port: 3306,
    user: 'oms_user', password: 'oms_db_2026', database: 'oms_db'
  })

  // Clear existing materials
  await conn.execute('DELETE FROM materials')
  console.log('Cleared existing materials')

  // Insert new materials
  let inserted = 0
  for (const r of rows) {
    try {
      await conn.execute(
        'INSERT INTO materials (material_code,material_name,spec,unit,category,product_category,supplier_id,supplier_name,supplier_price,company_price,currency,stock,current_stock,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
        [r.material_code, r.material_name, r.spec, r.unit, r.category, r.product_category, r.supplier_id, r.supplier_name, r.supplier_price, r.company_price, r.currency, r.stock, r.current_stock]
      )
      inserted++
    } catch (e) {
      console.error(`Error inserting ${r.material_code}:`, e.message)
    }
  }

  console.log(`Inserted ${inserted} materials`)

  // Verify
  const [result] = await conn.execute('SELECT COUNT(*) as cnt FROM materials')
  console.log('Total in DB:', result[0].cnt)

  await conn.end()
}

main().catch(console.error)
