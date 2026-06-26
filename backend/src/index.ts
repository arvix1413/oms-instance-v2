import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { query, queryOne, execute } from './db'
import { hashPw, signJwt, verifyJwt, now8 } from './auth'
import { sendNotificationEmail, buildPendingApprovalEmail } from './mailer'
import fs from 'fs'
import path from 'path'

type Variables = { user: any }
const app = new Hono<{ Variables: Variables }>()
const normalizeUserRole = (role: any): 'manager' | 'employee' => (role === 'manager' ? 'manager' : 'employee')

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.use('/api/*', async (_c, next) => {
  await ensureSoftDeleteColumns()
  await ensureMaterialReferenceColumns()
  await ensureCompanySignatureColumn()
  await next()
})

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

// Dynamic RBAC permission check — manager always pass, employee checks role_permissions
async function hasPermission(user: any, permKey: string) {
  if (!user) return false
  if (user.role === 'manager') return true
  const row = await queryOne<any>(
    'SELECT allowed FROM role_permissions WHERE role=? AND permission=? AND allowed=1',
    [normalizeUserRole(user.role), permKey]
  )
  return !!row
}

function requirePerm(permKey: string) {
  return async (c: any, next: () => Promise<void>) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    if (!await hasPermission(user, permKey)) return c.json({ error: `無此操作權限（${permKey}）` }, 403)
    return next()
  }
}

// Convenience wrappers — kept for any remaining legacy usage
const canWrite = requirePerm('po.create')
const canApprove = requirePerm('po.approve')
const requireManager = async (c: any, next: () => Promise<void>) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  if (normalizeUserRole(user.role) !== 'manager') return c.json({ error: 'Forbidden' }, 403)
  await next()
}

const PROFIT_ENTRY_CATEGORIES = [
  'operating_cost',
  'logistics',
  'platform_fee',
  'other_cost',
  'sales_tax',
  'income_tax',
  'manual_adjustment',
] as const

const toAmount = (value: any): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100) / 100
}

const calcMargin = (netProfit: number, revenue: number): number => {
  if (revenue <= 0) return 0
  return Math.round((netProfit / revenue) * 10000) / 100
}

const toRate = (value: any): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  if (num < 0) return 0
  if (num > 100) return 100
  return Math.round(num * 10000) / 10000
}

const pctAmount = (base: number, ratePct: number): number => toAmount(base * (ratePct / 100))

const AUTO_RATE_PREFIX = '【自動比例】'

type MoqTier = { moq: number; price: number }
const normalizeMoqTiers = (raw: any): MoqTier[] => {
  const src = Array.isArray(raw) ? raw : []
  return src
    .map((row: any) => ({
      moq: Math.max(0, Number(row?.moq) || 0),
      price: Math.max(0, Number(row?.price) || 0),
    }))
    .filter((row: MoqTier) => row.moq > 0 || row.price > 0)
    .sort((a: MoqTier, b: MoqTier) => a.moq - b.moq)
}
const parseMoqTiersFromDb = (raw: any): MoqTier[] => {
  if (!raw) return []
  try {
    return normalizeMoqTiers(JSON.parse(String(raw)))
  } catch {
    return []
  }
}

let ensureProfitTrackingTablePromise: Promise<void> | null = null
const ensureProfitTrackingTable = async () => {
  if (!ensureProfitTrackingTablePromise) {
    ensureProfitTrackingTablePromise = (async () => {
      await execute(`
        CREATE TABLE IF NOT EXISTS order_profit_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          category VARCHAR(50) NOT NULL,
          description VARCHAR(255) DEFAULT '',
          amount DECIMAL(15,2) NOT NULL DEFAULT 0,
          remark TEXT,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_order_profit_entries_order_id (order_id),
          CONSTRAINT fk_order_profit_entries_order FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE CASCADE
        )
      `)
    })().catch((e) => {
      ensureProfitTrackingTablePromise = null
      throw e
    })
  }
  await ensureProfitTrackingTablePromise
}

let ensureBomMoqTiersPromise: Promise<void> | null = null
const ensureBomMoqTiersColumn = async () => {
  if (!ensureBomMoqTiersPromise) {
    ensureBomMoqTiersPromise = (async () => {
      try {
        await execute('ALTER TABLE bom ADD COLUMN moq_tiers TEXT NULL')
      } catch (e: any) {
        const msg = String(e?.message || '').toLowerCase()
        if (!msg.includes('duplicate column')) throw e
      }
    })().catch((e) => {
      ensureBomMoqTiersPromise = null
      throw e
    })
  }
  await ensureBomMoqTiersPromise
}

let ensureCompanyProfitRatesPromise: Promise<void> | null = null
const ensureCompanyProfitRatesColumns = async () => {
  if (!ensureCompanyProfitRatesPromise) {
    ensureCompanyProfitRatesPromise = (async () => {
      const alterSafe = async (sql: string) => {
        try {
          await execute(sql)
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase()
          if (!msg.includes('duplicate column')) throw e
        }
      }
      await alterSafe('ALTER TABLE company_settings ADD COLUMN operating_cost_rate DECIMAL(8,4) NOT NULL DEFAULT 0')
      await alterSafe('ALTER TABLE company_settings ADD COLUMN vat_rate DECIMAL(8,4) NOT NULL DEFAULT 0')
      await alterSafe('ALTER TABLE company_settings ADD COLUMN cit_rate DECIMAL(8,4) NOT NULL DEFAULT 0')
    })().catch((e) => {
      ensureCompanyProfitRatesPromise = null
      throw e
    })
  }
  await ensureCompanyProfitRatesPromise
}

let ensureCompanySignaturePromise: Promise<void> | null = null
const ensureCompanySignatureColumn = async () => {
  if (!ensureCompanySignaturePromise) {
    ensureCompanySignaturePromise = (async () => {
      try {
        await execute('ALTER TABLE company_settings ADD COLUMN signature_url TEXT NULL')
      } catch (e: any) {
        const msg = String(e?.message || '').toLowerCase()
        if (!msg.includes('duplicate column')) throw e
      }
    })().catch((e) => {
      ensureCompanySignaturePromise = null
      throw e
    })
  }
  await ensureCompanySignaturePromise
}

let ensureCompanySignaturePrintPromise: Promise<void> | null = null
const ensureCompanySignaturePrintColumns = async () => {
  if (!ensureCompanySignaturePrintPromise) {
    ensureCompanySignaturePrintPromise = (async () => {
      const alterSafe = async (sql: string) => {
        try {
          await execute(sql)
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase()
          if (!msg.includes('duplicate column')) throw e
        }
      }
      await alterSafe('ALTER TABLE company_settings ADD COLUMN signature_print_width INT NOT NULL DEFAULT 220')
      await alterSafe('ALTER TABLE company_settings ADD COLUMN signature_print_height INT NOT NULL DEFAULT 72')
    })().catch((e) => {
      ensureCompanySignaturePrintPromise = null
      throw e
    })
  }
  await ensureCompanySignaturePrintPromise
}

let ensureCompanyNotificationEmailPromise: Promise<void> | null = null
const ensureCompanyNotificationEmail = async () => {
  if (!ensureCompanyNotificationEmailPromise) {
    ensureCompanyNotificationEmailPromise = (async () => {
      try {
        await execute('ALTER TABLE company_settings ADD COLUMN notification_email VARCHAR(255) NULL')
      } catch (e: any) {
        const msg = String(e?.message || '').toLowerCase()
        if (!msg.includes('duplicate column')) throw e
      }
    })().catch((e) => {
      ensureCompanyNotificationEmailPromise = null
      throw e
    })
  }
  await ensureCompanyNotificationEmailPromise
}
const SOFT_DELETE_TABLES = [
  'suppliers',
  'customers',
  'bom',
  'purchase_orders',
  'customer_orders',
  'quotations',
  'delivery_notes',
  'delivery_sheets',
  'inventory',
  'users',
  'goods_receipts',
  'production_orders',
  'stock_adjustments',
  'order_profit_entries',
] as const

let ensureSoftDeleteColumnsPromise: Promise<void> | null = null
const ensureSoftDeleteColumns = async () => {
  if (!ensureSoftDeleteColumnsPromise) {
    ensureSoftDeleteColumnsPromise = (async () => {
      const alterSafe = async (sql: string) => {
        try {
          await execute(sql)
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase()
          if (msg.includes('duplicate column')) return
          if (msg.includes("doesn't exist") || msg.includes('unknown table')) return
          throw e
        }
      }
      await ensureProfitTrackingTable()
      for (const table of SOFT_DELETE_TABLES) {
        await alterSafe(`ALTER TABLE ${table} ADD COLUMN deleted_at DATETIME NULL`)
        await alterSafe(`ALTER TABLE ${table} ADD COLUMN deleted_by INT NULL`)
      }
    })().catch((e) => {
      ensureSoftDeleteColumnsPromise = null
      throw e
    })
  }
  await ensureSoftDeleteColumnsPromise
}

const softDeleteById = async (table: string, id: any, userId: any) => {
  await execute(`UPDATE ${table} SET deleted_at=?, deleted_by=? WHERE id=? AND deleted_at IS NULL`, [now8(), userId || null, id])
}

const toQty = (value: any): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 10000) / 10000
}

