'use client'

import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'

/**
 * Laat binnen een `<Link>` zien dat de navigatie loopt. Een wissel van weergave
 * of periode leest het hele dashboard opnieuw; zonder dit teken lijkt een klik
 * de eerste tel niets te doen.
 *
 * Het teken neemt altijd zijn ruimte in (onzichtbaar als er niets loopt), zodat
 * de knop niet van breedte verspringt.
 */
export function LinkBezig() {
  const { pending } = useLinkStatus()
  return (
    <span
      className={`ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center ${pending ? '' : 'invisible'}`}
      data-bezig={pending ? 'ja' : undefined}
    >
      <Loader2 aria-hidden className="h-3.5 w-3.5 motion-safe:animate-spin" />
      {pending && <span className="sr-only"> wordt geladen</span>}
    </span>
  )
}
