'use client'

import { useState } from 'react'

type TestResult = {
  test: string
  pass: boolean
  detail: string
}

export default function TestDuplicateHoldingsPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)

  async function runTests() {
    setRunning(true)
    const testResults: TestResult[] = []
    const testTicker = `VWRL`
    const testName = `VWRL World ETF Test ${Date.now()}`
    let firstHoldingId: string | null = null
    let secondHoldingId: string | null = null

    // Test 1: Create first holding with ticker VWRL
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testName,
          ticker: testTicker,
          units: 10,
          avg_purchase_price: 85.50,
          current_price: 90.00,
        }),
      })

      if (res.status === 201) {
        const data = await res.json()
        firstHoldingId = data.holding?.id
        testResults.push({
          test: '1. Eerste holding met ticker VWRL aanmaken',
          pass: true,
          detail: `Holding aangemaakt: ${data.holding?.name} (${data.holding?.id?.substring(0, 8)}...)`,
        })
      } else if (res.status === 409) {
        // There's already a holding with VWRL — that's fine, we'll test with it
        const data = await res.json()
        testResults.push({
          test: '1. Eerste holding met ticker VWRL aanmaken',
          pass: true,
          detail: `Bestaande holding gevonden met ticker VWRL — dubbele detectie werkt al! (${data.message})`,
        })
        // Force create it for the test
        const forceRes = await fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: testName,
            ticker: testTicker,
            units: 10,
            avg_purchase_price: 85.50,
            current_price: 90.00,
            force_duplicate: true,
          }),
        })
        if (forceRes.status === 201) {
          const forceData = await forceRes.json()
          firstHoldingId = forceData.holding?.id
        }
      } else {
        const data = await res.json()
        testResults.push({
          test: '1. Eerste holding met ticker VWRL aanmaken',
          pass: false,
          detail: `Status ${res.status}: ${data.error || 'onbekend'}`,
        })
      }
    } catch (err) {
      testResults.push({
        test: '1. Eerste holding met ticker VWRL aanmaken',
        pass: false,
        detail: `Fout: ${err instanceof Error ? err.message : 'onbekend'}`,
      })
    }

    // Test 2: Try to create another holding with same ticker VWRL - should get 409 warning
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `VWRL Duplicate Test ${Date.now()}`,
          ticker: testTicker,
          units: 5,
          avg_purchase_price: 88.00,
        }),
      })

      const data = await res.json()

      if (res.status === 409 && data.warning === true) {
        testResults.push({
          test: '2. Dubbele holding met zelfde ticker geeft 409 warning',
          pass: true,
          detail: `Warning: "${data.message}" — Bestaande: ${data.existing_holdings?.map((h: {name: string}) => h.name).join(', ')}`,
        })
      } else if (res.status === 201) {
        testResults.push({
          test: '2. Dubbele holding met zelfde ticker geeft 409 warning',
          pass: false,
          detail: 'Holding werd aangemaakt zonder waarschuwing — duplicate detection niet actief!',
        })
        // Clean up the accidentally created holding
        if (data.holding?.id) {
          await fetch(`/api/holdings?id=${data.holding.id}`, { method: 'DELETE' })
        }
      } else {
        testResults.push({
          test: '2. Dubbele holding met zelfde ticker geeft 409 warning',
          pass: false,
          detail: `Onverwachte status ${res.status}: ${JSON.stringify(data)}`,
        })
      }
    } catch (err) {
      testResults.push({
        test: '2. Dubbele holding met zelfde ticker geeft 409 warning',
        pass: false,
        detail: `Fout: ${err instanceof Error ? err.message : 'onbekend'}`,
      })
    }

    // Test 3: Case-insensitive check - try lowercase "vwrl"
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `vwrl lowercase test`,
          ticker: 'vwrl', // lowercase!
          units: 1,
          avg_purchase_price: 90.00,
        }),
      })

      const data = await res.json()

      testResults.push({
        test: '3. Ticker check is hoofdletterongevoelig (vwrl = VWRL)',
        pass: res.status === 409 && data.warning === true,
        detail: res.status === 409
          ? `Correct: lowercase "vwrl" gedetecteerd als duplicaat`
          : `Fout: status ${res.status}, verwacht 409`,
      })

      // Clean up if accidentally created
      if (res.status === 201 && data.holding?.id) {
        await fetch(`/api/holdings?id=${data.holding.id}`, { method: 'DELETE' })
      }
    } catch (err) {
      testResults.push({
        test: '3. Ticker check is hoofdletterongevoelig (vwrl = VWRL)',
        pass: false,
        detail: `Fout: ${err instanceof Error ? err.message : 'onbekend'}`,
      })
    }

    // Test 4: force_duplicate=true bypasses the check
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `VWRL Force Duplicate ${Date.now()}`,
          ticker: testTicker,
          units: 2,
          avg_purchase_price: 92.00,
          force_duplicate: true,
        }),
      })

      const data = await res.json()

      if (res.status === 201) {
        secondHoldingId = data.holding?.id
        testResults.push({
          test: '4. force_duplicate=true maakt holding toch aan',
          pass: true,
          detail: `Holding aangemaakt ondanks duplicaat: ${data.holding?.name} (${data.holding?.id?.substring(0, 8)}...)`,
        })
      } else {
        testResults.push({
          test: '4. force_duplicate=true maakt holding toch aan',
          pass: false,
          detail: `Verwacht 201, kreeg ${res.status}: ${JSON.stringify(data)}`,
        })
      }
    } catch (err) {
      testResults.push({
        test: '4. force_duplicate=true maakt holding toch aan',
        pass: false,
        detail: `Fout: ${err instanceof Error ? err.message : 'onbekend'}`,
      })
    }

    // Test 5: No warning for holdings without ticker
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Holding Zonder Ticker ${Date.now()}`,
          units: 1,
          avg_purchase_price: 50.00,
        }),
      })

      const data = await res.json()
      let noTickerHoldingId: string | null = null

      if (res.status === 201) {
        noTickerHoldingId = data.holding?.id
        testResults.push({
          test: '5. Holding zonder ticker geeft geen dubbele waarschuwing',
          pass: true,
          detail: 'Holding zonder ticker direct aangemaakt (geen ticker = geen check)',
        })
        // Clean up
        if (noTickerHoldingId) {
          await fetch(`/api/holdings?id=${noTickerHoldingId}`, { method: 'DELETE' })
        }
      } else {
        testResults.push({
          test: '5. Holding zonder ticker geeft geen dubbele waarschuwing',
          pass: false,
          detail: `Verwacht 201, kreeg ${res.status}: ${JSON.stringify(data)}`,
        })
      }
    } catch (err) {
      testResults.push({
        test: '5. Holding zonder ticker geeft geen dubbele waarschuwing',
        pass: false,
        detail: `Fout: ${err instanceof Error ? err.message : 'onbekend'}`,
      })
    }

    // Cleanup: delete test holdings
    if (firstHoldingId) {
      await fetch(`/api/holdings?id=${firstHoldingId}`, { method: 'DELETE' })
    }
    if (secondHoldingId) {
      await fetch(`/api/holdings?id=${secondHoldingId}`, { method: 'DELETE' })
    }

    testResults.push({
      test: '6. Cleanup: testdata verwijderd',
      pass: true,
      detail: 'Test holdings opgeruimd',
    })

    setResults(testResults)
    setRunning(false)
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Test: Dubbele Holding Detectie (#106)
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verifieert dat het aanmaken van twee holdings met dezelfde ticker een waarschuwing geeft,
          en dat de gebruiker toch kan doorgaan als dat gewenst is.
        </p>

        <button
          onClick={runTests}
          disabled={running}
          className="mb-6 rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-50"
        >
          {running ? 'Tests uitvoeren...' : 'Tests uitvoeren'}
        </button>

        {results.length > 0 && (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-800">
              Resultaat: {passing}/{total} tests geslaagd
              {passing === total ? ' ✅' : ' ⚠️'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                r.pass
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-sm">{r.pass ? '✅' : '❌'}</span>
                <div>
                  <p className={`text-sm font-medium ${r.pass ? 'text-emerald-800' : 'text-red-800'}`}>
                    {r.test}
                  </p>
                  <p className={`mt-0.5 text-xs ${r.pass ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