const toDateStr = (value: any): string => {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Match DN line → order line; supports multiple order lines sharing the same bom_id. */
const resolveOrderItemIdForDnLine = async (
  customerOrderId: number,
  params: { orderItemId?: number | null; bomId?: number | null; qty?: number | null; materialCode?: string; itemName?: string },
  usedOrderItemIds?: Set<number>,
): Promise<number | null> => {
  const direct = Number(params.orderItemId || 0)
  if (direct > 0) return direct
  const orderId = Number(customerOrderId || 0)
  if (orderId <= 0) return null

  const bomId = Number(params.bomId || 0)
  const dnQty = toQty(params.qty)
  if (bomId > 0) {
    const candidates = await query<any>(
      `SELECT ci.id, ci.qty
       FROM customer_order_items ci
       WHERE ci.order_id=? AND ci.bom_id=?
       ORDER BY ci.id ASC`,
      [orderId, bomId],
    )
    const available = candidates.filter((row: any) => !usedOrderItemIds?.has(Number(row.id)))
    if (available.length === 1) return Number(available[0].id)
    if (dnQty > 0) {
      const exact = available.find((row: any) => Math.abs(toQty(row.qty) - dnQty) < 0.0001)
      if (exact) return Number(exact.id)
    }
    if (available[0]?.id) return Number(available[0].id)
  }

  const code = String(params.materialCode || '').trim()
  if (code) {
    const bySku = await queryOne<any>(`
      SELECT ci.id
      FROM customer_order_items ci
      JOIN bom b ON b.id = ci.bom_id AND b.deleted_at IS NULL
      WHERE ci.order_id=? AND TRIM(COALESCE(b.product_sku, '')) = ?
      ORDER BY ci.id ASC
      LIMIT 1
    `, [orderId, code])
    if (bySku?.id) return Number(bySku.id)
  }

  const name = String(params.itemName || '').trim()
  if (name) {
    const byName = await queryOne<any>(`
      SELECT ci.id
      FROM customer_order_items ci
      JOIN bom b ON b.id = ci.bom_id AND b.deleted_at IS NULL
      WHERE ci.order_id=? AND TRIM(COALESCE(b.product_name, '')) = ?
      ORDER BY ci.id ASC
      LIMIT 1
    `, [orderId, name])
    if (byName?.id) return Number(byName.id)
  }

  return null
}

const buildShippedQtyByOrderItemId = async (): Promise<Map<number, number>> => {
  const shippedByOrderItem = new Map<number, number>()
  const dniRows = await query<any>(`
    SELECT dni.id, dni.order_item_id, dni.bom_id, dni.material_code, dni.item_name,
           COALESCE(dni.qty, 0) as qty, dn.customer_order_id
    FROM delivery_note_items dni
    JOIN delivery_notes dn ON dn.id = dni.dn_id AND dn.deleted_at IS NULL
    WHERE dn.status='shipped'
  `)

  const usedByOrder = new Map<number, Set<number>>()
  for (const row of dniRows) {
    const orderId = Number(row.customer_order_id || 0)
    if (!usedByOrder.has(orderId)) usedByOrder.set(orderId, new Set<number>())
    const used = usedByOrder.get(orderId)!

    let orderItemId = Number(row.order_item_id || 0)
    if (!orderItemId) {
      orderItemId = (await resolveOrderItemIdForDnLine(orderId, {
        bomId: row.bom_id,
        qty: row.qty,
        materialCode: row.material_code,
        itemName: row.item_name,
      }, used)) || 0
      if (orderItemId) {
        await execute('UPDATE delivery_note_items SET order_item_id=? WHERE id=?', [orderItemId, row.id])
        used.add(orderItemId)
      }
    } else {
      used.add(orderItemId)
    }
    if (!orderItemId) continue
    shippedByOrderItem.set(orderItemId, toQty((shippedByOrderItem.get(orderItemId) || 0) + toQty(row.qty)))
  }
  return shippedByOrderItem
}

const recalcCustomerOrderStatus = async (orderIds: number[]) => {
  const normalized = Array.from(new Set(orderIds.map((id) => Number(id || 0)).filter((id) => id > 0)))
  for (const orderId of normalized) {
    const summary = await queryOne<any>(
      'SELECT COALESCE(SUM(qty),0) as total_qty, COALESCE(SUM(arrived_qty),0) as arrived_qty FROM customer_order_items WHERE order_id=?',
      [orderId],
    )
    const totalQty = toQty(summary?.total_qty || 0)
    const arrivedQty = toQty(summary?.arrived_qty || 0)
    const nextOrderStatus = totalQty <= 0 ? 'pending' : arrivedQty >= totalQty ? 'completed' : arrivedQty > 0 ? 'partial' : 'pending'
    await execute('UPDATE customer_orders SET status=? WHERE id=? AND deleted_at IS NULL', [nextOrderStatus, orderId])
  }
}

const applyShippedQtyToOrderItems = async (shippedByOrderItem: Map<number, number>, filterOrderIds?: number[]) => {
  const orderItemIds = Array.from(shippedByOrderItem.keys()).filter((id) => id > 0)
  if (!orderItemIds.length) return []

  const orderItems = await query<any>(
    `SELECT id, order_id, qty, COALESCE(arrived_qty, 0) as arrived_qty
     FROM customer_order_items
     WHERE id IN (${orderItemIds.map(() => '?').join(',')})`,
    orderItemIds,
  )

  const touchedOrderIds = new Set<number>()
  for (const row of orderItems) {
    const itemId = Number(row.id || 0)
    const orderId = Number(row.order_id || 0)
    if (!itemId || !orderId) continue
    if (filterOrderIds?.length && !filterOrderIds.includes(orderId)) continue

    const totalQty = toQty(row.qty)
    const shippedSum = toQty(shippedByOrderItem.get(itemId) || 0)
    const nextArrived = toQty(Math.min(totalQty, shippedSum))
    const nextBalance = toQty(Math.max(0, totalQty - nextArrived))
    const nextStatus = nextArrived >= totalQty && totalQty > 0 ? 'completed' : nextArrived > 0 ? 'partial' : 'pending'

    if (toQty(row.arrived_qty) === nextArrived) continue
    await execute(
      'UPDATE customer_order_items SET arrived_qty=?, balance=?, status=? WHERE id=?',
      [nextArrived, nextBalance, nextStatus, itemId],
    )
    touchedOrderIds.add(orderId)
  }

  if (touchedOrderIds.size) await recalcCustomerOrderStatus(Array.from(touchedOrderIds))
  return Array.from(touchedOrderIds)
}

const backfillOrderItemIdsForOrder = async (orderId: number) => {
  const normalizedOrderId = Number(orderId || 0)
  if (normalizedOrderId <= 0) return

  const usedOrderItemIds = new Set<number>()
  const assigned = await query<any>(`
    SELECT DISTINCT dni.order_item_id
    FROM delivery_note_items dni
    JOIN delivery_notes dn ON dn.id = dni.dn_id AND dn.deleted_at IS NULL
    WHERE dn.customer_order_id=? AND dni.order_item_id IS NOT NULL AND dni.order_item_id > 0
  `, [normalizedOrderId])
  for (const row of assigned) usedOrderItemIds.add(Number(row.order_item_id))

  const missing = await query<any>(`
    SELECT dni.id, dni.bom_id, dni.qty, dni.material_code, dni.item_name
    FROM delivery_note_items dni
    JOIN delivery_notes dn ON dn.id = dni.dn_id AND dn.deleted_at IS NULL
    WHERE dn.customer_order_id=?
      AND (dni.order_item_id IS NULL OR dni.order_item_id = 0)
    ORDER BY dni.id ASC
  `, [normalizedOrderId])

  for (const row of missing) {
    const orderItemId = await resolveOrderItemIdForDnLine(normalizedOrderId, {
      bomId: row.bom_id,
      qty: row.qty,
      materialCode: row.material_code,
      itemName: row.item_name,
    }, usedOrderItemIds)
    if (!orderItemId) continue
    await execute('UPDATE delivery_note_items SET order_item_id=? WHERE id=?', [orderItemId, row.id])
    usedOrderItemIds.add(orderItemId)
  }
}

const syncCustomerOrderArrivedFromShippedDns = async (customerOrderId: number) => {
  const orderId = Number(customerOrderId || 0)
  if (orderId <= 0) return
  await backfillOrderItemIdsForOrder(orderId)
  const shippedMap = await buildShippedQtyByOrderItemId()
  await applyShippedQtyToOrderItems(shippedMap, [orderId])
}

const syncAllCustomerOrdersArrivedFromShippedDns = async () => {
  const rows = await query<any>(`
    SELECT DISTINCT customer_order_id as order_id
    FROM delivery_notes
    WHERE deleted_at IS NULL AND status='shipped' AND customer_order_id IS NOT NULL
  `)
  for (const row of rows) {
    await syncCustomerOrderArrivedFromShippedDns(Number(row.order_id))
  }
}

// ── Daily Patrol (ERP 每日巡檢) ────────────────────────────────────────────────
type PatrolIssue = {
  type: string
  ref: string
  reason: string
  impact: string
  suggestion: string
}

type PatrolReview = {
  type: string
  ref: string
  reason: string
  suggestion: string
}

type PatrolStuck = {
  flow: string
  ref: string
  status: string
  cause: string
  next: string
}

type PatrolConsistency = {
  item: string
  ok: boolean
  detail: string
  suggestion: string
}

type PatrolSummary = {
  generated_at: string
  date: string
  time: string
  severe: PatrolIssue[]
  need_review: PatrolReview[]
  stuck: PatrolStuck[]
  consistency: PatrolConsistency[]
  normals: string[]
  priorities: PatrolIssue[]
}

const buildDailyPatrolReport = async (): Promise<PatrolSummary> => {
  const now = new Date()
  const date = toDateStr(now)
  const time = now8()

  const severe: PatrolIssue[] = []
  const needReview: PatrolReview[] = []
  const stuck: PatrolStuck[] = []
  const consistency: PatrolConsistency[] = []

  // 1) 訂單與出貨數量一致性（按 order_item_id 對應，避免同 BOM 多行誤判）
  const shippedMap = await buildShippedQtyByOrderItemId()
  const orderItemIds = Array.from(shippedMap.keys())
  const shippedRows = orderItemIds.length
    ? await query<any>(
      `SELECT ci.id as order_item_id, ci.order_id, ci.bom_id, co.po_number, ci.qty, ci.arrived_qty
       FROM customer_order_items ci
       JOIN customer_orders co ON co.id = ci.order_id AND co.deleted_at IS NULL
       WHERE ci.id IN (${orderItemIds.map(() => '?').join(',')})`,
      orderItemIds,
    )
    : []
  for (const row of shippedRows) {
    const totalQty = toQty(row.qty)
    const arrived = toQty(row.arrived_qty)
    const shipped = toQty(shippedMap.get(Number(row.order_item_id)) || 0)
    if (Math.abs(arrived - shipped) > 0.0001) {
      severe.push({
        type: '訂單與出貨數量不一致',
        ref: `訂單 ${row.order_id} / 客戶 PO ${row.po_number} / BOM ${row.bom_id}`,
        reason: `出貨累計 ${shipped} 與訂單到貨數量 ${arrived} 不一致`,
        impact: '可能導致訂單完成狀態錯誤，影響後續對帳與出貨判斷',
        suggestion: '請核對出貨單與訂單明細數量，必要時由管理者調整 arrived_qty',
      })
    }
    if (shipped > totalQty + 0.0001) {
      severe.push({
        type: '出貨數量超過訂單數量',
        ref: `訂單 ${row.order_id} / 客戶 PO ${row.po_number} / BOM ${row.bom_id}`,
        reason: `訂單數量 ${totalQty}，出貨累計 ${shipped}`,
        impact: '可能出現超量出貨或重複出貨',
        suggestion: '請檢查關聯出貨單，確認是否有重複出貨或錯誤數量',
      })
    }
  }

  // 2) 訂單資料完整性
  const ordersWithoutItems = await queryOne<any>(`
    SELECT co.id
    FROM customer_orders co
    LEFT JOIN customer_order_items ci ON ci.order_id = co.id
    WHERE co.deleted_at IS NULL
    GROUP BY co.id
    HAVING COUNT(ci.id) = 0
    LIMIT 1
  `).catch(() => null as any)
  if (ordersWithoutItems?.id) {
    severe.push({
      type: '訂單缺少品項',
      ref: '部分客戶訂單',
      reason: '存在沒有任何訂單明細的客戶訂單',
      impact: '無法進行採購、生產與出貨',
      suggestion: '請補齊訂單品項或刪除無效訂單',
    })
  }

  const itemsWithoutBom = await queryOne<any>(`
    SELECT COUNT(*) as cnt
    FROM customer_order_items ci
    JOIN customer_orders co ON co.id = ci.order_id AND co.deleted_at IS NULL
    WHERE ci.bom_id IS NULL OR ci.bom_id = 0
  `).catch(() => null as any)
  if (Number(itemsWithoutBom?.cnt || 0) > 0) {
    severe.push({
      type: '訂單品項缺少 BOM',
      ref: '部分訂單明細',
      reason: `至少 ${itemsWithoutBom.cnt} 筆訂單明細未關聯 BOM`,
      impact: '無法展開材料需求與出貨扣庫',
      suggestion: '請在客戶訂單頁補齊 BOM 關聯',
    })
  }

  // 3) BOM / 料號
  const missingBomItems = await queryOne<any>(`
    SELECT b.id
    FROM bom b
    LEFT JOIN bom_items bi ON bi.bom_id = b.id
    WHERE b.deleted_at IS NULL
    GROUP BY b.id
    HAVING COUNT(bi.id) = 0
    LIMIT 1
  `).catch(() => null as any)
  if (missingBomItems?.id) {
    severe.push({
      type: 'BOM 無任何材料',
      ref: '部分 BOM',
      reason: '存在至少 1 筆 BOM 沒有任何 bom_items 記錄',
      impact: '無法正確展開材料需求，影響採購與生產',
      suggestion: '請檢查 BOM 設定，補齊材料明細',
    })
  }

  const bomQtyAnomalies = await queryOne<any>(`
    SELECT COUNT(*) as cnt
    FROM bom_items bi
    JOIN bom b ON b.id = bi.bom_id AND b.deleted_at IS NULL
    WHERE bi.quantity IS NULL OR bi.quantity <= 0
  `).catch(() => null as any)
  if (Number(bomQtyAnomalies?.cnt || 0) > 0) {
    severe.push({
      type: 'BOM 材料數量為 0 或空值',
      ref: '部分 BOM 材料',
      reason: `至少 ${bomQtyAnomalies.cnt} 筆 BOM 材料數量異常`,
      impact: '導致材料需求低估或無法正確生成採購數量',
      suggestion: '請修正 BOM 材料數量',
    })
  }

  // 4) 庫存
  const negativeStock = await queryOne<any>(`
    SELECT COUNT(*) as cnt
    FROM bom
    WHERE deleted_at IS NULL AND COALESCE(current_stock, 0) < 0
  `).catch(() => null as any)
  if (Number(negativeStock?.cnt || 0) > 0) {
    severe.push({
      type: '庫存為負數',
      ref: '部分 BOM.current_stock',
      reason: `至少 ${negativeStock.cnt} 筆 BOM 現有庫存為負數`,
      impact: '庫存與實際狀態不一致，可能影響出貨判斷',
      suggestion: '請比對進貨、出貨、調整與領料紀錄並修正',
    })
  }

  const lowStock = await queryOne<any>(`
    SELECT COUNT(*) as cnt
    FROM bom
    WHERE deleted_at IS NULL AND COALESCE(current_stock, 0) <= 0
  `).catch(() => null as any)
  if (Number(lowStock?.cnt || 0) > 0) {
    needReview.push({
      type: '成品庫存為 0 或負數',
      ref: `${lowStock.cnt} 筆 BOM`,
      reason: '部分成品現有庫存為 0 或負數，可能影響出貨',
      suggestion: '請在庫存頁面確認是否需要補貨或調整',
    })
  }

  // 5) 流程卡住
  const staleOrders = await query<any>(`
    SELECT id, po_number, created_at
    FROM customer_orders
    WHERE status = 'pending'
      AND deleted_at IS NULL
      AND created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)
    ORDER BY created_at ASC
    LIMIT 5
  `)
  for (const row of staleOrders) {
    stuck.push({
      flow: '客戶訂單',
      ref: `訂單 ${row.id} / 客戶 PO ${row.po_number}`,
      status: 'pending',
      cause: '訂單建立已超過 14 天，仍未進入後續作業',
      next: '請與業務確認是否仍需出貨，必要時更新狀態或取消',
    })
  }

  const stalePo = await query<any>(`
    SELECT id, po_number, created_at
    FROM purchase_orders
    WHERE status = 'draft'
      AND deleted_at IS NULL
      AND created_at < DATE_SUB(NOW(), INTERVAL 3 DAY)
    ORDER BY created_at ASC
    LIMIT 5
  `)
  for (const row of stalePo) {
    stuck.push({
      flow: '採購單',
      ref: `PO ${row.po_number || row.id}`,
      status: 'draft',
      cause: '採購單草稿已超過 3 天未審核',
      next: '請盡快審核或作廢不需要的採購單',
    })
  }

  const staleDn = await query<any>(`
    SELECT id, dn_number, delivery_date, status
    FROM delivery_notes
    WHERE status = 'confirmed'
      AND deleted_at IS NULL
      AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY created_at ASC
    LIMIT 5
  `)
  for (const row of staleDn) {
    stuck.push({
      flow: '出貨單',
      ref: `出貨單 ${row.dn_number}`,
      status: row.status || 'confirmed',
      cause: '出貨單已確認超過 7 天仍未出貨',
      next: '請確認是否已實際出貨，必要時執行出貨或退回草稿',
    })
  }

  const staleProduction = await query<any>(`
    SELECT id, prod_number, status, planned_end
    FROM production_orders
    WHERE status = 'in_progress'
      AND deleted_at IS NULL
      AND planned_end IS NOT NULL
      AND planned_end < DATE_SUB(CURDATE(), INTERVAL 3 DAY)
    ORDER BY planned_end ASC
    LIMIT 5
  `)
  for (const row of staleProduction) {
    stuck.push({
      flow: '生產單',
      ref: `生產單 ${row.prod_number}`,
      status: row.status || 'in_progress',
      cause: '生產單已超過預計完工日 3 天仍未完工',
      next: '請確認生產進度並更新狀態或交期',
    })
  }

  // 6) 一致性檢查
  consistency.push({
    item: '訂單 vs 出貨數量',
    ok: !severe.some((s) => s.type === '訂單與出貨數量不一致' || s.type === '出貨數量超過訂單數量'),
    detail: severe.some((s) => s.type.startsWith('訂單與出貨') || s.type.startsWith('出貨數量超過'))
      ? '發現訂單與出貨累計數量不一致或超量'
      : '訂單數量與出貨累計整體合理',
    suggestion: '如為異常，請由出貨流程重新同步訂單數量',
  })

  consistency.push({
    item: 'BOM / 材料設定',
    ok: !missingBomItems?.id && !(Number(bomQtyAnomalies?.cnt || 0) > 0),
    detail: missingBomItems?.id || Number(bomQtyAnomalies?.cnt || 0) > 0
      ? '部分 BOM 缺少材料或材料數量異常'
      : 'BOM 與材料設定未發現明顯異常',
    suggestion: '建議定期抽查主要產品 BOM 結構',
  })

  consistency.push({
    item: '庫存現有量',
    ok: !(Number(negativeStock?.cnt || 0) > 0),
    detail: Number(negativeStock?.cnt || 0) > 0
      ? `有 ${negativeStock.cnt} 筆 BOM.current_stock 為負數`
      : 'BOM.current_stock 未發現負數庫存',
    suggestion: '如有負庫存，請檢查進貨、出貨與調整紀錄',
  })

  const normals: string[] = []
  if (!severe.length) {
    normals.push('訂單、生產單、BOM、庫存、採購、出貨資料整體狀態：正常')
  } else {
    if (!Number(negativeStock?.cnt || 0)) normals.push('庫存資料：未發現負庫存')
    if (!missingBomItems?.id && !Number(bomQtyAnomalies?.cnt || 0)) normals.push('BOM / 料號資料：主要結構正常')
  }

  return {
    generated_at: time,
    date,
    time,
    severe: severe.slice(0, 5),
    need_review: needReview.slice(0, 10),
    stuck: stuck.slice(0, 10),
    consistency,
    normals,
    priorities: severe.slice(0, 5),
  }
}

let ensureMaterialReferenceColumnsPromise: Promise<void> | null = null
const ensureMaterialReferenceColumns = async () => {
  if (!ensureMaterialReferenceColumnsPromise) {
    ensureMaterialReferenceColumnsPromise = (async () => {
      const alterSafe = async (sql: string) => {
        try {
          await execute(sql)
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase()
          if (
            !msg.includes('duplicate column') &&
            !msg.includes('duplicate key name') &&
            !msg.includes('duplicate index') &&
            !msg.includes("doesn't exist") &&
            !msg.includes('unknown table') &&
            !msg.includes('unknown column')
          ) throw e
        }
      }
      await alterSafe('ALTER TABLE po_items ADD COLUMN bom_id INT NULL AFTER po_id')
      await alterSafe('ALTER TABLE quotation_items ADD COLUMN bom_id INT NULL AFTER quotation_id')
      await alterSafe('ALTER TABLE delivery_note_items ADD COLUMN bom_id INT NULL AFTER dn_id')
      await alterSafe('ALTER TABLE delivery_note_items ADD COLUMN order_item_id INT NULL AFTER dn_id')
      await alterSafe('ALTER TABLE delivery_note_items ADD INDEX idx_delivery_note_items_order_item_id (order_item_id)')
      await alterSafe('ALTER TABLE delivery_sheet_items ADD COLUMN bom_id INT NULL AFTER ds_id')
      await alterSafe('ALTER TABLE goods_receipt_items ADD COLUMN bom_id INT NULL AFTER po_item_id')
      await alterSafe('ALTER TABLE po_items ADD INDEX idx_po_items_bom_id (bom_id)')
      await alterSafe('ALTER TABLE quotation_items ADD INDEX idx_quotation_items_bom_id (bom_id)')
      await alterSafe('ALTER TABLE delivery_note_items ADD INDEX idx_delivery_note_items_bom_id (bom_id)')
      await alterSafe('ALTER TABLE delivery_sheet_items ADD INDEX idx_delivery_sheet_items_bom_id (bom_id)')
      await alterSafe('ALTER TABLE goods_receipt_items ADD INDEX idx_goods_receipt_items_bom_id (bom_id)')

      const backfillSafe = async (sql: string) => {
        try {
          await execute(sql)
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase()
          if (
            !msg.includes("doesn't exist") &&
            !msg.includes('unknown table') &&
            !msg.includes('unknown column')
          ) throw e
        }
      }
      await backfillSafe(`
        INSERT INTO bom (product_sku,product_name,spec,unit,supplier_id,supplier_name,supplier_price,company_price,currency,category,image_url,material_name,created_at)
        SELECT m.material_code,m.material_name,m.spec,COALESCE(m.unit,'PCS'),m.supplier_id,m.supplier_name,COALESCE(m.supplier_price,0),COALESCE(m.company_price,0),COALESCE(m.currency,'VND'),m.category,m.image_url,m.material_name,COALESCE(m.created_at,CURRENT_TIMESTAMP)
        FROM materials m
        LEFT JOIN bom b ON b.product_sku = m.material_code AND b.deleted_at IS NULL
        WHERE b.id IS NULL
      `)
      await backfillSafe(`
        UPDATE customer_order_items coi
        JOIN bom b ON b.product_sku = coi.material_code AND b.deleted_at IS NULL
        SET coi.bom_id = b.id
        WHERE COALESCE(coi.material_code, '') <> '' AND (coi.bom_id IS NULL OR coi.bom_id = 0)
      `)
      await backfillSafe(`
        UPDATE po_items pi
        JOIN bom b ON b.product_sku = pi.material_code AND b.deleted_at IS NULL
        SET pi.bom_id = b.id
        WHERE COALESCE(pi.material_code, '') <> '' AND (pi.bom_id IS NULL OR pi.bom_id = 0)
      `)
      await backfillSafe(`
        UPDATE quotation_items qi
        JOIN bom b ON b.product_sku = qi.material_code AND b.deleted_at IS NULL
        SET qi.bom_id = b.id
        WHERE COALESCE(qi.material_code, '') <> '' AND (qi.bom_id IS NULL OR qi.bom_id = 0)
      `)
      await backfillSafe(`
        UPDATE delivery_note_items dni
        JOIN bom b ON b.product_sku = dni.material_code AND b.deleted_at IS NULL
        SET dni.bom_id = b.id
        WHERE COALESCE(dni.material_code, '') <> '' AND (dni.bom_id IS NULL OR dni.bom_id = 0)
      `)
      await backfillSafe(`
        UPDATE delivery_sheet_items dsi
        JOIN bom b ON b.product_sku = dsi.material_code AND b.deleted_at IS NULL
        SET dsi.bom_id = b.id
        WHERE COALESCE(dsi.material_code, '') <> '' AND (dsi.bom_id IS NULL OR dsi.bom_id = 0)
      `)
      await backfillSafe(`
        UPDATE goods_receipt_items gri
        JOIN bom b ON b.product_sku = gri.material_code AND b.deleted_at IS NULL
        SET gri.bom_id = b.id
        WHERE COALESCE(gri.material_code, '') <> '' AND (gri.bom_id IS NULL OR gri.bom_id = 0)
      `)
      await backfillSafe('DROP TABLE materials')
    })().catch((e) => {
      ensureMaterialReferenceColumnsPromise = null
      throw e
    })
  }
  await ensureMaterialReferenceColumnsPromise
}

const resolveMaterialId = async (materialIdRaw: any, materialCodeRaw: any): Promise<number | null> => {
  return null
}

const liveFirst = (...exprs: string[]) => `COALESCE(${exprs.join(', ')})`

const isMissingSchemaError = (error: any) => {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes("doesn't exist") ||
    msg.includes('unknown table') ||
    msg.includes('unknown column')
  )
}

const getActiveReferenceCount = async (sql: string, params: any[]) => {
  try {
    const row = await queryOne<any>(sql, params)
    return Number(row?.cnt || 0)
  } catch (e: any) {
    if (isMissingSchemaError(e)) return 0
    throw e
  }
}

const blockIfReferenced = async (
  id: any,
  checks: Array<{ sql: string; label: string }>,
): Promise<string | null> => {
  const hits: string[] = []
  for (const check of checks) {
    const count = await getActiveReferenceCount(check.sql, [id])
    if (count > 0) hits.push(`${check.label} ${count} 筆`)
  }
  if (!hits.length) return null
  return `無法刪除：此資料目前仍被其他業務單據或主檔引用。使用情況：${hits.join('、')}。請先解除關聯、刪除相關單據，或改用停用 / 封存後再操作。`
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

// ── All Permissions (defined early, used in login + role-permissions) ─────────
const ALL_PERMISSIONS = [
  { key: 'customer_order.create', label: '新增客戶訂單' },
  { key: 'customer_order.delete', label: '刪除客戶訂單' },
  { key: 'quotation.approve', label: '審核報價單' },
  { key: 'bom.create', label: '新增BOM' },
  { key: 'bom.edit', label: '編輯BOM' },
  { key: 'bom.delete', label: '刪除BOM' },
  { key: 'po.create', label: '新增採購單' },
  { key: 'po.approve', label: '審核採購單' },
  { key: 'po.delete', label: '刪除採購單' },
  { key: 'production.create', label: '新增生產單' },
  { key: 'production.delete', label: '刪除生產單' },
  { key: 'delivery.create', label: '新增出貨單' },
  { key: 'delivery.delete', label: '刪除出貨單' },
  { key: 'customer.manage', label: '管理客戶' },
  { key: 'supplier.manage', label: '管理供應商' },
  { key: 'stock.adjust', label: '庫存調整' },
  { key: 'company.manage', label: '公司設定' },
  { key: 'user.manage', label: '使用者管理' },
  { key: 'audit.view', label: '檢視操作日誌' },
]

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async c => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) return c.json({ error: 'Missing fields' }, 400)
    const user = await queryOne<any>('SELECT * FROM users WHERE email=? AND deleted_at IS NULL', [email])
    if (!user) return c.json({ error: 'Invalid credentials' }, 401)
    if (hashPw(password) !== user.password_hash) return c.json({ error: 'Invalid credentials' }, 401)
    const normalizedRole = normalizeUserRole(user.role)
    const token = await signJwt({ userId: user.id, email: user.email, name: user.name, role: normalizedRole })
    // Load role permissions
    let permissions: string[] = []
    if (normalizedRole === 'manager') {
      permissions = ALL_PERMISSIONS.map((p: any) => p.key)
    } else {
      const rows = await query<any>('SELECT permission FROM role_permissions WHERE role=? AND allowed=1', ['employee'])
      permissions = rows.map((r: any) => r.permission)
    }
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name, role: normalizedRole }, permissions })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.get('/api/auth/me', authMiddleware, async c => {
  const u = c.get('user')
  const user = await queryOne<any>('SELECT id,email,name,role FROM users WHERE id=? AND deleted_at IS NULL', [u.userId])
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json({ user: { ...user, role: normalizeUserRole(user.role) } })
})

