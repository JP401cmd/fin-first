// Kill all node.exe processes except the current one
const { execSync } = require('child_process');
const myPid = process.pid;
console.log('My PID: ' + myPid);

var output = '';
try {
  output = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  console.log('Could not list processes');
  process.exit(1);
}

var lines = output.trim().split('\n').filter(function(l) { return l.includes('node.exe'); });
console.log('Found ' + lines.length + ' node processes');

lines.forEach(function(line) {
  var match = line.match(/"node\.exe","(\d+)"/);
  if (match) {
    var pid = parseInt(match[1]);
    if (pid === myPid) {
      console.log('  Skipping self (PID ' + pid + ')');
      return;
    }
    try {
      execSync('taskkill /F /PID ' + pid, { encoding: 'utf8', stdio: 'pipe' });
      console.log('  Killed PID ' + pid);
    } catch (e) {
      console.log('  Could not kill PID ' + pid);
    }
  }
});

console.log('Done');
