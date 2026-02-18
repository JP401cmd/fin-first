import { execSync } from 'child_process';
import fs from 'fs';

// Find all listening ports
const pids = new Set();
try {
  const result = execSync('netstat -ano | findstr LISTENING', { encoding: 'utf8' });
  for (const line of result.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    const addr = parts[1] || '';
    const pid = parts[parts.length - 1];
    const port = parseInt(addr.split(':').pop());
    if (port >= 3000 && port <= 5000 && pid && pid !== '0') {
      pids.add(pid);
    }
  }
} catch (e) {
  console.log('No listening ports found');
}

console.log('Found PIDs to kill:', [...pids]);
for (const pid of pids) {
  try {
    execSync('taskkill /PID ' + pid + ' /F /T', { encoding: 'utf8' });
    console.log('Killed PID ' + pid);
  } catch (e) {
    console.log('Failed to kill PID ' + pid);
  }
}

// Clean .next
const nextDir = 'C:/Users/janpa/cd/development/fin/.next';
try {
  fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 2000 });
  console.log('.next removed');
} catch (e) {
  console.log('.next removal error:', e.message);
}
