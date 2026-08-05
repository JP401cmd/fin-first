/**
 * Horizon-kernel bridge — `box1Streams` (weergaveveld) + de Box 3-regressie-eis.
 *
 * Twee dingen, in één bestand omdat ze één claim bewijzen: "de bridge levert een
 * Box 1-RAPPORTAGE-veld ERBIJ, en de rekenkern is daardoor niet bewogen."
 *
 *  1. **Regressie — `cumulativeBox3` byte-identiek.** Een golden over de VOLLEDIGE
 *     `cumulativeBox3`-reeks van alle 19 oracle-fixtures. Bewust een **exacte**
 *     vergelijking (`toBe` / SHA-256 over de canonieke float-serialisatie), GEEN
 *     tolerantie: de claim is niet "ongeveer gelijk" maar "geen enkele
 *     drijvende-komma-operatie in het Box 3-pad is van plaats veranderd". Een
 *     absolute €0,01-tolerantie zou juist de foutklasse verbergen die hier telt —
 *     een herordende optelling die pas over 65 jaar cumulatief zichtbaar wordt.
 *     De golden is vastgelegd op de PRE-CHANGE bridge (commit-baseline) en mag
 *     alleen wijzigen bij een bewust, eigenaar-geaccordeerd kern-besluit.
 *  2. **`box1Streams`** — onafhankelijke recompute uit de kernel-tabellen, de
 *     spread-gating, en de deelsom-relatie met `grossIncomeBySource`.
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { solveFire } from './solver'
import type { KernelProjection } from './engine'
import { buildKernelInput } from './input-from-fixture'
import { listFixtures, loadFixture } from './oracle/fixture-load'
import { kernelToUnifiedResult } from './bridge'
import type { KernelInput } from './types'

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

/** Deterministische fixture-volgorde (volledige paden, alfabetisch). */
function sortedFixtureFiles(): string[] {
  return listFixtures(FIXTURE_DIR).slice().sort()
}

function fixtureName(file: string): string {
  return path.basename(file).replace(/\.json\.gz$/, '')
}

// ── 1. Box 3-regressie-golden (byte-identiteit, geen tolerantie) ─────────────

/**
 * SHA-256 over `naam:v0,v1,…|naam:…` met `JSON.stringify(number)` per waarde
 * (kortste round-trip-representatie ⇒ bit-identiteit van de double).
 * Vastgelegd op de bridge ZONDER `box1Streams`; ongewijzigd ná toevoeging.
 */
const CUMULATIVE_BOX3_GOLDEN_HASH =
  '5fc527bff9d94e1c0618556007dca7c029325cdba83c4c4fb1d56306c8c6d938'

/**
 * Leesbare tweede helft van dezelfde golden: rij-aantal + de EINDSTAND van de
 * cumulatieve Box 3 per fixture (= de levenslange Box 3-heffing van dat plan).
 * De hash bewijst de volledige reeks; deze tabel maakt een breuk diagnosticeerbaar.
 */
const CUMULATIVE_BOX3_GOLDEN_LAST: ReadonlyArray<readonly [string, number, number]> = [
  ['basis', 65, 488499.65768611245],
  ['box3-werkelijk', 65, 530543.9439360119],
  ['eind-deplete', 65, 385775.90102196514],
  ['eind-pensioen', 65, 3882831.997494537],
  ['eind-perpetual', 65, 1432820.6117216183],
  ['gezin', 65, 735212.0720082811],
  ['huis-meerekenen', 65, 191800.86203925908],
  ['huis-opeethypotheek', 65, 209028.74676283367],
  ['huis-uitsluiten', 65, 256789.52479388838],
  ['huis-verkoop-vast', 65, 365766.620078683],
  ['onhaalbaar', 65, 5109430.24466478],
  ['partner-aan', 65, 374819.3442999554],
  ['pensioen-tekort', 65, 676442.7369510538],
  ['profiel-guardrails', 65, 553961.664652786],
  ['profiel-oplopend', 65, 484342.6626704852],
  ['profiel-vast', 65, 567944.8796745088],
  ['reserve-depletie', 65, 158406.56099921506],
  ['schuld-prio', 65, 439050.5419593173],
  ['werk-strategie-uit', 65, 467997.44905654807],
]

// ── Onafhankelijke recompute-helpers voor box1Streams ───────────────────────

