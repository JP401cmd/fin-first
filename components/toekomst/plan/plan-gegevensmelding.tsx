// Verplaatst uit components/app/horizon/horizon-client.tsx r6508–6538 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/** Blok H — de "Vul profiel aan"-actie onder de KPI-rij plus de profielfout-melding. */
export interface PlanGegevensmeldingProps {
  showFireAgeNotice: boolean // horizon-client r5751
  showFireTargetNotice: boolean // horizon-client r2829
  showRetirementExpenseNotice: boolean // horizon-client r5763
  simError: string | null // horizon-client r1253
}

export function PlanGegevensmelding({
  showFireAgeNotice,
  showFireTargetNotice,
  showRetirementExpenseNotice,
  simError,
}: PlanGegevensmeldingProps) {
  return (
    <>
          {/* UR3-07 defect 1B — de gegevensmelding zei WAT er ontbrak, maar nergens hing
              er een actie aan: de tegel bleef een doodlopende mededeling. Eén knop ONDER
              de strip, niet één per tegel — de tegels zijn zelf al knoppen (naar hun
              kassabon), en een link in een knop is geen geldige markup. Staat één keer in
              de boom (na de mobiele strip) en geldt dus voor beide layouts.
              Woorden: de duiding komt uit de guards ín de tegels; hier staat alleen de
              actie, zodat de app-brede formulering in outcome-guard.ts niet kan driften. */}
          {(showFireAgeNotice || showFireTargetNotice || showRetirementExpenseNotice) && (
            <Link
              href="/mijn/profiel"
              data-testid="hero-missende-gegevens-cta"
              className="group mb-5 flex items-center justify-between gap-3 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-3 py-2.5 transition-colors hover:border-[var(--module-active-300)]"
            >
              <span className="font-sans text-[12px] text-[var(--ink-2)]">
                Vul je geboortedatum, inkomen en bestedingen aan — dan rekenen we je vrijheidsmoment uit.
              </span>
              <span className="shrink-0 font-sans text-[12px] font-semibold text-[var(--module-active-700)] group-hover:underline">
                Vul profiel aan →
              </span>
            </Link>
          )}

          {/* Profile error warning — shown when profile query failed but page loads with defaults */}
          {simError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="font-sans text-[12px] text-amber-700">
                Je profielgegevens konden niet worden geladen — de grafiek toont standaardwaarden. Probeer de pagina te verversen.
              </p>
            </div>
          )}
    </>
  )
}
