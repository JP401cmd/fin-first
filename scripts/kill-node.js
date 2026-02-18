const { execSync } = require('child_process');
// On Windows, use taskkill to kill all node processes
try {
  // First try Windows taskkill
  execSync('taskkill /F /IM node.exe', { encoding: 'utf8', stdio: 'pipe' });
  console.log('killed node processes via taskkill');
} catch(e) {
  console.log('taskkill result:', e.message.substring(0, 200));
}
console.log('done');
