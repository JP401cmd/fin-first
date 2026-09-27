// Verplaatst uit components/future/voorkeuren-view.tsx r486–502 @ 3daf6ae1b (fase 3, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

/**
 * PlanAfbouwOverzicht — "Van vrijheid tot eindleeftijd" in de verdieping van katern Plan
 * (ADR 0179 fase 3, spec §5: `AfbouwOverzichtCard` is resultaat, geen instelling, en
 * verhuist van Instellingen naar de Plan-verdieping).
 *
 * Eén bron: de HOOFDRUN van de state-provider — dezelfde run als het canvas en de KPI's
 * (`useToekomstSimContext().simResult`), met de rijen uit de euro-grens van de provider
 * (`useToekomstEuroContext().viewDisplaySimRows`, ADR 0090/0093: deflatie precies één keer,
 * hier niet). Tot fase 3 las de kaart een tweede lading (`dashboardData.simRows` +
 * `fireAgeFractional` op /toekomst/instellingen); daardoor kon hij van de grafiek afwijken.
 *
 * Het beginpunt van de afbouw is het stopmoment van de run: onder een vast anker
 * `vastStopLeeftijd`, anders de opgeloste vrijheidsleeftijd (fractioneel, afgerond op de
 * rij-leeftijd). Hier wordt niets gerekend: `afbouwInvoer` kiest alleen rijen.
 *
 * Montage (orchestrator): één regel in `plan-verdieping.tsx`, `<PlanAfbouwOverzicht />`.
 * De `HideInSimple` zit al hier (diepte, geen bedieningsvlak — ADR 0026).
 *
 * Vrijheidstijd: de bedragen zijn netto vermogen (`SimRow.endPortfolio` = `netWorth`,
 * Prognose!I, incl. eigen woning), maar een huis leef je niet op. De dagen komen daarom uit
 * `nettoLiquide` (Prognose!J) van dezelfde kernelrij, via de canonieke `freedomDaysAtAge`:
 * teller één keer door de kernelfactor van die leeftijd, noemer het dagtarief van vandaag,
 * real-verankerd (beweegt niet mee met de Nominaal/Reëel-schakelaar). Nominale rijen in,
 * geen `view*`-bedrag: vrijheidstijd is geen euro-weergave.
 */

import type { SimResult, SimRow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { FactorRow } from '@/lib/euro-display'
import type { FreedomRateSource } from '@/lib/format'
import { DEFAULT_FIRE_STRATEGY, type FireEndStrategy } from '@/lib/fire-strategy'
import { freedomDaysAtAge } from '@/lib/horizon/vrijheidsdagen'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { AfbouwOverzichtCard } from '@/components/future/afbouw-overzicht-card'
import { vrijheidTekst } from '@/components/toekomst/meldingen/meldingen-bron'
import {
  useToekomstBron,
  useToekomstEuroContext,
  useToekomstSimContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export interface AfbouwInvoer {
  fireAge: number
  endAge: number
  fireAgeBalance: number
  endBalance: number
  strategy: FireEndStrategy
}

/**
 * Kies de twee rijen uit de hoofdrun. `null` = geen run, geen stopmoment binnen het plan
 * of geen rijen (dan geen kaart — zoals de kaart zelf al deed bij ontbrekende getallen).
 */
export function afbouwInvoer({
  simResult,
  rows,
  endAge,
  strategy,
}: {
  simResult: Pick<SimResult, 'fireAgeFractional' | 'vastStopLeeftijd'> | null
  rows: readonly Pick<SimRow, 'age' | 'endPortfolio'>[]
  endAge: number
  strategy: FireEndStrategy
}): AfbouwInvoer | null {
  if (!simResult || rows.length === 0) return null
  const stop = simResult.vastStopLeeftijd ?? simResult.fireAgeFractional
  if (stop == null || !Number.isFinite(stop)) return null
  const fireAge = Math.round(stop)
  const fireRow = rows.find((r) => r.age === fireAge)
  const endRow = rows.find((r) => r.age === endAge) ?? rows[rows.length - 1]
  if (!fireRow || !endRow || endRow.age <= fireRow.age) return null
  return { fireAge, endAge: endRow.age, fireAgeBalance: fireRow.endPortfolio, endBalance: endRow.endPortfolio, strategy }
}

/**
 * Vrijheidsdagen van het LIQUIDE deel op begin en eind van de afbouw. Leest `nettoLiquide`
 * (J) van de nominale kernelrij op die leeftijd — nooit `netWorth` (I), dat de eigen woning
 * meetelt. `null` = geen regel (geen rij, geen liquide vermogen of geen dagbasis, ADR 0131).
 */
export function afbouwVrijheidsdagen({
  rows,
  fireAge,
  endAge,
  canonicalDailyRate,
  source,
}: {
  rows: readonly (FactorRow & Pick<UnifiedProjectionRow, 'nettoLiquide'>)[]
  fireAge: number
  endAge: number
  canonicalDailyRate: number
  source: FreedomRateSource | undefined
}): { start: number | null; eind: number | null } {
  const opLeeftijd = (age: number) => {
    const rij = rows.find((r) => r.age === age)
    return rij ? freedomDaysAtAge({ rows, age, nominalAmount: rij.nettoLiquide, canonicalDailyRate, source }) : null
  }
  return { start: opLeeftijd(fireAge), eind: opLeeftijd(endAge) }
}

export function PlanAfbouwOverzicht() {
  const { simResult, fireStrategy, displayUnifiedRows, canonicalDailyRate } = useToekomstSimContext()
  const { viewDisplaySimRows } = useToekomstEuroContext()
  const { initialData } = useToekomstBron()
  const { masked } = useMaskedAmounts()
  const invoer = afbouwInvoer({
    simResult,
    rows: viewDisplaySimRows,
    endAge: fireStrategy?.endAge ?? DEFAULT_FIRE_STRATEGY.endAge,
    strategy: fireStrategy?.strategy ?? 'deplete',
  })
  if (!invoer) return null
  const dagen = afbouwVrijheidsdagen({
    rows: displayUnifiedRows,
    fireAge: invoer.fireAge,
    endAge: invoer.endAge,
    canonicalDailyRate,
    source: initialData.dailyExpenseRateDetail?.source,
  })
  return (
    <HideInSimple>
      <div data-testid="plan-afbouw-overzicht">
        <AfbouwOverzichtCard
          {...invoer}
          masked={masked}
          fireAgeVrijheid={vrijheidTekst(dagen.start, masked)}
          endVrijheid={vrijheidTekst(dagen.eind, masked)}
        />
      </div>
    </HideInSimple>
  )
}
