import { execSync } from 'child_process';
import fs from 'fs';

// Find all node processes listening on any port
const ports = [3000, 3040, 3045, 3050, 3055, 3060, 3070, 3071, 3072, 3073, 3074, 3075, 3080, 3085, 3086, 3087, 3088, 3089, 3090, 3091, 3092, 3093, 3094, 3095, 3098, 3099, 3100, 3101, 3102, 3103, 3104, 3105, 3106, 3107, 3108, 3110, 3115, 3120, 3125, 3130, 3135, 3140, 3199];

const allPids = new Set();
for (const port of ports) {
  try {
    const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') allPids.add(pid);
    }
  } catch {}
}

console.log('Found PIDs:', [...allPids]);
for (const pid of allPids) {
  try {
    execSync(`taskkill /PID ${pid} /F /T`, { encoding: 'utf8' });
    console.log(`Killed PID ${pid}`);
  } catch {
    console.log(`PID ${pid} already dead`);
  }
}

// Remove .next
const nextDir = 'C:/Users/janpa/cd/development/fin/.next';
try {
  fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
  console.log('.next removed');
} catch (e) {
  console.log('Error removing .next:', e.message);
}

// Verify
try {
  fs.accessSync(nextDir);
  console.log('.next STILL EXISTS');
} catch {
  console.log('.next CONFIRMED GONE');
}
