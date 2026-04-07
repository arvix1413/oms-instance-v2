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

  // Remove msg state declarations
  src = src.replace(/\n\s*const \[msg, setMsg\] = useState[^\n]+\n/g, '\n')

  // Remove showMsg function definitions (single line)
  src = src.replace(/\n\s*const showMsg = [^\n]+\n/g, '\n')

  // Remove {msg && <div...>...</div>} blocks (single line JSX)
  src = src.replace(/\n\s*\{msg && <div[^>]*>[^<]*<\/div>\}\n/g, '\n')

  // Remove multi-line msg display blocks
  src = src.replace(/\n\s*\{msg && \(\n[\s\S]*?\)\}\n/g, '\n')

  // Remove duplicate blank lines
  src = src.replace(/\n{3,}/g, '\n\n')

  if (src !== orig) {
    fs.writeFileSync(file, src)
    console.log('Cleaned:', file)
    count++
  }
})
console.log(`Done: ${count} files cleaned`)
