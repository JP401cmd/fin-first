var fs = require('fs');
var path = require('path');
var os = require('os');

// Look for Supabase credentials in common locations
var searchPaths = [
  path.join(os.homedir(), '.supabase'),
  path.join(os.homedir(), '.config', 'supabase'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'supabase'),
  path.join(os.homedir(), 'AppData', 'Local', 'supabase'),
  path.join(os.homedir(), '.env'),
  path.join(os.homedir(), '.env.local'),
];

// Also check the project for any .env files we might have missed
var projectEnvFiles = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
];

process.stdout.write('=== Searching home directory ===\n');
searchPaths.forEach(function(p) {
  try {
    var stat = fs.statSync(p);
    if (stat.isFile()) {
      var content = fs.readFileSync(p, 'utf8');
      // Look for DB-related vars
      var lines = content.split('\n').filter(function(l) {
        return l.match(/DB_|DATABASE|SUPABASE.*KEY|SERVICE_ROLE|PASSWORD|SECRET/i);
      });
      if (lines.length > 0) {
        process.stdout.write('FOUND credentials in ' + p + ':\n');
        lines.forEach(function(l) {
          // Mask partial values
          var parts = l.split('=');
          if (parts.length > 1) {
            var val = parts.slice(1).join('=');
            process.stdout.write('  ' + parts[0] + '=' + val.substring(0, 10) + '...(length:' + val.length + ')\n');
          }
        });
      }
    } else if (stat.isDirectory()) {
      var files = fs.readdirSync(p);
      process.stdout.write('DIR ' + p + ': ' + files.join(', ') + '\n');
    }
  } catch(e) {
    // skip
  }
});

process.stdout.write('\n=== Searching project env files ===\n');
var projectDir = path.join(__dirname, '..');
projectEnvFiles.forEach(function(f) {
  var fp = path.join(projectDir, f);
  try {
    var content = fs.readFileSync(fp, 'utf8');
    var lines = content.split('\n').filter(function(l) {
      return l.match(/DB_|DATABASE|SERVICE_ROLE|PASSWORD|SECRET/i) && !l.startsWith('#');
    });
    if (lines.length > 0) {
      process.stdout.write('FOUND in ' + f + ':\n');
      lines.forEach(function(l) {
        var parts = l.split('=');
        if (parts.length > 1) {
          var val = parts.slice(1).join('=');
          process.stdout.write('  ' + parts[0] + '=' + val.substring(0, 10) + '...(length:' + val.length + ')\n');
        }
      });
    } else {
      process.stdout.write(f + ': no DB credentials found\n');
    }
  } catch(e) {
    // skip
  }
});

process.stdout.write('\nDone.\n');
