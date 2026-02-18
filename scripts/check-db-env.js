// Check for database-related environment variables
var envVars = [
  'DB_PASSWORD', 'DATABASE_URL', 'POSTGRES_PASSWORD',
  'SUPABASE_DB_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN', 'SERVICE_ROLE_KEY',
  'DIRECT_URL', 'DATABASE_DIRECT_URL'
];

envVars.forEach(function(v) {
  var val = process.env[v];
  if (val) {
    process.stdout.write(v + ' = ' + val.substring(0, 8) + '...(set)\n');
  } else {
    process.stdout.write(v + ' = (not set)\n');
  }
});

// Also check .env files
var fs = require('fs');
var path = require('path');
var envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
envFiles.forEach(function(f) {
  var fp = path.join(__dirname, '..', f);
  if (fs.existsSync(fp)) {
    var content = fs.readFileSync(fp, 'utf8');
    var lines = content.split('\n').filter(function(l) {
      return l.includes('SERVICE_ROLE') || l.includes('DB_PASSWORD') || l.includes('DATABASE_URL') || l.includes('POSTGRES');
    });
    if (lines.length > 0) {
      process.stdout.write('\nIn ' + f + ':\n');
      lines.forEach(function(l) {
        var parts = l.split('=');
        process.stdout.write('  ' + parts[0] + ' = ' + (parts[1] || '').substring(0, 8) + '...\n');
      });
    }
  }
});
