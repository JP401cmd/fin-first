'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { FireDeltaFooter, fireFooterSleutel } from '@/components/future/regels/shared'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { bandPct } from '@/lib/parameters-band'

/** Profiel-kolommen die deze body kan bewerken. */
export type VoorkeurColumn = 'inflation_rate' | 'expected_return'

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
 * Keuze · effect · waarom (eigenaarsnorm 13 sep 2026) per kolom — de uitleg die
 * /toekomst/voorkeuren én de plan-review tonen. `Record<VoorkeurColumn, …>`: een nieuwe
 * kolom heeft pas een geldige body wanneer hij uitleg heeft (meebeweeg-check, laag b).
 * TPR-02: de kern valt voor een bezitting zonder eigen rendement terug op het bruto
 * rendement; een rendement dat bij de bezitting zelf staat (ook 0%) gaat vóór.
 */
export const VOORKEUR_UITLEG: Record<VoorkeurColumn, string> = {
  inflation_rate:
    'Je kiest met hoeveel prijsstijging per jaar de app rekent. De bedragen in je plan groeien daarmee elk jaar mee, ' +
    'zoals je uitgaven na het stoppen; een hogere inflatie betekent dat je later meer nodig hebt, en dat schuift je ' +
    'vrijheidsmoment op. Relevant omdat een klein verschil over tientallen jaren flink oploopt. Ter referentie: het ' +
    'inflatiedoel van de Europese Centrale Bank is 2% per jaar.',
  expected_return:
    'Je kiest het rendement dat geldt voor bezittingen waar geen eigen rendement bij staat. ' +
    'Dat bepaalt hoe snel die potten in de grafiek groeien, en samen met inflatie en Box 3 je effectieve onttrekkingsvoet en dus je vrijheidsgetal. ' +
    'Een rendement dat je bij een bezitting zelf hebt ingevuld, ook 0%, gaat vóór. ' +
    'Relevant omdat een ontbrekend rendement anders stil als 0% zou tellen. ' +
    "Ter referentie: wereldwijde aandelen deden historisch zo'n 6 tot 8% per jaar; een lagere aanname geeft een later vrijheidsmoment.",
}

export interface VoorkeurBewerkenBodyProps {
  /** Heading-tekst ("Inflatie", "Bruto rendement"). */
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
   * voor oppervlakken die deze editor als losse sheet openen (bv. de fiscale
   * optimizer); de voorkeuren-pagina zelf laat 'm weg — die ís die plek.
   */
  secondaryLink?: { href: string; label: string }
  /** Kopniveau van de titel: 'h2' in de sheet, 'h5' in de plan-review (pane h3 → scherm h4). */
  kop?: 'h2' | 'h5'
  /**
   * TPR-15 — met een snapshot draait het effect live mee (`runRegelProjection` met de
   * `parameters`-override) en publiceert de body een FIRE-delta als footer-info. Zonder
   * snapshot (sheet op /toekomst/voorkeuren en de optimizer) geen live effect.
   */
  snapshot?: RegelSimSnapshot | null
  /** Host-contract (`RegelEditActionsState`): de host rendert de opslaanknop. */
  onActionsChange: (s: RegelEditActionsState) => void
  /** Na een geslaagde write via `PUT /api/parameters`. */
  onSaved: () => void
  /**
   * Opslaan zonder wijziging (bv. Enter in het veld). Meegegeven = niets schrijven en dit
   * aanroepen (plan-review); weggelaten = de sheet schrijft de waarde zoals altijd.
   */
  onOngewijzigd?: () => void
}

/**
 * VoorkeurBewerkenBody — de editor voor één markt-aanname, zonder overlay. Gerenderd door
 * `VoorkeurBewerkenSheet` (markt-aannames op /toekomst/voorkeuren, rendement-chip op de
 * fiscale optimizer) en door de plan-review (TPR-15, laag 2): één body, twee hosts.
 *
 * Persist via `PUT /api/parameters` met ALLEEN het gewijzigde veld in de body
 * (de route doet partiële patches). Bewust niet meer client-direct naar
 * `profiles`: die weg omzeilde de servervalidatie, en `profiles.expected_return`
 * heeft geen CHECK-constraint — een waarde als 5,0 (500% rendement) landde dus
 * ongehinderd in de kolom die de complete FIRE-projectie voedt. Fouten komen nu
 * als platte `{ error }`-envelope terug; een rauwe DB-message bereikt de UI niet.
 */
