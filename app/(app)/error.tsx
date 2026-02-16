'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error for debugging (server-side only, not exposed to user)
    console.error('[AppError]', error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-6 py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900">
          Er ging iets mis
        </h1>
        <p className="mt-3 text-base text-zinc-600">
          Er is een onverwachte fout opgetreden. Onze excuses voor het ongemak.
          Probeer het opnieuw of ga terug naar het dashboard.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Opnieuw proberen
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Naar dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-zinc-400">
            Foutcode: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
