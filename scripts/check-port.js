const net = require('net');
const port = process.argv[2] || 3098;
const s = net.createServer();
s.listen(Number(port), () => { s.close(); process.stdout.write(port + ' free\n'); });
s.on('error', () => { process.stdout.write(port + ' in use\n'); });
