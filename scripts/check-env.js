// Check all env files for service role key
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var files = ['.env', '.env.local', '.env.production', '.env.development', '.env.test'];
files.forEach(function(f) {
  var p = path.join(root, f);
  if (fs.existsSync(p)) {
    console.log('=== ' + f + ' ===');
    var content = fs.readFileSync(p, 'utf-8');
    // Mask values but show key names
    var lines = content.split('\n');
    lines.forEach(function(line) {
      if (line.includes('=') && !line.startsWith('#')) {
        var parts = line.split('=');
        var key = parts[0];
        var val = parts.slice(1).join('=');
        if (key.toLowerCase().includes('service') || key.toLowerCase().includes('role') || key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('db_')) {
          console.log('  FOUND: ' + key + ' = ' + val.substring(0, 10) + '...');
        } else {
          console.log('  ' + key + ' (length: ' + val.length + ')');
        }
      }
    });
  }
});
console.log('\nAlso checking for SUPABASE_SERVICE_ROLE_KEY in process.env...');
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('FOUND in process.env!');
} else {
  console.log('Not found in process.env');
}
if (process.env.DB_PASSWORD) {
  console.log('DB_PASSWORD found in process.env!');
} else {
  console.log('DB_PASSWORD not found in process.env');
}
