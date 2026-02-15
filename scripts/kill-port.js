// Kill the process using a specific port (Windows)
const { execSync } = require('child_process');
const port = process.argv[2] || '3090';

console.log('Finding process on port ' + port + '...');
const result = execSync('netstat -ano | findstr :' + port + ' | findstr LISTENING', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

if (!result) {
  console.log('No process found on port ' + port);
  process.exit(0);
}

const lines = result.split('\n');
const pids = new Set();
lines.forEach(function(line) {
  const parts = line.trim().split(/\s+/);
  const pid = parts[parts.length - 1];
  if (pid && pid !== '0') pids.add(pid);
});

pids.forEach(function(pid) {
  console.log('Killing PID ' + pid + '...');
  try {
    execSync('taskkill /F /PID ' + pid, { encoding: 'utf8', stdio: 'pipe' });
    console.log('  Killed PID ' + pid);
  } catch (e) {
    console.log('  Could not kill PID ' + pid + ': ' + e.message.substring(0, 100));
  }
});

console.log('Done');
