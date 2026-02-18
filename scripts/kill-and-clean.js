const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Kill existing node processes
try {
  execSync('taskkill /F /IM node.exe', { stdio: 'ignore' });
  console.log('Killed node processes');
} catch (e) {
  console.log('No node processes to kill');
}

// Clean .next directory
const nextDir = path.join(__dirname, '..', '.next');
try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('Cleaned .next directory');
} catch (e) {
  console.log('Could not clean .next:', e.message);
}
