'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * This page handles the return from bank authorization.
 * The actual callback processing happens in the API route (/api/gocardless/callback).
 * This client page is a fallback in case the redirect lands here instead.
 */
export default function ConnectCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // If we land on this page, redirect to the API callback endpoint
    const ref = searchParams.get('ref')
    if (ref) {
      router.replace(`/api/gocardless/callback?ref=${ref}`)
    } else {
      router.replace('/core/cash/connect?error=missing_reference')
    }
  }, [router, searchParams])

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      <p className="mt-4 text-sm font-medium text-zinc-700">Verbinding verwerken...</p>
      <p className="mt-1 text-xs text-zinc-400">Even geduld, je wordt automatisch doorgestuurd.</p>
    </div>
  )
}
