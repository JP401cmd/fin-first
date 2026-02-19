import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generatePDF() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const htmlPath = join(__dirname, 'trifinity-brochure.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  await page.pdf({
    path: join(__dirname, 'trifinity-brochure.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();
  console.log('PDF generated: marketing/trifinity-brochure.pdf');
}

generatePDF().catch(console.error);
