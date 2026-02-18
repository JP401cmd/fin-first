import net from 'net';
const port = parseInt(process.argv[2] || '3000');
const s = net.createServer();
s.listen(port, function() {
  console.log('Port ' + port + ' is FREE');
  s.close();
});
s.on('error', function(e) {
  console.log('Port ' + port + ' is IN USE: ' + e.code);
});
