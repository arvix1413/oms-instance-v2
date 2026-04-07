const ExcelJS = require('exceljs')
const mysql = require('mysql2/promise')

const SUPPLIER_MAP = {
  'NS': 11,
  'LH': 12,
  'Linki': 14,
  '天碩': 9,
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
    const materialCode = vals[3] != null ? vals[3].toString().trim() : ''
    const materialName = vals[4] != null ? vals[4].toString().trim() : ''
    if (!materialCode || !materialName) continue

    const supplierShort = vals[8] != null ? vals[8].toString().trim() : ''
    rows.push({
      material_code: materialCode,
      material_name: materialName,
      spec: vals[5] != null ? vals[5].toString().trim() : '',
      unit: vals[7] != null ? vals[7].toString().trim() : 'PCS',
      category: vals[1] != null ? vals[1].toString().trim() : '',
      product_category: vals[2] != null ? vals[2].toString().trim() : '',
      supplier_id: SUPPLIER_MAP[supplierShort] || null,
      supplier_name: supplierShort,
      supplier_price: parseFloat(vals[9]) || 0,
      company_price: parseFloat(vals[10]) || 0,
    })
  }

  console.log('Parsed:', rows.length, 'materials')

  const conn = await mysql.createConnection({
    host: '43.133.56.234', port: 3306,
    user: 'oms_user', password: 'oms_db_2026', database: 'oms_db',
    charset: 'utf8mb4'
  })
  await conn.execute("SET NAMES 'utf8mb4'")

  await conn.execute('DELETE FROM materials')
  console.log('Cleared existing materials')

  let ok = 0
  for (const r of rows) {
    try {
      await conn.execute(
        'INSERT INTO materials (material_code,material_name,spec,unit,category,product_category,supplier_id,supplier_name,supplier_price,company_price,currency,stock,current_stock,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())',
        [r.material_code, r.material_name, r.spec, r.unit, r.category, r.product_category, r.supplier_id, r.supplier_name, r.supplier_price, r.company_price, 'VND', 0, 0]
      )
      ok++
    } catch (e) {
      console.error('Error inserting', r.material_code, ':', e.message)
    }
  }

  console.log('Inserted:', ok, 'materials')
  const [res] = await conn.execute('SELECT COUNT(*) as cnt FROM materials')
  console.log('DB total:', res[0].cnt)
  await conn.end()
}

main().catch(console.error)
