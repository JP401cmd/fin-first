const port = process.argv[2] || '3156';
const base = `http://localhost:${port}`;
const pages = ['/api/health', '/login'];

async function main() {
  for (const page of pages) {
    const url = base + page;
    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(url);
        console.log(`${page} attempt ${attempt}: ${res.status}`);
        if (res.ok) break;
      } catch (err) {
        console.log(`${page} attempt ${attempt}: ${err.message}`);
      }
    }
  }
  console.log('Warmup complete');
}

main();
