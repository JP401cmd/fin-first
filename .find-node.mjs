import { execSync } from 'child_process';
try {
  const result = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { encoding: 'utf8' });
  console.log(result.trim());
} catch (e) {
  console.log('Error:', e.message);
}
