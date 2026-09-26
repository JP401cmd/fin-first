// Verplaatst uit components/app/horizon/horizon-client.tsx r387–455 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import type { ReactNode } from 'react'
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
 * De "we missen gegevens"-melding ín een KPI-cel — ÉÉN vorm voor alle cellen van de
 * figures-strip (bevinding UR2-05).
 *
 * De melding bestond eerst alleen op de Doelbedrag-tegel, tweemaal met de hand
 * uitgeschreven. Daardoor kon een buur-KPI met dezelfde ontbrekende brondata rustig
 * een exact getal blijven tonen. Deze helper ís die vorm, nu als de twee delen van
 * een `FiguresStrip`-cel (fase 2, ADR 0179): de kop (`guard.label`) op de plek van
 * het getal, iets kleiner gezet, en de uitleg (`guard.hint`) op de plek van het
 * onderschrift — zodat de cel even hoog blijft als zijn buren.
 *
 * Tekst komt uitsluitend uit `lib/horizon/outcome-guard.ts` — nooit hier.
 */
export function heroKpiNoticeDelen(
  guard: HorizonOutcomeGuard,
  /**
   * ADR 0127 — kop-override. De guard geeft app-breed één kop (zie
   * HORIZON_MISSENDE_GEGEVENS_LABEL), en die klopt voor elk gegevensprobleem.
   * Onder 'Nu stoppen' is `geen-doelvermogen` echter geen ontbrekend gegeven
   * maar een EIGENSCHAP van de strategie: er ís geen doelbedrag. De hint van
   * de guard blijft leidend.
   */
  label?: string,
): { amount: ReactNode; sub: string | undefined } {
  return {
    amount: (
      <span className="block text-[15px] sm:text-[18px] leading-tight tracking-[-0.01em]">
        {label ?? guard.label}
      </span>
    ),
    sub: guard.hint ?? undefined,
  }
}
