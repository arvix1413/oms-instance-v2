#!/usr/bin/env node
// Converts SQLite/D1 export to MySQL-compatible SQL
// Usage: node migrate-d1-to-mysql.js d1-export.sql > mysql-import.sql

const fs = require('fs')
const inputFile = process.argv[2] || '../oms/backend/d1-export.sql'
let sql = fs.readFileSync(inputFile, 'utf8')

// Remove SQLite-specific statements
sql = sql.replace(/PRAGMA.*?;\n/g, '')
sql = sql.replace(/BEGIN TRANSACTION;\n?/g, '')
sql = sql.replace(/COMMIT;\n?/g, '')
sql = sql.replace(/^-- .*\n/gm, '')

// Drop existing tables first (in reverse order to handle FK)
const dropStatements = `
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS delivery_note_items;
DROP TABLE IF EXISTS delivery_notes;
DROP TABLE IF EXISTS quotation_items;
DROP TABLE IF EXISTS quotations;
DROP TABLE IF EXISTS customer_order_items;
DROP TABLE IF EXISTS customer_orders;
DROP TABLE IF EXISTS po_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS bom_items;
DROP TABLE IF EXISTS bom;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS materials;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS=1;
`

// Convert CREATE TABLE: SQLite → MySQL
sql = sql.replace(/CREATE TABLE IF NOT EXISTS/g, 'CREATE TABLE')

// INTEGER PRIMARY KEY AUTOINCREMENT → INT AUTO_INCREMENT PRIMARY KEY
sql = sql.replace(/(\w+)\s+INTEGER PRIMARY KEY AUTOINCREMENT/g, '$1 INT AUTO_INCREMENT PRIMARY KEY')

// TEXT → VARCHAR/TEXT conversions
// TEXT with DEFAULT must be VARCHAR in MySQL
sql = sql.replace(/\bTEXT NOT NULL UNIQUE\b/g, 'VARCHAR(255) NOT NULL UNIQUE')
sql = sql.replace(/\bTEXT NOT NULL\b/g, 'TEXT NOT NULL')
sql = sql.replace(/\bTEXT DEFAULT CURRENT_TIMESTAMP\b/g, 'VARCHAR(50) DEFAULT NULL')
sql = sql.replace(/\bTEXT DEFAULT '([^']+)'\b/g, "VARCHAR(100) DEFAULT '$1'")
sql = sql.replace(/\bTEXT DEFAULT NULL\b/g, 'TEXT DEFAULT NULL')
// Any remaining TEXT with DEFAULT → VARCHAR
sql = sql.replace(/\bTEXT DEFAULT\b/g, 'VARCHAR(255) DEFAULT')

// REAL → DECIMAL
sql = sql.replace(/\bREAL DEFAULT 0\b/g, 'DECIMAL(15,2) DEFAULT 0')
sql = sql.replace(/\bREAL NOT NULL\b/g, 'DECIMAL(15,2) NOT NULL')
sql = sql.replace(/\bREAL\b/g, 'DECIMAL(15,2)')

// INTEGER DEFAULT → INT DEFAULT
sql = sql.replace(/\bINTEGER DEFAULT (\d+)\b/g, 'INT DEFAULT $1')
sql = sql.replace(/\bINTEGER NOT NULL\b/g, 'INT NOT NULL')
sql = sql.replace(/\bINTEGER\b/g, 'INT')

// Add ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 to CREATE TABLE only
// First mark CREATE TABLE endings, then fix INSERT statements
const lines = sql.split('\n')
const fixedLines = lines.map(line => {
  if (line.match(/^CREATE TABLE/i)) {
    // Will be fixed by the regex below
    return line
  }
  // Remove ENGINE clause from INSERT lines (shouldn't be there)
  return line.replace(/\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;$/, ');')
})
sql = fixedLines.join('\n')

// Add ENGINE to CREATE TABLE closing
sql = sql.replace(/^(CREATE TABLE[\s\S]*?)\);$/gm, '$1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;')

// Fix REFERENCES syntax (SQLite inline FK → keep as is, MySQL supports it)
// Remove SQLite-specific REFERENCES without proper FK syntax issues
sql = sql.replace(/REFERENCES \w+\(\w+\)/g, '')

// Fix boolean values
sql = sql.replace(/\b1\b(?=\s*[,)])/g, match => match) // keep as is

// Special fix for role_permissions: TEXT in UNIQUE constraint must be VARCHAR
sql = sql.replace(
  /CREATE TABLE role_permissions[\s\S]*?ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;/,
  `CREATE TABLE role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  allowed INT DEFAULT 1,
  UNIQUE KEY uq_role_perm (role, permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
)

// Remove SQLite internal tables
sql = sql.replace(/.*sqlite_sequence.*\n/g, '')
sql = sql.replace(/.*sqlite_stat.*\n/g, '')

// Fix INSERT statements: use INSERT IGNORE to skip duplicates
sql = sql.replace(/^INSERT INTO /gm, 'INSERT IGNORE INTO ')

// Fix quoted identifiers: SQLite uses "name", MySQL uses `name`
sql = sql.replace(/INSERT IGNORE INTO "(\w+)"/g, 'INSERT IGNORE INTO `$1`')
sql = sql.replace(/\("([^"]+)"(?:,"([^"]+)")*\) VALUES/g, (match) => {
  return match.replace(/"([^"]+)"/g, '`$1`')
})

// Remove any CREATE INDEX statements that might conflict
// Keep them but make them IF NOT EXISTS
sql = sql.replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ')
sql = sql.replace(/CREATE UNIQUE INDEX /g, 'CREATE UNIQUE INDEX IF NOT EXISTS ')

// MySQL doesn't support CREATE INDEX IF NOT EXISTS, remove them
sql = sql.replace(/CREATE (UNIQUE )?INDEX IF NOT EXISTS.*?;\n/g, '')

// Fix empty lines
sql = sql.replace(/\n{3,}/g, '\n\n')

const output = `-- MySQL import from Cloudflare D1
-- Generated: ${new Date().toISOString()}
-- Source: oms-v2-db

USE oms_db;

${dropStatements}

${sql.trim()}
`

process.stdout.write(output)
process.stderr.write(`Done. Lines: ${output.split('\n').length}\n`)
