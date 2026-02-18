import { execSync } from 'child_process';
import fs from 'fs';

const port = process.argv[2] || '3500';
console.log(`=== Cleaning up port ${port} ===`);

try {
  const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
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
      console.log('  Failed:', e.message.split('\n')[0]);
    }
  }
} catch (e) {
  console.log(`No processes found on port ${port}`);
}

const nextDir = 'C:/Users/janpa/cd/development/fin/.next';
console.log('\n=== Removing .next directory ===');
try {
  fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
  console.log('.next removed');
} catch (e) {
  console.log('Error removing .next:', e.message);
}

try {
  fs.accessSync(nextDir);
  console.log('.next STILL EXISTS');
} catch {
  console.log('.next CONFIRMED GONE');
}
