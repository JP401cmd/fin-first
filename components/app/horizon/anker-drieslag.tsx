'use client'

/**
 * AnkerDrieslag — de drie tegels onder een VAST stop-anker (ADR 0129 D7/B9, F3b):
 *
 *   VRIJ MOGELIJK VANAF {vrij} · JOUW STOPMOMENT {stop} · REIKT TOT {reikt}
 *
 * Consume-only: alle getallen komen uit `HeroFireAge.anker` (`lib/horizon/hero-fire-age.ts`)
 * — de tweede kernel-run (`solvedFireAge`), het stopmoment van de run
 * (`vastStopLeeftijd`, nooit `fireAge`) en het bereik uit dezelfde run. Woorden uit
 * `anker-copy`. Onder `now` valt tegel 2 weg (het stopmoment is vandaag) en staat
 * tegel 1 in de verleden tijd als het opgeloste moment al voorbij is.
 *
 * Hairline-cijferblok in de editorial taal: geen kaart-doos, wel drie Figure-cellen
 * onder een dunne regel — dezelfde vorm als de vrijheidsas-cijferrij.
 */

import type { HeroAnkerView } from '@/lib/horizon/hero-fire-age'
import { heroFireAgeYear } from '@/lib/horizon/hero-fire-age'
import { ankerVrijZin, formatStopAge, type AnkerStop } from '@/lib/horizon/anker-copy'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

export interface AnkerDrieslagProps {
  anker: HeroAnkerView
  currentAge: number | null
  /**
   * De eindleeftijd waartegen de tweede run solvede (`ScenarioPresetBatch.solvedFireEndAge`).
   * Bij een gemigreerde pensioen-rij is dat 100 (M1) — dan krijgt tegel 1 de duiding
   * "als je tot 100 rekent" (bevinding 6).
   */
  solvedFireEndAge?: number | null
  /** De eindleeftijd van het plan zelf (`SimResult.displayEndAge`). */
  planEndAge?: number | null
}

function Tegel({
  label,
  value,
  caption,
  testId,
}: {
  label: string
  value: string
  caption: string
  testId: string
}) {
  return (
    <div data-testid={testId}>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">{label}</div>
      <div
        className="text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {value}
      </div>
      <div className="mt-1 font-sans text-[10px] leading-snug text-[var(--ink-3)]">{caption}</div>
    </div>
  )
}

/** Het stopmoment van de tegels als `AnkerStop` — `now` heeft geen leeftijd. */
export function ankerStopFromView(anker: HeroAnkerView): AnkerStop | null {
  if (anker.soort === 'nu') return { kind: 'now' }
  if (anker.stopAge == null) return null
  return { kind: anker.soort === 'aow' ? 'aow' : 'age', stopAge: anker.stopAge }
}

export function AnkerDrieslag({ anker, currentAge, solvedFireEndAge = null, planEndAge = null }: AnkerDrieslagProps) {
  const stop = ankerStopFromView(anker)
  const isNow = anker.soort === 'nu'

  // Tegel 1 — VRIJ MOGELIJK VANAF
  const vrijValue = anker.solvedFireAge != null ? String(heroFireAgeYear(anker.solvedFireAge)) : '—'
  const vrijVerleden =
    anker.solvedFireAge != null && currentAge != null && anker.solvedFireAge < currentAge
  const vrijLabel = vrijVerleden ? 'Vrij was mogelijk vanaf' : 'Vrij mogelijk vanaf'
  const totHonderd =
    solvedFireEndAge != null && planEndAge != null && Math.round(solvedFireEndAge) !== Math.round(planEndAge)
  const vrijCaption =
    anker.solvedFireAge == null
      ? 'nog geen leeftijd gevonden binnen dit plan'
      : totHonderd
        ? `als je de app had laten rekenen, tot ${Math.round(solvedFireEndAge)}`
        : 'als je de app had laten rekenen'

  // Tegel 2 — JOUW STOPMOMENT (weg onder `now`)
  const stopValue = anker.stopAge != null ? formatStopAge(anker.stopAge) : '—'
  const stopCaption = anker.soort === 'aow' ? 'je AOW-leeftijd' : 'jouw instelling'

  // Tegel 3 — REIKT TOT
  const reach = anker.reach
  const reiktValue =
    reach.kind === 'gedekt'
      ? reach.endAge != null
        ? `voorbij je ${heroFireAgeYear(reach.endAge)}e`
        : 'einde van je plan'
      : reach.kind === 'reikt-tot'
        ? String(heroFireAgeYear(reach.age))
        : reach.kind === 'nu-op'
          ? 'vandaag'
          : '—'
  const reiktCaption =
    reach.kind === 'gedekt'
      ? 'het einde van je plan'
      : reach.kind === 'reikt-tot' && reach.endAge != null
        ? `plan loopt tot ${heroFireAgeYear(reach.endAge)}`
        : reach.kind === 'nu-op'
          ? 'vanaf vandaag niet gedekt'
          : 'nog niet te bepalen'

  const vrijZin =
    stop != null
      ? ankerVrijZin({ solvedFireAge: anker.solvedFireAge, currentAge, stop, gedekt: anker.gedekt })
      : null

  return (
    <div data-testid="anker-drieslag" className="mb-4 border-t border-[var(--border-ed)] pt-3">
      <div className={`grid gap-3 ${isNow ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <Tegel label={vrijLabel} value={vrijValue} caption={vrijCaption} testId="anker-tegel-vrij" />
        {!isNow && <Tegel label="Jouw stopmoment" value={stopValue} caption={stopCaption} testId="anker-tegel-stop" />}
        <Tegel
          label="Reikt tot"
          value={reiktValue}
          caption={reiktCaption}
          testId="anker-tegel-reikt"
        />
      </div>
      {vrijZin && (
        <p
          data-testid="anker-vrij-zin"
          className="mt-2 max-w-[60ch] text-[12px] italic leading-snug text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {vrijZin}
        </p>
      )}
    </div>
  )
}
