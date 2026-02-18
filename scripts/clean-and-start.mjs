import { unlinkSync, rmSync } from 'fs'
import { execSync } from 'child_process'

// Kill any leftover processes on port 3005
try {
  const output = execSync('netstat -ano | findstr :3005 | findstr LISTEN', { encoding: 'utf8' })
  const lines = output.trim().split('\n')
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    const pid = parts[parts.length - 1]
    if (pid && pid !== '0') {
      console.log('Killing PID', pid)
      execSync('taskkill /F /PID ' + pid, { encoding: 'utf8' })
    }
  }
} catch (e) {
  console.log('No process on port 3005 to kill')
}

// Remove the stale lock file
try {
  unlinkSync('C:/Users/janpa/cd/development/fin/.next/dev/lock')
  console.log('Removed stale lock file')
} catch (e) {
  console.log('No lock file to remove (or already gone)')
}

console.log('Ready to start server')
