export function generateDeliveryNoteHTML(data: any): string {
  const items: any[] = data.items || []
  const totalQty = items.reduce((s: number, i: any) => s + (Number(i.qty)||0), 0)

  const itemRows = items.map((item: any, i: number) => {
    return [
      '<tr>',
      '<td style="border:1px solid #333;text-align:center;padding:8px 6px;font-size:11px">' + (i+1) + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:10px;font-family:monospace">' + (data.po_ref || '—') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:10px;font-family:monospace">' + (item.material_code || '—') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:11px">' + (item.item_name || '—') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:10px;color:#666">' + (item.spec || '—') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:center;font-size:11px">' + (item.unit || 'PCS') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px;font-weight:600">' + Number(item.qty).toLocaleString() + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:10px;color:#666">' + (item.remark || '') + '</td>',
      '</tr>',
    ].join('')
  }).join('')

  const parts: string[] = []

  parts.push('<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/>')
  parts.push('<title>出貨單 ' + data.dn_number + '</title>')
  parts.push('<style>')
  parts.push('body{font-family:"Microsoft YaHei",Arial,sans-serif;font-size:11px;color:#000;padding:15mm;background:#fff;line-height:1.4}')
  parts.push('.header{text-align:center;margin-bottom:8mm;border-bottom:2px solid #000;padding-bottom:6mm}')
  parts.push('.company{font-size:20px;font-weight:700;letter-spacing:2px;margin-bottom:8px;text-transform:uppercase}')
  parts.push('.doc-title{font-size:16px;font-weight:700;margin-bottom:4px}')
  parts.push('.doc-subtitle{font-size:11px;color:#555}')
  parts.push('.info-section{margin-bottom:8mm}')
  parts.push('.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;border:1px solid #333;padding:6mm}')
  parts.push('.info-row{display:flex;font-size:11px;line-height:1.8}')
  parts.push('.info-label{font-weight:600;min-width:110px;color:#000}')
  parts.push('.info-value{color:#000}')
  parts.push('.full-width{grid-column:1/-1}')
  parts.push('table{width:100%;border-collapse:collapse;margin-bottom:6mm}')
  parts.push('thead th{border:1px solid #333;background:#f0f0f0;padding:8px 10px;text-align:center;font-size:11px;font-weight:700}')
  parts.push('tbody td{border:1px solid #333}')
  parts.push('.total-row{background:#f5f5f5;font-weight:700}')
  parts.push('.footer{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:12mm}')
  parts.push('.sign-box{text-align:center}')
  parts.push('.sign-label{font-weight:600;margin-bottom:25mm;font-size:11px}')
  parts.push('.sign-line{border-top:1px solid #333;padding-top:4px;font-size:10px}')
  parts.push('@media print{body{padding:10mm}@page{size:A4;margin:0}}')
  parts.push('</style></head><body>')

  // Header
  parts.push('<div class="header">')
  parts.push('<div class="company">FAN YONG CO., LTD</div>')
  parts.push('<div class="doc-title">出貨單 / Phiếu giao hàng</div>')
  parts.push('<div class="doc-subtitle">Delivery Note</div>')
  parts.push('</div>')

  // Info Section
  parts.push('<div class="info-section">')
  parts.push('<div class="info-grid">')
  
  // Left column
  parts.push('<div>')
  parts.push('<div class="info-row"><span class="info-label">出貨單號:</span><span class="info-value">' + data.dn_number + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">出貨日期/Ngày giao:</span><span class="info-value">' + (data.delivery_date || '—') + '</span></div>')
  parts.push('</div>')
  
  // Right column
  parts.push('<div>')
  parts.push('<div class="info-row"><span class="info-label">客戶/Khách hàng:</span><span class="info-value">' + (data.customer_name || '—') + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">訂單號/Mã PO:</span><span class="info-value">' + (data.po_ref || '—') + '</span></div>')
  parts.push('</div>')
  
  // Full width rows
  if (data.address) {
    parts.push('<div class="info-row full-width"><span class="info-label">地址/Địa chỉ:</span><span class="info-value">' + data.address + '</span></div>')
  }
  
  parts.push('</div></div>')

  // Table
  parts.push('<table>')
  parts.push('<thead><tr>')
  parts.push('<th style="width:40px">序號<br/>ST</th>')
  parts.push('<th style="width:100px">訂單編號<br/>Mã đơn đặt</th>')
  parts.push('<th style="width:100px">物料編號<br/>Mã vật liệu</th>')
  parts.push('<th style="width:180px">品名<br/>Tên hàng</th>')
  parts.push('<th style="width:100px">規格<br/>Qui cách</th>')
  parts.push('<th style="width:60px">單位<br/>Đơn vị</th>')
  parts.push('<th style="width:80px">交貨數量<br/>Số lượng</th>')
  parts.push('<th style="width:100px">備註<br/>Ghi chú</th>')
  parts.push('</tr></thead>')
  parts.push('<tbody>')
  parts.push(itemRows)
  
  // Total row
  parts.push('<tr class="total-row">')
  parts.push('<td colspan="6" style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px">Total</td>')
  parts.push('<td style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px;font-weight:700">' + totalQty.toLocaleString() + '</td>')
  parts.push('<td style="border:1px solid #333"></td>')
  parts.push('</tr>')
  
  parts.push('</tbody>')
  parts.push('</table>')

  // Notes
  if (data.remark) {
    parts.push('<div style="border:1px solid #333;padding:8px 12px;margin-bottom:8mm;font-size:10px;line-height:1.6">')
    parts.push('<div style="font-weight:700;margin-bottom:4px">備註/Ghi chú:</div>')
    parts.push('<div>' + data.remark + '</div>')
    parts.push('</div>')
  }

  // Footer signatures
  parts.push('<div class="footer">')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">供應商確認/NCC xác nhận</div>')
  parts.push('<div class="sign-line">FAN YONG CO., LTD</div>')
  parts.push('</div>')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">客戶簽收/Khách hàng ký nhận</div>')
  parts.push('<div class="sign-line">' + (data.customer_name || '') + '</div>')
  parts.push('</div>')
  parts.push('</div>')

  parts.push('</body></html>')
  return parts.join('')
}
