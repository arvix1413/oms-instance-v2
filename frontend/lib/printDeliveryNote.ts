export function generateDeliveryNoteHTML(data: any, signatureUrl?: string): string {
  const items: any[] = data.items || []
  const totalQty = items.reduce((s: number, i: any) => s + (Number(i.qty)||0), 0)

  const itemRows = items.map((item: any, i: number) => {
    return [
      '<tr>',
      '<td style="border:1px solid #333;text-align:center;padding:6px 4px;font-size:11px">' + (i+1) + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;font-size:10px;font-family:monospace;color:#1a56db">' + (data.po_ref || '—') + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;font-size:10px;font-family:monospace;color:#1a56db">' + (item.material_code || '—') + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;font-size:11px;font-weight:500">' + (item.item_name || '—') + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;font-size:10px;color:#555">' + (item.spec || '—') + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;text-align:center;font-size:10px">' + (item.unit || 'PCS') + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;text-align:right;font-size:11px;font-weight:600">' + Number(item.qty).toLocaleString() + '</td>',
      '<td style="border:1px solid #333;padding:6px 8px;font-size:10px;color:#666">' + (item.remark || '') + '</td>',
      '</tr>',
    ].join('')
  }).join('')

  const parts: string[] = []

  parts.push('<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/>')
  parts.push('<title>出貨單 ' + data.dn_number + '</title>')
  parts.push('<style>')
  parts.push('*{margin:0;padding:0;box-sizing:border-box}')
  parts.push('body{font-family:"Microsoft YaHei","Segoe UI",Arial,sans-serif;font-size:11px;color:#000;padding:12mm 15mm;background:#fff;line-height:1.5}')
  parts.push('.header{text-align:center;margin-bottom:6mm;border-bottom:2.5px solid #000;padding-bottom:5mm}')
  parts.push('.company{font-size:22px;font-weight:700;letter-spacing:2.5px;margin-bottom:6px;text-transform:uppercase;color:#000}')
  parts.push('.doc-title{font-size:17px;font-weight:700;margin-bottom:3px;color:#000}')
  parts.push('.doc-subtitle{font-size:11px;color:#666;font-weight:400}')
  parts.push('.info-section{margin-bottom:6mm}')
  parts.push('.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm 4mm;border:1.5px solid #333;padding:5mm 6mm;background:#fafafa}')
  parts.push('.info-row{display:flex;font-size:10.5px;line-height:1.9;align-items:baseline}')
  parts.push('.info-label{font-weight:600;min-width:105px;color:#000;flex-shrink:0}')
  parts.push('.info-value{color:#000;font-weight:400}')
  parts.push('.full-width{grid-column:1/-1}')
  parts.push('table{width:100%;border-collapse:collapse;margin-bottom:5mm;border:1.5px solid #333}')
  parts.push('thead th{border:1px solid #333;background:#e8e8e8;padding:7px 8px;text-align:center;font-size:10.5px;font-weight:700;line-height:1.4}')
  parts.push('tbody td{border:1px solid #333}')
  parts.push('.total-row{background:#f0f0f0;font-weight:700}')
  parts.push('.footer{display:grid;grid-template-columns:1fr 1fr;gap:25mm;margin-top:10mm;padding-top:8mm;border-top:1px solid #ddd}')
  parts.push('.sign-box{text-align:center}')
  parts.push('.sign-label{font-weight:600;margin-bottom:22mm;font-size:11px;color:#000}')
  parts.push('.sign-line{border-top:1.5px solid #333;padding-top:5px;font-size:10px;font-weight:500}')
  parts.push('.notes-box{border:1.5px solid #333;padding:6mm;margin-bottom:6mm;background:#fafafa}')
  parts.push('.notes-title{font-weight:700;margin-bottom:3mm;font-size:11px;color:#000}')
  parts.push('.notes-content{font-size:10px;line-height:1.7;color:#333;white-space:pre-wrap}')
  parts.push('@media print{body{padding:8mm 12mm}@page{size:A4;margin:0}}')
  parts.push('</style></head><body>')

  // Header
  parts.push('<div class="header">')
  parts.push('<div class="company">FAN YONG CO., LTD</div>')
  parts.push('<div class="doc-title">送貨單 / PHIẾU GIAO HÀNG</div>')
  parts.push('<div class="doc-subtitle">Delivery Note</div>')
  parts.push('</div>')

  // Info Section
  parts.push('<div class="info-section">')
  parts.push('<div class="info-grid">')
  
  // Left column
  parts.push('<div>')
  parts.push('<div class="info-row"><span class="info-label">送貨單號/Số phiếu:</span><span class="info-value">' + data.dn_number + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">送貨日期/Ngày giao:</span><span class="info-value">' + (data.delivery_date || '—') + '</span></div>')
  parts.push('</div>')
  
  // Right column
  parts.push('<div>')
  parts.push('<div class="info-row"><span class="info-label">客戶/Khách hàng:</span><span class="info-value">' + (data.customer_name || '—') + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">訂單號/Mã đơn hàng:</span><span class="info-value">' + (data.po_ref || '—') + '</span></div>')
  parts.push('</div>')
  
  // Full width rows
  if (data.address) {
    parts.push('<div class="info-row full-width"><span class="info-label">送貨地址/Địa chỉ:</span><span class="info-value">' + data.address + '</span></div>')
  }
  
  parts.push('</div></div>')

  // Table
  parts.push('<table>')
  parts.push('<thead><tr>')
  parts.push('<th style="width:35px">序號<br/>STT</th>')
  parts.push('<th style="width:95px">訂單編號<br/>Mã đơn hàng</th>')
  parts.push('<th style="width:95px">物料編號<br/>Mã vật liệu</th>')
  parts.push('<th style="width:auto">品名<br/>Tên hàng hóa</th>')
  parts.push('<th style="width:110px">規格<br/>Quy cách</th>')
  parts.push('<th style="width:55px">單位<br/>ĐVT</th>')
  parts.push('<th style="width:75px">數量<br/>Số lượng</th>')
  parts.push('<th style="width:100px">備註<br/>Ghi chú</th>')
  parts.push('</tr></thead>')
  parts.push('<tbody>')
  parts.push(itemRows)
  
  // Total row
  parts.push('<tr class="total-row">')
  parts.push('<td colspan="6" style="border:1px solid #333;padding:7px 10px;text-align:right;font-size:11px;font-weight:600">總計 / Tổng cộng</td>')
  parts.push('<td style="border:1px solid #333;padding:7px 10px;text-align:right;font-size:11px;font-weight:700">' + totalQty.toLocaleString() + '</td>')
  parts.push('<td style="border:1px solid #333"></td>')
  parts.push('</tr>')
  
  parts.push('</tbody>')
  parts.push('</table>')

  // Notes
  if (data.remark) {
    parts.push('<div class="notes-box">')
    parts.push('<div class="notes-title">備註 / Ghi chú:</div>')
    parts.push('<div class="notes-content">' + data.remark.replace(/\n/g, '<br/>') + '</div>')
    parts.push('</div>')
  }

  // Footer signatures
  parts.push('<div class="footer">')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">供應商確認 / Nhà cung cấp xác nhận</div>')
  if (signatureUrl) {
    parts.push('<div style="margin-bottom:4px"><img src="' + signatureUrl + '" style="max-height:48px;max-width:160px;object-fit:contain" /></div>')
  } else {
    parts.push('<div style="height:48px"></div>')
  }
  parts.push('<div class="sign-line">FAN YONG CO., LTD</div>')
  parts.push('</div>')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">客戶簽收 / Khách hàng ký nhận</div>')
  parts.push('<div style="height:48px"></div>')
  parts.push('<div class="sign-line">' + (data.customer_name || '') + '</div>')
  parts.push('</div>')
  parts.push('</div>')

  parts.push('</body></html>')
  return parts.join('')
}
