const fs = require('fs')
const path = require('path')

const nextDir = path.join(__dirname, '..', '.next')
try {
  fs.rmSync(nextDir, { recursive: true, force: true })
  process.stdout.write('Deleted .next\n')
} catch (e) {
  process.stdout.write('Error: ' + e.message + '\n')
}
