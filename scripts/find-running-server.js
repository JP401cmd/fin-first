const http = require('http');

const ports = [3000, 3040, 3045, 3050, 3055, 3060, 3065, 3070, 3071, 3072, 3073, 3074, 3075, 3080, 3085, 3090, 3095, 3098, 3099, 3100, 3120, 3130, 3199];

let found = 0;
let checked = 0;

ports.forEach(port => {
  const req = http.get('http://localhost:' + port + '/api/health', { timeout: 2000 }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      process.stdout.write('Port ' + port + ': status=' + res.statusCode + ' body=' + body.substring(0, 100) + '\n');
      found++;
      checked++;
      if (checked === ports.length) done();
    });
  });
  req.on('error', () => { checked++; if (checked === ports.length) done(); });
  req.on('timeout', () => { req.destroy(); checked++; if (checked === ports.length) done(); });
});

function done() {
  if (found === 0) process.stdout.write('No running servers found on any port\n');
  process.stdout.write('Check complete\n');
}
