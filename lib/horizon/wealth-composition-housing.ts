/**
 * Wealth-composition housing-injection (pure).
 *
 * De stapelbalk-grafiek (`WealthCompositionChart`) toont per-asset-groep-
 * samenstelling over de tijd. De engine-rijen (`unifiedRowsToStackedRows`)
 * vormen de bron. Voor NIET-`include_full`-woonstrategieën corrigeert deze
 * helper de samenstelling zodat de gebruiker eerlijk ziet wat de strategie
 * betekent (eigen huis + hypotheek terug in beeld).
 *
 * KERNVERSCHIL v1 ↔ v2 (de bron van de klif-bug, Issue 2):
 *
 * - In de **v1**-engine wordt het eigen huis (+ gekoppelde hypotheek) UIT de
 *   FIRE-projectie gefilterd (`filterAssetsForFire`) voor exclude/downsize.
 *   Het zit dus NIET in `unifiedRowsToStackedRows(rows)` en moet voor de
 *   visualisatie terug-geïnjecteerd worden (geprojecteerde huiswaarde in
 *   `vastgoed`, hypotheeksaldo van `schulden` afgetrokken).
 *
 * - In de **v2**-grootboekengine BLIJFT het eigen huis een `eigen_huis`-asset
 *   in het grootboek; `unifiedRowsToStackedRows(rows)` telt het al in
 *   `vastgoed`, en bij de downsize-liquidatie stroomt de netto-opbrengst al
 *   naar de liquide groepen in HETZELFDE jaar. Voor een v2-downsize zou de
 *   v1-injectie het huis dus DUBBEL tellen (pre-trigger `vastgoed ≈ 2× huis`)
 *   en op de trigger instorten → de klif. Daarom: in v2-downsize NIET
 *   injecteren — de engine-rijen zijn al correct en continu.
 *
 * Pure (geen React): zo is de echte injectie-logica afzonderlijk testbaar.
 */

import type { StackedRow } from '@/lib/wealth-composition'
import {
  isHousingStrategyEvent,
  projectEigenHuisValuesAt,
  projectMortgageStateAt,
  estimateReverseMortgagePayout,
  type HousingStrategyConfig,
  type HousingContext,
} from '@/lib/housing-strategy'
import type { LifeEvent } from '@/lib/horizon-data'

export interface ApplyHousingCompositionOpts {
  /** Gecureerde woonstrategie (mode + parameters). */
  housingCfg: HousingStrategyConfig
  /** Afgeleide eigen-huis-context (assets, hypotheken, hasEigenHuis). */
  ctx: HousingContext
  /** Weergave-events — bron voor de trigger-leeftijd (housing-strategy-event). */
  displayEvents: LifeEvent[]
  /** Huidige leeftijd, naar beneden afgerond (jaar-as-anker voor de projectie). */
  currentAgeFloor: number
  /** Einde van de FIRE-horizon — alleen nodig voor de reverse_mortgage-schatting. */
  fireEndAge: number
  /** True wanneer de v2-grootboekengine actief is (huis al in de engine-rijen). */
  isV2: boolean
}

/**
 * Pas de woonstrategie-injectie toe op de engine-afgeleide stapelrijen.
 *
 * @param baseRows - `unifiedRowsToStackedRows(unifiedRows)` — engine-output.
 * @param opts     - strategie + context + v2-vlag.
 * @returns nieuwe StackedRow[]; voor de skip-paden wordt `baseRows` ongewijzigd
 *          teruggegeven (referentieel identiek aan vandaag voor v1).
 */
