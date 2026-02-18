// Check for Supabase CLI token in default locations
var fs = require('fs');
var path = require('path');
var os = require('os');

var locations = [
  path.join(os.homedir(), '.supabase', 'access-token'),
  path.join(os.homedir(), '.config', 'supabase', 'access-token'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'supabase', 'access-token'),
  path.join(os.homedir(), 'AppData', 'Local', 'supabase', 'access-token'),
  path.join(os.homedir(), '.supabase'),
  path.join(os.homedir(), '.config', 'supabase'),
];

locations.forEach(function(loc) {
  try {
    var stat = fs.statSync(loc);
    if (stat.isFile()) {
      var content = fs.readFileSync(loc, 'utf8').trim();
      process.stdout.write('FOUND token at: ' + loc + ' (length: ' + content.length + ')\n');
      process.stdout.write('  First 10 chars: ' + content.substring(0, 10) + '...\n');
    } else if (stat.isDirectory()) {
      var files = fs.readdirSync(loc);
      process.stdout.write('DIR: ' + loc + ' contains: ' + files.join(', ') + '\n');
    }
  } catch(e) {
    // Not found, skip
  }
});

// Also check global npm config for supabase
var globalDirs = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'supabase'),
  path.join(os.homedir(), 'AppData', 'Local', 'supabase'),
  path.join(os.homedir(), '.supabase'),
];

globalDirs.forEach(function(dir) {
  try {
    if (fs.statSync(dir).isDirectory()) {
      var files = fs.readdirSync(dir);
      process.stdout.write('Supabase config dir: ' + dir + '\n');
      process.stdout.write('  Files: ' + files.join(', ') + '\n');
    }
  } catch(e) {
    // skip
  }
});

process.stdout.write('\nDone checking for Supabase tokens.\n');
