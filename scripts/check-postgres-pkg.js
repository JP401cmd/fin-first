// Check if postgres package is available
try {
  require('postgres');
  process.stdout.write('postgres package: AVAILABLE\n');
} catch(e) {
  process.stdout.write('postgres package: NOT AVAILABLE - ' + e.message + '\n');
}

// Check package.json for database packages
const pkg = require('../package.json');
const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
const dbPkgs = deps.filter(function(d) {
  return d.includes('pg') || d.includes('postgres') || d.includes('sql') || d.includes('database');
});
process.stdout.write('DB-related packages: ' + (dbPkgs.length > 0 ? dbPkgs.join(', ') : 'none') + '\n');
