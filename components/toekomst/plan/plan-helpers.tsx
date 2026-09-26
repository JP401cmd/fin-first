// Verplaatst uit components/app/horizon/horizon-client.tsx r387–455 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import { Receipt } from 'lucide-react'
import type { HorizonOutcomeGuard } from '@/lib/horizon/outcome-guard'

/**
 * Tap-affordance op een KPI-tegel die een kassabon opent (bevinding M5).
 *
 * De hero-KPI's waren al `<button>`-elementen met een kassabon eronder, maar dat
 * was uitsluitend af te lezen aan een hover-tint — op touch dus nergens. Een
 * prognose-kopgetal zonder zichtbaar spoor naar zijn aannames leest als een
 * vaststaand feit; dít bonnetje is dat spoor. Klein en in `--ink-4`, zodat het
 * de cijferregel niet beconcurreert, mét sr-only tekst zodat een schermlezer de
 * belofte óók hoort.
 *
 * Hoort in de kicker-rij van de tegel (`ml-auto` duwt hem naar rechts).
 */
export function ReceiptCue() {
  return (
    <>
      <Receipt className="ml-auto h-3 w-3 shrink-0 text-[var(--ink-4)]" aria-hidden />
      <span className="sr-only">— tik voor de aannames achter dit getal</span>
    </>
  )
}

/**
 * De "we missen gegevens"-melding ín een hero-KPI-tegel — ÉÉN vorm voor alle
 * tegels van de figures-strip (bevinding UR2-05).
 *
 * De melding bestond al, maar alleen op de Doelbedrag-tegel en tweemaal met de
 * hand uitgeschreven (desktop + mobiel). Daardoor kon een buur-KPI met dezelfde
 * ontbrekende brondata rustig een exact getal blijven tonen: er was geen vorm om
 * te hergebruiken, alleen markup om te kopiëren. Dit component ís die vorm —
 * kop (`guard.label`) in de cijferregel, uitleg (`guard.hint`) op de plek van
 * het bijschrift, zodat de tegel even hoog blijft als zijn buren en de rij niet
 * verspringt.
 *
 * `compact` = de mobiele 2×2-strip (kleinere typografie, krappere marges).
 * Tekst komt uitsluitend uit `lib/horizon/outcome-guard.ts` — nooit hier.
 */
export function HeroKpiNotice({
  guard,
  compact = false,
  label,
}: {
  guard: HorizonOutcomeGuard
  compact?: boolean
  /**
   * ADR 0127 — kop-override. De guard geeft app-breed één kop (zie
   * HORIZON_MISSENDE_GEGEVENS_LABEL), en die klopt voor elk gegevensprobleem.
   * Onder 'Nu stoppen' is `geen-doelvermogen` echter geen ontbrekend gegeven
   * maar een EIGENSCHAP van de strategie: er ís geen doelbedrag. De hint van
   * de guard blijft leidend.
   */
  label?: string
}) {
  return (
    <>
      <div
        className={`${compact ? 'text-[13px]' : 'text-[16px] sm:text-[18px]'} font-black leading-tight tracking-[-0.01em]`}
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label ?? guard.label}
      </div>
      <div
        className={`italic text-[var(--ink-3)] ${compact ? 'text-[10px] mt-1' : 'text-[11px] mt-1.5'}`}
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {guard.hint}
      </div>
    </>
  )
}
