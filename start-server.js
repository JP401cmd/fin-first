const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = 'C:/Users/janpa/cd/development/fin';

// Remove stale lock only
const lockPath = path.join(projectDir, '.next', 'dev', 'lock');
try { fs.rmSync(lockPath, { force: true }); } catch(e) {}

const logFile = fs.openSync(path.join(projectDir, 'dev-server.log'), 'w');
const nextBin = path.join(projectDir, 'node_modules', '.bin', 'next');

const c = spawn(nextBin, ['dev', '--port', '3000'], {
  cwd: projectDir,
  detached: true,
  stdio: ['ignore', logFile, logFile],
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});
c.unref();
console.log('Server spawned with PID:', c.pid);
process.exit(0);
