export function generateOrderHTML(data: any): string {
  const items: any[] = data.items || []
  const subtotal = items.reduce((s: number, i: any) => s + (Number(i.qty)||0) * (Number(i.unit_price)||0), 0)
  const taxRate = Number(data.tax_rate) || 0
  const taxAmt = Math.round(subtotal * taxRate / 100 * 100) / 100
  const total = subtotal + taxAmt

  const itemRows = items.map((item: any, i: number) => {
    const amt = (Number(item.qty)||0) * (Number(item.unit_price)||0)
    return [
      '<tr>',
      '<td style="color:#888;text-align:center;padding:6px 8px">' + (i+1) + '</td>',
      '<td style="padding:6px 8px">',
      '<div style="font-weight:600">' + (item.product_name || '—') + '</div>',
      '<div style="font-size:9px;color:#888;font-family:monospace">' + (item.product_sku || '') + '</div>',
      '</td>',
      '<td style="padding:6px 8px;color:#555">—</td>',
      '<td style="padding:6px 8px;text-align:right">' + Number(item.qty).toLocaleString() + '</td>',
      '<td style="padding:6px 8px;text-align:right">' + Number(item.unit_price).toLocaleString() + '</td>',
      '<td style="padding:6px 8px;text-align:right;font-weight:600">' + amt.toLocaleString() + '</td>',
      '</tr>',
    ].join('')
  }).join('')

  const parts: string[] = []

  parts.push('<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/>')
  parts.push('<title>客戶訂單 ' + data.po_number + '</title>')
  parts.push('<style>')
  parts.push('body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:20mm 15mm}')
  parts.push('.header{text-align:center;margin-bottom:6mm}')
  parts.push('.company{font-size:18px;font-weight:700;letter-spacing:1px;margin-bottom:2px}')
  parts.push('.doc-title{font-size:14px;font-weight:600;color:#444}')
  parts.push('.divider{border:none;border-top:2px solid #1a1a1a;margin:4mm 0 3mm}')
  parts.push('.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:12px}')
  parts.push('.meta-row{display:flex;gap:4px}.meta-label{color:#666;min-width:80px;font-size:10px}.meta-value{font-weight:600}')
  parts.push('table{width:100%;border-collapse:collapse;margin-bottom:12px}')
  parts.push('thead tr{background:#1a1a1a;color:#fff}')
  parts.push('thead th{padding:6px 8px;text-align:left;font-size:10px;font-weight:600}')
  parts.push('tbody tr{border-bottom:1px solid #eee}tbody tr:nth-child(even){background:#fafafa}')
  parts.push('.totals{display:flex;justify-content:flex-end;margin-bottom:16px}')
  parts.push('.totals-box{width:220px}')
  parts.push('.t-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:11px}')
  parts.push('.t-total{display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #1a1a1a;font-size:13px;font-weight:700}')
  parts.push('.footer{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20mm}')
  parts.push('.sign-box{border-top:1px solid #999;padding-top:4px}')
  parts.push('.sign-label{font-size:10px;color:#666;margin-bottom:20mm}')
  parts.push('@media print{body{padding:10mm 12mm}@page{size:A4;margin:0}}')
  parts.push('</style></head><body>')

  // Header
  parts.push('<div class="header">')
  parts.push('<div class="company">FAN YONG CO., LTD</div>')
  parts.push('<div class="doc-title">採購單 / 訂單確認書</div>')
  parts.push('<div style="font-size:10px;color:#888">Purchase Order / Order Confirmation</div>')
  parts.push('</div><hr class="divider"/>')

  // Meta
  parts.push('<div class="meta">')
  parts.push('<div class="meta-row"><span class="meta-label">採購單號：</span><span class="meta-value">' + data.po_number + '</span></div>')
  parts.push('<div class="meta-row"><span class="meta-label">採購日期：</span><span class="meta-value">' + (data.po_date || '—') + '</span></div>')
  parts.push('<div class="meta-row"><span class="meta-label">客戶名稱：</span><span class="meta-value">' + (data.customer_name || '—') + '</span></div>')
  parts.push('<div class="meta-row"><span class="meta-label">客戶代碼：</span><span class="meta-value">' + (data.customer_code || '—') + '</span></div>')
  if (data.tax_id) {
    parts.push('<div class="meta-row"><span class="meta-label">稅號：</span><span class="meta-value">' + data.tax_id + '</span></div>')
  }
  if (data.address) {
    parts.push('<div class="meta-row" style="grid-column:1/-1"><span class="meta-label">地址：</span><span class="meta-value">' + data.address + '</span></div>')
  }
  if (data.phone || data.fax) {
    parts.push('<div class="meta-row"><span class="meta-label">電話：</span><span class="meta-value">' + (data.phone || '—') + '</span></div>')
    parts.push('<div class="meta-row"><span class="meta-label">傳真：</span><span class="meta-value">' + (data.fax || '—') + '</span></div>')
  }
  parts.push('<div class="meta-row"><span class="meta-label">負責人：</span><span class="meta-value">' + (data.person_in_charge || '—') + '</span></div>')
  parts.push('<div class="meta-row"><span class="meta-label">付款方式：</span><span class="meta-value">' + (data.payment_terms || '—') + '</span></div>')
  parts.push('<div class="meta-row"><span class="meta-label">幣種：</span><span class="meta-value">' + (data.currency || 'VND') + '</span></div>')
  parts.push('<div class="meta-row"><span class="meta-label">稅率：</span><span class="meta-value">' + taxRate + '%</span></div>')
  parts.push('</div>')

  // Delivery date and address bar
  if (data.delivery_date || data.delivery_address) {
    parts.push('<div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:4px;padding:8px 12px;margin-bottom:12px">')
    if (data.delivery_date) {
      parts.push('<div style="display:flex;gap:16px;margin-bottom:4px">')
      parts.push('<span style="color:#666;font-size:10px">預計交貨日 / Ngày giao hàng：</span>')
      parts.push('<span style="font-weight:700;font-size:12px">' + data.delivery_date + '</span>')
      parts.push('</div>')
    }
    if (data.delivery_address) {
      parts.push('<div style="display:flex;gap:16px">')
      parts.push('<span style="color:#666;font-size:10px">交貨地點 / Địa chỉ giao hàng：</span>')
      parts.push('<span style="font-weight:600;font-size:11px">' + data.delivery_address + '</span>')
      parts.push('</div>')
    }
    parts.push('</div>')
  }

  // Table
  parts.push('<table><thead><tr>')
  parts.push('<th style="width:30px">ST</th><th>料號 / 品名</th><th>規格</th>')
  parts.push('<th style="text-align:right;width:70px">數量</th>')
  parts.push('<th style="text-align:right;width:80px">單價</th>')
  parts.push('<th style="text-align:right;width:90px">金額</th>')
  parts.push('</tr></thead><tbody>' + itemRows + '</tbody></table>')

  // Totals
  parts.push('<div class="totals"><div class="totals-box">')
  parts.push('<div class="t-row"><span style="color:#666">小計 / Subtotal</span><span>' + subtotal.toLocaleString() + '</span></div>')
  parts.push('<div class="t-row"><span style="color:#666">稅額 ' + taxRate + '% / Tax</span><span>' + taxAmt.toLocaleString() + '</span></div>')
  parts.push('<div class="t-total"><span>總計 / Total (' + (data.currency || 'VND') + ')</span><span>' + total.toLocaleString() + '</span></div>')
  parts.push('</div></div>')

  // Notes
  if (data.remark) {
    parts.push('<div style="margin-top:12px;padding:8px 12px;background:#f9f9f9;border-left:3px solid #ccc;font-size:10px;color:#555;line-height:1.6">')
    parts.push('<div style="font-weight:700;color:#333;margin-bottom:4px">備註 / Ghi chú：</div>' + data.remark)
    parts.push('</div>')
  }

  // Footer signatures
  parts.push('<div class="footer">')
  parts.push('<div><div class="sign-box"><div class="sign-label">供應商確認 / NCC xác nhận：</div>')
  parts.push('<div style="font-size:10px;color:#888">FAN YONG CO., LTD</div></div></div>')
  parts.push('<div><div class="sign-box"><div class="sign-label">客戶簽章 / Khách hàng ký：</div>')
  parts.push('<div style="font-size:10px;color:#888">' + (data.customer_name || '') + '</div></div></div>')
  parts.push('</div>')

  parts.push('</body></html>')
  return parts.join('')
}
