'use client'

/**
 * De schakelaar "Automatisch bijwerken" op /mijn/koppelingen (W-018, ADR 0182).
 *
 * Eén globale keuze voor al je bank- en brokerkoppelingen: mag /overzicht bij
 * openen de koppelingen die langer dan twaalf uur stilstaan zelf bijwerken?
 * De kopij volgt de norm keuze · effect · waarom.
 *
 * Schrijft via `PUT /api/auto-sync` (own-row, zod, error-envelope); zet
 * optimistisch en rolt terug met een melding als het niet lukt.
 */

import { useState } from 'react'
import { useToast } from '@/components/app/toast-provider'

export interface AutomatischBijwerkenSchakelaarProps {
  /** Huidige stand uit de profielrij (fail-closed gelezen: alleen `true` is aan). */
  initialEnabled: boolean
}

export function AutomatischBijwerkenSchakelaar({ initialEnabled }: AutomatischBijwerkenSchakelaarProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  async function toggle() {
    if (saving) return
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    try {
      const res = await fetch('/api/auto-sync', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error('opslaan mislukt')
    } catch {
      setEnabled(!next)
      addToast({
        type: 'error',
        title: 'Niet opgeslagen',
        message: 'Je keuze voor automatisch bijwerken is niet bewaard. Probeer het opnieuw.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby="automatisch-bijwerken-titel"
      className="mb-8 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-4 sm:px-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            id="automatisch-bijwerken-titel"
            className="font-display text-[18px] font-semibold leading-snug text-[var(--ink)]"
            style={{ letterSpacing: '-0.01em' }}
          >
            Automatisch bijwerken
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
            {enabled
              ? 'Aan: opent je Overzicht en is een bank- of brokerkoppeling langer dan twaalf uur niet bijgewerkt, dan halen we die op de achtergrond op.'
              : 'Uit: je bank- en brokergegevens komen alleen binnen als je zelf op synchroniseren drukt.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="automatisch-bijwerken-titel"
          disabled={saving}
          onClick={() => void toggle()}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-active-500)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
            enabled
              ? 'border-[var(--module-active-600)] bg-[var(--module-active-600)]'
              : 'border-[var(--rule-soft)] bg-[var(--subtle)]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-4 transform rounded-full bg-[var(--paper)] shadow-sm transition-transform duration-200 ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <p className="mt-3 border-t border-[var(--rule-soft)] pt-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
        Zo staan je saldi, transacties en posities klaar zonder dat je eraan denkt. Het gebeurt
        alleen terwijl jij de app open hebt, via dezelfde verbinding als de knop — niemand haalt
        iets op als je er niet bent. Crypto-exchanges en wallets werken we sowieso elke avond
        bij.
      </p>
    </section>
  )
}
