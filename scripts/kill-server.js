const { execSync } = require('child_process');
try {
  const ps = execSync('ps', { encoding: 'utf8' });
  const lines = ps.split('\n').filter(l => l.includes('node') && !l.includes('kill-server') && !l.includes('playwright'));
  let killed = 0;
  lines.forEach(l => {
    const pid = l.trim().split(/\s+/)[0];
    if (pid && !isNaN(Number(pid))) {
      try { process.kill(Number(pid), 'SIGKILL'); console.log('Killed PID ' + pid); killed++; } catch(e) { console.log('Skip ' + pid + ': ' + e.message); }
    }
  });
  console.log('Total killed: ' + killed);
} catch(e) { console.log('Error:', e.message); }
