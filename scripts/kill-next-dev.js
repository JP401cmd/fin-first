// Kill all next dev processes
require('child_process').execSync('taskkill /F /IM node.exe 2>NUL', { stdio: 'ignore' });
console.log('Killed node processes');
