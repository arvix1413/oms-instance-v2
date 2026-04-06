import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { query, queryOne, execute } from './db'
import { hashPw, signJwt, verifyJwt, now8 } from './auth'
import fs from 'fs'
import path from 'path'

type Variables = { user: any }
const app = new Hono<{ Variables: Variables }>()

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// ── Auth middleware ──────────────────────────────────────────────────────────
const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJwt(token)
  if (!payload) return c.json({ error: 'Invalid token' }, 401)
  c.set('user', payload)
  await next()
}

const isAdmin = async (c: any, next: () => Promise<void>) => {
  const user = c.get('user')
  if (user?.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  await next()
}

const canWrite = async (c: any, next: () => Promise<void>) => {
  const user = c.get('user')
  if (!['admin', 'manager', 'purchaser'].includes(user?.role)) return c.json({ error: 'Forbidden' }, 403)
  await next()
}

const canApprove = async (c: any, next: () => Promise<void>) => {
  const user = c.get('user')
  if (!['admin', 'manager'].includes(user?.role)) return c.json({ error: 'Forbidden' }, 403)
  await next()
}

// ── Audit ────────────────────────────────────────────────────────────────────
async function audit(user: any, action: string, resource: string, resourceId: any, detail?: string) {
  try {
    await execute(
      'INSERT INTO audit_logs (user_id, user_name, user_email, action, resource, resource_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [user?.userId || 0, user?.name || 'system', user?.email || '', action, resource, String(resourceId), detail || '', now8()]
    )
  } catch {}
}

app.get('/', c => c.json({ name: 'OMS Backend', version: '2.0.0' }))

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async c => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) return c.json({ error: 'Missing fields' }, 400)
    const user = await queryOne<any>('SELECT * FROM users WHERE email=?', [email])
    if (!user) return c.json({ error: 'Invalid credentials' }, 401)
    if (hashPw(password) !== user.password_hash) return c.json({ error: 'Invalid credentials' }, 401)
    const token = await signJwt({ userId: user.id, email: user.email, name: user.name, role: user.role })
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.get('/api/auth/me', authMiddleware, async c => {
  const u = c.get('user')
  const user = await queryOne<any>('SELECT id,email,name,role FROM users WHERE id=?', [u.userId])
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json({ user })
})

