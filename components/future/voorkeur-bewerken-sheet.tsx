'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { bandPct } from '@/lib/parameters-band'

/** Profiel-kolommen die deze sheet kan bewerken. */
type VoorkeurColumn = 'inflation_rate' | 'expected_return'

/**
 * De servernorm, in percentages — één-op-één de validatieband van
 * `PUT /api/parameters` (expected_return 0,01–0,15 · inflation_rate 0–0,08).
 * Dit zijn alleen de DEFAULTS voor snelle client-feedback; de server blijft de
 * norm die telt. Eerder hing de default aan een generieke `?? 15`, waardoor de
 * sheet een inflatie van 12% als geldig presenteerde die de server terecht
 * weigert. Wijzigt de band in de route, dan verhuist hij hier mee.
 */
// Uit de GEDEELDE bron: dezelfde module die de route zelf gebruikt om te
// valideren (lib/parameters-band.ts). Geen tweede kopie meer die kan wegdrijven.
const SERVER_BAND: Record<VoorkeurColumn, { min: number; max: number }> = {
  expected_return: bandPct('expected_return'),
  inflation_rate: bandPct('inflation_rate'),
}

/**
 * VoorkeurBewerkenSheet — generieke inline-editor voor één markt-aanname.
 * Gebruikt vanuit de markt-aannames op /toekomst/voorkeuren én vanuit de
 * rendement-chip op de fiscale optimizer.
 *
 * Persist via `PUT /api/parameters` met ALLEEN het gewijzigde veld in de body
 * (de route doet partiële patches). Bewust niet meer client-direct naar
 * `profiles`: die weg omzeilde de servervalidatie, en `profiles.expected_return`
 * heeft geen CHECK-constraint — een waarde als 5,0 (500% rendement) landde dus
 * ongehinderd in de kolom die de complete FIRE-projectie voedt. Fouten komen nu
 * als platte `{ error }`-envelope terug; een rauwe DB-message bereikt de UI niet.
 *
 * router.refresh() trigt de horizon-kernel om te herrekenen — de VoorkeurenView
 * toont meteen de nieuwe waarde, de tijdas-grafiek + briefing bewegen mee, en de
 * fiscale optimizer herberekent server-side zijn scenario's met de nieuwe aanname.
 */
export function VoorkeurBewerkenSheet({
  title,
  column,
  currentValuePct,
  minPct,
  maxPct,
  stepPct,
  helperText,
  secondaryLink,
  open = true,
  onClose,
}: {
  /** Heading-tekst in de sheet ("Inflatie", "Bruto rendement"). */
  title: string
  /** Profile-kolom om te updaten (inflation_rate / expected_return). */
  column: VoorkeurColumn
  /** Huidige waarde in percentage-vorm (bv. 2.5 = 2.5%). */
  currentValuePct: number
  /** Validatie-grenzen in percentages (default = de servernorm per kolom). */
  minPct?: number
  maxPct?: number
  /** Step-grootte voor input (default 0.1). */
  stepPct?: number
  /** Helper-tekst onder het input-veld voor context. */
  helperText?: string
  /**
   * Optionele uitgang naar de plek waar álle aannames beheerd worden. Bedoeld
   * voor oppervlakken die deze sheet als losse editor openen (bv. de fiscale
   * optimizer); de voorkeuren-pagina zelf laat 'm weg — die ís die plek.
   */
  secondaryLink?: { href: string; label: string }
  /**
   * Of de sheet open staat. Geef 'm expliciet mee en houd de component GEMOUNT
   * (`<Sheet open={x} />`, niet `{x && <Sheet />}`): de focus-trap herstelt de
   * focus naar het openende element in de cleanup van zijn actief-effect, en
   * die tak draait alleen bij een open→dicht-overgang. Bij conditioneel mounten
   * verdwijnt de trap ineens en landt een toetsenbordgebruiker op `<body>`.
   * Default true voor bestaande call-sites die al conditioneel mounten.
   */
  open?: boolean
  onClose: () => void
}) {
  const [value, setValue] = useState(String(currentValuePct))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const min = minPct ?? SERVER_BAND[column].min
  const max = maxPct ?? SERVER_BAND[column].max
  const step = stepPct ?? 0.1

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const pct = Number(value)
    if (!Number.isFinite(pct)) {
      setError('Waarde moet een getal zijn.')
      return
    }
    if (pct < min || pct > max) {
      setError(`Waarde moet tussen ${min}% en ${max}% liggen.`)
      return
    }
    setSaving(true)
    setError(null)
    // Persist als fractie (0.025 voor 2.5%), conform horizon-data-loader.
    // Alleen het gewijzigde veld in de body: de route patcht partieel, dus
    // andere parameters blijven ongemoeid.
    const fraction = pct / 100
    try {
      const res = await fetch('/api/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [column]: fraction }),
      })
      if (!res.ok) {
        // Platte envelope: `data.error` is een string en al client-veilig.
        const data = await res.json().catch(() => null)
        const message =
          data && typeof data.error === 'string' ? data.error : 'Opslaan mislukt. Probeer het opnieuw.'
        setError(message)
        setSaving(false)
        return
      }
    } catch {
      setError('Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.')
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  return (
    <ShellOverlay
      open={open}
      // Tijdens het opslaan is sluiten geblokkeerd. De busy-state woont hier,
      // het sluitpad bij de ouder, en ShellOverlay vuurt onClose ongeconditioneerd
      // af bij Escape, backdrop-klik en ✕ — zonder deze guard kan een gebruiker
      // "annuleren" terwijl de PUT al onderweg is: die landt alsnog, en een
      // serverafwijzing zou op een ongemounte component worden gezet.
      onClose={saving ? () => {} : onClose}
      kind="sheet"
      size="sm"
      title="Voorkeur bewerken"
      footer={
        <ModalFooter
          primary={{ label: 'Opslaan', onClick: () => handleSubmit(), loading: saving }}
          secondary={{ label: 'Annuleer', onClick: onClose }}
        />
      }
    >
      <form onSubmit={handleSubmit} className="p-5 sm:p-6">
        <h2 className="font-serif text-lg text-[var(--ink)] mb-4">
          {title}
        </h2>

        {error && (
          <div
            role="alert"
            // Semantische tokens, geen Tailwind-standaardkleuren: dit is
            // formulier-validatie (quality-checklist → `text-negative`), en het
            // is sinds de optimizer-chip het enige kanaal voor
            // servervalidatie-fouten op twee oppervlakken. Scherpe hoeken
            // conform de editorial-taal.
            className="mb-3 border border-[var(--border-ed)] border-l-4 border-l-[var(--negative)] bg-[var(--paper)] px-3 py-2 text-xs text-negative"
          >
            {error}
          </div>
        )}

        <label className="block mb-3">
          <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
            Waarde (%)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              required
              autoFocus
            />
            <span className="text-sm text-[var(--ink-3)]">%</span>
          </div>
          {helperText && (
            <p className="mt-1.5 text-[11px] text-[var(--ink-3)] italic leading-snug">
              {helperText}
            </p>
          )}
        </label>

        {secondaryLink && (
          <p className="text-[11px] leading-snug text-[var(--ink-3)]">
            <Link
              href={secondaryLink.href}
              className="underline decoration-dotted decoration-from-font underline-offset-4 hover:text-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-3)]"
            >
              {secondaryLink.label}
            </Link>
          </p>
        )}
      </form>
    </ShellOverlay>
  )
}
