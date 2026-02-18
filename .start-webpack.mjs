import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const port = process.argv[2] || '3140';
const logFile = `C:/Users/janpa/cd/development/fin/server-${port}-wp.log`;

const child = spawn('npx', ['next', 'dev', '-p', port], {
  cwd: 'C:/Users/janpa/cd/development/fin',
  env: {
    ...process.env,
    NEXT_PRIVATE_LOCAL_WEBPACK: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  shell: true,
});

const logStream = require('fs').createWriteStream(logFile);
child.stdout.pipe(logStream);
child.stderr.pipe(logStream);

child.unref();
console.log(`Started webpack dev server on port ${port}, PID: ${child.pid}`);
console.log(`Log: ${logFile}`);
