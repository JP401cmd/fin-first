import { execSync } from 'child_process';

// Find processes on port 3000
try {
  const result = execSync('netstat -ano | findstr :3000 | findstr LISTENING', { encoding: 'utf8' });
  const lines = result.trim().split('\n');
  const pids = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    console.log('Killing PID:', pid);
    try {
      execSync(`taskkill /PID ${pid} /F /T`, { encoding: 'utf8' });
      console.log('  Killed');
    } catch (e) {
      console.log('  Failed:', e.stderr || e.message);
    }
  }
} catch (e) {
  console.log('Port 3000 is already free');
}
