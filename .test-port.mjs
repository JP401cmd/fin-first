import net from 'net';

const socket = new net.Socket();
socket.setTimeout(3000);

socket.on('connect', () => {
  console.log('PORT 3000: OPEN (something is listening)');
  socket.destroy();
});

socket.on('timeout', () => {
  console.log('PORT 3000: TIMEOUT');
  socket.destroy();
});

socket.on('error', (err) => {
  console.log('PORT 3000:', err.message);
});

socket.connect(3000, 'localhost');
