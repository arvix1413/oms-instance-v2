export function generateOrderHTML(data: any, signatureUrl?: string): string {
  const items: any[] = data.items || []
  const subtotal = items.reduce((s: number, i: any) => s + (Number(i.qty)||0) * (Number(i.unit_price)||0), 0)
  const taxRate = Number(data.tax_rate) || 0
  const taxAmt = Math.round(subtotal * taxRate / 100 * 100) / 100
  const total = subtotal + taxAmt

  const itemRows = items.map((item: any, i: number) => {
    const unitPrice = Number(item.unit_price) || 0
    const qty = Number(item.qty) || 0
    const amt = qty * unitPrice
    
    // Combine product name and SKU in name column
    const nameText = item.product_name || '—'
    const skuText = item.product_sku ? '<div style="font-size:9px;color:#666;margin-top:2px">(' + item.product_sku + ')</div>' : ''
    
    return [
      '<tr>',
      '<td style="border:1px solid #333;text-align:center;padding:8px 6px;font-size:11px">' + (i+1) + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:11px">' + nameText + skuText + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;font-size:10px;color:#666">' + (item.spec || '—') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px;font-weight:600">' + qty.toLocaleString() + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:center;font-size:11px">' + (item.unit || 'PCS') + '</td>',
      '<td style="border:1px solid #333;padding:8px 10px;text-align:right;font-size:11px">' + unitPrice.toLocaleString() + '</td>',
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
  parts.push('<th style="width:40px">ST</th>')
  parts.push('<th style="width:200px">名稱<br/>Tên hàng</th>')
  parts.push('<th style="width:120px">規格<br/>Quy cách</th>')
  parts.push('<th style="width:80px">數量<br/>Số lượng</th>')
  parts.push('<th style="width:60px">單位<br/>Đơn vị</th>')
  parts.push('<th style="width:90px">單價<br/>Đơn giá</th>')
  parts.push('<th style="width:100px">金額<br/>Thành tiền</th>')
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
  if (data.remark) {
    parts.push('<div>' + data.remark + '</div>')
  }
  parts.push('</div>')

  // Terms and conditions
  parts.push('<div style="border:1px solid #333;padding:8px 12px;margin-bottom:8mm;font-size:9px;line-height:1.6">')
  parts.push('<div style="font-weight:700;margin-bottom:4px">Ghi chú注释：</div>')
  parts.push('<div>1. Nhà cung ứng phải theo ngày ghi trên đơn hàng, quy cách, số lượng, đơn giá để giao hàng. Nếu có chất lượng không đạt, giao hàng không đúng quy cách, số lượng, đơn giá thì chúng tôi sẽ không nhận hàng. Quy cách và số lượng phải theo ngày ghi trên đơn hàng để giao hàng, nếu không chúng tôi sẽ không nhận hàng.</div>')
  parts.push('<div style="margin-top:4px">供应商必须按照订单上注明的交货日期、规格、数量、单价交货。如有质量不合格、交货规格、数量、单价不符，我们将不予收货。规格和数量必须按照订单上注明的交货日期交货，否则我们将不予收货。</div>')
  parts.push('<div style="margin-top:4px">2. Sau khi đơn hàng được xác nhận thì không được thay đổi bất cứ nội dung nào trên đơn hàng đã ký (nếu có thay đổi thì phải được sự chấp thuận của chúng tôi).</div>')
  parts.push('<div style="margin-top:4px">订单确认后，不得更改订单上已签署的任何内容（如有更改，必须经我们同意）。</div>')
  parts.push('<div style="margin-top:4px">3. Lưu hàng dự trữ có nghĩa là mất đơn hàng đã ký (nếu theo đơn).</div>')
  parts.push('<div style="margin-top:4px">P.S: Khi nhận được đơn hàng này, vui lòng ký tên và chứng chỉ của chúng tôi.</div>')
  parts.push('<div style="margin-top:4px">收到本订单后，请签名并盖章回传给我们。</div>')
  parts.push('</div>')

  // Footer signatures
  parts.push('<div class="footer">')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">供應商確認/NCC xác nhận</div>')
  if (signatureUrl) {
    parts.push('<div style="margin-bottom:4px"><img src="' + signatureUrl + '" style="max-height:48px;max-width:160px;object-fit:contain" /></div>')
  } else {
    parts.push('<div style="height:48px"></div>')
  }
  parts.push('<div class="sign-line">FAN YONG CO., LTD</div>')
  parts.push('</div>')
  parts.push('<div class="sign-box">')
  parts.push('<div class="sign-label">客戶簽章/Khách hàng ký</div>')
  parts.push('<div style="height:48px"></div>')
  parts.push('<div class="sign-line">' + (data.customer_name || '') + '</div>')
  parts.push('</div>')
  parts.push('</div>')

  parts.push('</body></html>')
  return parts.join('')
}
