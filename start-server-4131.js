const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/janpa/cd/development/fin';
const lockPath = path.join(dir, '.next', 'dev', 'lock');
try { fs.rmSync(lockPath, { force: true }); } catch(e) {}
const logFile = fs.openSync(path.join(dir, 'server-4131-f131b.log'), 'w');
const c = spawn(path.join(dir, 'node_modules', '.bin', 'next'), ['dev', '--port', '4131'], {
  cwd: dir, detached: true, stdio: ['ignore', logFile, logFile], shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});
c.unref();
console.log('PID:', c.pid);
process.exit(0);
