'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

type VerifyResponse = {
  feature: string
  summary: string
  allPassing: boolean
  results: TestResult[]
}

export default function TestChatHistoryPage() {
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-chat-history')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-zinc-500">Verifying chat history persistence...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-red-500">Error: {error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">
          Feature #141: AI Chat History Preserved During Session
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Verifies that AI chat messages persist when navigating between pages within the same session.
        </p>

        {/* Summary */}
        <div
          className={`mb-6 rounded-xl border p-4 ${
            data.allPassing
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <p className={`text-lg font-semibold ${data.allPassing ? 'text-emerald-700' : 'text-red-700'}`}>
            {data.summary}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {data.allPassing
              ? 'All architectural checks confirm chat history persists during navigation.'
              : 'Some checks failed — chat history may not persist correctly.'}
          </p>
        </div>

        {/* Architecture Explanation */}
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-blue-800">How Chat Persistence Works</h2>
          <ol className="space-y-2 text-sm text-blue-700">
            <li><strong>1. Layout-level mounting:</strong> ChatPanel lives in app/(app)/layout.tsx, which wraps ALL protected pages. The layout component never unmounts during client-side navigation.</li>
            <li><strong>2. React state persistence:</strong> Both ChatProvider and ChatPanel are client components. Their React state (messages, isOpen) persists because the layout component stays mounted.</li>
            <li><strong>3. Stable chat ID:</strong> useChat uses id: &quot;chat-&#123;domain&#125;&quot; (e.g., &quot;chat-kern&quot;). All /core/* pages share domain &quot;kern&quot;, so navigating /core → /core/budgets → /core uses the same Chat instance.</li>
            <li><strong>4. useRef storage:</strong> The Vercel AI SDK stores the Chat instance in a useRef. This prevents recreation on re-renders while the component remains mounted.</li>
          </ol>
        </div>

        {/* Navigation flow diagram */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">Navigation Test Flow</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-amber-100 px-2 py-1 font-mono text-amber-700">/core</span>
            <span className="text-zinc-400">→</span>
            <span className="text-zinc-500">Open chat, send messages</span>
            <span className="text-zinc-400">→</span>
            <span className="rounded bg-amber-100 px-2 py-1 font-mono text-amber-700">/core/budgets</span>
            <span className="text-zinc-400">→</span>
            <span className="rounded bg-amber-100 px-2 py-1 font-mono text-amber-700">/core</span>
            <span className="text-zinc-400">→</span>
            <span className="text-emerald-600 font-semibold">Messages preserved ✓</span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Domain stays &quot;kern&quot; throughout → same Chat instance → messages persist.
          </p>
        </div>

        {/* Test Results */}
        <div className="space-y-3">
          {data.results.map((result, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-3 ${
                result.pass
                  ? 'border-emerald-200 bg-white'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-lg ${result.pass ? 'text-emerald-500' : 'text-red-500'}`}>
                  {result.pass ? '✅' : '❌'}
                </span>
                <span className="text-sm font-medium text-zinc-800">
                  {idx + 1}. {result.name}
                </span>
              </div>
              <p className="mt-1 ml-8 text-xs text-zinc-500">{result.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
