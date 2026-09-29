'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/editorial/button'

/**
 * Smalle balk boven de AI-Krant voor wie daar bewust voor koos terwijl de
 * tijdlijn openstaat (Krant 1C fase 2, B40): één knop terug naar de Krant
 * zonder AI. De server beslist daarna opnieuw welke bron /nieuws toont.
 */
export function TerugNaarTijdlijn() {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function terug() {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/krant/variant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: 'tijdlijn' }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null
        setFout(typeof data?.error === 'string' ? data.error : 'Overstappen is niet gelukt. Probeer het later opnieuw.')
        return
      }
      router.refresh()
    } catch {
      setFout('Overstappen is niet gelukt. Probeer het later opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2">
        <p className="flex-1 text-[13px] leading-snug text-[var(--ink-2)]">
          Je leest de Krant met AI. De Krant zonder AI is een persoonlijke tijdlijn.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void terug()} disabled={bezig}>
          {bezig ? 'Bezig…' : 'Naar de tijdlijn'}
        </Button>
      </div>
      {fout && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--negative)]">
          {fout}
        </p>
      )}
    </div>
  )
}
