'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * This page handles the return from bank authorization.
 * The actual callback processing happens in the API route (/api/bank-connect/callback).
 * This client page is a fallback in case the redirect lands here instead.
 */
export default function ConnectCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // If we land on this page, redirect to the API callback endpoint
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (code && state) {
      router.replace(`/api/bank-connect/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
    } else {
      router.replace('/core/cash/connect?error=missing_code')
    }
  }, [router, searchParams])

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      <p className="mt-4 text-sm font-medium text-[var(--ink-2)]">Verbinding verwerken...</p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">Even geduld, je wordt automatisch doorgestuurd.</p>
    </div>
  )
}
