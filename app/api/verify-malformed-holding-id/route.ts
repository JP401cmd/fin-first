import { NextResponse } from 'next/server'

/**
 * GET /api/verify-malformed-holding-id
 *
 * Verification endpoint for Feature #145: Malformed holding ID in URL handled gracefully.
 * Tests that invalid UUIDs in holding URLs show 404 not crash.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const baseUrl = 'http://localhost:3000'

  // Test 1: /holdings/invalid-uuid-here returns 404 (not 500)
  try {
    const res = await fetch(`${baseUrl}/holdings/invalid-uuid-here`, { redirect: 'manual' })
    const status = res.status
    results.push({
      name: '/holdings/invalid-uuid-here returns 404',
      pass: status === 404,
      detail: `Status: ${status} (expected 404)`,
    })
  } catch (e: unknown) {
    results.push({
      name: '/holdings/invalid-uuid-here returns 404',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 2: /holdings/not-a-uuid shows 404 content
  try {
    const res = await fetch(`${baseUrl}/holdings/not-a-uuid`, { redirect: 'manual' })
    const html = await res.text()
    const has404 = html.includes('404') || html.includes('niet gevonden') || html.includes('niet gevonden')
    results.push({
      name: '/holdings/not-a-uuid shows 404 content',
      pass: has404 && res.status === 404,
      detail: `Status: ${res.status}, contains 404/not-found text: ${has404}`,
    })
  } catch (e: unknown) {
    results.push({
      name: '/holdings/not-a-uuid shows 404 content',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 3: /holdings/12345 (numeric, not UUID) returns 404
  try {
    const res = await fetch(`${baseUrl}/holdings/12345`, { redirect: 'manual' })
    results.push({
      name: '/holdings/12345 returns 404',
      pass: res.status === 404,
      detail: `Status: ${res.status} (expected 404)`,
    })
  } catch (e: unknown) {
    results.push({
      name: '/holdings/12345 returns 404',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 4: /holdings/<script>alert(1)</script> (XSS attempt) returns 404
  try {
    const res = await fetch(`${baseUrl}/holdings/%3Cscript%3Ealert(1)%3C%2Fscript%3E`, { redirect: 'manual' })
    results.push({
      name: '/holdings/<script> (XSS) returns 404',
      pass: res.status === 404,
      detail: `Status: ${res.status} (expected 404)`,
    })
  } catch (e: unknown) {
    results.push({
      name: '/holdings/<script> (XSS) returns 404',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 5: /core/assets/holdings/invalid-uuid-here returns 307 (redirect to login) or 404
  try {
    const res = await fetch(`${baseUrl}/core/assets/holdings/invalid-uuid-here`, { redirect: 'manual' })
    // Without auth, protected routes redirect to login (307) which is acceptable
    // With auth, they'd show 404 from the [id] route's notFound() call
    const ok = res.status === 307 || res.status === 404
    results.push({
      name: '/core/assets/holdings/invalid-uuid-here handled gracefully',
      pass: ok,
      detail: `Status: ${res.status} (expected 307 redirect-to-login or 404)`,
    })
  } catch (e: unknown) {
    results.push({
      name: '/core/assets/holdings/invalid-uuid-here handled gracefully',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 6: 404 page has navigation links (no dead end)
  // Next.js RSC renders Link components in the payload, not as plain href attributes
  try {
    const res = await fetch(`${baseUrl}/holdings/invalid-uuid-here`, { redirect: 'manual' })
    const html = await res.text()
    const hasOverviewRef = html.includes('/overzicht') || html.includes('Naar Overzicht')
    const hasHomeRef = html.includes('Naar startpagina') || html.includes('Naar holdings')
    const hasNavLinks = hasOverviewRef && hasHomeRef
    results.push({
      name: '404 page includes navigation links',
      pass: hasNavLinks,
      detail: `Overzicht link: ${hasOverviewRef}, Home/holdings link: ${hasHomeRef}`,
    })
  } catch (e: unknown) {
    results.push({
      name: '404 page includes navigation links',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 7: 404 page does not crash (no 500 error)
  try {
    const res = await fetch(`${baseUrl}/holdings/invalid-uuid-here`, { redirect: 'manual' })
    results.push({
      name: 'No 500 server error on invalid ID',
      pass: res.status !== 500,
      detail: `Status: ${res.status} (must not be 500)`,
    })
  } catch (e: unknown) {
    results.push({
      name: 'No 500 server error on invalid ID',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Test 8: /holdings/ without ID also doesn't crash
  try {
    const res = await fetch(`${baseUrl}/holdings/`, { redirect: 'manual' })
    results.push({
      name: '/holdings/ (no ID) does not crash',
      pass: res.status !== 500,
      detail: `Status: ${res.status} (must not be 500)`,
    })
  } catch (e: unknown) {
    results.push({
      name: '/holdings/ (no ID) does not crash',
      pass: false,
      detail: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#145 — Malformed holding ID in URL handled gracefully',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
