// Start Next.js dev server
var spawn = require('child_process').spawn;
var path = require('path');

var projectDir = path.resolve(__dirname, '..');
var port = process.argv[2] || '3035';

console.log('Starting Next.js dev server on port ' + port + ' in ' + projectDir);

var child = spawn('npx', ['next', 'dev', '--port', port], {
  cwd: projectDir,
  stdio: 'inherit',
  shell: true,
  env: Object.assign({}, process.env, {
    PORT: port
  })
});

child.on('error', function(err) {
  console.error('Failed to start server:', err.message);
});

child.on('exit', function(code) {
  console.log('Server exited with code ' + code);
});
