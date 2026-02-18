import http from 'http';

const req = http.get('http://localhost:3000/api/health', { timeout: 10000 }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', data);
  });
});

req.on('error', (e) => {
  console.log('ERROR:', e.message);
});

req.on('timeout', () => {
  console.log('TIMEOUT');
  req.destroy();
});
