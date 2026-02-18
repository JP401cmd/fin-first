const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  await page.goto('http://127.0.0.1:3000/test-file-size-limit')
  await page.waitForLoadState('networkidle')

  // Upload large file (11 MB) - should trigger error
  console.log('=== Test 1: Uploading large file (11 MB) ===')
  const largeInput = page.locator('input[type="file"]').first()
  await largeInput.setInputFiles('test-large-file.csv')
  await page.waitForTimeout(1000)

  // Take screenshot
  await page.screenshot({ path: '.playwright-cli/test-large-upload.png' })

  // Check for error message
  const errorEl = page.locator('[data-testid="file-size-error"]')
  const hasError = await errorEl.count() > 0
  if (hasError) {
    const errorText = await errorEl.textContent()
    console.log('ERROR MESSAGE:', errorText)
    console.log('PASS: Error message shown for oversized file')

    if (errorText.includes('10 MB')) {
      console.log('PASS: Error includes file size limit (10 MB)')
    } else {
      console.log('FAIL: Error does not include size limit')
    }

    if (errorText.includes('11.0 MB')) {
      console.log('PASS: Error includes actual file size (11.0 MB)')
    } else {
      console.log('FAIL: Error does not include actual file size')
    }
  } else {
    console.log('FAIL: No error shown for oversized file')
  }

  // Upload small file - should be accepted
  console.log('\n=== Test 2: Uploading small file (< 10 MB) ===')
  await page.goto('http://127.0.0.1:3000/test-file-size-limit')
  await page.waitForLoadState('networkidle')

  const smallInput = page.locator('input[type="file"]').nth(1)
  await smallInput.setInputFiles('test-small-file.csv')
  await page.waitForTimeout(1000)

  await page.screenshot({ path: '.playwright-cli/test-small-upload.png' })

  // Check no error and file accepted
  const errorAfterSmall = page.locator('[data-testid="file-size-error"]')
  const hasErrorSmall = await errorAfterSmall.count() > 0
  if (!hasErrorSmall) {
    console.log('PASS: No error for small file')
  } else {
    console.log('FAIL: Error shown for small file:', await errorAfterSmall.textContent())
  }

  // Check for the max size info text
  console.log('\n=== Test 3: Max file size info shown ===')
  const maxSizeInfo = page.locator('[data-testid="max-size-info"]')
  const hasMaxSizeInfo = await maxSizeInfo.count() > 0
  if (hasMaxSizeInfo) {
    const infoText = await maxSizeInfo.textContent()
    console.log('MAX SIZE INFO:', infoText)
    if (infoText.includes('10 MB')) {
      console.log('PASS: Upload area shows max file size')
    } else {
      console.log('FAIL: Max size info does not include 10 MB')
    }
  } else {
    console.log('FAIL: Max size info not found')
  }

  // Check passing count
  const passCountEl = page.locator('text=passing').first()
  const passText = await passCountEl.textContent()
  console.log('\nFinal result:', passText)

  await browser.close()
  console.log('\nDone!')
}

main().catch(e => { console.error(e); process.exit(1) })
