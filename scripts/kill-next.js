const { execSync } = require('child_process');
try {
  // On Windows, kill all node processes related to next
  const isWin = process.platform === 'win32';
  if (isWin) {
    try {
      execSync('taskkill /F /FI "WINDOWTITLE eq next*" 2>nul', { stdio: 'ignore' });
    } catch(e) {}
    // Try killing via port
    try {
      const out = execSync('netstat -ano | findstr :3098', { encoding: 'utf8' });
      const lines = out.trim().split('\n');
      lines.forEach(l => {
        const parts = l.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          try {
            execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' });
            process.stdout.write('killed PID ' + pid + '\n');
          } catch(e) {}
        }
      });
    } catch(e) {}
  } else {
    try {
      const out = execSync('ps aux', { encoding: 'utf8' });
      const lines = out.split('\n').filter(l => l.includes('next') && !l.includes('grep') && !l.includes('kill-next'));
      lines.forEach(l => {
        const parts = l.trim().split(/\s+/);
        if (parts[1]) {
          try {
            process.kill(parseInt(parts[1]));
            process.stdout.write('killed ' + parts[1] + '\n');
          } catch(e) {}
        }
      });
    } catch(e) {}
  }
} catch(e) {
  process.stdout.write('error: ' + e.message + '\n');
}
process.stdout.write('done\n');
