/**
 * Horizon-kernel — grondslag-invariant van de FIRE-leeftijd / "nog X jaar"-aftelling.
 *
 * Vergrendelt de bevinding achter ADR 0034 (addendum 2026-07-07): de FIRE-leeftijd
 * (P!B16 → `fireAgeFractional`, de bron van de "nog X jaar"-aftelling, de grafiek-
 * FIRE-marker en de hero-KPI "vrijheidsleeftijd") staat AL op de INCL.-woning
 * grondslag zodra de woning MEEREKENT — de solver zoekt op Prognose!J (netto-
 * liquide), en Prognose!J = Prognose!I − (niet-liquide bezit − niet-liquide schuld);
 * onder woning-strategie "Meerekenen" is de eigen woning NIET niet-liquide (zie
 * `tables/prognose.ts` + `adapter/prio-overgang.ts`), dus J == I en
 * `requiredFirePortfolio == requiredFireNetWorth`.
 *
 * Gevolg (endpoint-invariant): op de FIRE-maand geldt Prognose!I == requiredFireNetWorth
 * ÉN Prognose!J == requiredFirePortfolio, dus vrijheidsvoortgang (freedomPct, INCL.,
 * noemer = requiredFireNetWorth) raakt 100% op EXACT dezelfde maand waarop de aftelling
 * 0 wordt — voor élke housing-strategie.
 *
 * Alleen bij `exclude_from_fire` (Uitsluiten) valt de woning uit Prognose!J → J < I →
 * de aftelling blijft (bewust) op de LIQUIDE grondslag, spiegelbeeld van freedomPct
 * die daar óók terugvalt op de EXCL. grondslag.
 *
 * Fixture-gated (skipt netjes vóór de oracle-extractie), spiegel `bridge.test.ts`.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { solveFire } from './solver'
import { prognoseI, prognoseJ } from './gap'
import { buildKernelInput } from './input-from-fixture'
import { listFixtures, loadFixture } from './oracle/fixture-load'

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0
const EUR = 0.01

/** Solve één fixture en lever de grondslag-grootheden bij FIRE. */
function solveFixture(naam: string) {
  const fx = loadFixture(path.join(FIXTURE_DIR, `${naam}.json.gz`))
  const input = buildKernelInput(fx)
  const solve = solveFire(input)
  const s = solve.projection.summary
  return {
    input,
    solve,
    fireMonth: s.fireMonth,
    // Bridge-doorvoer: requiredFireNetWorth = I@FIRE, requiredFirePortfolio = J@FIRE.
    requiredFireNetWorth: s.nettoVermogenBijFire ?? s.eindNettoVermogen,
    requiredFirePortfolio: s.nettoLiquideBijFire ?? s.eindNettoLiquide,
    iAtFire: prognoseI(solve.projection, s.fireMonth),
    jAtFire: prognoseJ(solve.projection, s.fireMonth),
  }
}

describe.skipIf(!hasFixtures)('FIRE-leeftijd grondslag-invariant (aftelling incl. woning)', () => {
  it('Meerekenen: aftelling IS incl. woning — requiredFirePortfolio == requiredFireNetWorth (J == I)', () => {
    const r = solveFixture('huis-meerekenen')
    expect(r.input.woning.selector).toBe('Meerekenen')
    // De solve-variabele van de aftelling (Prognose!J) telt de woning mee → == totaal
    // netto vermogen (Prognose!I). De "nog X jaar"-aftelling meet dus hetzelfde doel
    // als de INCL.-woning freedomPct.
    expect(r.requiredFirePortfolio).toBeCloseTo(r.requiredFireNetWorth, 2)
  })

  it('Uitsluiten: aftelling blijft LIQUIDE — requiredFireNetWorth > requiredFirePortfolio (verschil = overwaarde)', () => {
    const r = solveFixture('huis-uitsluiten')
    expect(r.input.woning.selector).toBe('Uitsluiten')
    // De woning valt uit Prognose!J → de aftelling meet de liquide portefeuille, terwijl
    // de INCL.-noemer (requiredFireNetWorth) de woning wél meetelt. Bewust verschil,
    // spiegelbeeld van freedomPct die bij exclude_from_fire óók terugvalt op EXCL.
    expect(r.requiredFireNetWorth - r.requiredFirePortfolio).toBeGreaterThan(1000)
  })

  it('endpoint-invariant: op de FIRE-maand geldt I == requiredFireNetWorth én J == requiredFirePortfolio (100% ⇔ aftelling 0)', () => {
    // Voor élke housing-strategie: beide grondslagen raken hun mijlpaal op HETZELFDE
    // moment (de FIRE-maand), dus 100% freedomPct en aftelling-0 vallen samen.
    for (const naam of [
      'huis-meerekenen',
      'huis-uitsluiten',
      'huis-verkoop-vast',
      'huis-opeethypotheek',
      'basis',
    ]) {
      const r = solveFixture(naam)
      expect(r.iAtFire).not.toBeNull()
      expect(r.jAtFire).not.toBeNull()
      expect(r.iAtFire as number).toBeCloseTo(r.requiredFireNetWorth, 2)
      expect(r.jAtFire as number).toBeCloseTo(r.requiredFirePortfolio, 2)
      // Overwaarde ≥ 0 ⇒ incl.-doel ≥ liquide-doel (identiteit I = J + niet-liquide netto).
      expect(r.requiredFireNetWorth).toBeGreaterThanOrEqual(r.requiredFirePortfolio - EUR)
    }
  })
})
