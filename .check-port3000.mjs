import { execSync } from 'child_process';
try {
  const result = execSync('netstat -ano | findstr :3000 | findstr LISTENING', { encoding: 'utf8' });
  console.log('LISTENING on 3000:', result.trim());
  // Extract PID and kill it
  const lines = result.trim().split('\n');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0') {
      console.log('Killing PID:', pid);
      try {
        const killResult = execSync(`taskkill /PID ${pid} /F /T`, { encoding: 'utf8' });
        console.log(killResult.trim());
      } catch (e2) {
        console.log('Kill failed:', e2.message);
      }
    }
  }
} catch (e) {
  console.log('Port 3000 is FREE');
}
