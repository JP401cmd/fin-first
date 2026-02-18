const http = require('http');

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:' + port, (res) => {
      console.log('Port ' + port + ' responding with status: ' + res.statusCode);
      res.on('data', () => {});
      resolve(true);
    });
    req.on('error', (e) => {
      console.log('Port ' + port + ' not responding: ' + e.message);
      resolve(false);
    });
    req.setTimeout(3000, () => {
      console.log('Port ' + port + ' timeout');
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  await checkPort(3000);
  await checkPort(3001);
}
main();
