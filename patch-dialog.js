const fs = require('fs')
const path = require('path')

const dir = 'frontend/app/dashboard'
const files = fs.readdirSync(dir, { recursive: true })
  .filter(f => f.endsWith('.tsx'))
  .map(f => path.join(dir, f))

let count = 0
files.forEach(file => {
  let src = fs.readFileSync(file, 'utf8')
  const orig = src

  if (src.includes('useDialog')) return
  if (!src.includes("confirm('") && !src.includes('confirm("') && !src.includes('showMsg(')) return

  // 1. Add import on line 2 (after 'use client')
  src = src.replace("'use client'\n", "'use client'\nimport { useDialog } from '@/components/Dialog'\n")

  // 2. Add hook call inside component - find first useState and add before it
  src = src.replace(
    /(\n  const \[)/,
    "\n  const { toast, confirm: confirmDialog } = useDialog()\n$1"
  )

  // 3. Replace showMsg calls ONLY (not the function definition)
  // showMsg('text', false) → toast('text', 'error')
  src = src.replace(/showMsg\(('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),\s*false\)/g, "toast($1, 'error')")
  // showMsg('text') → toast('text')
  src = src.replace(/showMsg\(('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)/g, 'toast($1)')
  // showMsg('text' + var) → toast('text' + var)
  src = src.replace(/showMsg\(([^)]+)\)/g, 'toast($1)')

  // 4. Replace confirm() - make the containing function async if needed
  // if (!confirm('...')) return  →  if (!await confirmDialog('...')) return
  src = src.replace(/if \(!confirm\('([^']+)'\)\) return/g, "if (!await confirmDialog('$1')) return")
  src = src.replace(/if \(!confirm\("([^"]+)"\)\) return/g, 'if (!await confirmDialog("$1")) return')

  // 5. Make del/remove functions async
  src = src.replace(/const (del|remove|deleteItem) = \(([^)]*)\) => \{/g, 'const $1 = async ($2) => {')

  if (src !== orig) {
    fs.writeFileSync(file, src)
    console.log('Patched:', file)
    count++
  }
})
console.log(`Done: ${count} files patched`)
