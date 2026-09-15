'use client'

/**
 * GebruikerZoeker — zoek een gebruiker op e-mailadres en houd een lijst gekozen
 * personen bij (ADR 0147).
 *
 * Gedeeld door de verspreiding-sheet (modus "Handmatig gekozen personen") en de
 * sheet voor een statische gebruikersgroep. Zoekt via de bestaande beheerroute
 * `GET /api/admin/tier-assign?email=` — exact één adres, geen vrije zoekterm,
 * zodat beheer alleen iemand kan kiezen van wie het het adres al kent.
 */

import { useCallback, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'

export interface GekozenGebruiker {
  user_id: string
  email: string | null
}

export function GebruikerZoeker({
  gekozen,
  onChange,
  eenheid = { een: 'persoon', meer: 'personen' },
}: {
  gekozen: readonly GekozenGebruiker[]
  onChange: (gekozen: GekozenGebruiker[]) => void
  /** Hoe de teller onderaan de gekozen mensen noemt ("persoon"/"personen", "lid"/"leden"). */
  eenheid?: { een: string; meer: string }
}) {
  const [zoekEmail, setZoekEmail] = useState('')
  const [zoeken, setZoeken] = useState(false)
  const [zoekMelding, setZoekMelding] = useState<string | null>(null)

  const zoekGebruiker = useCallback(async () => {
    const email = zoekEmail.trim()
    if (!email) return
    setZoeken(true)
    setZoekMelding(null)
    try {
      const res = await fetch(`/api/admin/tier-assign?email=${encodeURIComponent(email)}`)
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        setZoekMelding((data as { error?: string } | null)?.error ?? `Zoeken mislukt (HTTP ${res.status})`)
        return
      }
      const gebruiker = (data as { user?: { id: string; email: string | null } | null } | null)?.user
      if (!gebruiker) {
        setZoekMelding(`Geen gebruiker gevonden met ${email}.`)
        return
      }
      if (!gekozen.some((r) => r.user_id === gebruiker.id)) {
        onChange([...gekozen, { user_id: gebruiker.id, email: gebruiker.email ?? email }])
      }
      setZoekEmail('')
    } catch {
      setZoekMelding('Zoeken mislukt — controleer je verbinding.')
    } finally {
      setZoeken(false)
    }
  }, [zoekEmail, gekozen, onChange])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          aria-label="E-mailadres van de gebruiker"
          value={zoekEmail}
          onChange={(e) => setZoekEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void zoekGebruiker()
            }
          }}
          placeholder="naam@voorbeeld.nl"
          className="min-w-0 flex-1 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void zoekGebruiker()}
          disabled={zoeken || !zoekEmail.trim()}
          className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
        >
          {zoeken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Zoeken
        </button>
      </div>

      {zoekMelding && (
        <p role="alert" className="text-xs text-[var(--ink-3)]">
          {zoekMelding}
        </p>
      )}

      {gekozen.length > 0 && (
        <ul className="space-y-1">
          {gekozen.map((rij) => (
            <li
              key={rij.user_id}
              className="flex items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--ink-2)]">
                {rij.email ?? rij.user_id}
              </span>
              <button
                type="button"
                aria-label={`${rij.email ?? rij.user_id} verwijderen`}
                onClick={() => onChange(gekozen.filter((r) => r.user_id !== rij.user_id))}
                className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
        {gekozen.length} {gekozen.length === 1 ? eenheid.een : eenheid.meer} gekozen
      </p>
    </div>
  )
}
