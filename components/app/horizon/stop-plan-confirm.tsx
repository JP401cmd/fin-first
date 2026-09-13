'use client'

import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import type { StopAnchor } from '@/lib/fire-strategy'
import { formatStopAge } from '@/lib/horizon/anker-copy'
import { formatAowAge } from '@/lib/aow-leeftijd'

/**
 * StopPlanConfirm — bevestiging van "Maak dit mijn plan" op de vrijheidsas (TPR-09).
 *
 * De vrijheidsas kent twee stopleeftijden die op het scherm op elkaar leken maar
 * iets anders doen: de scenario-marker (`toekomst_scenario_prefs.stopAge`, alleen de
 * lijn hier) en het plan-anker (`fire_stop_anchor = 'age'` + `fire_stop_age`, de
 * hele app). Deze confirm is de brug: hij maakt expliciet WAT je kiest, WAT het
 * effect is en WAAROM dat relevant is (formulier-uitleg-norm, eigenaar 13 sep 2026)
 * vóór de verkenning het plan wordt.
 *
 * Presentational; de PUT zelf (via `planDraftToFireSettingsBody`, volledig plan —
 * route-contract R3) woont bij de consumer. Niet destructief: een plan is altijd
 * opnieuw te kiezen, dus geen rode knop.
 *
 * Beschrijvend, niet aansporend (Wft): de tekst zegt wat er verandert, niet wat je
 * zou moeten kiezen.
 */
export function StopPlanConfirm({
  open,
  busy,
  error,
  stopAge,
  planAnchor,
  planEndAge,
  aowAge,
  onConfirm,
  onClose,
}: {
  open: boolean
  busy: boolean
  /** Inline foutregel (validatie of route-400); "" = geen regel. */
  error: string
  /** De verkende stopleeftijd die het plan wordt (halve jaren). */
  stopAge: number
  /** Het huidige anker van het plan — voor de "nu rekent je plan met …"-zin. */
  planAnchor: StopAnchor
  /** Eindleeftijd van het plan (blijft ongewijzigd); null = onbekend. */
  planEndAge: number | null
  /** AOW-leeftijd (fractioneel) — alleen voor de zin onder het aow-anker. */
  aowAge: number | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ShellOverlay
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      kind="confirm"
      title="Maak dit mijn plan"
      footer={
        <ModalFooter
          align="end"
          primary={{ label: 'Maak dit mijn plan', onClick: onConfirm, loading: busy }}
          secondary={{ label: 'Annuleren', onClick: onClose, disabled: busy }}
        />
      }
    >
      <div className="space-y-3 p-6 font-sans text-sm leading-relaxed text-[var(--ink-2)]">
        {/* keuze */}
        <p>
          Je kiest <b className="font-semibold text-[var(--ink)]">{formatStopAge(stopAge)} jaar</b> als
          stopleeftijd van je plan. {huidigPlanZin(planAnchor, aowAge)}
        </p>
        {/* effect */}
        <p>
          De hele app — de grafiek, je doelen en Fin — rekent dan met dit stopmoment.
          {planEndAge != null ? (
            <> Tot welke leeftijd je geld moet reiken ({planEndAge}) en wat er dan over moet zijn, verandert niet.</>
          ) : (
            <> Tot welke leeftijd je geld moet reiken en wat er dan over moet zijn, verandert niet.</>
          )}
        </p>
        {/* waarom */}
        <p>
          Relevant omdat je plan bepaalt wanneer je vrij bent en waar je doelen op mikken. Verkennen
          blijft altijd kunnen: de schuif verschuift alleen de lijn hier.
        </p>
        {error && <p className="text-negative">{error}</p>}
      </div>
    </ShellOverlay>
  )
}

/** "Nu rekent je plan met …" — het huidige anker in gewone taal. */
export function huidigPlanZin(anchor: StopAnchor, aowAge: number | null): string {
  switch (anchor.kind) {
    case 'age':
      return `Nu rekent je plan met stoppen op ${formatStopAge(anchor.age)}.`
    case 'aow':
      return aowAge != null
        ? `Nu rekent je plan met stoppen op je AOW-leeftijd (${formatAowAge(aowAge)}).`
        : 'Nu rekent je plan met stoppen op je AOW-leeftijd.'
    case 'now':
      return 'Nu rekent je plan alsof je vandaag stopt.'
    case 'solved':
      return 'Nu zoekt de app zelf het vroegste moment waarop werken een keuze wordt.'
  }
}
