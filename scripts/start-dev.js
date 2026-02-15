const { spawn } = require('child_process');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');

// Disable Turbopack persistent caching to avoid Windows SST file corruption
const env = Object.assign({}, process.env, {
  NEXT_TURBOPACK_PERSISTENT_CACHING: '0'
});

const child = spawn('npx', ['next', 'dev', '-p', '3035'], {
  cwd: projectDir,
  stdio: 'inherit',
  env: env,
  shell: true
});

child.on('error', (err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
