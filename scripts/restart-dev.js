// Restart dev server: kill existing node processes on port and start fresh
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Clean .next directory
const nextDir = path.join(__dirname, '..', '.next');
try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  process.stdout.write('Cleaned .next directory\n');
} catch (e) {
  process.stdout.write('Could not clean .next: ' + e.message + '\n');
}

// Start dev server on port 3055
const child = spawn('npx', ['next', 'dev', '-p', '3055', '--turbopack'], {
  cwd: path.join(__dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  detached: true,
  env: { ...process.env, NODE_ENV: 'development' }
});

const logFile = fs.createWriteStream(path.join(__dirname, '..', '.next-dev.log'));
child.stdout.pipe(logFile);
child.stderr.pipe(logFile);

// Also show output on console for first 10 seconds
child.stdout.on('data', (data) => process.stdout.write(data));
child.stderr.on('data', (data) => process.stderr.write(data));

child.unref();

process.stdout.write('Dev server starting on port 3055 (PID: ' + child.pid + ')\n');

// Wait for server to be ready
var attempts = 0;
var maxAttempts = 30;
function checkReady() {
  var http = require('http');
  var req = http.get('http://localhost:3055/api/health', function(res) {
    process.stdout.write('\nServer ready on port 3055!\n');
    process.exit(0);
  });
  req.on('error', function() {
    attempts++;
    if (attempts >= maxAttempts) {
      process.stdout.write('\nServer may still be starting. Check .next-dev.log\n');
      process.exit(0);
    }
    setTimeout(checkReady, 2000);
  });
  req.setTimeout(2000, function() {
    req.destroy();
    attempts++;
    setTimeout(checkReady, 2000);
  });
}

setTimeout(checkReady, 3000);
