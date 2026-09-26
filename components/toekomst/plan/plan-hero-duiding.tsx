// Verplaatst uit components/app/horizon/horizon-client.tsx r6186–6305 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Onder de KPI-strip van katern Plan: de ankerdrieslag (alleen onder een vast anker) en
 * de voortgangsbalk (fase 2, ADR 0179 D2/D4, spec §4.9).
 *
 * De duidingszin ("werken wordt een keuze rond je 52e", `buildVrijheidsleeftijdZin`)
 * is in fase 2 bewust vervallen: de ankerregel in de kop zegt het moment al, KPI 1 zegt
 * het getal. De toets van ADR 0129 B10 staat in ADR 0179: de drager van B10 is
 * `ankerVraag`, niet deze zin — B10 blijft ongewijzigd.
 *
 * De balk:
 * - onder `solved` de vulling plus "N% van je doelbedrag" (`planSamenvatting`, dezelfde
 *   formulering als de Plan-samenvatting op de katern-kop);
 * - onder een vast anker alleen de vulling — het dekkingspercentage staat in de kop.
 * De vulling is `effectiveFreedomPct` (solved: kapitaalratio; vast anker: dekking,
 * ADR 0129 B3/D5), een ratio (klasse R, ADR 0093) die nooit deflateert. Geen bedrag
 * meer onder de balk: het doelbedrag staat in KPI 2 (één getal, één plek — §4.2 r10).
 */

import { AnkerDrieslag } from '@/components/app/horizon/anker-drieslag'
import type { SimResult } from '@/lib/fire-simulation'
import type { HeroFireAge } from '@/lib/horizon/hero-fire-age'
import { planSamenvatting } from '@/lib/horizon/katern-copy'
import type { HouseholdHeroData } from '@/components/toekomst/state/types'

export interface PlanAnkerEnVoortgangProps {
  hasPerspectiveHero: boolean
  heroFireAge: HeroFireAge
  currentAge: number | null
  solvedRun: { fireAge: number | null; endAge: number | null; } | null
  simResult: SimResult | null
  isFixedAnchorMode: boolean
  perspectiveHero: HouseholdHeroData | null
  effectiveFreedomPct: number
  /** De Doelbedrag-cel draagt een gegevensmelding (M6) — dan noemt de balk geen "% van je doelbedrag". */
  showFireTargetNotice: boolean
}

export function PlanAnkerEnVoortgang({
  hasPerspectiveHero,
  heroFireAge,
  currentAge,
  solvedRun,
  simResult,
  isFixedAnchorMode,
  perspectiveHero,
  effectiveFreedomPct,
  showFireTargetNotice,
}: PlanAnkerEnVoortgangProps) {
  const vulling = hasPerspectiveHero
    ? Math.max(Math.min(perspectiveHero!.freedomPercentage, 100), 0)
    : effectiveFreedomPct
  // Onder een vast anker (eigen weergave) zegt de kop het percentage; de balk zwijgt.
  const balkLabel =
    isFixedAnchorMode && !hasPerspectiveHero
      ? null
      : !hasPerspectiveHero && showFireTargetNotice
        ? null
        : planSamenvatting({ kind: 'solved', doelbedragPct: vulling })

  return (
    <>
      {/* ADR 0129 D7/B9 — de DRIESLAG onder een vast anker: VRIJ MOGELIJK VANAF
          (tweede run) · JOUW STOPMOMENT (instelling). Het bereik ("Reikt tot") staat
          alleen in KPI 1 (eigenaarsbesluit 26 sep: één keer per scherm). Alleen
          in de eigen weergave; consume-only uit `heroFireAge.anker`. */}
      {!hasPerspectiveHero && heroFireAge.anker && (
        <AnkerDrieslag
          anker={heroFireAge.anker}
          currentAge={currentAge}
          solvedFireEndAge={solvedRun?.endAge ?? null}
          planEndAge={simResult?.displayEndAge ?? null}
          solvedPending={isFixedAnchorMode && solvedRun === null}
        />
      )}

      {/* Voortgangsbalk — decoratief: het getal staat als tekst eronder (solved) of in de kop (vast anker). */}
      <div className="mb-3 sm:mb-6" data-testid="plan-voortgang">
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-horizon-600 via-horizon-400 to-horizon-300 transition-all duration-1000"
            style={{ width: `${vulling}%` }}
          />
        </div>
        {balkLabel && (
          <p
            data-testid="plan-voortgang-label"
            className="mt-2 font-mono text-xs tabular-nums text-[var(--ink-3)]"
          >
            {balkLabel}
          </p>
        )}
      </div>
    </>
  )
}