export function applyHousingToComposition(
  baseRows: StackedRow[],
  opts: ApplyHousingCompositionOpts,
): StackedRow[] {
  const { housingCfg, ctx, displayEvents, currentAgeFloor, fireEndAge, isV2 } = opts

  const eigenHuisAssets = ctx.eigenHuisAssets ?? []
  const mortgages = ctx.eigenHuisMortgages
  const hasHouse = ctx.hasEigenHuis && eigenHuisAssets.length > 0
  // Geen huis → niets te injecteren, retourneer engine-output direct.
  if (!hasHouse) return baseRows
  // include_full: huis + hypotheek zitten al in de engine — geen injectie.
  if (housingCfg.mode === 'include_full') return baseRows
  // v2-downsize: het huis zit al als eigen_huis-asset in het grootboek én de
  // verkoopopbrengst stroomt bij liquidatie al naar de liquide groepen. De
  // engine-rijen zijn dus al continu — de v1-injectie zou dubbeltellen
  // (pre-trigger ≈ 2× huis) en op de trigger de klif veroorzaken.
  if (isV2 && housingCfg.mode === 'downsize') return baseRows

  // Trigger-leeftijd voor downsize en reverse_mortgage: ÉÉN bron — het
  // (client-side geregenereerde) housing-event zelf. Daardoor knikt de
  // vastgoed-bar op exact dezelfde leeftijd als de event-marker én het
  // verkoop-cashflow-moment in de sim. Voor exclude_from_fire is er geen
  // trigger (huis blijft permanent buiten de FIRE-pot).
  let triggerAge: number | null = null
  if (housingCfg.mode === 'downsize' || housingCfg.mode === 'reverse_mortgage') {
    const housingEvent = displayEvents.find(isHousingStrategyEvent)
    // Het event is de ENIGE bron. Geen housing-event (bv. een on_depletion-
    // trigger die binnen de horizon nooit afgaat → reason 'no_sale') betekent
    // GEEN trigger ⇒ GEEN injectie. Géén fallback naar config.triggerAge: dat
    // tekende een fantoom reverse_mortgage-schaduwschuld (en fantoom-verkoop bij
    // downsize) zonder tegenhanger in de projectielijn of de FIRE-berekening.
    triggerAge = housingEvent?.target_age ?? null
  }

  return baseRows.map((row) => {
    const monthsForward = Math.max(0, (row.age - currentAgeFloor) * 12)
    const projectedHouse = projectEigenHuisValuesAt(eigenHuisAssets, monthsForward)
    const mortgageState = projectMortgageStateAt(mortgages, monthsForward)

    if (housingCfg.mode === 'exclude_from_fire') {
      // Huis + hypotheek beide injecteren (groeien resp. amortiseren).
      // Reden: filterAssetsForFire haalt ze uit de engine; ze moeten
      // terugkomen voor de visualisatie zodat netto vermogen eerlijk is.
      return {
        ...row,
        vastgoed: row.vastgoed + Math.round(projectedHouse.currentValue),
        schulden: row.schulden - Math.round(mortgageState.balance),
      }
    }

    if (housingCfg.mode === 'downsize') {
      // v1-pad (v2-downsize is hierboven al ge-skipt).
      if (triggerAge !== null && row.age >= triggerAge) {
        // Na trigger: huis verkocht, hypotheek afgelost via sale-cashflow.
        // De verkoopopbrengst staat al in liquide (via lifeEventsToCashflows).
        return row
      }
      // Vóór trigger: huis + hypotheek beide zichtbaar.
      return {
        ...row,
        vastgoed: row.vastgoed + Math.round(projectedHouse.currentValue),
        schulden: row.schulden - Math.round(mortgageState.balance),
      }
    }

    if (housingCfg.mode === 'reverse_mortgage') {
      // Huis blijft zichtbaar via baseRows (geen filter — reverse_mortgage
      // houdt eigen_huis in de assets). Vóór trigger: niets extra.
      if (triggerAge === null || row.age < triggerAge) return row
      // Vanaf trigger: stapelende schaduwschuld vanwege opeethypotheek.
      // monthlyPayout uit config of auto-schatting op basis van equity bij
      // trigger. Schuld groeit als principal + rente over de looptijd.
      // Uitkering uit het event-metadata (zelfde bron als de sim-cashflow);
      // fallback: zelfde schatting als buildHousingLifeEventsAtAge.
      const housingEvent = displayEvents.find(isHousingStrategyEvent)
      const metaPayout = Number(
        (housingEvent?.metadata as Record<string, unknown> | null | undefined)?.monthlyPayout,
      )
      const equityAtTrigger = Math.max(
        0,
        projectEigenHuisValuesAt(eigenHuisAssets, Math.max(0, (triggerAge - currentAgeFloor) * 12))
          .currentValue -
          projectMortgageStateAt(mortgages, Math.max(0, (triggerAge - currentAgeFloor) * 12))
            .balance,
      )
      const monthlyPayout = Number.isFinite(metaPayout) && metaPayout > 0
        ? metaPayout
        : housingCfg.monthlyPayout ??
          estimateReverseMortgagePayout(
            equityAtTrigger,
            housingCfg.maxLoanPct,
            Math.max(1, fireEndAge - triggerAge),
          )
      const yearsAfterTrigger = row.age - triggerAge
      const principal = monthlyPayout * 12 * yearsAfterTrigger
      const shadowDebt =
        principal * Math.pow(1 + housingCfg.interestRate, yearsAfterTrigger) - principal
      if (shadowDebt <= 0) return row
      return { ...row, schulden: row.schulden - Math.round(shadowDebt) }
    }

    return row
  })
}