const GEB_ROW_AOW = 14
const GEB_ROW_PENSIOEN_FIRST = 15
const GEB_ROW_PENSIOEN_LAST = 20
/** ASSET_ORDER-index van 'Pensioen' (Spaargeld, Beleggingen, Pensioen, …). */
const PENSIOEN_CAT_INDEX = 2

function inHorizonMonth(proj: KernelProjection, m: number): boolean {
  const row = proj.bez[m]
  return row !== undefined && !row.beyondHorizon
}

function blockMonths(proj: KernelProjection, k: number, lastInHorizon: number): number[] {
  const out: number[] = []
  for (let m = 12 * k; m <= Math.min(12 * k + 11, lastInHorizon); m++) {
    if (inHorizonMonth(proj, m)) out.push(m)
  }
  return out
}

/**
 * Recompute van de vier Box 1-stromen rechtstreeks uit de kernel-tabellen —
 * bewust NIET via de bridge-helpers, zodat een bridge-drift hier rood wordt.
 */
function expectedBox1Streams(
  proj: KernelProjection,
  input: KernelInput,
  months: number[],
): { aow: number; pensioenUitkering: number; pensioenOnttrekking: number; partner: number } {
  let aow = 0
  let pensioenUitkering = 0
  let pensioenOnttrekking = 0
  let partner = 0
  for (const m of months) {
    const cf = proj.cf[m]
    if (cf !== undefined && !cf.beyondHorizon) {
      const idx = Math.pow(1 + input.inflatie, m / 12)
      let aowBn = 0
      let penBn = 0
      for (const row of proj.gebAutoRows) {
        for (const h of row.helpers) {
          if (h.bn <= 0) continue
          if (!(h.sIdx <= m && m <= h.eIdx)) continue
          if (row.gebRow === GEB_ROW_AOW) aowBn += h.bn
          else if (row.gebRow >= GEB_ROW_PENSIOEN_FIRST && row.gebRow <= GEB_ROW_PENSIOEN_LAST) {
            penBn += h.bn
          }
        }
      }
      aow += aowBn * idx
      pensioenUitkering += penBn * idx
      partner += proj.pt[m]?.totaal ?? 0
    }
    const v = proj.verdeling[m]
    if (v !== undefined) {
      const bedrag = v.onttrekking.eind[PENSIOEN_CAT_INDEX] ?? 0
      if (bedrag > 0) pensioenOnttrekking += bedrag
    }
  }
  return { aow, pensioenUitkering, pensioenOnttrekking, partner }
}

// ── Suites ───────────────────────────────────────────────────────────────────

