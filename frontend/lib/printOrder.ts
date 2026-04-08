export function generateOrderHTML(data: any): string {
  const items: any[] = data.items || []
  const subtotal = items.reduce((s: number, i: any) => s + (Number(i.qty)||0) * (Number(i.unit_price)||0), 0)
  const taxRate = Number(data.tax_rate) || 0
  const taxAmt = Math.round(subtotal * taxRate / 100 * 100) / 100
  const total = subtotal + taxAmt

  const itemRows = items.map((item: any, i: number) => {
    const amt = (Number(item.qty)||0) * (Number(item.unit_price)||0)
    // Use spec from BOM table
    const specText = item.spec ? '<div style="font-size:9px;color:#666;margin-top:2px">' + item.spec + '</div>' : ''
    
    return [
      '<tr>',
      '<td style="border:1px solid #333;text-align:center;padding:8px 6px;font-size:11px">' + (i+1) + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px">',
      '<div style="font-weight:600;font-size:11px;margin-bottom:2px">' + (item.product_name || '—') + '</div>',
      '<div style="font-size:9px;color:#666;font-family:monospace">SKU: ' + (item.product_sku || '') + '</div>',
      specText,
      '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:center;font-size:11px">' + (item.unit || 'PCS') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px;font-weight:600">' + Number(item.qty).toLocaleString() + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px;font-weight:600">' + amt.toLocaleString() + '</td>',
      '</tr>',
    ].join('')
  }).join('')

  const parts: string[] = []

  parts.push('<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/>')
  parts.push('<title>客戶訂單 ' + data.po_number + '</title>')
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
  parts.push('.summary-section{display:flex;justify-content:space-between;margin-bottom:8mm}')
  parts.push('.summary-left{flex:1;font-size:10px;line-height:1.8}')
  parts.push('.summary-right{width:280px;border:1px solid #333;padding:8px 12px}')
  parts.push('.sum-row{display:flex;justify-content:space-between;padding:6px 0;font-size:11px;border-bottom:1px solid #ddd}')
  parts.push('.sum-row:last-child{border-bottom:none;border-top:2px solid #333;padding-top:8px;margin-top:4px}')
  parts.push('.sum-label{font-weight:600}')
  parts.push('.sum-value{font-weight:700;font-size:12px}')
  parts.push('.notes{border:1px solid #333;padding:8px 12px;margin-bottom:8mm;min-height:40px;font-size:10px;line-height:1.6}')
  parts.push('.notes-title{font-weight:700;margin-bottom:4px}')
  parts.push('.footer{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:12mm}')
  parts.push('.sign-box{text-align:center}')
  parts.push('.sign-label{font-weight:600;margin-bottom:25mm;font-size:11px}')
  parts.push('.sign-line{border-top:1px solid #333;padding-top:4px;font-size:10px}')
  parts.push('@media print{body{padding:10mm}@page{size:A4;margin:0}}')
  parts.push('</style></head><body>')

  // Header
  parts.push('<div class="header">')
  parts.push('<div class="company">FAN YONG CO., LTD</div>')
  parts.push('<div class="doc-title">採購單 / Đơn đặt hàng</div>')
  parts.push('<div class="doc-subtitle">Purchase Order</div>')
  parts.push('</div>')

  // Info Section
  parts.push('<div class="info-section">')
  parts.push('<div class="info-grid">')
  
  // Left column
  parts.push('<div>')
  parts.push('<div class="info-row"><span class="info-label">人/Người lập biểu:</span><span class="info-value">' + (data.person_in_charge || '—') + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">採購單號/Mã PO:</span><span class="info-value">' + data.po_number + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">採購日期/Ngày lập:</span><span class="info-value">' + (data.po_date || '—') + '</span></div>')
  parts.push('</div>')
  
  // Right column
  parts.push('<div>')
  parts.push('<div class="info-row"><span class="info-label">幣種/Loại tiền:</span><span class="info-value">' + (data.currency || 'VND') + '</span></div>')
  parts.push('<div class="info-row"><span class="info-label">稅率/Thuế VAT:</span><span class="info-value">' + taxRate + '%</span></div>')
  parts.push('<div class="info-row"><span class="info-label">交貨日/Ngày giao:</span><span class="info-value">' + (data.delivery_date || '—') + '</span></div>')
  parts.push('</div>')
  
  // Full width rows
  parts.push('<div class="info-row full-width"><span class="info-label">客戶/Khách hàng:</span><span class="info-value">' + (data.customer_name || '—') + '</span></div>')
  if (data.address) {
    parts.push('<div class="info-row full-width"><span class="info-label">地址/Địa chỉ:</span><span class="info-value">' + data.address + '</span></div>')
  }
  parts.push('<div class="info-row full-width">')
  parts.push('<span class="info-label">電話/TEL:</span><span class="info-value" style="margin-right:20px">' + (data.phone || '—') + '</span>')
  parts.push('<span class="info-label">傳真/FAX:</span><span class="info-value">' + (data.fax || '—') + '</span>')
  parts.push('</div>')
  
  parts.push('</div></div>')

  // Table
  parts.push('<table>')
  parts.push('<thead><tr>')
  parts.push('<th style="width:40px">STT</th>')
  parts.push('<th>料號/品名<br/>Mã hàng/Tên hàng</th>')
  parts.push('<th style="width:80px">單位<br/>Đơn vị tính</th>')
  parts.push('<th style="width:100px">數量<br/>Số lượng</th>')
  parts.push('<th style="width:120px">金額<br/>Thành tiền</th>')
  parts.push('</tr></thead>')
  parts.push('<tbody>' + itemRows + '</tbody>')
  parts.push('</table>')

  // Summary section
  parts.push('<div class="summary-section">')
  
  // Left side - payment and delivery info
  parts.push('<div class="summary-left">')
  parts.push('<div><strong>付款方式/Phương thức TT:</strong> ' + (data.payment_terms || '—') + '</div>')
  if (data.delivery_address) {
    parts.push('<div><strong>交貨地點/Địa chỉ giao hàng:</strong> ' + data.delivery_address + '</div>')
  }
  parts.push('</div>')
  
  // Right side - totals
  parts.push('<div class="summary-right">')
  parts.push('<div class="sum-row"><span class="sum-label">小計/Tổng tiền chưa thuế:</span><span class="sum-value">' + subtotal.toLocaleString() + '</span></div>')
  parts.push('<div class="sum-row"><span class="sum-label">稅額/Tiền thuế (' + taxRate + '%):</span><span class="sum-value">' + taxAmt.toLocaleString() + '</span></div>')
  parts.push('<div class="sum-row"><span class="sum-label">含稅總計/Tổng cộng:</span><span class="sum-value" style="font-size:14px">' + total.toLocaleString() + '</span></div>')
  parts.push('</div>')
  
  parts.push('</div>')

  // Notes
  parts.push('<div class="notes">')
  parts.push('<div class="notes-title">備註/Ghi chú:</div>')
  parts.push('<div>' + (data.remark || '—') + '</div>')
  parts.push('</div>')

  // Footer signatures
  parts.push('<div class="footer">')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">供應商確認/NCC xác nhận</div>')
  parts.push('<div class="sign-line">FAN YONG CO., LTD</div>')
  parts.push('</div>')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">客戶簽章/Khách hàng ký</div>')
  parts.push('<div class="sign-line">' + (data.customer_name || '') + '</div>')
  parts.push('</div>')
  parts.push('</div>')

  parts.push('</body></html>')
  return parts.join('')
}
