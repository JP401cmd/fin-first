/**
 * Horizon-kernel · wrapper **scenarioband** — port van de VBA-macro
 * `RunScenarioBand` (Module1, `docs/horizon-oracle/vba.txt`).
 *
 * Voor elk scenario (Pessimistisch/Verwacht/Optimistisch) draait de macro de
 * **volledige FIRE-bisectie** (zelfde algoritme + horizon-check als `BepaalFIRE`)
 * met de bijbehorende rendement-shift P!B43, en schrijft per scenario naar Sim:
 *   - **Sim!B(6+i)** = de gevonden FIRE-leeftijd (P!B16), of `#N/A` als het
 *     scenario onhaalbaar is (gap < 0 op de horizon);
 *   - **Sim!C(6+i)** = `Rapport!L6` = `INDEX(Prognose!I, R1)` = netto-vermogen op
 *     de FIRE-maand (Prognose!I@FIRE);
 *   - **Sim!D(6+i)** = `Sim!B3` = `INDEX(Prognose!J, (B35−B7)·12+1)` =
 *     netto-liquide op de eindleeftijd (Prognose!J@eindleeftijd).
 *
 * ### Shift-toepassing via een input-transform (tabellen onaangeraakt)
 * De shift P!B43 (`SWITCH(B42, Pessimistisch −0,02, Verwacht 0, Optimistisch
 * 0,02)`) raakt uitsluitend het Bez-rendement van **investeringspotten** (bens!F=1)
 * — en `tables/bez.ts` past `input.onzekerheid.shift` daar al op toe. De wrapper
 * hoeft dus alleen `onzekerheid.scenario`/`onzekerheid.shift` in een kopie van de
 * `KernelInput` te zetten; de tabellen blijven ongewijzigd. De VBA-herstelstap
 * (B42→"Verwacht", B16←Sim!B7) is bij ons impliciet: `runScenarioBand` is puur en
 * muteert niets.
 *
 * ### Bewuste afwijking van `solveFire` (gerapporteerd)
 * `RunScenarioBand` doet **géén** pensioen-kortsluiting (anders dan `BepaalFIRE`/
 * `solveFire`): ook bij eindstrategie 'Pensioenleeftijd' bisecteert het op de gap.
 * Dat is empirisch bevestigd door de fixtures (bv. `eind-pensioen`: Sim!B7 =
 * 52,92 ≠ de live P!B16 = 67 = AOW). De wrapper reproduceert dus de pure bisectie
 * voor álle eindstrategieën.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { runKernelProjection } from '../engine'
import { computeEs } from '../tables/es'
import type { KernelInput, ScenarioBand } from '../types'
import { clng, computeGap, eindMaandVan, eindleeftijdVan, prognoseJ } from '../gap'

/** De scenario's + hun rendement-shift P!B43 (SWITCH op P!B42). */
const SCENARIO_SHIFT: Readonly<Record<ScenarioBand, number>> = {
  Pessimistisch: -0.02,
  Verwacht: 0,
  Optimistisch: 0.02,
}
const SCENARIOS: readonly ScenarioBand[] = ['Pessimistisch', 'Verwacht', 'Optimistisch']

/** Eén scenario-uitkomst (de Sim!B/C/D-rij voor dat scenario). */
export interface ScenarioBandRow {
  readonly scenario: ScenarioBand
  /** false = onhaalbaar op de horizon (Sim!B/C/D = #N/A). */
  readonly reachable: boolean
  /** Sim!B(6+i) — gevonden FIRE-leeftijd; `null` bij onhaalbaar. */
  readonly fireAge: number | null
  /** Sim!C(6+i) = Rapport!L6 — Prognose!I op de FIRE-maand; `null` bij onhaalbaar. */
  readonly nettoVermogenBijFire: number | null
  /** Sim!D(6+i) = Sim!B3 — Prognose!J op de eindleeftijd; `null` bij onhaalbaar. */
  readonly vermogenOpEindleeftijd: number | null
}

/** De volledige scenarioband (drie rijen) + het aantal engine-runs (rapportage). */
export interface ScenarioBandResult {
  readonly rows: readonly ScenarioBandRow[]
  readonly engineRuns: number
}

// NB: de gap-sign-toetsen hieronder zijn bewust strikt — zie de toelichting in
// solver.ts (calc-review): maand-gap-sprongen ≫ float-ruis; EPS zou de
// Excel-semantiek veranderen.

/**
 * Draai de scenarioband: drie volledige FIRE-bisecties, één per scenario, met de
 * bijbehorende rendement-shift. Reproduceert `RunScenarioBand` cel-voor-cel.
 */
export function runScenarioBand(input: KernelInput): ScenarioBandResult {
  const es = computeEs(input)
  const start = input.startLeeftijd
  const eindleeftijd = eindleeftijdVan(es)
  const eindMaand = eindMaandVan(eindleeftijd, start)
  const maxM = clng((100 - start) * 12)

  const rows: ScenarioBandRow[] = []
  let engineRuns = 0

  for (const scenario of SCENARIOS) {
    // Input-transform: alleen de scenario-shift; de tabellen blijven ongewijzigd.
    const shifted: KernelInput = {
      ...input,
      onzekerheid: { ...input.onzekerheid, scenario, shift: SCENARIO_SHIFT[scenario] },
    }
    const run = (fireAge: number) => {
      engineRuns += 1
      return runKernelProjection(shifted, { fireAge })
    }

    // Horizon-check: B16 = leeftijd + maxM/12 (= 100); gap < 0 → onhaalbaar (#N/A).
    const horizonFireAge = start + maxM / 12
    if (computeGap(shifted, es, run(horizonFireAge), horizonFireAge) < 0) {
      rows.push({
        scenario,
        reachable: false,
        fireAge: null,
        nettoVermogenBijFire: null,
        vermogenOpEindleeftijd: null,
      })
      continue
    }

    // Maand-bisectie op de gap (VBA: `\` = integer-deling = floor); invariant gap(hi) ≥ 0.
    let lo = 0
    let hi = maxM
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      const midFireAge = start + mid / 12
      if (computeGap(shifted, es, run(midFireAge), midFireAge) >= 0) hi = mid
      else lo = mid
    }

    const fireAge = start + hi / 12
    const finalProj = run(fireAge)
    rows.push({
      scenario,
      reachable: true,
      fireAge,
      // Rapport!L6 = INDEX(Prognose!I, R1); de summary levert Prognose!I@FIRE.
      nettoVermogenBijFire: finalProj.summary.nettoVermogenBijFire,
      // Sim!B3 = INDEX(Prognose!J, (B35−B7)·12+1) = Prognose!J op de eindleeftijd.
      vermogenOpEindleeftijd: prognoseJ(finalProj, eindMaand),
    })
  }

  return { rows, engineRuns }
}
