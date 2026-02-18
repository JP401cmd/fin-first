// Wait for server to be ready, then test the reset endpoint
async function waitForServer(url, maxWait = 30000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()
      console.log('Status:', res.status)
      console.log('Response:', JSON.stringify(data))
      return true
    } catch (e) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  console.log('Server did not become ready')
  return false
}

await waitForServer('http://localhost:3005/api/onboarding/reset')
