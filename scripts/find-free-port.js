// Find a free port
const net = require('net');

function checkPort(port) {
  return new Promise(function(resolve) {
    var server = net.createServer();
    server.once('error', function() { resolve(false); });
    server.once('listening', function() { server.close(); resolve(true); });
    server.listen(port);
  });
}

async function main() {
  var ports = [3100, 3200, 3300, 3400, 3500, 4000, 4100, 5000, 8080, 8000];
  for (var i = 0; i < ports.length; i++) {
    var free = await checkPort(ports[i]);
    console.log('Port ' + ports[i] + ': ' + (free ? 'FREE' : 'IN USE'));
    if (free) {
      console.log('\nUse port: ' + ports[i]);
      break;
    }
  }
}

main();
