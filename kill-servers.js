const { execSync } = require('child_process');
const r = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', {encoding:'utf8'});
const lines = r.trim().split('\n');
lines.forEach(l => {
  const m = l.match(/"node.exe","(\d+)"/);
  if (m) {
    const pid = parseInt(m[1]);
    if (pid !== process.pid) {
      try { process.kill(pid); console.log('Killed PID', pid); } catch(e) { console.log('Skip PID', pid); }
    }
  }
});
console.log('Done killing servers');
