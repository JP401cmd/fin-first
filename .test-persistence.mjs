import http from 'http';

const url = process.argv[2] || 'http://localhost:3000/api/health?persistence_test=RESTART_TEST_12345';

const req = http.get(url, { timeout: 15000 }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('BODY:', JSON.stringify(json, null, 2));
    } catch {
      console.log('BODY:', data);
    }
  });
});

req.on('error', (e) => {
  console.log('ERROR:', e.message);
});

req.on('timeout', () => {
  console.log('TIMEOUT');
  req.destroy();
});
