var http = require('http');
var options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/verify-box3-optimization',
  headers: { 'Accept': 'application/json' }
};
var req = http.get(options, function(res) {
  var data = '';
  res.on('data', function(chunk) { data += chunk; });
  res.on('end', function() {
    var result = JSON.parse(data);
    console.log('Status: ' + result.status);
    console.log('Passing: ' + result.passing + '/' + result.total);
    console.log('All passing: ' + result.allPassing);
    console.log('');
    result.tests.forEach(function(t, i) {
      console.log((t.pass ? 'PASS' : 'FAIL') + ' [' + (i+1) + '] ' + t.name);
      console.log('     ' + t.detail.substring(0, 150));
    });
  });
});
req.on('error', function(e) { console.error('Error:', e.message); });