export function VoorkeurBewerkenBody({
  title,
  column,
  currentValuePct,
  minPct,
  maxPct,
  stepPct,
  helperText,
  secondaryLink,
  kop = 'h2',
  snapshot = null,
  onActionsChange,
  onSaved,
  onOngewijzigd,
}: VoorkeurBewerkenBodyProps) {
  const [value, setValue] = useState(String(currentValuePct))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const min = minPct ?? SERVER_BAND[column].min
  const max = maxPct ?? SERVER_BAND[column].max
  const step = stepPct ?? 0.1

  // Live validatie: een ongeldige waarde houdt "Opslaan" dicht (canSave) en zegt waarom.
  const pctNu = value.trim() === '' ? Number.NaN : Number(value)
  const invoerFout = !Number.isFinite(pctNu)
    ? 'Vul een getal in.'
    : pctNu < min || pctNu > max
      ? `Vul een waarde tussen ${min}% en ${max}% in.`
      : null
  // Vergeleken met wat er opgeslagen staat (afgerond op de invoerstap, tegen float-ruis).
  const changed = invoerFout == null && Math.abs(pctNu - currentValuePct) > 1e-9

  // Kernel-runs pas zodra er iets gewijzigd is: zonder wijziging toont de footer geen effect.
  const deferredPct = useDeferredValue(pctNu)
  const deferredChanged = Number.isFinite(deferredPct) && Math.abs(deferredPct - currentValuePct) > 1e-9
  const baseline = useMemo(
    () => (snapshot && deferredChanged ? runRegelProjection(snapshot) : null),
    [snapshot, deferredChanged],
  )
  const draftProj = useMemo(
    () =>
      snapshot && deferredChanged && deferredPct >= min && deferredPct <= max
        ? runRegelProjection(snapshot, { parameters: { [column]: deferredPct / 100 } })
        : null,
    [snapshot, column, deferredPct, deferredChanged, min, max],
  )
  const footerSleutel = baseline && draftProj ? fireFooterSleutel(baseline, draftProj) : null

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    // Eén tekst per fout: dezelfde als de live veldregel (die wijkt zolang de melding staat).
    if (invoerFout != null) {
      setError(invoerFout)
      return
    }
    // Review M1 — een host die niets wil schrijven zonder wijziging (de plan-review): Enter in
    // het veld mag dan geen ongewijzigde (bv. uit de jaarlaag ingevulde) waarde vastleggen.
    if (!changed && onOngewijzigd) {
      onOngewijzigd()
      return
    }
    const pct = pctNu
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
    onSaved()
  }

  // Save via ref tegen stale closures (zelfde patroon als de regel-bodies).
  const saveRef = useRef(handleSubmit)
  useEffect(() => {
    saveRef.current = handleSubmit
  })

  useEffect(() => {
    onActionsChange({
      canSave: !saving && invoerFout == null,
      saving,
      save: () => void saveRef.current(),
      changed,
      // Zonder wijziging geen effect (er verandert niets); zonder snapshot geen live effect.
      footerInfo: changed && baseline && draftProj ? <FireDeltaFooter baseline={baseline} draft={draftProj} /> : undefined,
    })
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, saving, invoerFout, changed, footerSleutel])

  const Kop = kop
  const foutId = `voorkeur-${column}-fout`

  return (
    <form onSubmit={handleSubmit} className={kop === 'h2' ? 'p-5 sm:p-6' : ''}>
      <Kop className="font-serif text-lg text-[var(--ink)] mb-4">
        {title}
      </Kop>

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
            aria-invalid={invoerFout ? true : undefined}
            aria-describedby={invoerFout ? foutId : undefined}
            className="flex-1 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
            required
            autoFocus
          />
          <span className="text-sm text-[var(--ink-3)]">%</span>
        </div>
        {invoerFout && invoerFout !== error && (
          <p id={foutId} className="mt-1 text-[11px] text-negative">
            {invoerFout}
          </p>
        )}
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
  )
}
