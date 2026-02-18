const {execSync} = require('child_process');
const out = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', {encoding:'utf8'});
const lines = out.trim().split('\n');
lines.forEach(l => {
  const m = l.match(/"node\.exe","(\d+)"/);
  if(m) {
    const pid = parseInt(m[1]);
    if (pid !== process.pid) {
      try { process.kill(pid, 'SIGTERM'); console.log('Killed PID', pid); }
      catch(e) { console.log('Could not kill', pid, e.message); }
    }
  }
});
