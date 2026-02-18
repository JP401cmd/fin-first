import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const port = process.argv[2] || '3073';
const logFile = `server-${port}-persistent.log`;

const child = spawn('npx', ['next', 'dev', '--port', port], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  detached: true,
  env: { ...process.env, PORT: port }
});

child.stdout.on('data', (d) => {
  const s = d.toString();
  writeFileSync(logFile, s, { flag: 'a' });
  if (s.includes('Ready')) {
    console.log(`Server ready on port ${port}, PID: ${child.pid}`);
    child.unref();
    process.exit(0);
  }
});

child.stderr.on('data', (d) => {
  writeFileSync(logFile, d.toString(), { flag: 'a' });
});

child.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.log(`Server started (timeout), PID: ${child.pid}`);
  child.unref();
  process.exit(0);
}, 15000);