// Change own password
app.post('/api/auth/change-password', authMiddleware, async c => {
  try {
    const u = c.get('user')
    const { currentPassword, newPassword } = await c.req.json()
    if (!currentPassword || !newPassword) return c.json({ error: 'Missing fields' }, 400)
    if (newPassword.length < 6) return c.json({ error: '新密碼至少需要6個字元' }, 400)
    const user = await queryOne<any>('SELECT password_hash FROM users WHERE id=? AND deleted_at IS NULL', [u.userId])
    if (!user || hashPw(currentPassword) !== user.password_hash) return c.json({ error: '目前密碼不正確' }, 400)
    await execute('UPDATE users SET password_hash=? WHERE id=?', [hashPw(newPassword), u.userId])
    await audit(u, 'UPDATE', '使用者', u.userId, '修改密碼')
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// Reset password for any user
app.post('/api/users/:id/reset-password', authMiddleware, requirePerm('user.manage'), async c => {
  try {
    const u = c.get('user'); const id = c.req.param('id')
    const row = await queryOne<any>('SELECT name,email,role FROM users WHERE id=? AND deleted_at IS NULL', [id])
    if (!row) return c.json({ error: 'User not found' }, 404)
    await execute('UPDATE users SET password_hash=? WHERE id=?', [hashPw('admin123'), id])
    await audit(u, 'UPDATE', '使用者', id, `重設密碼: ${row.email}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Suppliers ────────────────────────────────────────────────────────────────
app.get('/api/suppliers', authMiddleware, async c => {
  const rows = await query('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY created_at DESC')
  return c.json(rows)
})
app.post('/api/suppliers', authMiddleware, requirePerm('supplier.manage'), async c => {
  try {
    const b = await c.req.json()
    if (!b.name) return c.json({ error: 'name required' }, 400)
    const r = await execute('INSERT INTO suppliers (name,supplier_code,tax_id,contact,phone,email,address,main_items,payment_terms,currency,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [b.name,b.supplier_code||'',b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_items||'',b.payment_terms||'',b.currency||'VND',b.status||'active',now8()])
    await audit(c.get('user'), 'CREATE', '供應商', r.insertId, b.name)
    return c.json({ id: r.insertId, ...b }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/suppliers/:id', authMiddleware, requirePerm('supplier.manage'), async c => {
  try {
    const id = c.req.param('id')
    const b = await c.req.json()
    const existing = await queryOne<any>('SELECT supplier_code FROM suppliers WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    await execute('UPDATE suppliers SET name=?,supplier_code=?,tax_id=?,contact=?,phone=?,email=?,address=?,main_items=?,payment_terms=?,currency=?,status=? WHERE id=?',
      [b.name,existing.supplier_code||'',b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_items||'',b.payment_terms||'',b.currency||'VND',b.status||'active',id])
    await audit(c.get('user'), 'UPDATE', '供應商', id, b.name)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/suppliers/:id', authMiddleware, requirePerm('supplier.manage'), async c => {
  const id = c.req.param('id')
  const blockedBy = await blockIfReferenced(id, [
    { label: 'BOM', sql: 'SELECT COUNT(*) as cnt FROM bom WHERE supplier_id=? AND deleted_at IS NULL' },
    { label: '採購單', sql: 'SELECT COUNT(*) as cnt FROM purchase_orders WHERE supplier_id=? AND deleted_at IS NULL' },
    { label: '進貨單', sql: 'SELECT COUNT(*) as cnt FROM goods_receipts WHERE supplier_id=? AND deleted_at IS NULL' },
  ])
  if (blockedBy) return c.json({ error: blockedBy }, 400)
  const row = await queryOne<any>('SELECT name, supplier_code FROM suppliers WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.supplier_code) {
    const releasedCode = `${String(row.supplier_code).trim()}#DEL${Date.now()}-${id}`
    await execute('UPDATE suppliers SET supplier_code=? WHERE id=? AND deleted_at IS NULL', [releasedCode, id])
  }
  await softDeleteById('suppliers', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '供應商', id, row?.name)
  return c.json({ ok: true })
})

// ── Customers ────────────────────────────────────────────────────────────────
app.get('/api/customers', authMiddleware, async c => c.json(await query('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY created_at DESC')))
app.post('/api/customers', authMiddleware, requirePerm('customer.manage'), async c => {
  try {
    const b = await c.req.json()
    if (!b.customer_code || !b.customer_name) return c.json({ error: 'customer_code and customer_name required' }, 400)
    const r = await execute('INSERT INTO customers (customer_code,customer_name,tax_id,contact,phone,email,address,main_products,payment_terms,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [b.customer_code,b.customer_name,b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_products||'',b.payment_terms||'',b.status||'active',now8()])
    await audit(c.get('user'), 'CREATE', '客戶', r.insertId, `${b.customer_code} ${b.customer_name}`)
    return c.json({ id: r.insertId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/customers/:id', authMiddleware, requirePerm('customer.manage'), async c => {
  try {
    const id = c.req.param('id')
    const b = await c.req.json()
    const existing = await queryOne<any>('SELECT customer_code FROM customers WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    await execute('UPDATE customers SET customer_code=?,customer_name=?,tax_id=?,contact=?,phone=?,email=?,address=?,main_products=?,payment_terms=?,status=? WHERE id=?',
      [existing.customer_code,b.customer_name,b.tax_id||'',b.contact||'',b.phone||'',b.email||'',b.address||'',b.main_products||'',b.payment_terms||'',b.status||'active',id])
    await audit(c.get('user'), 'UPDATE', '客戶', id, b.customer_name)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/customers/:id', authMiddleware, requirePerm('customer.manage'), async c => {
  const id = c.req.param('id')
  const blockedBy = await blockIfReferenced(id, [
    { label: '客戶訂單', sql: 'SELECT COUNT(*) as cnt FROM customer_orders WHERE customer_id=? AND deleted_at IS NULL' },
    { label: '報價單', sql: 'SELECT COUNT(*) as cnt FROM quotations WHERE customer_id=? AND deleted_at IS NULL' },
    { label: '出貨單', sql: 'SELECT COUNT(*) as cnt FROM delivery_notes WHERE customer_id=? AND deleted_at IS NULL' },
    { label: '送貨單', sql: 'SELECT COUNT(*) as cnt FROM delivery_sheets WHERE customer_id=? AND deleted_at IS NULL' },
  ])
  if (blockedBy) return c.json({ error: blockedBy }, 400)
  const row = await queryOne<any>('SELECT customer_name, customer_code FROM customers WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.customer_code) {
    const releasedCode = `${String(row.customer_code).trim()}#DEL${Date.now()}-${id}`
    await execute('UPDATE customers SET customer_code=? WHERE id=? AND deleted_at IS NULL', [releasedCode, id])
  }
  await softDeleteById('customers', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '客戶', id, row?.customer_name)
  return c.json({ ok: true })
})

// ── BOM ──────────────────────────────────────────────────────────────────────
app.get('/api/bom', authMiddleware, async c => {
  await ensureBomMoqTiersColumn()
  const rows = await query<any>(`
    SELECT b.*, s.name as supplier_display_name
    FROM bom b LEFT JOIN suppliers s ON b.supplier_id = s.id AND s.deleted_at IS NULL
    WHERE b.deleted_at IS NULL
    ORDER BY b.category, b.created_at DESC
  `)
  return c.json(rows.map((row: any) => ({ ...row, moq_tiers: parseMoqTiersFromDb(row.moq_tiers) })))
})
app.get('/api/bom/:id', authMiddleware, async c => {
  await ensureBomMoqTiersColumn()
  const bom = await queryOne<any>(`
    SELECT b.*, s.name as supplier_display_name
    FROM bom b LEFT JOIN suppliers s ON b.supplier_id = s.id AND s.deleted_at IS NULL
    WHERE b.id=? AND b.deleted_at IS NULL`, [c.req.param('id')])
  if (!bom) return c.json({ error: 'Not found' }, 404)
  const items = await query(`
    SELECT bi.*, bi.material_name as mat_name, bi.spec as mat_spec, bi.unit as mat_unit
    FROM bom_items bi
    WHERE bi.bom_id=?`, [c.req.param('id')])
  return c.json({ ...bom, moq_tiers: parseMoqTiersFromDb(bom.moq_tiers), items })
})

const parseRequiredMoney = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return toAmount(num)
}

const normalizeRequiredText = (value: any): string => String(value ?? '').trim()

app.post('/api/bom', authMiddleware, requirePerm('bom.create'), async c => {
  try {
    await ensureBomMoqTiersColumn()
    const b = await c.req.json()
    const productSku = normalizeRequiredText(b.product_sku)
    const productName = normalizeRequiredText(b.product_name)
    const unit = normalizeRequiredText(b.unit)
    const currency = normalizeRequiredText(b.currency)
    const supplierPrice = parseRequiredMoney(b.supplier_price)
    const companyPrice = parseRequiredMoney(b.company_price)
    if (!productSku) return c.json({ error: 'product_sku required' }, 400)
    if (!productName) return c.json({ error: 'product_name required' }, 400)
    if (!unit) return c.json({ error: 'unit required' }, 400)
    if (!currency) return c.json({ error: 'currency required' }, 400)
    if (supplierPrice === null) return c.json({ error: 'supplier_price required and must be >= 0' }, 400)
    if (companyPrice === null) return c.json({ error: 'company_price required and must be >= 0' }, 400)
    const existing = await queryOne<any>('SELECT id FROM bom WHERE product_sku=? AND deleted_at IS NULL', [productSku])
    if (existing) return c.json({ error: `SKU「${productSku}」已存在，請使用不同的 SKU` }, 409)
    const u = c.get('user')
    const moqTiers = normalizeMoqTiers(b.moq_tiers)
    const r = await execute(`INSERT INTO bom (product_sku,product_name,material_name,spec,unit,supplier_id,supplier_name,supplier_price,company_price,currency,category,cert_code,brand,image_url,version,moq_tiers,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [productSku, productName, b.material_name||'', b.spec||'', unit,
       b.supplier_id||null, b.supplier_name||'', supplierPrice, companyPrice,
       currency, b.category||'', b.cert_code||'', b.brand||'', b.image_url||'', b.version||'V1',
       moqTiers.length ? JSON.stringify(moqTiers) : null,
       'active', u.userId, now8()])
    const bomId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        const materialId = await resolveMaterialId(item.material_id, item.material_code)
        await execute('INSERT INTO bom_items (bom_id,material_id,material_code,material_name,spec,unit,quantity,supplier_name,supplier_price,company_price,currency,remark,color,lt,moq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [bomId,materialId,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity||null,item.supplier_name||'',item.supplier_price||0,item.company_price||0,item.currency||'VND',item.remark||'',item.color||'',item.lt||'',item.moq||null])
      }
    }
    await audit(u, 'CREATE', 'BOM', bomId, `${productSku} ${productName}`)
    return c.json({ id: bomId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/bom/:id', authMiddleware, requirePerm('bom.edit'), async c => {
  try {
    await ensureBomMoqTiersColumn()
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>(
      'SELECT product_sku FROM bom WHERE id=? AND deleted_at IS NULL',
      [id]
    )
    if (!existing) return c.json({ error: 'Not found' }, 404)
    const productName = normalizeRequiredText(b.product_name)
    const unit = normalizeRequiredText(b.unit)
    const currency = normalizeRequiredText(b.currency)
    const supplierPrice = parseRequiredMoney(b.supplier_price)
    const companyPrice = parseRequiredMoney(b.company_price)
    if (!productName) return c.json({ error: 'product_name required' }, 400)
    if (!unit) return c.json({ error: 'unit required' }, 400)
    if (!currency) return c.json({ error: 'currency required' }, 400)
    if (supplierPrice === null) return c.json({ error: 'supplier_price required and must be >= 0' }, 400)
    if (companyPrice === null) return c.json({ error: 'company_price required and must be >= 0' }, 400)
    const moqTiers = normalizeMoqTiers(b.moq_tiers)
    await execute(`UPDATE bom SET product_sku=?,product_name=?,material_name=?,spec=?,unit=?,supplier_id=?,supplier_name=?,supplier_price=?,company_price=?,currency=?,category=?,cert_code=?,brand=?,image_url=?,version=?,moq_tiers=? WHERE id=?`,
      [existing.product_sku, productName, b.material_name||'', b.spec||'', unit,
       b.supplier_id||null, b.supplier_name||'', supplierPrice, companyPrice,
       currency, b.category||'', b.cert_code||'', b.brand||'', b.image_url||'', b.version||'V1',
       moqTiers.length ? JSON.stringify(moqTiers) : null,
       id])
    await execute('DELETE FROM bom_items WHERE bom_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        const materialId = await resolveMaterialId(item.material_id, item.material_code)
        await execute('INSERT INTO bom_items (bom_id,material_id,material_code,material_name,spec,unit,quantity,supplier_name,supplier_price,company_price,currency,remark,color,lt,moq) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [id,materialId,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity||null,item.supplier_name||'',item.supplier_price||0,item.company_price||0,item.currency||'VND',item.remark||'',item.color||'',item.lt||'',item.moq||null])
      }
    }
    await audit(u, 'UPDATE', 'BOM', id, `${existing.product_sku} ${productName}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/bom/:id', authMiddleware, requirePerm('bom.delete'), async c => {
  const id = c.req.param('id')
  const blockedBy = await blockIfReferenced(id, [
    { label: '客戶訂單', sql: 'SELECT COUNT(*) as cnt FROM customer_order_items coi JOIN customer_orders co ON co.id = coi.order_id WHERE coi.bom_id=? AND co.deleted_at IS NULL' },
    { label: '生產單', sql: 'SELECT COUNT(*) as cnt FROM production_orders WHERE bom_id=? AND deleted_at IS NULL' },
  ])
  if (blockedBy) return c.json({ error: blockedBy }, 400)
  const row = await queryOne<any>('SELECT product_sku,product_name FROM bom WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.product_sku) {
    const releasedSku = `${String(row.product_sku).trim()}#DEL${Date.now()}-${id}`
    await execute('UPDATE bom SET product_sku=? WHERE id=? AND deleted_at IS NULL', [releasedSku, id])
  }
  await softDeleteById('bom', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', 'BOM', id, `${row?.product_sku} ${row?.product_name}`)
  return c.json({ ok: true })
})

// ── Purchase Orders ───────────────────────────────────────────────────────────
app.get('/api/po', authMiddleware, async c => {
  const url = new URL(c.req.url)
  const status = url.searchParams.get('status') || ''
  const supplierId = url.searchParams.get('supplier_id') || ''
  let sql = `SELECT po.*, ${liveFirst('NULLIF(s.name, \'\')', 'NULLIF(po.supplier_name, \'\')', '\'\'')} as supplier_name, s.supplier_code
    FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id AND s.deleted_at IS NULL`
  const params: any[] = []
  const where: string[] = ['po.deleted_at IS NULL']
  if (status) { where.push('po.status=?'); params.push(status) }
  if (supplierId) { where.push('po.supplier_id=?'); params.push(supplierId) }
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY po.created_at DESC'
  return c.json(await query(sql, params.length ? params : undefined))
})
app.get('/api/po/:id', authMiddleware, async c => {
  const po = await queryOne<any>(`
    SELECT po.*, ${liveFirst('NULLIF(s.name, \'\')', 'NULLIF(po.supplier_name, \'\')', '\'\'')} as supplier_name, s.supplier_code
    FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id AND s.deleted_at IS NULL
    WHERE po.id=? AND po.deleted_at IS NULL`, [c.req.param('id')])
  if (!po) return c.json({ error: 'Not found' }, 404)
  const items = await query(`
    SELECT pi.*,
           COALESCE(b.product_name, '') as material_name,
           COALESCE(b.spec, '') as spec,
           COALESCE(b.unit, 'PCS') as unit,
           COALESCE(b.image_url, '') as image_url
    FROM po_items pi 
    LEFT JOIN bom b ON pi.bom_id = b.id AND b.deleted_at IS NULL
    WHERE pi.po_id=?`, [c.req.param('id')])
  return c.json({ ...po, items })
})
app.post('/api/po', authMiddleware, requirePerm('po.create'), async c => {
  try {
    const b = await c.req.json()
    const u = c.get('user')
    const poNum = String(b.po_number || '').trim()
    if (!poNum) return c.json({ error: 'po_number is required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM purchase_orders WHERE po_number=? AND deleted_at IS NULL', [poNum])
    if (duplicated) return c.json({ error: `採購單號「${poNum}」已存在，請使用不同編號` }, 409)
    const subTotal = (b.items||[]).reduce((s: number, i: any) => s + (i.total_price||0), 0)
    const taxRate = Math.min(25, Math.max(1, Number(b.tax_rate) || 8))
    const total = Math.round(subTotal * (1 + taxRate / 100) * 100) / 100
    const r = await execute('INSERT INTO purchase_orders (po_number,supplier_id,supplier_name,status,total_amount,tax_rate,currency,created_by,remark,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [poNum,b.supplier_id||null,b.supplier_name,'draft',total,taxRate,b.currency||'VND',u.userId,b.remark||'',now8()])
    const poId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        const tp = (item.quantity||0)*(item.unit_price||0)
        await execute('INSERT INTO po_items (po_id,bom_id,material_id,material_code,material_name,spec,unit,quantity,unit_price,total_price,currency,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [poId,item.bom_id||null,null,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity,item.unit_price||0,tp,item.currency||'VND',item.remark||'',item.po_ref||'',item.thickness||null])
      }
    }
    await audit(u, 'CREATE', '採購單', poId, poNum)
    return c.json({ id: poId, po_number: poNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/po/:id', authMiddleware, requirePerm('po.create'), async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const po = await queryOne<any>('SELECT status FROM purchase_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!po) return c.json({ error: 'Not found' }, 404)
    if (po.status !== 'draft') return c.json({ error: '只能編輯尚未審核狀態的採購單' }, 400)
    const poNum = String(b.po_number || '').trim()
    if (!poNum) return c.json({ error: 'po_number is required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM purchase_orders WHERE po_number=? AND id<>? AND deleted_at IS NULL', [poNum, id])
    if (duplicated) return c.json({ error: `採購單號「${poNum}」已存在，請使用不同編號` }, 409)
    const subTotal = (b.items||[]).reduce((s: number, i: any) => s + (i.total_price||0), 0)
    const taxRate = Math.min(25, Math.max(1, Number(b.tax_rate) || 8))
    const total = Math.round(subTotal * (1 + taxRate / 100) * 100) / 100
    await execute('UPDATE purchase_orders SET po_number=?,supplier_id=?,supplier_name=?,total_amount=?,tax_rate=?,currency=?,remark=? WHERE id=?',
      [poNum, b.supplier_id||null, b.supplier_name, total, taxRate, b.currency||'VND', b.remark||'', id])
    await execute('DELETE FROM po_items WHERE po_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        const tp = (item.quantity||0)*(item.unit_price||0)
        await execute('INSERT INTO po_items (po_id,bom_id,material_id,material_code,material_name,spec,unit,quantity,unit_price,total_price,currency,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [id,item.bom_id||null,null,item.material_code,item.material_name,item.spec||'',item.unit||'PCS',item.quantity,item.unit_price||0,tp,item.currency||'VND',item.remark||'',item.po_ref||'',item.thickness||null])
      }
    }
    await audit(u, 'UPDATE', '採購單', id, `${poNum} / ${b.supplier_name}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/po/:id/approve', authMiddleware, requirePerm('po.approve'), async c => {
  try {
    const id = c.req.param('id'); const u = c.get('user')
    const row = await queryOne<any>('SELECT po_number, status FROM purchase_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!row) return c.json({ error: 'Not found' }, 404)
    if (row.status !== 'draft') return c.json({ error: '只有尚未審核狀態的採購單才能審核' }, 400)
    await execute('UPDATE purchase_orders SET status=?,approved_by=?,approved_at=? WHERE id=?', ['approved',u.userId,now8(),id])
    await audit(u, 'APPROVE', '採購單', id, row?.po_number)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/po/:id/status', authMiddleware, async c => {
  try {
    const id = c.req.param('id'); const { status } = await c.req.json(); const user = c.get('user')
    const validStatuses = ['pending_review', 'draft', 'approved', 'sent', 'cancelled']
    if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    const row = await queryOne<any>('SELECT po_number,supplier_name,status,total_amount,currency FROM purchase_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!row) return c.json({ error: 'Not found' }, 404)

    if (status === 'pending_review') {
      // 任何有 create 權限的人可以提交審核，只有 draft 可以提交
      if (!await hasPermission(user, 'po.create')) return c.json({ error: '無此操作權限（po.create）' }, 403)
      if (row.status !== 'draft') return c.json({ error: '只有草稿狀態的採購單才能提交審核' }, 400)
    } else if (status === 'draft') {
      // 退回草稿（撤回提交）
      if (!await hasPermission(user, 'po.create')) return c.json({ error: '無此操作權限（po.create）' }, 403)
      if (row.status !== 'pending_review') return c.json({ error: '只有待審核狀態的採購單才能退回草稿' }, 400)
    } else if (status === 'approved') {
      if (!await hasPermission(user, 'po.approve')) return c.json({ error: '無此操作權限（po.approve）' }, 403)
      if (row.status !== 'pending_review') return c.json({ error: '只有待審核狀態的採購單才能審核通過' }, 400)
    } else if (status === 'sent') {
      if (!await hasPermission(user, 'po.create')) return c.json({ error: '無此操作權限（po.create）' }, 403)
      if (row.status !== 'approved') return c.json({ error: '只有已審核的採購單才能送出' }, 400)
    } else {
      // cancelled
      if (!await hasPermission(user, 'po.create')) return c.json({ error: '無此操作權限（po.create）' }, 403)
    }

    await execute('UPDATE purchase_orders SET status=? WHERE id=?', [status,id])
    await audit(user, 'STATUS_CHANGE', '採購單', id, `${row?.po_number} ${row?.status} → ${status}`)

    // 提交審核時發通知郵件（非阻塞）
    if (status === 'pending_review') {
      ;(async () => {
        try {
          const co = await queryOne<any>('SELECT notification_email FROM company_settings WHERE id=1')
          const notifyEmail = co?.notification_email?.trim()
          if (notifyEmail) {
            const { subject, html } = buildPendingApprovalEmail({
              type: '採購單',
              number: row.po_number,
              name: row.supplier_name || '（未指定供應商）',
              createdBy: user.username || user.email || String(user.userId),
              amount: row.total_amount,
              currency: row.currency || 'VND',
            })
            await sendNotificationEmail({ to: notifyEmail, subject, html })
          }
        } catch {}
      })()
    }

    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/po/:id', authMiddleware, requirePerm('po.delete'), async c => {
  try {
    const id = c.req.param('id')
    const row = await queryOne<any>('SELECT po_number, status FROM purchase_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!row) return c.json({ error: 'Not found' }, 404)
    await softDeleteById('purchase_orders', id, c.get('user')?.userId)
    await audit(c.get('user'), 'DELETE', '採購單', id, row?.po_number)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// 採購單收貨：更新材料庫存
app.patch('/api/po/:id/receive', authMiddleware, requirePerm('po.approve'), async c => {
  try {
    const id = c.req.param('id'); const u = c.get('user')
    const po = await queryOne<any>('SELECT * FROM purchase_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!po) return c.json({ error: 'Not found' }, 404)
    if (po.status === 'received') return c.json({ error: '此採購單已收貨，不可重複操作' }, 400)
    if (!['approved', 'sent'].includes(po.status)) return c.json({ error: '只有已審核或已送出的採購單才能收貨' }, 400)
    const items = await query<any>('SELECT * FROM po_items WHERE po_id=?', [id])
    for (const item of items) {
      const qty = parseFloat(item.quantity) || 0
      const bom = await queryOne<any>('SELECT id, current_stock FROM bom WHERE product_sku=?', [item.material_code])
      const before = parseFloat(bom?.current_stock) || 0
      const after = before + qty
      if (bom) {
        await execute('UPDATE bom SET current_stock=? WHERE product_sku=?', [after, item.material_code])
      }
      await execute(
        'INSERT INTO stock_ledger (material_code,material_name,transaction_type,ref_type,ref_id,ref_number,qty_change,qty_before,qty_after,unit,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [item.material_code, item.material_name, 'GR_IN', 'purchase_order', id, po.po_number, qty, before, after, item.unit||'PCS', `採購收貨 ${po.po_number}`, u.userId, now8()]
      )
      await execute('UPDATE po_items SET received_qty=? WHERE id=?', [qty, item.id])
    }
    await execute('UPDATE purchase_orders SET status=? WHERE id=?', ['received', id])
    await audit(u, 'RECEIVE', '採購單', id, `${po.po_number} 收貨完成，庫存已更新`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Customer Orders ───────────────────────────────────────────────────────────
app.get('/api/customer-orders', authMiddleware, async c => {
  try {
    const url = new URL(c.req.url)
    const status = url.searchParams.get('status') || ''
    const customerId = url.searchParams.get('customer_id') || ''
    const dateFrom = url.searchParams.get('date_from') || ''
    const dateTo = url.searchParams.get('date_to') || ''
    const where: string[] = []
    const params: any[] = []
    if (status) { where.push('co.status=?'); params.push(status) }
    if (customerId) { where.push('co.customer_id=?'); params.push(customerId) }
    if (dateFrom) { where.push('co.po_date>=?'); params.push(dateFrom) }
    if (dateTo) { where.push('co.po_date<=?'); params.push(dateTo) }
    where.unshift('co.deleted_at IS NULL')
    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : ''
    const orders = await query(`
      SELECT co.id, co.po_date, co.po_number, co.customer_id, co.status, co.remark, co.created_at,
             COALESCE(co.tax_rate, 0) as tax_rate,
             COALESCE(co.tax_amount, 0) as tax_amount, 
             COALESCE(co.total_amount, 0) as total_amount, 
             COALESCE(co.currency, 'VND') as currency,
             co.delivery_date, co.delivery_address, co.person_in_charge, co.payment_terms,
             COALESCE(co.received_amount, 0) as received_amount, 
             COALESCE(co.payment_status, 'unpaid') as payment_status, 
             co.payment_date, co.payment_note,
             ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(co.customer_name, \'\')', '\'\'')} as customer_name,
             c.customer_code
      FROM customer_orders co LEFT JOIN customers c ON co.customer_id = c.id AND c.deleted_at IS NULL
      ${whereClause}
      ORDER BY co.created_at DESC
    `, params.length ? params : undefined)
    return c.json(orders)
  } catch (e: any) {
    console.error('Error fetching customer orders:', e.message)
    try {
      const orders = await query(`
        SELECT co.id, co.po_date, co.po_number, co.customer_id, co.status, co.remark, co.created_at,
               ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(co.customer_name, \'\')', '\'\'')} as customer_name,
               c.customer_code
        FROM customer_orders co LEFT JOIN customers c ON co.customer_id = c.id AND c.deleted_at IS NULL
        WHERE co.deleted_at IS NULL
        ORDER BY co.created_at DESC
      `)
      return c.json(orders)
    } catch (fallbackError: any) {
      return c.json({ error: fallbackError.message }, 500)
    }
  }
})
// Must be before /:id to avoid 'pending' being treated as an id
app.get('/api/customer-orders/pending', authMiddleware, async c => {
  const customerId = c.req.query('customer_id')
  const poSearch = c.req.query('po_search')
  if (!customerId && !poSearch) return c.json([])

  let sql = `
    SELECT co.id, co.po_number, co.po_date, co.status, co.customer_id,
           ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(co.customer_name, \'\')', '\'\'')} as customer_name,
           GROUP_CONCAT(b.product_name ORDER BY ci.id SEPARATOR ', ') as items_summary
    FROM customer_orders co
    LEFT JOIN customers c ON co.customer_id = c.id AND c.deleted_at IS NULL
    LEFT JOIN customer_order_items ci ON ci.order_id = co.id
    LEFT JOIN bom b ON ci.bom_id = b.id
    WHERE co.status IN ('pending', 'partial') AND co.deleted_at IS NULL
  `
  const params: any[] = []
  if (customerId) { sql += ' AND co.customer_id = ?'; params.push(customerId) }
  if (poSearch) { sql += ' AND co.po_number LIKE ?'; params.push(`%${poSearch}%`) }
  sql += ' GROUP BY co.id ORDER BY co.created_at DESC'

  return c.json(await query(sql, params))
})
app.get('/api/customer-orders/:id', authMiddleware, async c => {
  const order = await queryOne<any>(`
    SELECT co.id, co.po_date, co.po_number, co.customer_id, co.status, co.remark, co.created_at,
           co.tax_rate, co.tax_amount, co.total_amount, co.currency,
           co.delivery_date, co.delivery_address, co.person_in_charge, co.payment_terms,
           co.received_amount, co.payment_status, co.payment_date, co.payment_note,
           ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(co.customer_name, \'\')', '\'\'')} as customer_name,
           c.customer_code, c.address, c.phone, c.fax, c.email, c.tax_id
    FROM customer_orders co LEFT JOIN customers c ON co.customer_id = c.id AND c.deleted_at IS NULL
    WHERE co.id=? AND co.deleted_at IS NULL`, [c.req.param('id')])
  if (!order) return c.json({ error: 'Not found' }, 404)
  const items = await query(`
    SELECT ci.id, ci.order_id, ci.bom_id, ci.qty, ci.unit_price, ci.rta_date, ci.remark,
           ci.arrived_qty, ci.arrived_date, ci.balance, ci.status,
           b.product_sku, b.product_name, b.version, b.spec, b.unit
    FROM customer_order_items ci
    LEFT JOIN bom b ON ci.bom_id = b.id
    WHERE ci.order_id=?`, [c.req.param('id')])
  return c.json({ ...order, items })
})
app.post('/api/customer-orders', authMiddleware, requirePerm('customer_order.create'), async c => {
  try {
    const b = await c.req.json()
    if (!b.po_number || !b.customer_id) return c.json({ error: 'po_number and customer_id required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM customer_orders WHERE po_number=? AND deleted_at IS NULL', [b.po_number])
    if (duplicated) return c.json({ error: `訂單編號「${b.po_number}」已存在，請使用不同編號` }, 409)
    const cust = await queryOne<any>('SELECT customer_name, payment_terms FROM customers WHERE id=? AND deleted_at IS NULL', [b.customer_id])
    // No tax for customer orders
    const subtotal = (b.items||[]).reduce((s: number, i: any) => s + (i.qty||0) * (i.unit_price||0), 0)
    const taxRate = 0
    const taxAmount = 0
    const totalAmount = subtotal
    const r = await execute('INSERT INTO customer_orders (po_date,po_number,customer_id,status,remark,tax_rate,tax_amount,total_amount,currency,delivery_date,delivery_address,person_in_charge,payment_terms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [b.po_date||null, b.po_number, b.customer_id, b.status||'pending', b.remark||'',
       taxRate, taxAmount, totalAmount, b.currency||'VND',
       b.delivery_date||null, b.delivery_address||'', b.person_in_charge||'', b.payment_terms||cust?.payment_terms||'',
       now8()])
    const orderId = r.insertId
    const createdOrderItems: Array<{ id: number; bom_id: number; qty: number }> = []
    if (b.items?.length) {
      for (const item of b.items) {
        if (!item.bom_id) continue  // skip items without BOM
        const itemR = await execute('INSERT INTO customer_order_items (order_id,bom_id,qty,unit_price,rta_date,remark,arrived_qty,balance,status) VALUES (?,?,?,?,?,?,?,?,?)',
          [orderId, item.bom_id, item.qty||0, item.unit_price||0, null, item.remark||'', 0, item.qty||0, 'pending'])
        createdOrderItems.push({ id: Number(itemR.insertId), bom_id: Number(item.bom_id), qty: toQty(item.qty) })
      }
    }
    await audit(c.get('user'), 'CREATE', '客戶訂單', orderId, `${b.po_number} / ${cust?.customer_name||b.customer_id}`)

    // Auto-create a draft delivery note with same items
    const dnNum = `DN${Date.now()}`
    const dnR = await execute(
      'INSERT INTO delivery_notes (dn_number,customer_id,customer_name,customer_order_id,delivery_date,status,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [dnNum, b.customer_id, cust?.customer_name||'', orderId, b.po_date||null, 'draft', b.remark||'', c.get('user').userId, now8()]
    )
    const dnId = dnR.insertId
    for (const oi of createdOrderItems) {
      const bom = await queryOne<any>('SELECT product_sku, product_name, spec, unit FROM bom WHERE id=? AND deleted_at IS NULL', [oi.bom_id])
      await execute(
        'INSERT INTO delivery_note_items (dn_id,order_item_id,bom_id,material_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [dnId, oi.id, oi.bom_id, null, bom?.product_name||'', bom?.product_sku||'', bom?.spec||'', bom?.unit||'PCS', oi.qty, '', b.po_number||'', null]
      )
    }
    await audit(c.get('user'), 'CREATE', '出貨單(自動)', dnId, `${dnNum} ← ${b.po_number}`)

    return c.json({ id: orderId, dn_id: dnId, dn_number: dnNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/customer-orders/:id/status', authMiddleware, requirePerm('customer_order.create'), async c => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json()
    const valid = ['pending', 'partial', 'completed', 'delay']
    if (!valid.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    await execute('UPDATE customer_orders SET status=? WHERE id=?', [status, id])
    const row = await queryOne<any>('SELECT po_number FROM customer_orders WHERE id=? AND deleted_at IS NULL', [id])
    await audit(c.get('user'), 'STATUS_CHANGE', '客戶訂單', id, `${row?.po_number} → ${status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/customer-orders/:id', authMiddleware, requirePerm('customer_order.create'), async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>('SELECT status, po_number FROM customer_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.status === 'completed') return c.json({ error: '已完成的訂單不能修改' }, 400)
    const subtotal = (b.items||[]).reduce((s: number, i: any) => s + (i.qty||0) * (i.unit_price||0), 0)
    const taxRate = 0
    const taxAmount = 0
    const totalAmount = subtotal
    await execute('UPDATE customer_orders SET po_date=?,po_number=?,customer_id=?,remark=?,tax_rate=?,tax_amount=?,total_amount=?,currency=?,delivery_date=?,delivery_address=?,person_in_charge=?,payment_terms=? WHERE id=?',
      [b.po_date||null, existing.po_number, b.customer_id, b.remark||'', taxRate, taxAmount, totalAmount, b.currency||'VND', b.delivery_date||null, b.delivery_address||'', b.person_in_charge||'', b.payment_terms||'', id])
    // Replace items
    await execute('DELETE FROM customer_order_items WHERE order_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        if (!item.bom_id) continue
        await execute('INSERT INTO customer_order_items (order_id,bom_id,qty,unit_price,rta_date,remark,arrived_qty,balance,status) VALUES (?,?,?,?,?,?,?,?,?)',
          [id, item.bom_id, item.qty||0, item.unit_price||0, null, item.remark||'', 0, item.qty||0, 'pending'])
      }
    }
    // Sync linked draft delivery notes so item changes (e.g. added BOM) are reflected.
    const draftDeliveryNotes = await query<any>(
      'SELECT id, dn_number FROM delivery_notes WHERE customer_order_id=? AND deleted_at IS NULL AND status=?',
      [id, 'draft']
    )
    const lockedDeliveryNotes = await queryOne<any>(
      'SELECT COUNT(*) as cnt FROM delivery_notes WHERE customer_order_id=? AND deleted_at IS NULL AND status<>?',
      [id, 'draft']
    )
    const syncedOrderItems = await query<any>('SELECT id, bom_id, qty FROM customer_order_items WHERE order_id=? ORDER BY id ASC', [id])
    for (const dn of draftDeliveryNotes) {
      await execute('DELETE FROM delivery_note_items WHERE dn_id=?', [dn.id])
      for (const oi of syncedOrderItems) {
        const bom = await queryOne<any>('SELECT product_sku, product_name, spec, unit FROM bom WHERE id=? AND deleted_at IS NULL', [oi.bom_id])
        await execute(
          'INSERT INTO delivery_note_items (dn_id,order_item_id,bom_id,material_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [dn.id, oi.id, oi.bom_id, null, bom?.product_name||'', bom?.product_sku||'', bom?.spec||'', bom?.unit||'PCS', oi.qty||0, '', existing.po_number||'', null]
        )
      }
      await audit(u, 'AUTO_UPDATE', '出貨單', dn.id, `${dn.dn_number} ← ${existing.po_number}（客戶訂單變更同步）`)
    }

    await audit(
      u,
      'UPDATE',
      '客戶訂單',
      id,
      `${existing.po_number}（同步尚未確認出貨單 ${draftDeliveryNotes.length} 筆，略過非尚未確認 ${Number(lockedDeliveryNotes?.cnt || 0)} 筆）`
    )
    return c.json({
      ok: true,
      synced_delivery_notes: draftDeliveryNotes.length,
      skipped_delivery_notes: Number(lockedDeliveryNotes?.cnt || 0),
    })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/customer-orders/:id', authMiddleware, requirePerm('customer_order.delete'), async c => {
  try {
    const id = c.req.param('id')
    const deletedBy = c.get('user')?.userId || null
    const deletedAt = now8()
    const row = await queryOne<any>(`
      SELECT co.po_number, c.customer_name
      FROM customer_orders co LEFT JOIN customers c ON co.customer_id = c.id AND c.deleted_at IS NULL
      WHERE co.id=? AND co.deleted_at IS NULL`, [id])
    if (!row) return c.json({ error: 'Not found' }, 404)
    await execute('UPDATE delivery_notes SET deleted_at=?, deleted_by=? WHERE customer_order_id=? AND deleted_at IS NULL', [deletedAt, deletedBy, id])
    await execute('UPDATE delivery_sheets SET deleted_at=?, deleted_by=? WHERE customer_order_id=? AND deleted_at IS NULL', [deletedAt, deletedBy, id])

    // Release po_number for future reuse after soft delete.
    const deletedPoNumber = `${String(row.po_number || '').trim()}#DEL${Date.now()}-${id}`
    await execute('UPDATE customer_orders SET po_number=? WHERE id=? AND deleted_at IS NULL', [deletedPoNumber, id])
    await softDeleteById('customer_orders', id, deletedBy)
    await audit(c.get('user'), 'DELETE', '客戶訂單', id, `${row?.po_number} / ${row?.customer_name}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Profit Tracking (Manager only) ───────────────────────────────────────────
app.get('/api/profit-tracking/orders', authMiddleware, requireManager, async c => {
  try {
    await ensureProfitTrackingTable()
    const url = new URL(c.req.url)
    const search = (url.searchParams.get('search') || '').trim()
    const status = (url.searchParams.get('status') || '').trim()
    const where: string[] = []
    const params: any[] = []
    if (status) { where.push('co.status=?'); params.push(status) }
    if (search) {
      where.push('(co.po_number LIKE ? OR c.customer_name LIKE ? OR c.customer_code LIKE ?)')
      const term = `%${search}%`
      params.push(term, term, term)
    }
    where.unshift('co.deleted_at IS NULL')
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const orders = await query<any>(`
      SELECT co.id, co.po_number, co.po_date, co.status, co.created_at, co.currency,
             ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(co.customer_name, \'\')', '\'\'')} as customer_name,
             c.customer_code
      FROM customer_orders co
      LEFT JOIN customers c ON co.customer_id = c.id AND c.deleted_at IS NULL
      ${whereClause}
      ORDER BY co.created_at DESC
      LIMIT 500
    `, params.length ? params : undefined)

    if (!orders.length) return c.json({ orders: [] })

    const orderIds = orders.map((o: any) => Number(o.id))
    const idPlaceholders = orderIds.map(() => '?').join(',')
    const itemSums = await query<any>(`
      SELECT ci.order_id,
             COALESCE(SUM(ci.qty * ci.unit_price), 0) as revenue,
             COALESCE(SUM(ci.qty * COALESCE(b.company_price, b.supplier_price, 0)), 0) as cogs
      FROM customer_order_items ci
      LEFT JOIN bom b ON b.id = ci.bom_id
      WHERE ci.order_id IN (${idPlaceholders})
      GROUP BY ci.order_id
    `, orderIds)
    const entrySums = await query<any>(`
      SELECT ope.order_id,
             COALESCE(SUM(CASE WHEN ope.category IN ('operating_cost','logistics','platform_fee','other_cost') THEN ope.amount ELSE 0 END), 0) as operating_cost,
             COALESCE(SUM(CASE WHEN ope.category='sales_tax' THEN ope.amount ELSE 0 END), 0) as sales_tax,
             COALESCE(SUM(CASE WHEN ope.category='income_tax' THEN ope.amount ELSE 0 END), 0) as income_tax,
             COALESCE(SUM(CASE WHEN ope.category='manual_adjustment' THEN ope.amount ELSE 0 END), 0) as manual_adjustment
      FROM order_profit_entries ope
      WHERE ope.order_id IN (${idPlaceholders}) AND ope.deleted_at IS NULL
      GROUP BY ope.order_id
    `, orderIds)

    const itemMap = new Map<number, any>()
    const entryMap = new Map<number, any>()
    itemSums.forEach((row: any) => itemMap.set(Number(row.order_id), row))
    entrySums.forEach((row: any) => entryMap.set(Number(row.order_id), row))

    const result = orders.map((o: any) => {
      const item = itemMap.get(Number(o.id)) || {}
      const entry = entryMap.get(Number(o.id)) || {}
      const revenue = toAmount(item.revenue)
      const cogs = toAmount(item.cogs)
      const operating_cost = toAmount(entry.operating_cost)
      const sales_tax = toAmount(entry.sales_tax)
      const income_tax = toAmount(entry.income_tax)
      const manual_adjustment = toAmount(entry.manual_adjustment)
      const gross_profit = toAmount(revenue - cogs)
      const net_profit = toAmount(gross_profit - operating_cost - sales_tax - income_tax + manual_adjustment)
      const net_margin = calcMargin(net_profit, revenue)
      return {
        ...o,
        revenue,
        cogs,
        gross_profit,
        operating_cost,
        sales_tax,
        income_tax,
        manual_adjustment,
        net_profit,
        net_margin,
      }
    })
    return c.json({ orders: result })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.get('/api/profit-tracking/orders/:id', authMiddleware, requireManager, async c => {
  try {
    await ensureProfitTrackingTable()
    const orderId = Number(c.req.param('id'))
    if (!Number.isFinite(orderId)) return c.json({ error: 'Invalid order id' }, 400)
    const order = await queryOne<any>(`
      SELECT co.id, co.po_number, co.po_date, co.status, co.remark, co.currency,
             co.delivery_date, co.delivery_address, co.person_in_charge, co.payment_terms,
             ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(co.customer_name, \'\')', '\'\'')} as customer_name,
             c.customer_code
      FROM customer_orders co
      LEFT JOIN customers c ON c.id = co.customer_id AND c.deleted_at IS NULL
      WHERE co.id=? AND co.deleted_at IS NULL
    `, [orderId])
    if (!order) return c.json({ error: 'Not found' }, 404)

    const items = await query<any>(`
      SELECT ci.id, ci.bom_id, ci.qty, ci.unit_price, ci.remark,
             b.product_sku, b.product_name, b.spec, b.unit,
             COALESCE(b.company_price, b.supplier_price, 0) as standard_cost
      FROM customer_order_items ci
      LEFT JOIN bom b ON b.id = ci.bom_id
      WHERE ci.order_id=?
      ORDER BY ci.id ASC
    `, [orderId])

    const entries = await query<any>(`
      SELECT id, order_id, category, description, amount, remark, created_by, created_at, updated_at
      FROM order_profit_entries
      WHERE order_id=? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
    `, [orderId])

    let revenue = 0
    let cogs = 0
    const itemRows = items.map((item: any) => {
      const qty = toAmount(item.qty)
      const unit_price = toAmount(item.unit_price)
      const standard_cost = toAmount(item.standard_cost)
      const line_revenue = toAmount(qty * unit_price)
      const line_cost = toAmount(qty * standard_cost)
      revenue += line_revenue
      cogs += line_cost
      return { ...item, qty, unit_price, standard_cost, line_revenue, line_cost, line_gross: toAmount(line_revenue - line_cost) }
    })
    revenue = toAmount(revenue)
    cogs = toAmount(cogs)
    const gross_profit = toAmount(revenue - cogs)

    const entryTotals = { operating_cost: 0, sales_tax: 0, income_tax: 0, manual_adjustment: 0 }
    const normalizedEntries = entries.map((entry: any) => {
      const amount = toAmount(entry.amount)
      if (['operating_cost', 'logistics', 'platform_fee', 'other_cost'].includes(entry.category)) {
        entryTotals.operating_cost += amount
      } else if (entry.category === 'sales_tax') {
        entryTotals.sales_tax += amount
      } else if (entry.category === 'income_tax') {
        entryTotals.income_tax += amount
      } else if (entry.category === 'manual_adjustment') {
        entryTotals.manual_adjustment += amount
      }
      return { ...entry, amount }
    })

    entryTotals.operating_cost = toAmount(entryTotals.operating_cost)
    entryTotals.sales_tax = toAmount(entryTotals.sales_tax)
    entryTotals.income_tax = toAmount(entryTotals.income_tax)
    entryTotals.manual_adjustment = toAmount(entryTotals.manual_adjustment)

    const net_profit = toAmount(
      gross_profit
      - entryTotals.operating_cost
      - entryTotals.sales_tax
      - entryTotals.income_tax
      + entryTotals.manual_adjustment
    )

    return c.json({
      order,
      items: itemRows,
      entries: normalizedEntries,
      summary: {
        revenue,
        cogs,
        gross_profit,
        operating_cost: entryTotals.operating_cost,
        sales_tax: entryTotals.sales_tax,
        income_tax: entryTotals.income_tax,
        manual_adjustment: entryTotals.manual_adjustment,
        net_profit,
        net_margin: calcMargin(net_profit, revenue),
      },
    })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.get('/api/profit-tracking/config', authMiddleware, requireManager, async c => {
  try {
    await ensureCompanyProfitRatesColumns()
    const row = await queryOne<any>(`
      SELECT operating_cost_rate, vat_rate, cit_rate
      FROM company_settings
      WHERE id=1
    `)
    return c.json({
      operating_cost_rate: toRate(row?.operating_cost_rate),
      vat_rate: toRate(row?.vat_rate),
      cit_rate: toRate(row?.cit_rate),
    })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.put('/api/profit-tracking/config', authMiddleware, requireManager, async c => {
  try {
    await ensureCompanyProfitRatesColumns()
    const b = await c.req.json()
    const operating_cost_rate = toRate(b.operating_cost_rate)
    const vat_rate = toRate(b.vat_rate)
    const cit_rate = toRate(b.cit_rate)
    await execute(
      `INSERT INTO company_settings (id, operating_cost_rate, vat_rate, cit_rate)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE operating_cost_rate=?, vat_rate=?, cit_rate=?`,
      [operating_cost_rate, vat_rate, cit_rate, operating_cost_rate, vat_rate, cit_rate]
    )
    await audit(c.get('user'), 'UPDATE', '利潤參數', 1, `op=${operating_cost_rate} vat=${vat_rate} cit=${cit_rate}`)
    return c.json({ ok: true, operating_cost_rate, vat_rate, cit_rate })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.post('/api/profit-tracking/orders/:id/apply-rates', authMiddleware, requireManager, async c => {
  try {
    await ensureProfitTrackingTable()
    await ensureCompanyProfitRatesColumns()
    const orderId = Number(c.req.param('id'))
    if (!Number.isFinite(orderId)) return c.json({ error: 'Invalid order id' }, 400)
    const order = await queryOne<any>('SELECT id, po_number FROM customer_orders WHERE id=? AND deleted_at IS NULL', [orderId])
    if (!order) return c.json({ error: 'Order not found' }, 404)

    const row = await queryOne<any>(`
      SELECT
        COALESCE(SUM(ci.qty * ci.unit_price), 0) as revenue,
        COALESCE(SUM(ci.qty * COALESCE(b.company_price, b.supplier_price, 0)), 0) as cogs
      FROM customer_order_items ci
      LEFT JOIN bom b ON b.id = ci.bom_id
      WHERE ci.order_id=?
    `, [orderId])
    const revenue = toAmount(row?.revenue)
    const cogs = toAmount(row?.cogs)
    const grossProfit = toAmount(revenue - cogs)
    const cfg = await queryOne<any>(`
      SELECT operating_cost_rate, vat_rate, cit_rate
      FROM company_settings
      WHERE id=1
    `)
    const operating_cost_rate = toRate(cfg?.operating_cost_rate)
    const vat_rate = toRate(cfg?.vat_rate)
    const cit_rate = toRate(cfg?.cit_rate)

    // Danny confirmed formula:
    // 1) taxes are calculated on gross profit
    // 2) operating cost is calculated on after-tax gross profit
    const salesTax = pctAmount(grossProfit, vat_rate)
    const incomeTax = pctAmount(grossProfit, cit_rate)
    const afterTaxGross = toAmount(grossProfit - salesTax - incomeTax)
    const operatingCost = pctAmount(afterTaxGross, operating_cost_rate)

    await execute(
      `UPDATE order_profit_entries
       SET deleted_at=?, deleted_by=?
       WHERE order_id=? AND category IN ('operating_cost','sales_tax','income_tax') AND description LIKE ? AND deleted_at IS NULL`,
      [now8(), c.get('user')?.userId || null, orderId, `${AUTO_RATE_PREFIX}%`]
    )

    const u = c.get('user')
    let inserted = 0
    const insertRow = async (category: string, amount: number, description: string) => {
      if (amount <= 0) return
      inserted += 1
      await execute(
        'INSERT INTO order_profit_entries (order_id,category,description,amount,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
        [orderId, category, description, amount, '', u.userId, now8()]
      )
    }
    await insertRow('operating_cost', operatingCost, `${AUTO_RATE_PREFIX}營運成本 (${operating_cost_rate}%)`)
    await insertRow('sales_tax', salesTax, `${AUTO_RATE_PREFIX}營業稅 (${vat_rate}%)`)
    await insertRow('income_tax', incomeTax, `${AUTO_RATE_PREFIX}所得稅 (${cit_rate}%)`)

    await audit(
      u,
      'UPDATE',
      '利潤追蹤',
      orderId,
      `${order.po_number} auto-rates revenue=${revenue} cogs=${cogs} gross=${grossProfit} after_tax_gross=${afterTaxGross} op=${operatingCost} vat=${salesTax} cit=${incomeTax}`
    )
    return c.json({
      ok: true,
      inserted,
      revenue,
      cogs,
      gross_profit: grossProfit,
      after_tax_gross: afterTaxGross,
      rates: { operating_cost_rate, vat_rate, cit_rate },
      amounts: { operating_cost: operatingCost, sales_tax: salesTax, income_tax: incomeTax },
    })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.post('/api/profit-tracking/orders/:id/entries', authMiddleware, requireManager, async c => {
  try {
    await ensureProfitTrackingTable()
    const orderId = Number(c.req.param('id'))
    if (!Number.isFinite(orderId)) return c.json({ error: 'Invalid order id' }, 400)
    const order = await queryOne<any>('SELECT id, po_number FROM customer_orders WHERE id=? AND deleted_at IS NULL', [orderId])
    if (!order) return c.json({ error: 'Order not found' }, 404)

    const b = await c.req.json()
    const category = String(b.category || '')
    if (!PROFIT_ENTRY_CATEGORIES.includes(category as any)) return c.json({ error: 'Invalid category' }, 400)
    const description = String(b.description || '').trim()
    if (!description) return c.json({ error: 'description required' }, 400)
    const amount = toAmount(b.amount)
    if (category !== 'manual_adjustment' && amount < 0) return c.json({ error: 'amount must be >= 0' }, 400)
    if (amount === 0) return c.json({ error: 'amount must not be 0' }, 400)

    const u = c.get('user')
    const r = await execute(
      'INSERT INTO order_profit_entries (order_id,category,description,amount,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
      [orderId, category, description, amount, String(b.remark || ''), u.userId, now8()]
    )
    await audit(u, 'CREATE', '利潤追蹤', r.insertId, `${order.po_number} / ${category} / ${amount}`)
    return c.json({ ok: true, id: r.insertId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.delete('/api/profit-tracking/entries/:entryId', authMiddleware, requireManager, async c => {
  try {
    await ensureProfitTrackingTable()
    const entryId = Number(c.req.param('entryId'))
    if (!Number.isFinite(entryId)) return c.json({ error: 'Invalid entry id' }, 400)
    const row = await queryOne<any>(`
      SELECT ope.id, ope.order_id, ope.category, ope.amount, co.po_number
      FROM order_profit_entries ope
      LEFT JOIN customer_orders co ON co.id = ope.order_id
      WHERE ope.id=? AND ope.deleted_at IS NULL
    `, [entryId])
    if (!row) return c.json({ error: 'Not found' }, 404)
    await softDeleteById('order_profit_entries', entryId, c.get('user')?.userId)
    await audit(c.get('user'), 'DELETE', '利潤追蹤', entryId, `${row.po_number || row.order_id} / ${row.category} / ${row.amount}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Quotations ────────────────────────────────────────────────────────────────
app.get('/api/quotations', authMiddleware, async c => c.json(await query(`
  SELECT q.*, ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(q.customer_name, \'\')', '\'\'')} as customer_name, c.customer_code
  FROM quotations q LEFT JOIN customers c ON q.customer_id = c.id AND c.deleted_at IS NULL
  WHERE q.deleted_at IS NULL
  ORDER BY q.created_at DESC
`)))
app.get('/api/quotations/:id', authMiddleware, async c => {
  const q = await queryOne<any>(`
    SELECT q.*, ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(q.customer_name, \'\')', '\'\'')} as customer_name, c.customer_code
    FROM quotations q LEFT JOIN customers c ON q.customer_id = c.id AND c.deleted_at IS NULL
    WHERE q.id=? AND q.deleted_at IS NULL`, [c.req.param('id')])
  if (!q) return c.json({ error: 'Not found' }, 404)
  const rawItems = await query<any>(`
    SELECT qi.*,
           COALESCE(b.product_name, '') as item_name,
           COALESCE(b.product_sku, qi.material_code, '') as material_code,
           COALESCE(b.spec, '') as spec,
           COALESCE(b.unit, 'PCS') as unit,
           COALESCE(b.image_url, qi.image_url, '') as image_url
    FROM quotation_items qi
    LEFT JOIN bom b ON qi.bom_id = b.id AND b.deleted_at IS NULL
    WHERE qi.quotation_id=?
  `, [c.req.param('id')])
  // Parse moq JSON into moq_tiers array
  const items = rawItems.map((item: any) => {
    let moq_tiers: {moq:number;price:number}[] = []
    if (item.moq) {
      try {
        const parsed = JSON.parse(String(item.moq))
        if (Array.isArray(parsed)) moq_tiers = parsed
      } catch { /* legacy number */ }
    }
    return { ...item, moq_tiers }
  })
  return c.json({ ...q, items })
})
app.post('/api/quotations', authMiddleware, requirePerm('customer_order.create'), async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    const qNum = String(b.quotation_number || '').trim()
    if (!qNum) return c.json({ error: 'quotation_number is required' }, 400)
    const total = (b.items||[]).reduce((s: number, i: any) => s + (i.total_price||0), 0)
    const r = await execute('INSERT INTO quotations (quotation_number,customer_id,customer_name,status,total_amount,currency,valid_until,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [qNum,b.customer_id||null,b.customer_name,'draft',total,b.currency||'VND',b.valid_until||null,b.remark||'',u.userId,now8()])
    const qId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO quotation_items (quotation_id,bom_id,material_id,item_name,material_code,spec,unit,qty,unit_price,total_price,remark,moq,image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [qId,item.bom_id||null,null,item.item_name,item.material_code||'',item.spec||'',item.unit||'PCS',item.qty,item.unit_price||0,(item.qty||0)*(item.unit_price||0),item.remark||'',item.moq||null,item.image_url||null])
      }
    }
    await audit(u, 'CREATE', '報價單', qId, `${qNum} / ${b.customer_name}`)
    return c.json({ id: qId, quotation_number: qNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/quotations/:id', authMiddleware, requirePerm('customer_order.create'), async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>('SELECT status FROM quotations WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.status !== 'draft') return c.json({ error: '只能編輯尚未審核狀態的報價單' }, 400)
    const qNum = String(b.quotation_number || '').trim()
    if (!qNum) return c.json({ error: 'quotation_number is required' }, 400)
    const total = (b.items||[]).reduce((s: number, i: any) => s + (i.total_price||0), 0)
    await execute('UPDATE quotations SET quotation_number=?,customer_id=?,customer_name=?,currency=?,valid_until=?,remark=?,total_amount=? WHERE id=?',
      [qNum, b.customer_id||null, b.customer_name, b.currency||'VND', b.valid_until||null, b.remark||'', total, id])
    await execute('DELETE FROM quotation_items WHERE quotation_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO quotation_items (quotation_id,bom_id,material_id,item_name,material_code,spec,unit,qty,unit_price,total_price,remark,moq,image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [id,item.bom_id||null,null,item.item_name,item.material_code||'',item.spec||'',item.unit||'PCS',item.qty,item.unit_price||0,(item.qty||0)*(item.unit_price||0),item.remark||'',item.moq||null,item.image_url||null])
      }
    }
    await audit(u, 'UPDATE', '報價單', id, `${qNum} / ${b.customer_name}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/quotations/:id/status', authMiddleware, async c => {
  try {
    const id = c.req.param('id'); const { status } = await c.req.json(); const user = c.get('user')
    const validStatuses = ['pending_review', 'draft', 'approved', 'sent', 'accepted', 'rejected']
    if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    const row = await queryOne<any>('SELECT quotation_number,customer_name,status,total_amount,currency FROM quotations WHERE id=? AND deleted_at IS NULL', [id])
    if (!row) return c.json({ error: 'Not found' }, 404)

    if (status === 'pending_review') {
      // 任何有 create 權限的人可以提交審核，只有 draft 可以提交
      if (!await hasPermission(user, 'customer_order.create')) return c.json({ error: '無此操作權限（customer_order.create）' }, 403)
      if (row.status !== 'draft') return c.json({ error: '只有草稿狀態的報價單才能提交審核' }, 400)
    } else if (status === 'draft') {
      // 退回草稿（撤回提交）
      if (!await hasPermission(user, 'customer_order.create')) return c.json({ error: '無此操作權限（customer_order.create）' }, 403)
      if (row.status !== 'pending_review') return c.json({ error: '只有待審核狀態的報價單才能退回草稿' }, 400)
    } else if (status === 'approved') {
      if (!await hasPermission(user, 'quotation.approve')) return c.json({ error: '無此操作權限（quotation.approve）' }, 403)
      if (row.status !== 'pending_review') return c.json({ error: '只有待審核狀態的報價單才能審核通過' }, 400)
    } else if (status === 'sent') {
      if (!await hasPermission(user, 'customer_order.create')) return c.json({ error: '無此操作權限（customer_order.create）' }, 403)
      if (row.status !== 'approved') return c.json({ error: '只有已審核的報價單才能送出' }, 400)
    } else {
      if (!await hasPermission(user, 'customer_order.create')) return c.json({ error: '無此操作權限（customer_order.create）' }, 403)
      if (row.status !== 'sent') return c.json({ error: '只有已送出的報價單才能更新結果' }, 400)
    }

    await execute('UPDATE quotations SET status=? WHERE id=?', [status,id])
    await audit(user, 'STATUS_CHANGE', '報價單', id, `${row?.quotation_number} ${row?.status} → ${status}`)

    // 提交審核時發通知郵件（非阻塞）
    if (status === 'pending_review') {
      ;(async () => {
        try {
          const co = await queryOne<any>('SELECT notification_email FROM company_settings WHERE id=1')
          const notifyEmail = co?.notification_email?.trim()
          if (notifyEmail) {
            const { subject, html } = buildPendingApprovalEmail({
              type: '報價單',
              number: row.quotation_number,
              name: row.customer_name,
              createdBy: user.username || user.email || String(user.userId),
              amount: row.total_amount,
              currency: row.currency || 'VND',
            })
            await sendNotificationEmail({ to: notifyEmail, subject, html })
          }
        } catch {}
      })()
    }

    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/quotations/:id', authMiddleware, requirePerm('customer_order.delete'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT quotation_number,customer_name FROM quotations WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  await softDeleteById('quotations', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '報價單', id, `${row?.quotation_number} / ${row?.customer_name}`)
  return c.json({ ok: true })
})

// ── Delivery Notes ────────────────────────────────────────────────────────────
app.get('/api/delivery-notes/overview', authMiddleware, async c => {
  const orders = await query<any>(`
    SELECT
      co.id as customer_order_id,
      co.customer_id,
      co.po_number as order_po_number,
      COALESCE(c.customer_name, co.customer_name, '') as customer_name,
      co.status as order_status,
      co.created_at,
      COALESCE(SUM(ci.qty), 0) as order_qty
    FROM customer_orders co
    LEFT JOIN customers c ON c.id = co.customer_id AND c.deleted_at IS NULL
    LEFT JOIN customer_order_items ci ON ci.order_id = co.id
    WHERE co.deleted_at IS NULL
    GROUP BY co.id, co.customer_id, co.po_number, c.customer_name, co.customer_name, co.status, co.created_at
    ORDER BY co.created_at DESC
  `)

  const notes = await query<any>(`
    SELECT
      dn.id,
      dn.dn_number,
      dn.customer_order_id,
      dn.customer_name,
      dn.delivery_date,
      dn.status,
      dn.remark,
      dn.created_at,
      COALESCE(SUM(dni.qty), 0) as batch_qty
    FROM delivery_notes dn
    LEFT JOIN delivery_note_items dni ON dni.dn_id = dn.id
    WHERE dn.deleted_at IS NULL AND dn.customer_order_id IS NOT NULL
    GROUP BY dn.id, dn.dn_number, dn.customer_order_id, dn.customer_name, dn.delivery_date, dn.status, dn.remark, dn.created_at
    ORDER BY dn.created_at DESC
  `)

  const notesByOrder = new Map<number, any[]>()
  for (const n of notes) {
    const key = Number(n.customer_order_id || 0)
    if (!notesByOrder.has(key)) notesByOrder.set(key, [])
    notesByOrder.get(key)!.push(n)
  }

  const shippedByOrder = new Map<number, number>()
  const shippedRows = await query<any>(`
    SELECT dn.customer_order_id, COALESCE(SUM(dni.qty),0) as shipped_qty
    FROM delivery_notes dn
    JOIN delivery_note_items dni ON dni.dn_id = dn.id
    WHERE dn.deleted_at IS NULL AND dn.status='shipped' AND dn.customer_order_id IS NOT NULL
    GROUP BY dn.customer_order_id
  `)
  for (const row of shippedRows) {
    shippedByOrder.set(Number(row.customer_order_id || 0), Number(row.shipped_qty || 0))
  }

  const data = orders.map((o: any) => {
    const orderQty = Number(o.order_qty || 0)
    const shippedQty = Number(shippedByOrder.get(Number(o.customer_order_id || 0)) || 0)
    const ratio = orderQty > 0 ? Math.min(100, Math.max(0, (shippedQty / orderQty) * 100)) : 0
    const progressStatus = shippedQty <= 0 ? 'pending' : shippedQty >= orderQty ? 'completed' : 'partial'
    return {
      customer_order_id: Number(o.customer_order_id),
      customer_id: o.customer_id ? Number(o.customer_id) : null,
      order_po_number: o.order_po_number || '',
      customer_name: o.customer_name || '',
      order_status: o.order_status || 'pending',
      order_qty: orderQty,
      shipped_qty: shippedQty,
      remaining_qty: Math.max(0, orderQty - shippedQty),
      shipping_ratio: Math.round(ratio * 100) / 100,
      progress_status: progressStatus,
      notes: notesByOrder.get(Number(o.customer_order_id || 0)) || [],
    }
  })

  return c.json(data)
})

app.get('/api/delivery-notes', authMiddleware, async c => c.json(await query(`
  SELECT dn.*, ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(dn.customer_name, \'\')', '\'\'')} as customer_name, c.customer_code,
         co.po_number as order_po_number
  FROM delivery_notes dn 
  LEFT JOIN customers c ON dn.customer_id = c.id AND c.deleted_at IS NULL
  LEFT JOIN customer_orders co ON dn.customer_order_id = co.id AND co.deleted_at IS NULL
  WHERE dn.deleted_at IS NULL
  ORDER BY dn.created_at DESC
`)))
app.get('/api/delivery-notes/:id', authMiddleware, async c => {
  const dn = await queryOne<any>(`
    SELECT dn.*, ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(dn.customer_name, \'\')', '\'\'')} as customer_name, c.customer_code, c.address,
           co.po_number as po_ref
    FROM delivery_notes dn 
    LEFT JOIN customers c ON dn.customer_id = c.id AND c.deleted_at IS NULL
    LEFT JOIN customer_orders co ON dn.customer_order_id = co.id AND co.deleted_at IS NULL
    WHERE dn.id=? AND dn.deleted_at IS NULL`, [c.req.param('id')])
  if (!dn) return c.json({ error: 'Not found' }, 404)
  const items = await query(`
    SELECT dni.*, 
           COALESCE(b.product_name, '') as item_name,
           COALESCE(b.spec, '') as spec,
           COALESCE(b.unit, 'PCS') as unit
    FROM delivery_note_items dni
    LEFT JOIN bom b ON dni.bom_id = b.id AND b.deleted_at IS NULL
    WHERE dni.dn_id=?`, [c.req.param('id')])
  return c.json({ ...dn, items })
})
app.post('/api/delivery-notes', authMiddleware, requirePerm('delivery.create'), async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    // Get customer name from customer_id if not provided
    let customerName = b.customer_name || ''
    if (!customerName && b.customer_id) {
      const cust = await queryOne<any>('SELECT customer_name FROM customers WHERE id=? AND deleted_at IS NULL', [b.customer_id])
      customerName = cust?.customer_name || ''
    }
    const dnNum = String(b.dn_number || '').trim()
    if (!dnNum) return c.json({ error: 'dn_number is required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM delivery_notes WHERE dn_number=? AND deleted_at IS NULL', [dnNum])
    if (duplicated) return c.json({ error: `出貨單號「${dnNum}」已存在，請使用不同編號` }, 409)
    const r = await execute('INSERT INTO delivery_notes (dn_number,customer_id,customer_name,customer_order_id,delivery_date,status,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [dnNum, b.customer_id||null, customerName, b.customer_order_id||null, b.delivery_date||null, 'draft', b.remark||'', u.userId, now8()])
    const dnId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        const orderItemId = Number(item.order_item_id || 0) || null
        await execute('INSERT INTO delivery_note_items (dn_id,order_item_id,bom_id,material_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [dnId, orderItemId, item.bom_id||null, null, item.item_name||'', item.material_code||'', item.spec||'', item.unit||'PCS', item.qty||0, item.remark||'', item.po_ref||'', item.thickness||null])
      }
    }
    await audit(u, 'CREATE', '出貨單', dnId, `${dnNum} / ${customerName}`)
    return c.json({ id: dnId, dn_number: dnNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/delivery-notes/:id', authMiddleware, requirePerm('delivery.create'), async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>('SELECT status FROM delivery_notes WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.status !== 'draft') return c.json({ error: '只能編輯尚未確認狀態的出貨單' }, 400)
    const dnNum = String(b.dn_number || '').trim()
    if (!dnNum) return c.json({ error: 'dn_number is required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM delivery_notes WHERE dn_number=? AND id<>? AND deleted_at IS NULL', [dnNum, id])
    if (duplicated) return c.json({ error: `出貨單號「${dnNum}」已存在，請使用不同編號` }, 409)
    await execute('UPDATE delivery_notes SET dn_number=?,delivery_date=?,remark=? WHERE id=?',
      [dnNum, b.delivery_date||null, b.remark||'', id])
    await execute('DELETE FROM delivery_note_items WHERE dn_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        const orderItemId = Number(item.order_item_id || 0) || null
        await execute('INSERT INTO delivery_note_items (dn_id,order_item_id,bom_id,material_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [id, orderItemId, item.bom_id||null, null, item.item_name||'', item.material_code||'', item.spec||'', item.unit||'PCS', item.qty||0, item.remark||'', item.po_ref||'', item.thickness||null])
      }
    }
    await audit(u, 'UPDATE', '出貨單', id, dnNum)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/delivery-notes/:id/status', authMiddleware, requirePerm('delivery.create'), async c => {
  try {
    const id = c.req.param('id'); const { status } = await c.req.json()
    const u = c.get('user')
    const row = await queryOne<any>('SELECT dn_number,customer_name,status as current_status FROM delivery_notes WHERE id=? AND deleted_at IS NULL', [id])
    if (!row) return c.json({ error: 'Not found' }, 404)
    if (row.current_status === 'shipped') return c.json({ error: '此出貨單已出貨，不可重複操作' }, 400)
    if (status === 'shipped' && row.current_status !== 'confirmed') return c.json({ error: '出貨前需先確認出貨單' }, 400)

    // When shipped: deduct stock from BOM
    if (status === 'shipped') {
      const items = await query<any>('SELECT * FROM delivery_note_items WHERE dn_id=?', [id])
      for (const item of items) {
        if (!item.bom_id) continue
        const qty = parseFloat(item.qty) || 0
        const bom = await queryOne<any>('SELECT id, product_sku, product_name, unit, current_stock FROM bom WHERE id=?', [item.bom_id])
        const before = parseFloat(bom?.current_stock) || 0
        const after = Math.max(0, before - qty)
        if (bom) {
          await execute('UPDATE bom SET current_stock=? WHERE id=?', [after, item.bom_id])
        }
        await execute(
          'INSERT INTO stock_ledger (material_code,material_name,transaction_type,ref_type,ref_id,ref_number,qty_change,qty_before,qty_after,unit,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [bom?.product_sku || item.material_code, bom?.product_name || '', 'DN_OUT', 'delivery_note', id, row.dn_number, -qty, before, after, bom?.unit || 'PCS', `出貨 ${row.dn_number}`, u.userId, now8()]
        )
      }
    }

    await execute('UPDATE delivery_notes SET status=? WHERE id=?', [status, id])

    if (status === 'shipped') {
      const dn = await queryOne<any>('SELECT customer_order_id FROM delivery_notes WHERE id=? AND deleted_at IS NULL', [id])
      if (dn?.customer_order_id) {
        await syncCustomerOrderArrivedFromShippedDns(Number(dn.customer_order_id))
        await audit(u, 'AUTO_UPDATE', '客戶訂單', dn.customer_order_id, '出貨後依 order_item_id 自動回寫數量')
      }
    }

    await audit(u, 'STATUS_CHANGE', '出貨單', id, `${row.dn_number} → ${status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/delivery-notes/:id', authMiddleware, requirePerm('delivery.delete'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT dn_number,customer_name,customer_order_id,status FROM delivery_notes WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  const orderId = Number(row.customer_order_id || 0)
  await softDeleteById('delivery_notes', id, c.get('user')?.userId)
  if (orderId > 0 && row.status === 'shipped') {
    await syncCustomerOrderArrivedFromShippedDns(orderId)
  }
  await audit(c.get('user'), 'DELETE', '出貨單', id, `${row?.dn_number} / ${row?.customer_name}`)
  return c.json({ ok: true })
})

// ── Delivery Sheets (送貨單) ────────────────────────────────────────────────
app.get('/api/delivery-sheets', authMiddleware, async c => c.json(await query(`
  SELECT ds.*, ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(ds.customer_name, \'\')', '\'\'')} as customer_name, c.customer_code,
         co.po_number as order_po_number
  FROM delivery_sheets ds
  LEFT JOIN customers c ON ds.customer_id = c.id AND c.deleted_at IS NULL
  LEFT JOIN customer_orders co ON ds.customer_order_id = co.id AND co.deleted_at IS NULL
  WHERE ds.deleted_at IS NULL
  ORDER BY ds.created_at DESC
`)))
app.get('/api/delivery-sheets/:id', authMiddleware, async c => {
  const ds = await queryOne<any>(`
    SELECT ds.*, ${liveFirst('NULLIF(c.customer_name, \'\')', 'NULLIF(ds.customer_name, \'\')', '\'\'')} as customer_name, c.customer_code, c.address,
           co.po_number as po_ref
    FROM delivery_sheets ds
    LEFT JOIN customers c ON ds.customer_id = c.id AND c.deleted_at IS NULL
    LEFT JOIN customer_orders co ON ds.customer_order_id = co.id AND co.deleted_at IS NULL
    WHERE ds.id=? AND ds.deleted_at IS NULL`, [c.req.param('id')])
  if (!ds) return c.json({ error: 'Not found' }, 404)
  const items = await query(`
    SELECT dsi.*,
           COALESCE(b.product_name, '') as item_name,
           COALESCE(b.spec, '') as spec,
           COALESCE(b.unit, 'PCS') as unit
    FROM delivery_sheet_items dsi
    LEFT JOIN bom b ON dsi.bom_id = b.id AND b.deleted_at IS NULL
    WHERE dsi.ds_id=?`, [c.req.param('id')])
  return c.json({ ...ds, items })
})
app.post('/api/delivery-sheets', authMiddleware, requirePerm('delivery.create'), async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    let customerName = b.customer_name || ''
    if (!customerName && b.customer_id) {
      const cust = await queryOne<any>('SELECT customer_name FROM customers WHERE id=? AND deleted_at IS NULL', [b.customer_id])
      customerName = cust?.customer_name || ''
    }
    const dsNum = String(b.ds_number || '').trim()
    if (!dsNum) return c.json({ error: 'ds_number is required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM delivery_sheets WHERE ds_number=? AND deleted_at IS NULL', [dsNum])
    if (duplicated) return c.json({ error: `送貨單號「${dsNum}」已存在，請使用不同編號` }, 409)
    const r = await execute('INSERT INTO delivery_sheets (ds_number,customer_id,customer_name,customer_order_id,delivery_date,status,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [dsNum, b.customer_id||null, customerName, b.customer_order_id||null, b.delivery_date||null, 'draft', b.remark||'', u.userId, now8()])
    const dsId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO delivery_sheet_items (ds_id,bom_id,material_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [dsId, item.bom_id||null, null, item.item_name||'', item.material_code||'', item.spec||'', item.unit||'PCS', item.qty||0, item.remark||'', item.po_ref||'', item.thickness||null])
      }
    }
    await audit(u, 'CREATE', '送貨單', dsId, `${dsNum} / ${customerName}`)
    return c.json({ id: dsId, ds_number: dsNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/delivery-sheets/:id', authMiddleware, requirePerm('delivery.create'), async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>('SELECT status FROM delivery_sheets WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.status !== 'draft') return c.json({ error: '只能編輯尚未確認狀態的送貨單' }, 400)
    const dsNum = String(b.ds_number || '').trim()
    if (!dsNum) return c.json({ error: 'ds_number is required' }, 400)
    const duplicated = await queryOne<any>('SELECT id FROM delivery_sheets WHERE ds_number=? AND id<>? AND deleted_at IS NULL', [dsNum, id])
    if (duplicated) return c.json({ error: `送貨單號「${dsNum}」已存在，請使用不同編號` }, 409)
    await execute('UPDATE delivery_sheets SET ds_number=?,delivery_date=?,remark=? WHERE id=?',
      [dsNum, b.delivery_date||null, b.remark||'', id])
    await execute('DELETE FROM delivery_sheet_items WHERE ds_id=?', [id])
    if (b.items?.length) {
      for (const item of b.items) {
        await execute('INSERT INTO delivery_sheet_items (ds_id,bom_id,material_id,item_name,material_code,spec,unit,qty,remark,po_ref,thickness) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [id, item.bom_id||null, null, item.item_name||'', item.material_code||'', item.spec||'', item.unit||'PCS', item.qty||0, item.remark||'', item.po_ref||'', item.thickness||null])
      }
    }
    await audit(u, 'UPDATE', '送貨單', id, dsNum)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/delivery-sheets/:id', authMiddleware, requirePerm('delivery.delete'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT ds_number,customer_name FROM delivery_sheets WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  await softDeleteById('delivery_sheets', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '送貨單', id, `${row?.ds_number} / ${row?.customer_name}`)
  return c.json({ ok: true })
})

// ── Inventory ─────────────────────────────────────────────────────────────────
// Real-time inventory from bom.current_stock
app.get('/api/inventory', authMiddleware, async c => c.json(await query(`
  SELECT b.id, b.product_sku as product_code, b.product_name,
         b.spec, b.unit, COALESCE(b.current_stock, 0) as closing_balance,
         b.category, ${liveFirst('NULLIF(s.name, \'\')', 'NULLIF(b.supplier_name, \'\')', '\'\'')} as supplier_name, b.currency, b.image_url
  FROM bom b
  LEFT JOIN suppliers s ON b.supplier_id = s.id AND s.deleted_at IS NULL
  WHERE b.deleted_at IS NULL
  ORDER BY b.category, b.product_sku
`)))

// BOM-based inventory: only show stock for items that exist in BOM
app.get('/api/inventory/bom', authMiddleware, async c => c.json(await query(`
  SELECT b.id, b.product_sku as product_code, b.product_name,
         b.spec, b.unit, b.category,
         COALESCE(b.current_stock, 0) as closing_balance,
         ${liveFirst('NULLIF(s.name, \'\')', 'NULLIF(b.supplier_name, \'\')', '\'\'')} as supplier_name, b.currency,
         b.image_url
  FROM bom b
  LEFT JOIN suppliers s ON b.supplier_id = s.id AND s.deleted_at IS NULL
  WHERE b.deleted_at IS NULL
  ORDER BY b.category, b.product_sku
`)))
app.post('/api/inventory', authMiddleware, requirePerm('stock.adjust'), async c => {
  try {
    const b = await c.req.json()
    const closing = (b.opening_balance||0)+(b.inbound_qty||0)-(b.outbound_qty||0)
    const r = await execute('INSERT INTO inventory (product_code,product_name,spec,unit,opening_balance,inbound_qty,outbound_qty,closing_balance,warehouse_location,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [b.product_code,b.product_name,b.spec||'',b.unit||'PCS',b.opening_balance||0,b.inbound_qty||0,b.outbound_qty||0,closing,b.warehouse_location||'',b.remark||''])
    await audit(c.get('user'), 'CREATE', '庫存', r.insertId, `${b.product_code} ${b.product_name}`)
    return c.json({ id: r.insertId }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/inventory/:id', authMiddleware, requirePerm('stock.adjust'), async c => {
  try {
    const b = await c.req.json()
    const closing = (b.opening_balance||0)+(b.inbound_qty||0)-(b.outbound_qty||0)
    await execute('UPDATE inventory SET product_code=?,product_name=?,spec=?,unit=?,opening_balance=?,inbound_qty=?,outbound_qty=?,closing_balance=?,warehouse_location=?,remark=? WHERE id=?',
      [b.product_code,b.product_name,b.spec||'',b.unit||'PCS',b.opening_balance||0,b.inbound_qty||0,b.outbound_qty||0,closing,b.warehouse_location||'',b.remark||'',c.req.param('id')])
    await audit(c.get('user'), 'UPDATE', '庫存', c.req.param('id'), `${b.product_code} ${b.product_name}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/inventory/:id', authMiddleware, requirePerm('stock.adjust'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT product_code,product_name FROM inventory WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  await softDeleteById('inventory', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '庫存', id, `${row?.product_code} ${row?.product_name}`)
  return c.json({ ok: true })
})

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', authMiddleware, requirePerm('user.manage'), async c => {
  return c.json(await query(`
    SELECT id,email,name,
           CASE WHEN role='manager' THEN 'manager' ELSE 'employee' END as role,
           created_at
    FROM users
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `))
})
app.post('/api/users', authMiddleware, requirePerm('user.manage'), async c => {
  try {
    const u = c.get('user')
    const { email, password, name, role } = await c.req.json()
    if (!email || !password || !name) return c.json({ error: 'Missing fields' }, 400)
    const safeRole = role === 'manager' ? 'manager' : 'employee'
    const existing = await queryOne('SELECT id FROM users WHERE email=? AND deleted_at IS NULL', [email])
    if (existing) return c.json({ error: 'Email already exists' }, 409)
    const r = await execute('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)', [email,hashPw(password),name,safeRole])
    await audit(u, 'CREATE', '使用者', r.insertId, `${email} (${safeRole})`)
    return c.json({ id: r.insertId, email, name, role: safeRole }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/users/:id', authMiddleware, requirePerm('user.manage'), async c => {
  try {
    const u = c.get('user'); const id = c.req.param('id')
    const { name, role, password } = await c.req.json()
    const target = await queryOne<any>('SELECT role FROM users WHERE id=? AND deleted_at IS NULL', [id])
    if (!target) return c.json({ error: 'User not found' }, 404)
    const safeRole = role === 'manager' ? 'manager' : 'employee'
    if (password) {
      await execute('UPDATE users SET name=?,role=?,password_hash=? WHERE id=?', [name,safeRole,hashPw(password),id])
    } else {
      await execute('UPDATE users SET name=?,role=? WHERE id=?', [name,safeRole,id])
    }
    await audit(u, 'UPDATE', '使用者', id, `${name} → ${safeRole}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/users/:id', authMiddleware, requirePerm('user.manage'), async c => {
  try {
    const u = c.get('user'); const id = c.req.param('id')
    if (String(u.userId) === id) return c.json({ error: 'Cannot delete yourself' }, 400)
    const target = await queryOne<any>('SELECT email,name,role FROM users WHERE id=? AND deleted_at IS NULL', [id])
    if (!target) return c.json({ error: 'User not found' }, 404)
    if (target.email) {
      const releasedEmail = `${String(target.email).trim()}#DEL${Date.now()}-${id}`
      await execute('UPDATE users SET email=? WHERE id=? AND deleted_at IS NULL', [releasedEmail, id])
    }
    await softDeleteById('users', id, u.userId)
    await audit(u, 'DELETE', '使用者', id, `${target.email} (${target.name})`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Role Permissions ──────────────────────────────────────────────────────────
app.get('/api/role-permissions', authMiddleware, async c => {
  try {
    const rows = await query<any>('SELECT role,permission,allowed FROM role_permissions')
    const map: any = {}
    rows.forEach(r => { if (!map[r.role]) map[r.role] = {}; map[r.role][r.permission] = r.allowed === 1 })
    return c.json({ permissions: map, allPermissions: ALL_PERMISSIONS })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/role-permissions', authMiddleware, requirePerm('user.manage'), async c => {
  try {
    const { role, permission, allowed } = await c.req.json()
    if (role !== 'employee') return c.json({ error: 'Only employee role can be modified' }, 400)
    await execute('INSERT INTO role_permissions (role,permission,allowed) VALUES (?,?,?) ON DUPLICATE KEY UPDATE allowed=?', ['employee',permission,allowed?1:0,allowed?1:0])
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Audit Logs ────────────────────────────────────────────────────────────────
app.get('/api/audit-logs', authMiddleware, requirePerm('audit.view'), async c => {
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
// 來源：客戶訂單（所有狀態）→ 待收款；可標記已收款
app.get('/api/receivables', authMiddleware, async c => {
  try {
    const rows = await query<any>(`
      SELECT co.id, co.po_number as dn_number, co.customer_name,
             co.po_date as delivery_date, co.status, co.remark, co.created_at,
             COALESCE(co.received_amount, 0) as received_amount,
             COALESCE(
               (SELECT SUM(qty * unit_price) FROM customer_order_items WHERE order_id = co.id), 0
             ) as invoice_amount,
             co.payment_status, co.payment_date, co.payment_note,
             co.po_number as customer_po
      FROM customer_orders co
      WHERE co.deleted_at IS NULL
      ORDER BY co.created_at DESC
    `)
    return c.json(rows)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/receivables/:id/payment', authMiddleware, async c => {
  try {
    const id = c.req.param('id')
    const { payment_status, received_amount, payment_date, payment_note } = await c.req.json()
    await execute(
      'UPDATE customer_orders SET payment_status=?, received_amount=?, payment_date=?, payment_note=? WHERE id=?',
      [payment_status, received_amount||0, payment_date||null, payment_note||'', id]
    )
    const row = await queryOne<any>('SELECT po_number, customer_name FROM customer_orders WHERE id=? AND deleted_at IS NULL', [id])
    await audit(c.get('user'), 'PAYMENT', '應收帳款', id, `${row?.po_number} ${payment_status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── 應付帳款 (Payables) ───────────────────────────────────────────────────────
// 來源：採購單（所有非尚未審核狀態）→ 待付款；可標記已付款
app.get('/api/payables', authMiddleware, async c => {
  try {
    const rows = await query<any>(`
      SELECT id, po_number, supplier_name, total_amount, currency, status,
             COALESCE(paid_amount, 0) as paid_amount,
             payment_status, payment_date, payment_note, created_at, approved_at
      FROM purchase_orders
      WHERE status != 'cancelled' AND deleted_at IS NULL
      ORDER BY created_at DESC
    `)
    return c.json(rows)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/payables/:id/payment', authMiddleware, async c => {
  try {
    const id = c.req.param('id')
    const { payment_status, paid_amount, payment_date, payment_note } = await c.req.json()
    await execute(
      'UPDATE purchase_orders SET payment_status=?, paid_amount=?, payment_date=?, payment_note=? WHERE id=?',
      [payment_status, paid_amount||0, payment_date||null, payment_note||'', id]
    )
    const row = await queryOne<any>('SELECT po_number, supplier_name FROM purchase_orders WHERE id=? AND deleted_at IS NULL', [id])
    await audit(c.get('user'), 'PAYMENT', '應付帳款', id, `${row?.po_number} ${payment_status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── 報表 (Reports) ────────────────────────────────────────────────────────────
app.get('/api/reports', authMiddleware, async c => {
  try {
    const url = new URL(c.req.url)
    const year = url.searchParams.get('year') || new Date().getFullYear().toString()

    // 應收：客戶訂單金額，按月（用 po_date 或 created_at）
    const receivables = await query<any>(`
      SELECT DATE_FORMAT(COALESCE(co.po_date, co.created_at), '%Y-%m') as month,
             SUM(COALESCE(ci.qty * ci.unit_price, 0)) as invoiced,
             SUM(CASE WHEN co.payment_status='paid' THEN COALESCE(co.received_amount, 0) ELSE 0 END) as received,
             COUNT(DISTINCT co.id) as count
      FROM customer_orders co
      LEFT JOIN customer_order_items ci ON ci.order_id = co.id
      WHERE DATE_FORMAT(COALESCE(co.po_date, co.created_at), '%Y') = ? AND co.deleted_at IS NULL
      GROUP BY month ORDER BY month
    `, [year])

    // 應付：採購單金額，按月
    const payables = await query<any>(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
             SUM(total_amount) as total,
             SUM(CASE WHEN payment_status='paid' THEN COALESCE(paid_amount, 0) ELSE 0 END) as paid,
             COUNT(*) as count
      FROM purchase_orders
      WHERE status != 'cancelled' AND deleted_at IS NULL AND DATE_FORMAT(created_at, '%Y') = ?
      GROUP BY month ORDER BY month
    `, [year])

    // 匯總
    const summary = await queryOne<any>(`
      SELECT
        (SELECT COALESCE(SUM(ci.qty * ci.unit_price), 0) FROM customer_orders co LEFT JOIN customer_order_items ci ON ci.order_id = co.id WHERE co.deleted_at IS NULL) as total_invoiced,
        (SELECT COALESCE(SUM(received_amount), 0) FROM customer_orders WHERE payment_status='paid' AND deleted_at IS NULL) as total_received,
        (SELECT COALESCE(SUM(ci.qty * ci.unit_price), 0) FROM customer_orders co LEFT JOIN customer_order_items ci ON ci.order_id = co.id WHERE co.deleted_at IS NULL AND (co.payment_status IS NULL OR co.payment_status != 'paid')) as total_outstanding_receivable,
        (SELECT COALESCE(SUM(total_amount), 0) FROM purchase_orders WHERE status != 'cancelled' AND deleted_at IS NULL) as total_payable,
        (SELECT COALESCE(SUM(paid_amount), 0) FROM purchase_orders WHERE payment_status='paid' AND deleted_at IS NULL) as total_paid,
        (SELECT COALESCE(SUM(total_amount), 0) FROM purchase_orders WHERE status != 'cancelled' AND deleted_at IS NULL AND (payment_status IS NULL OR payment_status != 'paid')) as total_outstanding_payable
    `)

    return c.json({ receivables, payables, summary, year })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

// ── Goods Receipts (進貨單) ───────────────────────────────────────────────────
app.get('/api/goods-receipts', authMiddleware, async c => {
  const rows = await query(`
    SELECT gr.*, ${liveFirst('NULLIF(s.name, \'\')', 'NULLIF(gr.supplier_name, \'\')', '\'\'')} as supplier_name, s.supplier_code
    FROM goods_receipts gr LEFT JOIN suppliers s ON gr.supplier_id = s.id AND s.deleted_at IS NULL
    WHERE gr.deleted_at IS NULL
    ORDER BY gr.created_at DESC`)
  return c.json(rows)
})
app.get('/api/goods-receipts/:id', authMiddleware, async c => {
  const gr = await queryOne<any>(`
    SELECT gr.*, ${liveFirst('NULLIF(s.name, \'\')', 'NULLIF(gr.supplier_name, \'\')', '\'\'')} as supplier_name
    FROM goods_receipts gr LEFT JOIN suppliers s ON gr.supplier_id = s.id AND s.deleted_at IS NULL
    WHERE gr.id=? AND gr.deleted_at IS NULL`, [c.req.param('id')])
  if (!gr) return c.json({ error: 'Not found' }, 404)
  const items = await query(`
    SELECT gri.*,
           COALESCE(b.product_name, '') as material_name,
           COALESCE(b.spec, '') as spec,
           COALESCE(b.unit, 'PCS') as unit
    FROM goods_receipt_items gri
    LEFT JOIN bom b ON gri.bom_id = b.id AND b.deleted_at IS NULL
    WHERE gri.gr_id=?`, [c.req.param('id')])
  return c.json({ ...gr, items })
})
app.post('/api/goods-receipts', authMiddleware, requirePerm('po.create'), async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    const grNum = `GR${Date.now()}`
    const r = await execute(
      'INSERT INTO goods_receipts (gr_number,po_id,po_number,supplier_id,supplier_name,status,received_date,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [grNum,b.po_id||null,b.po_number||'',b.supplier_id||null,b.supplier_name,'draft',b.received_date||null,b.remark||'',u.userId,now8()]
    )
    const grId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        let bomId = item.bom_id || null
        let materialCode = item.material_code || ''
        let materialName = item.material_name || ''
        let spec = item.spec || ''
        let unit = item.unit || 'PCS'
        let orderedQty = item.ordered_qty || 0
        let unitPrice = item.unit_price || 0
        let currency = item.currency || 'VND'

        if (item.po_item_id) {
          const poItem = await queryOne<any>(`
            SELECT pi.*, b.product_sku as live_material_code, b.product_name as live_material_name, b.spec as live_spec, b.unit as live_unit, b.currency as live_currency
            FROM po_items pi
            LEFT JOIN bom b ON pi.bom_id = b.id AND b.deleted_at IS NULL
            WHERE pi.id=?
            LIMIT 1
          `, [item.po_item_id])
          if (poItem) {
            bomId = poItem.bom_id || bomId
            materialCode = poItem.live_material_code || poItem.material_code || materialCode
            materialName = poItem.live_material_name || poItem.material_name || materialName
            spec = poItem.live_spec || poItem.spec || spec
            unit = poItem.live_unit || poItem.unit || unit
            orderedQty = poItem.quantity || orderedQty
            unitPrice = poItem.unit_price || unitPrice
            currency = poItem.live_currency || poItem.currency || currency
          }
        }
        await execute(
          'INSERT INTO goods_receipt_items (gr_id,po_item_id,bom_id,material_id,material_code,material_name,spec,unit,ordered_qty,received_qty,unit_price,currency,batch_no,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [grId,item.po_item_id||null,bomId,null,materialCode,materialName,spec,unit,orderedQty,item.received_qty,unitPrice,currency,item.batch_no||'',item.remark||'']
        )
      }
    }
    await audit(u, 'CREATE', '進貨單', grId, grNum)
    return c.json({ id: grId, gr_number: grNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/goods-receipts/:id/confirm', authMiddleware, requirePerm('po.approve'), async c => {
  try {
    const id = c.req.param('id'); const u = c.get('user')
    const gr = await queryOne<any>('SELECT * FROM goods_receipts WHERE id=? AND deleted_at IS NULL', [id])
    if (!gr) return c.json({ error: 'Not found' }, 404)
    if (gr.status === 'confirmed') return c.json({ error: 'Already confirmed' }, 400)
    const items = await query<any>('SELECT * FROM goods_receipt_items WHERE gr_id=?', [id])
    // Update stock for each item
    for (const item of items) {
      const bom = item.bom_id ? await queryOne<any>('SELECT id, product_sku, product_name, unit, current_stock FROM bom WHERE id=?', [item.bom_id]) : null
      const before = parseFloat(bom?.current_stock) || 0
      const after = before + parseFloat(item.received_qty)
      if (bom) {
        await execute('UPDATE bom SET current_stock=? WHERE id=?', [after, item.bom_id])
      }
      // Write stock ledger
      await execute(
        'INSERT INTO stock_ledger (material_code,material_name,transaction_type,ref_type,ref_id,ref_number,qty_change,qty_before,qty_after,unit,batch_no,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [bom?.product_sku || item.material_code,bom?.product_name || item.material_name,'GR_IN','goods_receipt',id,gr.gr_number,item.received_qty,before,after,bom?.unit || item.unit || 'PCS',item.batch_no||'',`進貨確認 ${gr.gr_number}`,u.userId,now8()]
      )
      // Update po_item received_qty if linked
      if (item.po_item_id) {
        await execute('UPDATE po_items SET received_qty = received_qty + ? WHERE id=?', [item.received_qty, item.po_item_id])
      }
    }
    await execute('UPDATE goods_receipts SET status=? WHERE id=?', ['confirmed', id])
    await audit(u, 'CONFIRM', '進貨單', id, gr.gr_number)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/goods-receipts/:id', authMiddleware, requirePerm('po.delete'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT gr_number,status FROM goods_receipts WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  await softDeleteById('goods_receipts', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '進貨單', id, row?.gr_number)
  return c.json({ ok: true })
})

// ── Production Orders (生產單) ────────────────────────────────────────────────
app.get('/api/production', authMiddleware, async c => {
  const rows = await query('SELECT * FROM production_orders WHERE deleted_at IS NULL ORDER BY created_at DESC')
  return c.json(rows)
})
// 庫存檢查：傳入 bom_id + planned_qty，返回每個材料的庫存狀況
app.post('/api/production/check-stock', authMiddleware, async c => {
  try {
    const { bom_id, planned_qty } = await c.req.json()
    if (!bom_id) return c.json({ error: 'bom_id required' }, 400)
    const qty = planned_qty || 1
    const bomItems = await query<any>('SELECT * FROM bom_items WHERE bom_id=?', [bom_id])
    const result = []
    let hasShortage = false
    for (const item of bomItems) {
      const needed = (item.quantity || 0) * qty
      const bom = await queryOne<any>('SELECT current_stock, product_name FROM bom WHERE product_sku=?', [item.material_code])
      const stock = parseFloat(bom?.current_stock) || 0
      const shortage = Math.max(0, needed - stock)
      if (shortage > 0) hasShortage = true
      result.push({
        material_code: item.material_code,
        material_name: item.material_name || bom?.product_name || '',
        spec: item.spec || '',
        unit: item.unit || 'PCS',
        planned_qty: needed,
        current_stock: stock,
        shortage,
        sufficient: shortage === 0,
      })
    }
    return c.json({ items: result, has_shortage: hasShortage, status: hasShortage ? 'shortage' : 'ready' })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.get('/api/production/:id', authMiddleware, async c => {
  const prod = await queryOne<any>('SELECT * FROM production_orders WHERE id=? AND deleted_at IS NULL', [c.req.param('id')])
  if (!prod) return c.json({ error: 'Not found' }, 404)
  const materials = await query('SELECT * FROM production_materials WHERE prod_id=?', [c.req.param('id')])
  return c.json({ ...prod, materials })
})
app.post('/api/production', authMiddleware, requirePerm('production.create'), async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    const prodNum = `WO${Date.now()}`
    const r = await execute(
      'INSERT INTO production_orders (prod_number,customer_order_id,bom_id,product_sku,product_name,planned_qty,status,planned_start,planned_end,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [prodNum,b.customer_order_id||null,b.bom_id||null,b.product_sku||'',b.product_name,b.planned_qty,b.initial_status||'draft',b.planned_start||null,b.planned_end||null,b.remark||'',u.userId,now8()]
    )
    const prodId = r.insertId
    if (b.materials?.length) {
      for (const mat of b.materials) {
        const materialId = await resolveMaterialId(mat.material_id, mat.material_code)
        await execute(
          'INSERT INTO production_materials (prod_id,material_id,material_code,material_name,spec,unit,planned_qty,issued_qty,batch_no,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [prodId,materialId,mat.material_code,mat.material_name,mat.spec||'',mat.unit||'PCS',mat.planned_qty||0,0,mat.batch_no||'',mat.remark||'']
        )
      }
    }
    await audit(u, 'CREATE', '生產單', prodId, prodNum)
    return c.json({ id: prodId, prod_number: prodNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/production/:id', authMiddleware, requirePerm('production.create'), async c => {
  try {
    const id = c.req.param('id'); const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>('SELECT status FROM production_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (!['draft', 'confirmed', 'shortage'].includes(existing.status)) return c.json({ error: '此狀態的生產單不能修改' }, 400)
    await execute('UPDATE production_orders SET bom_id=?,product_sku=?,product_name=?,planned_qty=?,planned_start=?,planned_end=?,remark=? WHERE id=?',
      [b.bom_id||null, b.product_sku||'', b.product_name, b.planned_qty, b.planned_start||null, b.planned_end||null, b.remark||'', id])
    if (b.materials?.length) {
      await execute('DELETE FROM production_materials WHERE prod_id=?', [id])
      for (const mat of b.materials) {
        const materialId = await resolveMaterialId(mat.material_id, mat.material_code)
        await execute('INSERT INTO production_materials (prod_id,material_id,material_code,material_name,spec,unit,planned_qty,issued_qty,batch_no,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [id,materialId,mat.material_code,mat.material_name,mat.spec||'',mat.unit||'PCS',mat.planned_qty||0,0,mat.batch_no||'',mat.remark||''])
      }
    }
    await audit(u, 'UPDATE', '生產單', id, b.product_name)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/production/:id/status', authMiddleware, requirePerm('production.create'), async c => {
  try {
    const id = c.req.param('id'); const { status, produced_qty } = await c.req.json(); const u = c.get('user')
    const validStatuses = ['confirmed', 'shortage', 'ready', 'in_progress', 'completed', 'cancelled']
    if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    const prod = await queryOne<any>('SELECT * FROM production_orders WHERE id=? AND deleted_at IS NULL', [id])
    if (!prod) return c.json({ error: 'Not found' }, 404)
    if (prod.status === 'completed') return c.json({ error: '已完工的生產單不能再變更狀態' }, 400)
    const updates: any = { status }
    if (status === 'in_progress' && !prod.actual_start) updates.actual_start = now8().slice(0,10)
    if (status === 'completed') {
      updates.actual_end = now8().slice(0,10)
      if (produced_qty) updates.produced_qty = produced_qty
      // Issue materials from stock only on completion
      const mats = await query<any>('SELECT * FROM production_materials WHERE prod_id=?', [id])
      for (const mat of mats) {
        const qty = parseFloat(mat.issued_qty) > 0 ? parseFloat(mat.issued_qty) : parseFloat(mat.planned_qty) || 0
        const bom = await queryOne<any>('SELECT current_stock FROM bom WHERE product_sku=?', [mat.material_code])
        const before = parseFloat(bom?.current_stock) || 0
        const after = Math.max(0, before - qty)
        await execute('UPDATE bom SET current_stock=? WHERE product_sku=?', [after, mat.material_code])
        await execute('UPDATE production_materials SET issued_qty=? WHERE id=?', [qty, mat.id])
        await execute(
          'INSERT INTO stock_ledger (material_code,material_name,transaction_type,ref_type,ref_id,ref_number,qty_change,qty_before,qty_after,unit,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [mat.material_code,mat.material_name,'PROD_OUT','production',id,prod.prod_number,-qty,before,after,mat.unit||'PCS',`生產領料 ${prod.prod_number}`,u.userId,now8()]
        )
      }
    }
    const setClause = Object.keys(updates).map(k => `${k}=?`).join(',')
    await execute(`UPDATE production_orders SET ${setClause} WHERE id=?`, [...Object.values(updates), id])
    await audit(u, 'STATUS_CHANGE', '生產單', id, `${prod.prod_number} → ${status}`)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/production/:id', authMiddleware, requirePerm('production.delete'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT prod_number,status FROM production_orders WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  await softDeleteById('production_orders', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '生產單', id, row?.prod_number)
  return c.json({ ok: true })
})

// ── Stock Ledger (庫存流水) ───────────────────────────────────────────────────
app.get('/api/stock-ledger', authMiddleware, async c => {
  const url = new URL(c.req.url)
  const materialCode = url.searchParams.get('material_code') || ''
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500)
  let sql = 'SELECT * FROM stock_ledger'
  const params: any[] = []
  if (materialCode) { sql += ' WHERE material_code=?'; params.push(materialCode) }
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`
  const rows = await query(sql, params.length ? params : undefined)
  return c.json(rows)
})

// ── Stock Adjustments (庫存調整) ──────────────────────────────────────────────
app.get('/api/stock-adjustments', authMiddleware, async c => {
  const rows = await query('SELECT * FROM stock_adjustments WHERE deleted_at IS NULL ORDER BY created_at DESC')
  return c.json(rows)
})
app.get('/api/stock-adjustments/:id', authMiddleware, async c => {
  const adj = await queryOne<any>('SELECT * FROM stock_adjustments WHERE id=? AND deleted_at IS NULL', [c.req.param('id')])
  if (!adj) return c.json({ error: 'Not found' }, 404)
  const items = await query('SELECT * FROM stock_adjustment_items WHERE adj_id=?', [c.req.param('id')])
  return c.json({ ...adj, items })
})
app.post('/api/stock-adjustments', authMiddleware, requirePerm('stock.adjust'), async c => {
  try {
    const b = await c.req.json(); const u = c.get('user')
    const adjNum = `ADJ${Date.now()}`
    const r = await execute(
      'INSERT INTO stock_adjustments (adj_number,adj_type,status,adj_date,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
      [adjNum,b.adj_type||'count','draft',b.adj_date||null,b.remark||'',u.userId,now8()]
    )
    const adjId = r.insertId
    if (b.items?.length) {
      for (const item of b.items) {
        const materialId = await resolveMaterialId(item.material_id, item.material_code)
        const bom = await queryOne<any>('SELECT current_stock FROM bom WHERE product_sku=?', [item.material_code])
        const systemQty = parseFloat(bom?.current_stock) || 0
        const diff = (item.actual_qty || 0) - systemQty
        await execute(
          'INSERT INTO stock_adjustment_items (adj_id,material_id,material_code,material_name,unit,system_qty,actual_qty,diff_qty,batch_no,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [adjId,materialId,item.material_code,item.material_name||'',item.unit||'PCS',systemQty,item.actual_qty||0,diff,item.batch_no||'',item.remark||'']
        )
      }
    }
    await audit(u, 'CREATE', '庫存調整', adjId, adjNum)
    return c.json({ id: adjId, adj_number: adjNum }, 201)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.patch('/api/stock-adjustments/:id/approve', authMiddleware, requirePerm('stock.adjust'), async c => {
  try {
    const id = c.req.param('id'); const u = c.get('user')
    const adj = await queryOne<any>('SELECT * FROM stock_adjustments WHERE id=? AND deleted_at IS NULL', [id])
    if (!adj) return c.json({ error: 'Not found' }, 404)
    if (adj.status === 'approved') return c.json({ error: 'Already approved' }, 400)
    const items = await query<any>('SELECT * FROM stock_adjustment_items WHERE adj_id=?', [id])
    for (const item of items) {
      if (item.diff_qty === 0) continue
      const bom = await queryOne<any>('SELECT current_stock FROM bom WHERE product_sku=?', [item.material_code])
      const before = parseFloat(bom?.current_stock) || 0
      const after = item.actual_qty
      await execute('UPDATE bom SET current_stock=? WHERE product_sku=?', [after, item.material_code])
      const txType = item.diff_qty > 0 ? 'ADJ_IN' : 'ADJ_OUT'
      await execute(
        'INSERT INTO stock_ledger (material_code,material_name,transaction_type,ref_type,ref_id,ref_number,qty_change,qty_before,qty_after,unit,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [item.material_code,item.material_name,txType,'adjustment',id,adj.adj_number,item.diff_qty,before,after,item.unit||'PCS',`庫存調整 ${adj.adj_number}`,u.userId,now8()]
      )
    }
    await execute('UPDATE stock_adjustments SET status=?,approved_by=?,approved_at=? WHERE id=?', ['approved',u.userId,now8(),id])
    await audit(u, 'APPROVE', '庫存調整', id, adj.adj_number)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.delete('/api/stock-adjustments/:id', authMiddleware, requirePerm('stock.adjust'), async c => {
  const id = c.req.param('id')
  const row = await queryOne<any>('SELECT adj_number,status FROM stock_adjustments WHERE id=? AND deleted_at IS NULL', [id])
  if (!row) return c.json({ error: 'Not found' }, 404)
  await softDeleteById('stock_adjustments', id, c.get('user')?.userId)
  await audit(c.get('user'), 'DELETE', '庫存調整', id, row?.adj_number)
  return c.json({ ok: true })
})

// ── Company Settings ──────────────────────────────────────────────────────────
app.get('/api/company', async c => {
  try {
    await ensureCompanySignatureColumn()
    await ensureCompanySignaturePrintColumns()
    await ensureCompanyNotificationEmail()
    const row = await queryOne<any>('SELECT * FROM company_settings WHERE id=1')
    if (!row) {
      return c.json({ id: 1, company_name: 'FAN YONG CO., LTD', company_name_local: 'CÔNG TY TNHH FAN YONG VIỆT NAM', address: '', phone: '', contact_person: '', email: '', tax_id: '', logo_url: null, signature_url: null, signature_print_width: 220, signature_print_height: 72 })
    }
    return c.json(row)
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})
app.put('/api/company', authMiddleware, requirePerm('company.manage'), async c => {
  try {
    await ensureCompanySignatureColumn()
    await ensureCompanySignaturePrintColumns()
    await ensureCompanyNotificationEmail()
    const b = await c.req.json(); const u = c.get('user')
    const existing = await queryOne<any>('SELECT signature_url FROM company_settings WHERE id=1')
    const nextSignatureUrl = Object.prototype.hasOwnProperty.call(b || {}, 'signature_url')
      ? (b.signature_url || null)
      : (existing?.signature_url || null)
    const signaturePrintWidth = Math.max(120, Math.min(320, Number(b.signature_print_width) || 220))
    const signaturePrintHeight = Math.max(48, Math.min(140, Number(b.signature_print_height) || 72))
    // Upsert
    await execute(`INSERT INTO company_settings (id,company_name,company_name_local,address,phone,contact_person,email,tax_id,logo_url,signature_url,signature_print_width,signature_print_height)
      VALUES (1,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE company_name=?,company_name_local=?,address=?,phone=?,contact_person=?,email=?,tax_id=?,logo_url=?,signature_url=?,signature_print_width=?,signature_print_height=?`,
      [b.company_name,b.company_name_local||'',b.address||'',b.phone||'',b.contact_person||'',b.email||'',b.tax_id||'',b.logo_url||null,nextSignatureUrl,signaturePrintWidth,signaturePrintHeight,
       b.company_name,b.company_name_local||'',b.address||'',b.phone||'',b.contact_person||'',b.email||'',b.tax_id||'',b.logo_url||null,nextSignatureUrl,signaturePrintWidth,signaturePrintHeight])
    await audit(u, 'UPDATE', '公司設定', 1, b.company_name)
    return c.json({ ok: true })
  } catch (e: any) { return c.json({ error: String(e.message) }, 500) }
})

app.get('/api/daily-patrol-report', authMiddleware, async c => {
  try {
    await ensureMaterialReferenceColumns()
    const report = await buildDailyPatrolReport()
    return c.json(report)
  } catch (e: any) {
    return c.json({ error: String(e.message) }, 500)
  }
})

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', authMiddleware, async c => {
  try {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const [materials, suppliers, customers, po, orders, monthOrders, allSales, lowStock] = await Promise.all([
      queryOne<any>('SELECT COUNT(*) as cnt FROM bom WHERE deleted_at IS NULL'),
      queryOne<any>('SELECT COUNT(*) as cnt FROM suppliers WHERE deleted_at IS NULL'),
      queryOne<any>('SELECT COUNT(*) as cnt FROM customers WHERE deleted_at IS NULL'),
      queryOne<any>("SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE status='received' AND deleted_at IS NULL"),
      queryOne<any>('SELECT COUNT(*) as cnt FROM customer_orders WHERE deleted_at IS NULL'),
      queryOne<any>('SELECT COUNT(*) as cnt, COALESCE(SUM(ci.qty*ci.unit_price),0) as total FROM customer_orders co JOIN customer_order_items ci ON ci.order_id=co.id WHERE co.deleted_at IS NULL AND co.po_date>=?', [monthStart]),
      queryOne<any>('SELECT COALESCE(SUM(ci.qty*ci.unit_price),0) as total, MIN(co.po_date) as earliest, MAX(co.po_date) as latest FROM customer_orders co JOIN customer_order_items ci ON ci.order_id=co.id WHERE co.deleted_at IS NULL'),
      queryOne<any>('SELECT COUNT(*) as cnt FROM bom WHERE deleted_at IS NULL AND COALESCE(current_stock,0) <= 0'),
    ])
    return c.json({
      materials: materials?.cnt||0, suppliers: suppliers?.cnt||0, customers: customers?.cnt||0,
      po_count: po?.cnt||0, po_total: po?.total||0, orders_count: orders?.cnt||0,
      month_orders: monthOrders?.cnt||0, month_sales: monthOrders?.total||0,
      total_sales: allSales?.total||0,
      sales_date_range: allSales?.earliest ? `${allSales.earliest} ~ ${allSales.latest}` : '',
      low_stock_count: lowStock?.cnt||0,
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
    // Return relative URL so it works through Nginx proxy
    return c.json({ url: `/uploads/${filename}` })
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
  ensureMaterialReferenceColumns()
    .then(() => syncAllCustomerOrdersArrivedFromShippedDns())
    .then(() => console.log('✓ Shipped qty backfill/sync completed'))
    .catch((e) => console.warn('[shipped sync]', e))
})
