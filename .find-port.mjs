import { execSync } from 'child_process';
try {
  const result = execSync('netstat -ano | findstr :3000 | findstr LISTENING', { encoding: 'utf8' });
  console.log(result.trim());
} catch (e) {
  console.log('No LISTENING process found on port 3000');
}
