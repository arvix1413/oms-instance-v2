#!/usr/bin/env node
/**
 * 伺服器磁碟容量告警 → Telegram
 *
 * 由 GitHub Actions 先 SSH 收集指標，再透過環境變數傳入本腳本。
 *
 * 環境變數:
 *   DISK_HOST              伺服器識別（預設 43.160.199.226）
 *   DISK_USE_PCT           根目錄使用率（整數，不含 %）
 *   DISK_SIZE / DISK_USED / DISK_AVAIL   人類可讀容量
 *   DISK_AVAIL_KB          可用空間 KB
 *   DISK_DOCKER_DF         docker system df 摘要（可選）
 *   DISK_WARN_PCT          預警使用率，預設 80
 *   DISK_CRIT_PCT          嚴重使用率，預設 90
 *   DISK_WARN_AVAIL_KB     預警可用空間，預設 4194304（4GiB）
 *   DISK_CRIT_AVAIL_KB     嚴重可用空間，預設 2097152（2GiB）
 *   DISK_FORCE_NOTIFY      1 時即使正常也發「狀態正常」
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_PATROL_BOT_TOKEN
 *   TELEGRAM_CHAT_ID / TELEGRAM_PATROL_CHAT_ID
 */
const HOST = process.env.DISK_HOST || '43.160.199.226'
const usePct = Number(process.env.DISK_USE_PCT || '0')
const size = process.env.DISK_SIZE || '?'
const used = process.env.DISK_USED || '?'
const avail = process.env.DISK_AVAIL || '?'
const availKb = Number(process.env.DISK_AVAIL_KB || '0')
const dockerDf = (process.env.DISK_DOCKER_DF || '').trim()
const warnPct = Number(process.env.DISK_WARN_PCT || '80')
const critPct = Number(process.env.DISK_CRIT_PCT || '90')
const warnAvailKb = Number(process.env.DISK_WARN_AVAIL_KB || String(4 * 1024 * 1024))
const critAvailKb = Number(process.env.DISK_CRIT_AVAIL_KB || String(2 * 1024 * 1024))
const forceNotify = String(process.env.DISK_FORCE_NOTIFY || '') === '1'
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_PATROL_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_PATROL_CHAT_ID

function level() {
  if (usePct >= critPct || availKb < critAvailKb) return 'critical'
  if (usePct >= warnPct || availKb < warnAvailKb) return 'warning'
  return 'ok'
}

function title(lv) {
  if (lv === 'critical') return '【磁碟告警 · 嚴重】'
  if (lv === 'warning') return '【磁碟告警 · 預警】'
  return '【磁碟狀態 · 正常】'
}

function fmtGiB(kb) {
  if (!Number.isFinite(kb) || kb <= 0) return '?'
  return `${(kb / 1024 / 1024).toFixed(2)} GiB`
}

function buildMessage(lv) {
  const now = new Date()
  const tz = 'Asia/Taipei'
  const date = now.toLocaleDateString('zh-TW', { timeZone: tz })
  const time = now.toLocaleTimeString('zh-TW', { timeZone: tz, hour12: false })

  const lines = [
    title(lv),
    '',
    `時間: ${date} ${time}（台北）`,
    `伺服器: ${HOST}`,
    '',
    `根目錄使用率: ${usePct}%`,
    `容量: ${used} / ${size}（可用 ${avail}）`,
    `可用空間: ${fmtGiB(availKb)}（${availKb} KB）`,
    '',
  ]

  if (lv === 'critical') {
    lines.push('狀態: 可用空間過低，可能影響 MySQL / 部署拉映像。')
    lines.push('建議: 立刻清理 Docker 無用映像，或擴充磁碟。')
  } else if (lv === 'warning') {
    lines.push('狀態: 磁碟偏高，請盡快清理或觀察部署頻率。')
    lines.push('建議: 執行 docker image prune，並確認無異常大檔。')
  } else {
    lines.push('狀態: 磁碟空間正常。')
  }

  if (dockerDf) {
    lines.push('', 'Docker 占用:')
    for (const row of dockerDf.split('\n').filter(Boolean).slice(0, 8)) {
      lines.push(`- ${row}`)
    }
  }

  lines.push(
    '',
    `門檻: 預警 ≥${warnPct}% 或可用 < ${fmtGiB(warnAvailKb)}；嚴重 ≥${critPct}% 或可用 < ${fmtGiB(critAvailKb)}`,
  )

  return lines.join('\n')
}

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[Telegram] skipped: missing bot token or chat id')
    return false
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`Telegram send failed: HTTP ${res.status} ${body}`)
  }
  console.log('[Telegram] sent')
  return true
}

async function main() {
  if (!process.env.DISK_USE_PCT || !process.env.DISK_AVAIL_KB) {
    throw new Error('Missing DISK_USE_PCT / DISK_AVAIL_KB (collect metrics via SSH first)')
  }

  const lv = level()
  const text = buildMessage(lv)
  console.log(text)
  console.log('---')
  console.log(`level=${lv}`)

  if (lv === 'ok' && !forceNotify) {
    console.log('OK within threshold; Telegram notify skipped (set DISK_FORCE_NOTIFY=1 to send anyway)')
    return
  }

  await sendTelegram(text)

  // 嚴重時讓 workflow 顯示失敗，方便在 Actions 列表一眼看出
  if (lv === 'critical') {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
