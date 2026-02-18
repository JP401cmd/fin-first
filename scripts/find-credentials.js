// Search for Supabase credentials in common locations
var fs = require('fs');
var path = require('path');
var home = process.env.HOME || process.env.USERPROFILE || '';

console.log('Home directory:', home);
console.log('');

// Check common env file locations
var locations = [
  path.join(home, '.env'),
  path.join(home, '.env.local'),
  path.join(home, '.env.development'),
  path.join(home, '.env.production'),
  path.join(home, '.supabase', 'access-token'),
  path.join(home, '.supabase', 'credentials.json'),
  path.join(home, 'AppData', 'Roaming', 'supabase', 'access-token'),
  path.join(home, 'AppData', 'Local', 'supabase', 'access-token'),
];

console.log('=== Checking env files ===');
locations.forEach(function(loc) {
  try {
    var content = fs.readFileSync(loc, 'utf8');
    if (content.match(/SUPABASE|SERVICE_ROLE|DB_PASS|DATABASE_URL|ACCESS_TOKEN/i)) {
      console.log('FOUND: ' + loc);
      // Print relevant lines only (mask values for safety)
      content.split('\n').forEach(function(line) {
        if (line.match(/SUPABASE|SERVICE_ROLE|DB_PASS|DATABASE_URL|ACCESS_TOKEN/i) && !line.startsWith('#')) {
          var parts = line.split('=');
          if (parts.length >= 2) {
            var key = parts[0].trim();
            var val = parts.slice(1).join('=').trim();
            console.log('  ' + key + '=' + val.substring(0, 10) + '...[' + val.length + ' chars]');
          }
        }
      });
    }
  } catch(e) {
    // file doesn't exist
  }
});

// Check AppData\Roaming\supabase directory
console.log('\n=== Checking Supabase CLI data ===');
var supabaseDirs = [
  path.join(home, '.supabase'),
  path.join(home, 'AppData', 'Roaming', 'supabase'),
  path.join(home, 'AppData', 'Local', 'supabase'),
  path.join(home, '.config', 'supabase'),
];

supabaseDirs.forEach(function(dir) {
  try {
    var files = fs.readdirSync(dir);
    console.log(dir + ': ' + files.join(', '));
    files.forEach(function(f) {
      try {
        var content = fs.readFileSync(path.join(dir, f), 'utf8');
        if (content.length < 1000) {
          console.log('  ' + f + ' (' + content.length + ' chars): ' + content.substring(0, 50) + '...');
        }
      } catch(e) {}
    });
  } catch(e) {
    // dir doesn't exist
  }
});

// Check all env vars for anything useful
console.log('\n=== Relevant environment variables ===');
Object.keys(process.env).sort().forEach(function(key) {
  if (key.match(/SUPABASE|SERVICE_ROLE|DB_PASS|DATABASE_URL|POSTGRES/i)) {
    console.log(key + '=' + process.env[key].substring(0, 15) + '...');
  }
});
