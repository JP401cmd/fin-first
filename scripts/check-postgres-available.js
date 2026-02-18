try {
  require('postgres');
  console.log('postgres package is AVAILABLE');
} catch(e) {
  console.log('postgres package is NOT available');
}

try {
  require('pg');
  console.log('pg package is AVAILABLE');
} catch(e) {
  console.log('pg package is NOT available');
}
