// Check if a page loads successfully
const url = process.argv[2] || 'http://localhost:3000/signup';
fetch(url).then(function(r) {
  console.log('Status:', r.status);
  r.text().then(function(t) {
    console.log('Length:', t.length);
    console.log('Has error:', t.includes('Internal Server Error'));
    if (t.length < 500) console.log('Content:', t.substring(0, 500));
  });
}).catch(function(e) {
  console.log('Error:', e.message);
});
