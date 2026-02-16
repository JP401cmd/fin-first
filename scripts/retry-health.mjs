const url = process.argv[2] || 'http://localhost:3143/api/health';
const maxRetries = parseInt(process.argv[3] || '10', 10);
const delay = 3000;

async function main() {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await new Promise(r => setTimeout(r, delay));
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Attempt ${attempt}: ${res.status} - ${text.substring(0, 120)}`);
      if (res.ok) {
        console.log('SUCCESS');
        process.exit(0);
      }
    } catch (err) {
      console.log(`Attempt ${attempt}: error - ${err.message}`);
    }
  }
  console.log('FAILED after all retries');
  process.exit(1);
}

main();
