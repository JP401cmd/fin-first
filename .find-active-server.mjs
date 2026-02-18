import http from 'http';

const ports = [3000, 3050, 3055, 3060, 3070, 3073, 3074, 3075, 3080, 3085, 3090, 3095, 3098];
let found = 0;

for (const p of ports) {
  const req = http.get(`http://localhost:${p}/login`, (res) => {
    console.log(`Port ${p}: ACTIVE (status ${res.statusCode})`);
    found++;
    res.resume();
  });
  req.on('error', () => {});
  req.setTimeout(2000, () => { req.destroy(); });
}

setTimeout(() => {
  if (found === 0) console.log('No active servers found');
  process.exit(0);
}, 4000);
