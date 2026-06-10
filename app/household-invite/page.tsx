'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Household invite redirect page.
 * This is the landing page for email invitation links.
 * It extracts the token from the URL and redirects to /mijn/profiel?invite_token=xxx
 * The proxy will handle redirecting to login if not authenticated.
 */
function HouseholdInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      router.replace(`/mijn/profiel?invite_token=${token}`)
    } else {
      router.replace('/mijn/profiel')
    }
  }, [token, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-teal-300 border-t-teal-600" />
        <p className="mt-4 text-sm text-zinc-500">Even geduld, je wordt doorgestuurd...</p>
      </div>
    </div>
  )
}

export default function HouseholdInvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-teal-300 border-t-teal-600" />
          <p className="mt-4 text-sm text-zinc-500">Even geduld, je wordt doorgestuurd...</p>
        </div>
      </div>
    }>
      <HouseholdInviteContent />
    </Suspense>
  )
}
