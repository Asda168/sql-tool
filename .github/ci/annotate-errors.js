// Prints the compiler errors found in a build log as a GitHub Actions error annotation,
// so failures are readable from the run page / API without downloading job logs.
const fs = require('fs')
const text = fs.readFileSync(process.argv[2], 'utf8')
const errors = [...text.matchAll(/(^|\n)(error(\[[A-Z0-9]+\])?:[^\n]*(\n[^\n]*){0,10})/g)].map((m) => m[2])
const body = (errors.join('\n---\n') || text.slice(-6000)).slice(0, 9000)
const escaped = body.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
console.log('::error title=Build failed::' + escaped)