// ── Suppliers ────────────────────────────────────────────────────────────────
app.get('/api/suppliers', authMiddleware, async c => {
  const rows = await query('SELECT * FROM suppliers ORDER BY created_at DESC')
  return c.json(rows)
})
app.post('/api/suppliers', authMiddleware, async c => {
  try {
    const b = await c.req.json()
    if (!b.name) return c.json({ error: 'name required' }, 400)
    const r = await execute('INSERT INTO suppliers (name,supplier_code,tax_id,contact,phone,email,address,main_items,payment_terms,currency,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [b.name,b.supplier_code||'',b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_items||'',b.payment_terms||'',b.currency||'VND',b.status||'active',now8()])
    await audit(c.get('user'), 'CREATE', '供應商', r.insertId, b.name)
    return c.json({ id: r.insertId, ...b }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/suppliers/:id', authMiddleware, async c => {
  try {
    const id = c.req.param('id')
    const b = await c.req.json()
    await execute('UPDATE suppliers SET name=?,supplier_code=?,tax_id=?,contact=?,phone=?,email=?,address=?,main_items=?,payment_terms=?,currency=?,status=? WHERE id=?',
      [b.name,b.supplier_code||'',b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_items||'',b.payment_terms||'',b.currency||'VND',b.status||'active',id])
    await audit(c.get('user'), 'UPDATE', '供應商', id, b.name)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/suppliers/:id', authMiddleware, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT name FROM suppliers WHERE id=?', [id])
  await execute('DELETE FROM suppliers WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '供應商', id, row?.name)
  return c.json({ ok: true })
})

// ── Customers ────────────────────────────────────────────────────────────────
app.get('/api/customers', authMiddleware, async c => c.json(await query('SELECT * FROM customers ORDER BY created_at DESC')))
app.post('/api/customers', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    if (!b.customer_code || !b.customer_name) return c.json({ error: 'customer_code and customer_name required' }, 400)
    const r = await execute('INSERT INTO customers (customer_code,customer_name,tax_id,contact,phone,email,address,main_products,payment_terms,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [b.customer_code,b.customer_name,b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_products||'',b.payment_terms||'',b.status||'active',now8()])
    await audit(c.get('user'), 'CREATE', '客戶', r.insertId, `${b.customer_code} ${b.customer_name}`)
    return c.json({ id: r.insertId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/customers/:id', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    await execute('UPDATE customers SET customer_code=?,customer_name=?,tax_id=?,contact=?,phone=?,email=?,address=?,main_products=?,payment_terms=?,status=? WHERE id=?',
      [b.customer_code,b.customer_name,b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_products||'',b.payment_terms||'',b.status||'active',c.req.param('id')])
    await audit(c.get('user'), 'UPDATE', '客戶', c.req.param('id'), b.customer_name)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/customers/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT customer_name FROM customers WHERE id=?', [id])
  await execute('DELETE FROM customers WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '客戶', id, row?.customer_name)
  return c.json({ ok: true })
})

// ── Materials ────────────────────────────────────────────────────────────────
app.get('/api/materials', authMiddleware, async c => {
  const rows = await query('SELECT m.*, s.name as supplier_name, s.supplier_code FROM materials m LEFT JOIN suppliers s ON m.supplier_id=s.id ORDER BY m.created_at DESC')
  return c.json(rows)
})
app.post('/api/materials', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    if (!b.material_code || !b.material_name) return c.json({ error: 'material_code and material_name required' }, 400)
    const r = await execute('INSERT INTO materials (material_code,material_name,spec,unit,category,product_category,supplier_id,supplier_price,company_price,currency,stock,image_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [b.material_code,b.material_name,b.spec||'',b.unit||'PCS',b.category||'',b.product_category||'',b.supplier_id||null,b.supplier_price||0,b.company_price||0,b.currency||'VND',b.stock||0,b.image_url||'',now8()])
    return c.json({ id: r.insertId, ...b }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/materials/:id', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    await execute('UPDATE materials SET material_code=?,material_name=?,spec=?,unit=?,category=?,product_category=?,supplier_id=?,supplier_price=?,company_price=?,currency=?,stock=?,image_url=? WHERE id=?',
      [b.material_code,b.material_name,b.spec||'',b.unit||'PCS',b.category||'',b.product_category||'',b.supplier_id||null,b.supplier_price||0,b.company_price||0,b.currency||'VND',b.stock||0,b.image_url||'',c.req.param('id')])
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/materials/:id', authMiddleware, async c => {
  await execute('DELETE FROM materials WHERE id=?', [c.req.param('id')])
  return c.json({ ok: true })
})
app.post('/api/materials/bulk', authMiddleware, canWrite, async c => {
  try {
    const items = await c.req.json()
    let success = 0, updated = 0, newSuppliers = 0
    const errors: string[] = []
    for (const item of items) {
      try {
        let supplierId = null
        if (item.supplier_name) {
          let sup = await queryOne<any>('SELECT id FROM suppliers WHERE name=?', [item.supplier_name])
          if (!sup) {
            const r = await execute('INSERT INTO suppliers (name,currency,status,created_at) VALUES (?,?,?,?)', [item.supplier_name,'VND','active',now8()])
            supplierId = r.insertId; newSuppliers++
          } else { supplierId = sup.id }
        }
        const existing = await queryOne<any>('SELECT id FROM materials WHERE material_code=?', [item.material_code])
        if (existing) {
          await execute('UPDATE materials SET material_name=?,spec=?,unit=?,category=?,product_category=?,supplier_id=?,supplier_price=?,currency=? WHERE material_code=?',
            [item.material_name,item.spec||'',item.unit||'PCS',item.category||'',item.product_category||'',supplierId,item.supplier_price||0,item.currency||'VND',item.material_code])
          updated++
        } else {
          await execute('INSERT INTO materials (material_code,material_name,spec,unit,category,product_category,supplier_id,supplier_price,currency,stock,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.category||'',item.product_category||'',supplierId,item.supplier_price||0,item.currency||'VND',0,now8()])
          success++
        }
      } catch (e: any) { errors.push(`${item.material_code}: ${e.message}`) }
    }
    return c.json({ success, updated, new_suppliers: newSuppliers, errors })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── BOM ──────────────────────────────────────────────────────────────────────
app.get('/api/bom', authMiddleware, async c => c.json(await query('SELECT * FROM bom ORDER BY created_at DESC')))
app.get('/api/bom/:id', authMiddleware, async c => {
  const bom = await queryOne<any>('SELECT * FROM bom WHERE id=?', [c.req.param('id')])
  if (!bom) return c.json({ error: 'Not found' }, 404)
  const items = await query('SELECT * FROM bom_items WHERE bom_id=?', [c.req.param('id')])
  return c.json({ ...bom, items })
})
app.post('/api/bom', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    if (!b.product_sku || !b.product_name) return c.json({ error: 'product_sku and product_name required' }, 400)
    const u = c.get('user')
    const r = await execute('INSERT INTO bom (product_sku,product_name,version,status,created_by,created_at) VALUES (?,?,?,?,?,?)',
      [b.product_sku,b.product_name,b.version||'V1','active',u.userId,now8()])
    const bomId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO bom_items (bom_id,material_code,material_name,spec,unit,quantity,supplier_name,supplier_price,company_price,currency,remark,color,lt,moq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [bomId,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity||null,item.supplier_name||'',item.supplier_price||0,item.company_price||0,item.currency||'VND',item.remark||'',item.color||'',item.lt||'',item.moq||null])
      }
    }
    await audit(u, 'CREATE', 'BOM', bomId, `${b.product_sku} ${b.product_name}`)
    return c.json({ id: bomId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/bom/:id', authMiddleware, canWrite, async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    await execute('UPDATE bom SET product_sku=?,product_name=?,version=? WHERE id=?',
      [b.product_sku,b.product_name,b.version||'V1',id])
    await execute('DELETE FROM bom_items WHERE bom_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO bom_items (bom_id,material_code,material_name,spec,unit,quantity,supplier_name,supplier_price,company_price,currency,remark,color,lt,moq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [id,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity||null,item.supplier_name||'',item.supplier_price||0,item.company_price||0,item.currency||'VND',item.remark||'',item.color||'',item.lt||'',item.moq||null])
      }
    }
    await audit(u, 'UPDATE', 'BOM', id, `${b.product_sku} ${b.product_name}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/bom/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT product_sku,product_name FROM bom WHERE id=?', [id])
  await execute('DELETE FROM bom_items WHERE bom_id=?', [id])
  await execute('DELETE FROM bom WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', 'BOM', id, `${row?.product_sku} ${row?.product_name}`)
  return c.json({ ok: true })
})

// ── Purchase Orders ───────────────────────────────────────────────────────────
app.get('/api/po', authMiddleware, async c => c.json(await query('SELECT * FROM purchase_orders ORDER BY created_at DESC')))
app.get('/api/po/:id', authMiddleware, async c => {
  const po = await queryOne<any>('SELECT * FROM purchase_orders WHERE id=?', [c.req.param('id')])
  if (!po) return c.json({ error: 'Not found' }, 404)
  const items = await query('SELECT * FROM po_items WHERE po_id=?', [c.req.param('id')])
  return c.json({ ...po, items })
})
app.post('/api/po', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    const u = c.get('user')
    const poNum = `PO${Date.now()}`
    const total = (b.items||[]).reduce((s: number, i: any) => s + (i.total_price||0), 0)
    const r = await execute('INSERT INTO purchase_orders (po_number,supplier_id,supplier_name,status,total_amount,currency,created_by,remark,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [poNum,b.supplier_id||null,b.supplier_name,'draft',total,b.currency||'VND',u.userId,b.remark||'',now8()])
    const poId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        const tp = (item.quantity||0)*(item.unit_price||0)
        await execute('INSERT INTO po_items (po_id,material_code,material_name,spec,unit,quantity,unit_price,total_price,currency,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [poId,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity,item.unit_price||0,tp,item.currency||'VND',item.remark||'',item.po_ref||'',item.thickness||null])
      }
    }
    await audit(u, 'CREATE', '採購單', poId, poNum)
    return c.json({ id: poId, po_number: poNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/po/:id/approve', authMiddleware, canApprove, async c => {
  try {
    const id = c.req.param('id'); const u = c.get('user')
    const row = await queryOne<any>('SELECT po_number FROM purchase_orders WHERE id=?', [id])
    await execute('UPDATE purchase_orders SET status=?,approved_by=?,approved_at=? WHERE id=?', ['approved',u.userId,now8(),id])
    await audit(u, 'APPROVE', '採購單', id, row?.po_number)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/po/:id/status', authMiddleware, async c => {
  try {
    const id = c.req.param('id'); const { status } = await c.req.json()
    const row = await queryOne<any>('SELECT po_number FROM purchase_orders WHERE id=?', [id])
    await execute('UPDATE purchase_orders SET status=? WHERE id=?', [status,id])
    await audit(c.get('user'), 'STATUS_CHANGE', '採購單', id, `${row?.po_number} → ${status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/po/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT po_number FROM purchase_orders WHERE id=?', [id])
  await execute('DELETE FROM po_items WHERE po_id=?', [id])
  await execute('DELETE FROM purchase_orders WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '採購單', id, row?.po_number)
  return c.json({ ok: true })
})

// ── Customer Orders ───────────────────────────────────────────────────────────
app.get('/api/customer-orders', authMiddleware, async c => c.json(await query('SELECT * FROM customer_orders ORDER BY created_at DESC')))
app.get('/api/customer-orders/:id', authMiddleware, async c => {
  const order = await queryOne<any>('SELECT * FROM customer_orders WHERE id=?', [c.req.param('id')])
  if (!order) return c.json({ error: 'Not found' }, 404)
  const items = await query('SELECT * FROM customer_order_items WHERE order_id=?', [c.req.param('id')])
  return c.json({ ...order, items })
})
app.post('/api/customer-orders', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    if (!b.po_number || !b.customer_name) return c.json({ error: 'po_number and customer_name required' }, 400)
    const r = await execute('INSERT INTO customer_orders (po_date,po_number,customer_id,customer_name,status,remark,created_at) VALUES (?,?,?,?,?,?,?)',
      [b.po_date||null,b.po_number,b.customer_id||null,b.customer_name,b.status||'pending',b.remark||'',now8()])
    const orderId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO customer_order_items (order_id,item_name,material_code,spec,thickness,unit,qty,unit_price,rta_date,arrived_qty,arrived_date,balance,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [orderId,item.item_name,item.material_code||'',item.spec||'',item.thickness||null,item.unit||'PCS',item.qty,item.unit_price||0,item.rta_date||null,item.arrived_qty||0,item.arrived_date||null,item.qty-(item.arrived_qty||0),item.status||'pending'])
      }
    }
    await audit(c.get('user'), 'CREATE', '客戶訂單', orderId, `${b.po_number} / ${b.customer_name}`)
    return c.json({ id: orderId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/customer-orders/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT po_number,customer_name FROM customer_orders WHERE id=?', [id])
  await execute('DELETE FROM customer_order_items WHERE order_id=?', [id])
  await execute('DELETE FROM customer_orders WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '客戶訂單', id, `${row?.po_number} / ${row?.customer_name}`)
  return c.json({ ok: true })
})

// ── Quotations ────────────────────────────────────────────────────────────────
app.get('/api/quotations', authMiddleware, async c => c.json(await query('SELECT * FROM quotations ORDER BY created_at DESC')))
app.get('/api/quotations/:id', authMiddleware, async c => {
  const q = await queryOne<any>('SELECT * FROM quotations WHERE id=?', [c.req.param('id')])
  if (!q) return c.json({ error: 'Not found' }, 404)
  const items = await query('SELECT * FROM quotation_items WHERE quotation_id=?', [c.req.param('id')])
  return c.json({ ...q, items })
})
app.post('/api/quotations', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    const qNum = `QT${Date.now()}`
    const total = (b.items||[]).reduce((s: number, i: any) => s + (i.total_price||0), 0)
    const r = await execute('INSERT INTO quotations (quotation_number,customer_id,customer_name,status,total_amount,currency,valid_until,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [qNum,b.customer_id||null,b.customer_name,'draft',total,b.currency||'VND',b.valid_until||null,b.remark||'',u.userId,now8()])
    const qId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO quotation_items (quotation_id,item_name,material_code,spec,unit,qty,unit_price,total_price,remark,moq) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [qId,item.item_name,item.material_code||'',item.spec||'',item.unit||'PCS',item.qty,item.unit_price||0,(item.qty||0)*(item.unit_price||0),item.remark||'',item.moq||null])
      }
    }
    await audit(u, 'CREATE', '報價單', qId, `${qNum} / ${b.customer_name}`)
    return c.json({ id: qId, quotation_number: qNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/quotations/:id/status', authMiddleware, canApprove, async c => {
  const id = c.req.param('id'); const { status } = await c.req.json()
  const row = await queryOne<any>('SELECT quotation_number,customer_name FROM quotations WHERE id=?', [id])
  await execute('UPDATE quotations SET status=? WHERE id=?', [status,id])
  await audit(c.get('user'), 'STATUS_CHANGE', '報價單', id, `${row?.quotation_number} → ${status}`)
  return c.json({ ok: true })
})
app.delete('/api/quotations/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT quotation_number,customer_name FROM quotations WHERE id=?', [id])
  await execute('DELETE FROM quotation_items WHERE quotation_id=?', [id])
  await execute('DELETE FROM quotations WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '報價單', id, `${row?.quotation_number} / ${row?.customer_name}`)
  return c.json({ ok: true })
})

// ── Delivery Notes ────────────────────────────────────────────────────────────
app.get('/api/delivery-notes', authMiddleware, async c => c.json(await query('SELECT * FROM delivery_notes ORDER BY created_at DESC')))
app.get('/api/delivery-notes/:id', authMiddleware, async c => {
  const dn = await queryOne<any>('SELECT * FROM delivery_notes WHERE id=?', [c.req.param('id')])
  if (!dn) return c.json({ error: 'Not found' }, 404)
  const items = await query('SELECT * FROM delivery_note_items WHERE dn_id=?', [c.req.param('id')])
  return c.json({ ...dn, items })
})
app.post('/api/delivery-notes', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    const dnNum = `DN${Date.now()}`
    const r = await execute('INSERT INTO delivery_notes (dn_number,customer_id,customer_name,customer_order_id,delivery_date,status,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [dnNum,b.customer_id||null,b.customer_name,b.customer_order_id||null,b.delivery_date||null,'draft',b.remark||'',u.userId,now8()])
    const dnId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO delivery_note_items (dn_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?)',
          [dnId,item.item_name,item.material_code||'',item.spec||'',item.unit||'PCS',item.qty,item.remark||'',item.po_ref||'',item.thickness||null])
      }
    }
    await audit(u, 'CREATE', '出貨單', dnId, `${dnNum} / ${b.customer_name}`)
    return c.json({ id: dnId, dn_number: dnNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/delivery-notes/:id/status', authMiddleware, canApprove, async c => {
  const id = c.req.param('id'); const { status } = await c.req.json()
  const row = await queryOne<any>('SELECT dn_number,customer_name FROM delivery_notes WHERE id=?', [id])
  await execute('UPDATE delivery_notes SET status=? WHERE id=?', [status,id])
  await audit(c.get('user'), 'STATUS_CHANGE', '出貨單', id, `${row?.dn_number} → ${status}`)
  return c.json({ ok: true })
})
app.delete('/api/delivery-notes/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT dn_number,customer_name FROM delivery_notes WHERE id=?', [id])
  await execute('DELETE FROM delivery_note_items WHERE dn_id=?', [id])
  await execute('DELETE FROM delivery_notes WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '出貨單', id, `${row?.dn_number} / ${row?.customer_name}`)
  return c.json({ ok: true })
})

// ── Inventory ─────────────────────────────────────────────────────────────────
app.get('/api/inventory', authMiddleware, async c => c.json(await query('SELECT * FROM inventory ORDER BY product_code')))
app.post('/api/inventory', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    const closing = (b.opening_balance||0)+(b.inbound_qty||0)-(b.outbound_qty||0)
    const r = await execute('INSERT INTO inventory (product_code,product_name,spec,unit,opening_balance,inbound_qty,outbound_qty,closing_balance,warehouse_location,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [b.product_code,b.product_name,b.spec||'',b.unit||'PCS',b.opening_balance||0,b.inbound_qty||0,b.outbound_qty||0,closing,b.warehouse_location||'',b.remark||''])
    await audit(c.get('user'), 'CREATE', '庫存', r.insertId, `${b.product_code} ${b.product_name}`)
    return c.json({ id: r.insertId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/inventory/:id', authMiddleware, canWrite, async c => {
  try {
    const b = await c.req.json()
    const closing = (b.opening_balance||0)+(b.inbound_qty||0)-(b.outbound_qty||0)
    await execute('UPDATE inventory SET product_code=?,product_name=?,spec=?,unit=?,opening_balance=?,inbound_qty=?,outbound_qty=?,closing_balance=?,warehouse_location=?,remark=? WHERE id=?',
      [b.product_code,b.product_name,b.spec||'',b.unit||'PCS',b.opening_balance||0,b.inbound_qty||0,b.outbound_qty||0,closing,b.warehouse_location||'',b.remark||'',c.req.param('id')])
    await audit(c.get('user'), 'UPDATE', '庫存', c.req.param('id'), `${b.product_code} ${b.product_name}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/inventory/:id', authMiddleware, canApprove, async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT product_code,product_name FROM inventory WHERE id=?', [id])
  await execute('DELETE FROM inventory WHERE id=?', [id])
  await audit(c.get('user'), 'DELETE', '庫存', id, `${row?.product_code} ${row?.product_name}`)
  return c.json({ ok: true })
})

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', authMiddleware, isAdmin, async c => c.json(await query('SELECT id,email,name,role,created_at FROM users ORDER BY created_at DESC')))
app.post('/api/users', authMiddleware, isAdmin, async c => {
  try {
    const { email, password, name, role } = await c.req.json()
    if (!email || !password || !name) return c.json({ error: 'Missing fields' }, 400)
    const existing = await queryOne('SELECT id FROM users WHERE email=?', [email])
    if (existing) return c.json({ error: 'Email already exists' }, 409)
    const r = await execute('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)', [email,hashPw(password),name,role||'viewer'])
    await audit(c.get('user'), 'CREATE', '用戶', r.insertId, `${email} (${role})`)
    return c.json({ id: r.insertId, email, name, role }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/users/:id', authMiddleware, isAdmin, async c => {
  try {
    const id = c.req.param('id'); const { name, role, password } = await c.req.json()
    if (password) {
      await execute('UPDATE users SET name=?,role=?,password_hash=? WHERE id=?', [name,role,hashPw(password),id])
    } else {
      await execute('UPDATE users SET name=?,role=? WHERE id=?', [name,role,id])
    }
    await audit(c.get('user'), 'UPDATE', '用戶', id, `${name} → ${role}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/users/:id', authMiddleware, isAdmin, async c => {
  const u = c.get('user'); const id = c.req.param('id')
  if (String(u.userId) === id) return c.json({ error: 'Cannot delete yourself' }, 400)
  const row = await queryOne<any>('SELECT email,name FROM users WHERE id=?', [id])
  await execute('DELETE FROM users WHERE id=?', [id])
  await audit(u, 'DELETE', '用戶', id, `${row?.email} (${row?.name})`)
  return c.json({ ok: true })
})

// ── Role Permissions ──────────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { key: 'material.create', label: '新增料號' }, { key: 'material.edit', label: '編輯料號' }, { key: 'material.delete', label: '刪除料號' },
  { key: 'supplier.create', label: '新增供應商' }, { key: 'supplier.edit', label: '編輯供應商' }, { key: 'supplier.delete', label: '刪除供應商' },
  { key: 'bom.create', label: '新增BOM' }, { key: 'bom.delete', label: '刪除BOM' },
  { key: 'po.create', label: '新增採購單' }, { key: 'po.approve', label: '核准採購單' }, { key: 'po.delete', label: '刪除採購單' },
  { key: 'user.manage', label: '用戶管理' },
]
app.get('/api/role-permissions', authMiddleware, async c => {
  try {
    const rows = await query<any>('SELECT role,permission,allowed FROM role_permissions')
    const map: any = {}
    rows.forEach(r => { if (!map[r.role]) map[r.role] = {}; map[r.role][r.permission] = r.allowed === 1 })
    return c.json({ permissions: map, allPermissions: ALL_PERMISSIONS })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/role-permissions', authMiddleware, isAdmin, async c => {
  try {
    const { role, permission, allowed } = await c.req.json()
    if (role === 'admin') return c.json({ error: 'Cannot modify admin permissions' }, 400)
    await execute('INSERT INTO role_permissions (role,permission,allowed) VALUES (?,?,?) ON DUPLICATE KEY UPDATE allowed=?', [role,permission,allowed?1:0,allowed?1:0])
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Audit Logs ────────────────────────────────────────────────────────────────
app.get('/api/audit-logs', authMiddleware, isAdmin, async c => {
  try {
    const url = new URL(c.req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const resource = url.searchParams.get('resource') || ''
    const user_email = url.searchParams.get('user_email') || ''
    const params: any[] = []
    const where: string[] = []
    if (resource) { where.push('resource=?'); params.push(resource) }
    if (user_email) { where.push('user_email LIKE ?'); params.push(`%${user_email}%`) }
    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : ''
    // Embed LIMIT/OFFSET directly to avoid mysql2 prepared statement issues
    const sql = `SELECT * FROM audit_logs${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    const countSql = `SELECT COUNT(*) as cnt FROM audit_logs${whereClause}`
    const [logs, totalRow] = await Promise.all([
      query(sql, params),
      queryOne<any>(countSql, params)
    ])
    return c.json({ logs, total: totalRow?.cnt || 0 })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── 應收帳款 (Receivables) ────────────────────────────────────────────────────
// 來源：出貨單已出貨 → 待收款；可標記已收款
app.get('/api/receivables', authMiddleware, async c => {
  try {
    const rows = await query<any>(`
      SELECT dn.id, dn.dn_number, dn.customer_name, dn.delivery_date, dn.status,
             dn.remark, dn.created_at,
             COALESCE(dn.received_amount, 0) as received_amount,
             COALESCE(dn.invoice_amount, 0) as invoice_amount,
             dn.payment_status, dn.payment_date, dn.payment_note,
             co.po_number as customer_po
      FROM delivery_notes dn
      LEFT JOIN customer_orders co ON dn.customer_order_id = co.id
      WHERE dn.status = 'shipped'
      ORDER BY dn.delivery_date DESC, dn.created_at DESC
    `)
    return c.json(rows)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/receivables/:id/payment', authMiddleware, canWrite, async c => {
  try {
    const id = c.req.param('id')
    const { payment_status, received_amount, payment_date, payment_note } = await c.req.json()
    await execute(
      'UPDATE delivery_notes SET payment_status=?, received_amount=?, payment_date=?, payment_note=? WHERE id=?',
      [payment_status, received_amount||0, payment_date||null, payment_note||'', id]
    )
    const row = await queryOne<any>('SELECT dn_number, customer_name FROM delivery_notes WHERE id=?', [id])
    await audit(c.get('user'), 'PAYMENT', '應收帳款', id, `${row?.dn_number} ${payment_status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── 應付帳款 (Payables) ───────────────────────────────────────────────────────
// 來源：採購單已核准/已發送/已收貨 → 待付款；可標記已付款
app.get('/api/payables', authMiddleware, async c => {
  try {
    const rows = await query<any>(`
      SELECT id, po_number, supplier_name, total_amount, currency, status,
             COALESCE(paid_amount, 0) as paid_amount,
             payment_status, payment_date, payment_note, created_at, approved_at
      FROM purchase_orders
      WHERE status IN ('approved', 'sent', 'received')
      ORDER BY created_at DESC
    `)
    return c.json(rows)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/payables/:id/payment', authMiddleware, canWrite, async c => {
  try {
    const id = c.req.param('id')
    const { payment_status, paid_amount, payment_date, payment_note } = await c.req.json()
    await execute(
      'UPDATE purchase_orders SET payment_status=?, paid_amount=?, payment_date=?, payment_note=? WHERE id=?',
      [payment_status, paid_amount||0, payment_date||null, payment_note||'', id]
    )
    const row = await queryOne<any>('SELECT po_number, supplier_name FROM purchase_orders WHERE id=?', [id])
    await audit(c.get('user'), 'PAYMENT', '應付帳款', id, `${row?.po_number} ${payment_status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── 報表 (Reports) ────────────────────────────────────────────────────────────
app.get('/api/reports', authMiddleware, async c => {
  try {
    const url = new URL(c.req.url)
    const year = url.searchParams.get('year') || new Date().getFullYear().toString()

    // 應收：出貨單已出貨的 invoice_amount，按月
    const receivables = await query<any>(`
      SELECT DATE_FORMAT(COALESCE(payment_date, delivery_date, created_at), '%Y-%m') as month,
             SUM(COALESCE(invoice_amount, 0)) as invoiced,
             SUM(CASE WHEN payment_status='paid' THEN COALESCE(received_amount, 0) ELSE 0 END) as received,
             COUNT(*) as count
      FROM delivery_notes
      WHERE status='shipped' AND DATE_FORMAT(COALESCE(delivery_date, created_at), '%Y') = ?
      GROUP BY month ORDER BY month
    `, [year])

    // 應付：採購單已核准以上，按月
    const payables = await query<any>(`
      SELECT DATE_FORMAT(COALESCE(payment_date, approved_at, created_at), '%Y-%m') as month,
             SUM(total_amount) as total,
             SUM(CASE WHEN payment_status='paid' THEN COALESCE(paid_amount, 0) ELSE 0 END) as paid,
             COUNT(*) as count
      FROM purchase_orders
      WHERE status IN ('approved','sent','received') AND DATE_FORMAT(created_at, '%Y') = ?
      GROUP BY month ORDER BY month
    `, [year])

    // 匯總
    const summary = await queryOne<any>(`
      SELECT
        (SELECT COALESCE(SUM(invoice_amount),0) FROM delivery_notes WHERE status='shipped') as total_invoiced,
        (SELECT COALESCE(SUM(received_amount),0) FROM delivery_notes WHERE status='shipped' AND payment_status='paid') as total_received,
        (SELECT COALESCE(SUM(invoice_amount),0) FROM delivery_notes WHERE status='shipped' AND (payment_status IS NULL OR payment_status!='paid')) as total_outstanding_receivable,
        (SELECT COALESCE(SUM(total_amount),0) FROM purchase_orders WHERE status IN ('approved','sent','received')) as total_payable,
        (SELECT COALESCE(SUM(paid_amount),0) FROM purchase_orders WHERE payment_status='paid') as total_paid,
        (SELECT COALESCE(SUM(total_amount),0) FROM purchase_orders WHERE status IN ('approved','sent','received') AND (payment_status IS NULL OR payment_status!='paid')) as total_outstanding_payable
    `)

    return c.json({ receivables, payables, summary, year })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', authMiddleware, async c => {
  try {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const [materials, suppliers, customers, po, orders, monthOrders, allSales] = await Promise.all([
      queryOne<any>('SELECT COUNT(*) as cnt FROM materials'),
      queryOne<any>('SELECT COUNT(*) as cnt FROM suppliers'),
      queryOne<any>('SELECT COUNT(*) as cnt FROM customers'),
      queryOne<any>("SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE status='received'"),
      queryOne<any>('SELECT COUNT(*) as cnt FROM customer_orders'),
      queryOne<any>('SELECT COUNT(*) as cnt, COALESCE(SUM(ci.qty*ci.unit_price),0) as total FROM customer_orders co JOIN customer_order_items ci ON ci.order_id=co.id WHERE co.po_date>=?', [monthStart]),
      queryOne<any>('SELECT COALESCE(SUM(ci.qty*ci.unit_price),0) as total, MIN(co.po_date) as earliest, MAX(co.po_date) as latest FROM customer_orders co JOIN customer_order_items ci ON ci.order_id=co.id'),
    ])
    return c.json({
      materials: materials?.cnt||0, suppliers: suppliers?.cnt||0, customers: customers?.cnt||0,
      po_count: po?.cnt||0, po_total: po?.total||0, orders_count: orders?.cnt||0,
      month_orders: monthOrders?.cnt||0, month_sales: monthOrders?.total||0,
      total_sales: allSales?.total||0,
      sales_date_range: allSales?.earliest ? `${allSales.earliest} ~ ${allSales.latest}` : '',
    })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Upload ────────────────────────────────────────────────────────────────────
app.post('/api/upload', authMiddleware, async c => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    if (!file) return c.json({ error: 'No file' }, 400)
    const uploadDir = process.env.UPLOAD_DIR || '/app/uploads'
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
    const ext = path.extname(file.name) || '.bin'
    const filename = `${Date.now()}${ext}`
    const filepath = path.join(uploadDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)
    const baseUrl = process.env.BASE_URL || `http://43.133.56.234:3001`
    return c.json({ url: `${baseUrl}/uploads/${filename}` })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// Serve uploaded files
app.get('/uploads/*', async c => {
  const filename = c.req.path.replace('/uploads/', '')
  const uploadDir = process.env.UPLOAD_DIR || '/app/uploads'
  const filepath = path.join(uploadDir, filename)
  if (!fs.existsSync(filepath)) return c.json({ error: 'Not found' }, 404)
  const data = fs.readFileSync(filepath)
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string,string> = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp' }
  return new Response(data, { headers: { 'Content-Type': mimeTypes[ext]||'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' } })
})

// ── Start server ──────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT || '3001')
console.log(`OMS Backend starting on port ${port}`)
serve({ fetch: app.fetch, port }, info => {
  console.log(`✓ Server running at http://localhost:${info.port}`)
})
