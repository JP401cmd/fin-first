import { execSync } from 'child_process';
try {
  const result = execSync('taskkill /PID 5724 /F /T', { encoding: 'utf8' });
  console.log(result.trim());
} catch (e) {
  console.log('Error killing process:', e.message);
}
