'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    // reason=blocked → na uitloggen naar /login met een blokkade-melding.
    // window.location vermijdt useSearchParams (en daarmee een Suspense-grens).
    const reason = new URLSearchParams(window.location.search).get('reason')
    const destination = reason === 'blocked' ? '/login?blocked=1' : '/'
    const supabase = createClient()
    supabase.auth.signOut().finally(() => {
      router.replace(destination)
    })
  }, [router])

  return null
}
