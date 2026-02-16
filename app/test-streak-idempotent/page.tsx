'use client'

import { useState, useEffect } from 'react'

type TestResult = {
  test: string
  passed: boolean
  details: string
}

type VerifyResponse = {
  feature: string
  summary: string
  all_passing: boolean
  results: TestResult[]
  error?: string
}

export default function TestStreakIdempotentPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [liveResults, setLiveResults] = useState<{ step: string; result: string; passed: boolean }[]>([])
  const [liveRunning, setLiveRunning] = useState(false)

  useEffect(() => {
    fetch('/api/verify-streak-idempotent')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => {
        setData({ feature: '#157', summary: 'Error', all_passing: false, results: [], error: e.message })
        setLoading(false)
      })
  }, [])

  async function runLiveTest() {
    setLiveRunning(true)
    setLiveResults([])
    const testDate = '2024-06-10' // A specific Monday for testing

    try {
      // Step 1: First checkin
      setLiveResults(prev => [...prev, { step: '1. First checkin...', result: 'Running...', passed: true }])
      const res1 = await fetch(`/api/streaks/checkin?date=${testDate}`, { method: 'POST' })
      const data1 = await res1.json()

      if (!res1.ok) {
        setLiveResults([{
          step: '1. First checkin',
          result: `Failed: ${data1.error || res1.statusText} (status ${res1.status})`,
          passed: false,
        }])
        setLiveRunning(false)
        return
      }

      const count1 = data1.streak?.current_count
      const longest1 = data1.streak?.longest_count
      const lastDate1 = data1.streak?.last_activity_date

      setLiveResults([{
        step: '1. First checkin',
        result: `Action: "${data1.action}", count: ${count1}, longest: ${longest1}, last_activity: "${lastDate1}"`,
        passed: true,
      }])

      // Step 2: Second checkin (same day)
      const res2 = await fetch(`/api/streaks/checkin?date=${testDate}`, { method: 'POST' })
      const data2 = await res2.json()

      const count2 = data2.streak?.current_count
      const longest2 = data2.streak?.longest_count
      const lastDate2 = data2.streak?.last_activity_date

      const countSame = count1 === count2
      const longestSame = longest1 === longest2
      const dateSame = lastDate1 === lastDate2
      const actionCorrect = data2.action === 'already_checked_in'

      setLiveResults(prev => [
        ...prev,
        {
          step: '2. Second checkin (same day)',
          result: `Action: "${data2.action}" ${actionCorrect ? '✅' : '❌'}, count: ${count2} ${countSame ? '✅ unchanged' : '❌ CHANGED'}, longest: ${longest2} ${longestSame ? '✅ unchanged' : '❌ CHANGED'}, last_activity: "${lastDate2}" ${dateSame ? '✅ unchanged' : '❌ CHANGED'}`,
          passed: countSame && longestSame && dateSame && actionCorrect,
        },
      ])

      // Step 3: Third checkin (same day)
      const res3 = await fetch(`/api/streaks/checkin?date=${testDate}`, { method: 'POST' })
      const data3 = await res3.json()

      const count3 = data3.streak?.current_count
      const longest3 = data3.streak?.longest_count
      const lastDate3 = data3.streak?.last_activity_date

      const tripleCountSame = count1 === count3
      const tripleLongestSame = longest1 === longest3
      const tripleDateSame = lastDate1 === lastDate3
      const tripleActionCorrect = data3.action === 'already_checked_in'

      setLiveResults(prev => [
        ...prev,
        {
          step: '3. Third checkin (same day)',
          result: `Action: "${data3.action}" ${tripleActionCorrect ? '✅' : '❌'}, count: ${count3} ${tripleCountSame ? '✅ unchanged' : '❌ CHANGED'}, longest: ${longest3} ${tripleLongestSame ? '✅ unchanged' : '❌ CHANGED'}, last_activity: "${lastDate3}" ${tripleDateSame ? '✅ unchanged' : '❌ CHANGED'}`,
          passed: tripleCountSame && tripleLongestSame && tripleDateSame && tripleActionCorrect,
        },
      ])

      // Summary
      const allPassed = countSame && longestSame && dateSame && actionCorrect &&
        tripleCountSame && tripleLongestSame && tripleDateSame && tripleActionCorrect

      setLiveResults(prev => [
        ...prev,
        {
          step: 'Summary',
          result: allPassed
            ? '✅ ALL IDEMPOTENCY CHECKS PASSED — Multiple checkins on same day do not inflate streak count'
            : '❌ IDEMPOTENCY VIOLATION — Streak count or date changed on duplicate checkin',
          passed: allPassed,
        },
      ])
    } catch (err) {
      setLiveResults(prev => [
        ...prev,
        {
          step: 'Error',
          result: `Exception: ${err instanceof Error ? err.message : 'Unknown error'}`,
          passed: false,
        },
      ])
    }

    setLiveRunning(false)
  }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: '900px', margin: '2rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
        Feature #157: Streak Checkin Idempotency Test
      </h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Verifies that calling POST /api/streaks/checkin multiple times on the same day
        does not inflate the streak count.
      </p>

      {/* Code verification results */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
        Code Verification
      </h2>
      {loading ? (
        <p>Loading verification results...</p>
      ) : data?.error ? (
        <p style={{ color: 'red' }}>Error: {data.error}</p>
      ) : (
        <>
          <p style={{
            marginBottom: '1rem',
            padding: '0.5rem',
            backgroundColor: data?.all_passing ? '#d4edda' : '#f8d7da',
            borderRadius: '4px',
          }}>
            {data?.summary}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data?.results.map((r, i) => (
              <div key={i} style={{
                padding: '0.75rem',
                backgroundColor: r.passed ? '#f0fff0' : '#fff0f0',
                border: `1px solid ${r.passed ? '#c3e6c3' : '#e6c3c3'}`,
                borderRadius: '4px',
              }}>
                <div style={{ fontWeight: 'bold' }}>
                  {r.passed ? '✅' : '❌'} {r.test}
                </div>
                <div style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {r.details}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Live API test */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '0.5rem' }}>
        Live API Test (requires authentication)
      </h2>
      <p style={{ color: '#666', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        Calls POST /api/streaks/checkin 3 times with the same date and verifies count stays the same.
      </p>
      <button
        onClick={runLiveTest}
        disabled={liveRunning}
        style={{
          padding: '0.5rem 1.5rem',
          backgroundColor: liveRunning ? '#ccc' : '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: liveRunning ? 'not-allowed' : 'pointer',
          marginBottom: '1rem',
        }}
      >
        {liveRunning ? 'Running...' : 'Run Live Idempotency Test'}
      </button>

      {liveResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {liveResults.map((r, i) => (
            <div key={i} style={{
              padding: '0.75rem',
              backgroundColor: r.passed ? '#f0fff0' : '#fff0f0',
              border: `1px solid ${r.passed ? '#c3e6c3' : '#e6c3c3'}`,
              borderRadius: '4px',
            }}>
              <div style={{ fontWeight: 'bold' }}>{r.step}</div>
              <div style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {r.result}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
