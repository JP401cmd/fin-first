import { execSync } from 'child_process';

// Kill any existing node processes on common ports
const ports = [3000, 3001, 3002, 3005, 3010];
for (const port of ports) {
  try {
    // Find PID using port on Windows
    const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8', timeout: 5000 });
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        try {
          execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 });
          console.log(`Killed PID ${pid} on port ${port}`);
        } catch(e) {
          // ignore
        }
      }
    }
  } catch(e) {
    // Port not in use
  }
}

console.log('Ready to start server');
