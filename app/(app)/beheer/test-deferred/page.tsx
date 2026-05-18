'use client'

import { useState } from 'react'

/**
 * Test page for feature #830: Set/clear onboarding deferred fields.
 * Accessible at /beheer/test-deferred — admin test only.
 */
export default function TestDeferredPage() {
  const [status, setStatus] = useState<string>('Ready')
  const [fields, setFields] = useState<string[]>([])

  async function loadFields() {
    const res = await fetch('/api/verify-deferred-fields')
    const data = await res.json()
    setFields(data.deferredFields || [])
    setStatus(JSON.stringify(data, null, 2))
  }

  async function setDeferredFields(newFields: string[]) {
    const res = await fetch('/api/verify-deferred-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: newFields }),
    })
    const data = await res.json()
    setStatus(JSON.stringify(data, null, 2))
    await loadFields()
  }

  async function clearFields() {
    const res = await fetch('/api/verify-deferred-fields', { method: 'DELETE' })
    const data = await res.json()
    setStatus(JSON.stringify(data, null, 2))
    await loadFields()
  }

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-bold">Test: Deferred Onboarding Fields (#830)</h1>

      <div className="space-y-2">
        <button onClick={loadFields} className="px-4 py-2 bg-blue-600 text-white rounded mr-2">
          Load Current Fields
        </button>
        <button
          onClick={() => setDeferredFields(['income', 'assets', 'spaardoel'])}
          className="px-4 py-2 bg-green-600 text-white rounded mr-2"
        >
          Set All 3 Deferred
        </button>
        <button
          onClick={() => setDeferredFields(['income'])}
          className="px-4 py-2 bg-yellow-600 text-white rounded mr-2"
        >
          Set Income Only
        </button>
        <button
          onClick={() => setDeferredFields(['assets'])}
          className="px-4 py-2 bg-orange-600 text-white rounded mr-2"
        >
          Set Assets Only
        </button>
        <button onClick={clearFields} className="px-4 py-2 bg-red-600 text-white rounded">
          Clear All
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Current Deferred Fields:</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm">{JSON.stringify(fields, null, 2)}</pre>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">API Response:</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">{status}</pre>
      </div>

      <div className="text-sm text-gray-500 space-y-1">
        <p>After setting fields, navigate to /core and wait 1.5s for the coach-bubble.</p>
        <p>Deferred suggestions should appear before generic data-gap suggestions.</p>
        <p>Dismiss the coach-bubble, then revisit — same suggestion should not reappear.</p>
      </div>
    </div>
  )
}
