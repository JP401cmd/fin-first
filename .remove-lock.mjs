import fs from 'fs';
import path from 'path';

const lockPath = path.join('C:/Users/janpa/cd/development/fin/.next/dev/lock');
try {
  fs.unlinkSync(lockPath);
  console.log('Lock file removed');
} catch (e) {
  console.log('Lock removal result:', e.message);
}

// Verify
try {
  fs.accessSync(lockPath);
  console.log('Lock file STILL EXISTS');
} catch (e) {
  console.log('Lock file CONFIRMED GONE');
}
