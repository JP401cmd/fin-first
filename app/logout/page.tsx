'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { purgeAccountScopedStorage } from '@/lib/browser-account-storage'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    // reason=blocked → na uitloggen naar /login met een blokkade-melding.
    // window.location vermijdt useSearchParams (en daarmee een Suspense-grens).
    const reason = new URLSearchParams(window.location.search).get('reason')
    const destination = reason === 'blocked' ? '/login?blocked=1' : '/'
    // Vóór signOut: als het wegschrijven van de sessie faalt, is de opslag toch
    // al leeg. Andersom zou een fout de gegevens van dit account laten staan voor
    // wie er hierna op dit toestel inlogt.
    purgeAccountScopedStorage()
    const supabase = createClient()
    supabase.auth.signOut().finally(() => {
      router.replace(destination)
    })
  }, [router])

  return null
}
