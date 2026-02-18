import { execSync } from 'child_process'

// Kill any existing process on port 3005
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
  console.log('No process on port 3005')
}

console.log('Done killing. Start server manually.')