if (!hasFixtures) {
  describe.skip('bridge · box1Streams + Box 3-regressie (fixtures ontbreken)', () => {
    it('overgeslagen', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  describe('bridge — REGRESSIE: cumulativeBox3 blijft byte-identiek', () => {
    it('volledige reeks over alle 19 oracle-fixtures = golden (exact, geen tolerantie)', () => {
      const parts: string[] = []
      const perFixture: Array<[string, number, number]> = []
      for (const file of sortedFixtureFiles()) {
        const input = buildKernelInput(loadFixture(file))
        const res = kernelToUnifiedResult(solveFire(input), { input })
        const name = fixtureName(file)
        const series = res.rows.map((r) => r.cumulativeBox3)
        parts.push(`${name}:${series.map((v) => JSON.stringify(v)).join(',')}`)
        perFixture.push([name, series.length, series[series.length - 1]])
      }

      // (a) leesbare eindstanden — exacte gelijkheid, per fixture diagnosticeerbaar.
      expect(perFixture).toEqual(CUMULATIVE_BOX3_GOLDEN_LAST.map((r) => [...r]))

      // (b) de volledige reeks, bit-voor-bit.
      const hash = createHash('sha256').update(parts.join('|')).digest('hex')
      expect(hash).toBe(CUMULATIVE_BOX3_GOLDEN_HASH)
    }, 60_000)
  })

  describe('bridge — box1Streams (read-only weergaveveld)', () => {
    it('recompute + gating + deelsom-relatie met grossIncomeBySource', () => {
      for (const file of sortedFixtureFiles()) {
        const name = fixtureName(file)
        const input = buildKernelInput(loadFixture(file))
        const solve = solveFire(input)
        const proj = solve.projection
        const res = kernelToUnifiedResult(solve, { input })
        const last = proj.summary.lastInHorizonMonth

        for (const row of res.rows) {
          const months = blockMonths(proj, row.year, last)
          const exp = expectedBox1Streams(proj, input, months)
          const anyNonZero =
            exp.aow !== 0 ||
            exp.pensioenUitkering !== 0 ||
            exp.pensioenOnttrekking !== 0 ||
            exp.partner !== 0

          if (!anyNonZero) {
            // Spread-gating: rij-vorm blijft identiek in jaren zonder stromen.
            expect(row.box1Streams, `${name} jaar ${row.year}`).toBeUndefined()
            continue
          }

          const s = row.box1Streams
          expect(s, `${name} jaar ${row.year}`).toBeDefined()
          if (!s) continue
          expect(s.aowNetto).toBeCloseTo(exp.aow, 6)
          expect(s.pensioenUitkeringBruto).toBeCloseTo(exp.pensioenUitkering, 6)
          expect(s.pensioenOnttrekkingBruto).toBeCloseTo(exp.pensioenOnttrekking, 6)
          expect(s.partnerBatenNetto).toBeCloseTo(exp.partner, 6)

          // Alle vier zijn baten/onttrekkingen ⇒ nooit negatief, altijd eindig.
          for (const v of [
            s.aowNetto,
            s.pensioenUitkeringBruto,
            s.pensioenOnttrekkingBruto,
            s.partnerBatenNetto,
          ]) {
            expect(Number.isFinite(v)).toBe(true)
            expect(v).toBeGreaterThanOrEqual(0)
          }

          // AOW + pensioen-uitkering zijn DEELSOMMEN van CF!H (= gebeurtenisBaten).
          // Relatieve tolerantie (1e-9) is hier de juiste keuze en geen absolute
          // cent: het verschil is puur float-associativiteit ((a+b)·idx vs a·idx +
          // b·idx) en schaalt dus MET het bedrag — een vaste €0,01 zou op een
          // miljoenen-jaarsom te ruim en op een klein bedrag te streng zijn.
          const deelsom = s.aowNetto + s.pensioenUitkeringBruto
          const cfH = row.grossIncomeBySource?.gebeurtenisBaten ?? 0
          expect(deelsom).toBeLessThanOrEqual(cfH * (1 + 1e-9) + 1e-6)

          // De pensioen-onttrekking is een deel van de totale onttrekking.
          expect(s.pensioenOnttrekkingBruto).toBeLessThanOrEqual(row.withdrawal + 1e-6)
        }
      }
    }, 120_000)

    it('AOW verschijnt pas vanaf de AOW-leeftijd (fixture basis)', () => {
      const file = sortedFixtureFiles().find((f) => fixtureName(f) === 'basis')
      expect(file).toBeDefined()
      if (!file) return
      const input = buildKernelInput(loadFixture(file))
      const res = kernelToUnifiedResult(solveFire(input), { input })
      const aowLeeftijd = input.persoon.aowLeeftijd

      const voor = res.rows.filter((r) => r.age < Math.floor(aowLeeftijd))
      const na = res.rows.filter((r) => r.age >= Math.ceil(aowLeeftijd) + 1)
      expect(voor.length).toBeGreaterThan(0)
      expect(na.length).toBeGreaterThan(0)
      for (const r of voor) expect(r.box1Streams?.aowNetto ?? 0).toBe(0)
      for (const r of na) expect(r.box1Streams?.aowNetto ?? 0).toBeGreaterThan(0)
    })

    it('pensioen-uitkering > 0 op een fixture met een actieve pensioenpot (gezin)', () => {
      const file = sortedFixtureFiles().find((f) => fixtureName(f) === 'gezin')
      expect(file).toBeDefined()
      if (!file) return
      const input = buildKernelInput(loadFixture(file))
      const res = kernelToUnifiedResult(solveFire(input), { input })
      const metPensioen = res.rows.filter((r) => (r.box1Streams?.pensioenUitkeringBruto ?? 0) > 0)
      expect(metPensioen.length).toBeGreaterThan(0)
    })

    it('partnerBatenNetto > 0 op een partner-fixture (partner-aan)', () => {
      const file = sortedFixtureFiles().find((f) => fixtureName(f) === 'partner-aan')
      expect(file).toBeDefined()
      if (!file) return
      const input = buildKernelInput(loadFixture(file))
      const res = kernelToUnifiedResult(solveFire(input), { input })
      const metPartner = res.rows.filter((r) => (r.box1Streams?.partnerBatenNetto ?? 0) > 0)
      expect(metPartner.length).toBeGreaterThan(0)
    })
  })
}
