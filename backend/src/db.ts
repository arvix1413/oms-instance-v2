import mysql from 'mysql2/promise'
import type { PoolConnection } from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'oms_db',
  user: process.env.DB_USER || 'oms_user',
  password: process.env.DB_PASSWORD || 'oms_db_2026',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
})

export default pool

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] || null
}

export async function execute(sql: string, params?: any[]): Promise<{ insertId: number; affectedRows: number }> {
  const [result] = await pool.execute(sql, params) as any
  return { insertId: result.insertId, affectedRows: result.affectedRows }
}

export type DbTransaction = {
  query: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>
  execute: (sql: string, params?: any[]) => Promise<{ insertId: number; affectedRows: number }>
}

export async function withTransaction<T>(work: (tx: DbTransaction) => Promise<T>): Promise<T> {
  const connection: PoolConnection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const tx: DbTransaction = {
      query: async <R = any>(sql: string, params?: any[]) => {
        const [rows] = await connection.execute(sql, params)
        return rows as R[]
      },
      queryOne: async <R = any>(sql: string, params?: any[]) => {
        const [rows] = await connection.execute(sql, params)
        return (rows as R[])[0] || null
      },
      execute: async (sql: string, params?: any[]) => {
        const [result] = await connection.execute(sql, params) as any
        return { insertId: result.insertId, affectedRows: result.affectedRows }
      },
    }
    const result = await work(tx)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
