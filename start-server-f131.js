const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/janpa/cd/development/fin';
const lockPath = path.join(dir, '.next', 'dev', 'lock');
try { fs.rmSync(lockPath, { force: true }); } catch(e) {}

const logFile = fs.openSync(path.join(dir, 'server-f131-detached.log'), 'w');

const c = spawn('npx', ['next', 'dev', '--port', '3000'], {
  cwd: dir,
  detached: true,
  stdio: ['ignore', logFile, logFile],
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});
c.unref();
console.log('Server spawned with PID:', c.pid);
process.exit(0);
