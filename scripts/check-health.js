// Check if the Next.js dev server is running at various ports
var ports = [3000, 3001, 3015, 3020, 3025, 3035];

async function checkPort(port) {
  try {
    var resp = await fetch('http://localhost:' + port + '/api/health', { signal: AbortSignal.timeout(3000) });
    var json = await resp.json();
    console.log('Port ' + port + ': ' + JSON.stringify(json));
  } catch (e) {
    console.log('Port ' + port + ': not responding (' + e.message + ')');
  }
}

async function main() {
  for (var i = 0; i < ports.length; i++) {
    await checkPort(ports[i]);
  }
}
main();
