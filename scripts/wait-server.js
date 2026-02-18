// Wait for dev server to be ready
var port = process.argv[2] || 3035;
var maxAttempts = 20;
var attempt = 0;

function check() {
  attempt++;
  if (attempt > maxAttempts) {
    console.log('Server not ready after ' + maxAttempts + ' attempts');
    process.exit(1);
  }
  fetch('http://localhost:' + port + '/api/health', { signal: AbortSignal.timeout(3000) })
    .then(function(r) {
      console.log('Server ready on port ' + port + ' (status ' + r.status + ')');
      process.exit(0);
    })
    .catch(function() {
      console.log('Attempt ' + attempt + ': not ready, waiting...');
      setTimeout(check, 3000);
    });
}

check();
