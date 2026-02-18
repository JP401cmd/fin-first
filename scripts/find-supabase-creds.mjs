import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const home = homedir();
console.log('Home directory:', home);

// Check various locations for Supabase credentials
const locations = [
  join(home, '.supabase', 'credentials.json'),
  join(home, '.supabase', 'access-token'),
  join(home, 'AppData', 'Roaming', 'supabase', 'access-token'),
  join(home, 'AppData', 'Local', 'supabase', 'access-token'),
  join(home, '.config', 'supabase', 'access-token'),
  join(home, '.config', 'supabase', 'credentials.json'),
];

for (const loc of locations) {
  const exists = existsSync(loc);
  console.log(`${exists ? 'FOUND' : 'MISSING'}: ${loc}`);
  if (exists) {
    try {
      const content = readFileSync(loc, 'utf-8');
      console.log('  Content (first 100 chars):', content.substring(0, 100));
    } catch(e) {
      console.log('  Cannot read:', e.message);
    }
  }
}

// Check env vars
const envVars = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'DB_PASSWORD'];
for (const v of envVars) {
  const val = process.env[v];
  console.log(`ENV ${v}: ${val ? 'SET (' + val.substring(0, 10) + '...)' : 'NOT SET'}`);
}

// Check if npx supabase has stored credentials
const supaConfigPaths = [
  join(home, 'AppData', 'Local', 'supabase-cli'),
  join(home, 'AppData', 'Local', 'supabase'),
  join(home, '.local', 'supabase'),
];
for (const p of supaConfigPaths) {
  console.log(`${existsSync(p) ? 'FOUND DIR' : 'MISSING DIR'}: ${p}`);
}
