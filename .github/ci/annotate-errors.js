// Prints compiler errors from a build log as GitHub Actions error annotations (one per error, max 9),
// so failures are readable from the run page / API without downloading job logs.
const fs = require('fs')
const text = fs.readFileSync(process.argv[2], 'utf8').replace(/\u001b\[[0-9;]*m/g, '')
const esc = (t) => t.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const errors = [...text.matchAll(/(^|\n)(error(\[[A-Za-z0-9]+\])?:[^\n]*(\n[^\n]*){0,14})/g)].map((m) => m[2])
const uniq = [...new Set(errors)].slice(0, 9)
if (!uniq.length) console.log('::error title=Build failed::' + esc(text.slice(-3000)))
uniq.forEach((e, i) => console.log(`::error title=Build error ${i + 1}/${uniq.length}::` + esc(e.slice(0, 1800))))
