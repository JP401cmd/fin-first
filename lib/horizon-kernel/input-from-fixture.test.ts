import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, listFixtures, loadFixture } from './oracle/fixture-load'
import type { CellValue, OracleFixture } from './oracle/fixture-types'
import { buildKernelInput } from './input-from-fixture'
import type { KernelInput } from './types'

/**
 * COMPLETENESS — `buildKernelInput` dekt de volledige Excel-invoer (FASE 2, stap 2).
 *
 * Drie bewijzen per fixture:
 *  1. de input bouwt zonder fouten (strikte enum-parsing vangt fixture-drift);
 *  2. elke scenario-`override` die in de mapping zit komt als de bijbehorende
 *     input-waarde terug (scenario-identiteit → geparste input);
 *  3. bekende basiswaarden + de getypte slot-rollen kloppen.
 *
 * Teacher-forced parity van de tabellen zelf zit in `test/horizon-oracle/`.
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

/**
 * Override-cel → de input-waarde die 'm hoort te weerspiegelen. Alleen cellen die
 * DIRECT in de mapping zitten. Bewust NIET hier: `TS!D41`/`TS!D42` (dat zijn de
 * toename-MAPPING-matrixcellen; hun effect landt geresolveerd op TS!B17/B18 —
 * zie de aparte TS-fix-assert), en de solver-outputs (die zijn geen input).
 */
const OVERRIDE_CHECKS: Record<string, (i: KernelInput) => CellValue> = {
  'P!B90': (i) => i.box3.method,
  'P!B48': (i) => i.eindstrategie.selector,
  'P!B57': (i) => i.woning.selector,
  'P!B58': (i) => i.woning.trigger,
  'P!B69': (i) => i.onttrekkingsprofiel.profiel,
  'P!B72': (i) => i.onttrekkingsprofiel.factor1Pct,
  'P!B75': (i) => i.onttrekkingsprofiel.factor3Pct,
  'PT!B2': (i) => (i.partner.aanwezig ? 1 : 0),
  'Werk-strategie!B2': (i) => i.werkStrategie.reeleGroei,
}

if (!hasFixtures) {
  describe.skip('horizon-kernel · input-completeness (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const files = listFixtures(FIXTURE_DIR)
  const fixtures: OracleFixture[] = files.map(loadFixture)

  describe('horizon-kernel · input-from-fixture (volledige invoer-oppervlakte)', () => {
    it('draait over alle 16 fixtures', () => {
      expect(fixtures.length).toBe(16)
    })

    // ── 1. bouwt zonder fouten + basale vorm ──────────────────────────────────
    for (const fx of fixtures) {
      it(`${fx.meta.scenario}: bouwt zonder fouten`, () => {
        const input = buildKernelInput(fx)
        // Basale vorm: alle blokken aanwezig.
        expect(input.box3).toBeDefined()
        expect(input.persoon).toBeDefined()
        expect(input.inkomenUitgaven).toBeDefined()
        expect(input.strategie).toBeDefined()
        expect(input.eindstrategie).toBeDefined()
        expect(input.woning).toBeDefined()
        expect(input.onttrekkingsprofiel).toBeDefined()
        expect(input.onzekerheid).toBeDefined()
        expect(input.ts).toBeDefined()
        expect(input.autoGebeurtenissen).toBeDefined()
        expect(input.partner).toBeDefined()
        expect(input.werkStrategie).toBeDefined()
        expect(Array.isArray(input.gebeurtenissen)).toBe(true)
      })
    }

    // ── 2. scenario-identiteit: overrides ↔ geparste input ────────────────────
    for (const fx of fixtures) {
      it(`${fx.meta.scenario}: overrides weerspiegelen de geparste input`, () => {
        const input = buildKernelInput(fx)
        for (const override of fx.meta.overrides) {
          const check = OVERRIDE_CHECKS[override.cell]
          if (check === undefined) continue // niet in de mapping (bv. TS!D41/D42)
          expect(
            check(input),
            `override ${override.cell}=${JSON.stringify(override.value)} (${fx.meta.scenario}) ` +
              `moet in de input terugkomen`,
          ).toBe(override.value)
        }
      })
    }

    // ── 3. bekende basiswaarden + getypte slot-rollen ─────────────────────────
    for (const fx of fixtures) {
      it(`${fx.meta.scenario}: bekende basiswaarden + slot-rollen`, () => {
        const input = buildKernelInput(fx)

        // startLeeftijd 36 (P!B7) + inflatie uit P!B14, in alle fixtures.
        expect(input.startLeeftijd).toBe(36)
        expect(input.inflatie).toBe(getCell(fx, 'P!B14'))

        // 6 bezitting-potten (bens rij 4-9), 5 schuld-potten (rij 17-20 + 23);
        // bens is in geen enkele fixture overschreven.
        expect(input.assetPotten.length).toBe(6)
        expect(input.schuldPotten.length).toBe(5)
        for (const p of input.assetPotten) expect(p.slot).toBeGreaterThanOrEqual(0)
        for (const p of input.assetPotten) expect(p.slot).toBeLessThan(10)
        for (const p of input.schuldPotten) expect(p.slot).toBeLessThan(7)

        // Getypte slot-rollen op de contract-rijen (Controle!K8/K9 + reserved).
        const huis = input.assetPotten.filter((p) => p.rol === 'eigenHuis')
        expect(huis).toHaveLength(1)
        expect(huis[0].slot).toBe(2) // bens rij 6
        expect(huis[0].categorie).toBe('Eigen huis')

        const hypotheek = input.schuldPotten.filter((p) => p.rol === 'hypotheek')
        const opeet = input.schuldPotten.filter((p) => p.rol === 'opeethypotheek')
        const tekort = input.schuldPotten.filter((p) => p.rol === 'tekortLening')
        expect(hypotheek).toHaveLength(1)
        expect(hypotheek[0].slot).toBe(0) // bens rij 17
        expect(opeet).toHaveLength(1)
        expect(opeet[0].slot).toBe(3) // bens rij 20
        expect(tekort).toHaveLength(1)
        expect(tekort[0].slot).toBe(6) // bens rij 23

        // P!B19 (personen) ↔ PT!B2 (partner): consistent per fixture.
        expect(input.box3.personen).toBe(input.partner.aanwezig ? 2 : 1)

        // TS-fix (override TS!D41/D42=5) landt geresolveerd op de schuld-prio's:
        // Consumptief + Studie hebben aflos-prio 5 in élke fixture.
        const consumptief = input.ts.schuldCategorien.find((c) => c.categorie === 'Consumptief')
        const studie = input.ts.schuldCategorien.find((c) => c.categorie === 'Studie')
        expect(consumptief?.prioAflossing).toBe(5)
        expect(studie?.prioAflossing).toBe(5)
      })
    }

    // ── 4. basis-fixture: diepere waardecheck (single point of truth) ─────────
    it('basis: kern-invoerwaarden komen exact uit de bekende cellen', () => {
      const basis = fixtures.find((f) => f.meta.scenario === 'basis')
      expect(basis).toBeDefined()
      if (basis === undefined) return
      const input = buildKernelInput(basis)

      expect(input.persoon).toEqual({ geboortejaar: 1990, startjaar: 2026, aowLeeftijd: 67 })
      expect(input.inkomenUitgaven).toEqual({
        nettoJaarinkomen: 45000,
        nettoJaaruitgaven: 33000,
        uitgaveNaPensioenPerJaar: 40000,
      })
      expect(input.tekortLeningRente).toBe(0.05)
      expect(input.eindstrategie.selector).toBe('Nalatenschap')
      expect(input.eindstrategie.nalatenschapBedrag).toBe(100000)
      expect(input.woning.selector).toBe('Verkopen')
      expect(input.woning.trigger).toBe('Wanneer nodig')
      expect(input.woning.opeetMaandopname).toBeNull() // P!B67 leeg = auto
      expect(input.onttrekkingsprofiel.profiel).toBe('Afnemend')
      expect(input.onttrekkingsprofiel.factor1Pct).toBe(100)
      expect(input.onttrekkingsprofiel.factor3Pct).toBe(70)
      expect(input.onzekerheid.scenario).toBe('Verwacht')
      expect(input.onzekerheid.mc).toEqual({ aantalRuns: 10, sigma: 0.15, actief: false })
      expect(input.onzekerheid.hist.actief).toBe(false)
      expect(input.onzekerheid.hist.rendementReeks).toHaveLength(96) // Hist!B4:B99

      // Handmatige gebeurtenissen: Huwelijk (2 posten) + Pensionering (3 posten).
      expect(input.gebeurtenissen.map((g) => g.naam)).toEqual(['Huwelijk', 'Pensionering'])
      const huwelijk = input.gebeurtenissen[0]
      expect(huwelijk.posten).toHaveLength(2)
      expect(huwelijk.posten[0]).toEqual({
        type: 'Eenmalig',
        bedrag: 5000,
        startLeeftijd: 40,
        startMaand: 6,
        eindLeeftijd: null,
        eindMaand: null,
      })
      expect(huwelijk.posten[1].bedrag).toBe(-15000)
      const pensionering = input.gebeurtenissen[1]
      expect(pensionering.posten).toHaveLength(3)
      expect(pensionering.posten[1]).toEqual({
        type: 'Periodiek',
        bedrag: 1500,
        startLeeftijd: 65,
        startMaand: 1,
        eindLeeftijd: 80,
        eindMaand: 12,
      })

      // Auto-gebeurtenissen: invoer + lege pensioen-multipot.
      expect(input.autoGebeurtenissen.leefsituatie).toBe('Alleenstaand')
      expect(input.autoGebeurtenissen.aowOpbouwjaren).toBe(50)
      expect(input.autoGebeurtenissen.aantalKinderen).toBe(0)
      expect(input.autoGebeurtenissen.pensioenPotten).toHaveLength(0)

      // Werk-strategie ACTIEF in basis (2% reële groei; geen sprongen/deeltijd).
      expect(input.werkStrategie.reeleGroei).toBe(0.02)
      expect(input.werkStrategie.groeiTotLeeftijd).toBeNull()
      expect(input.werkStrategie.plafondNettoPerMaand).toBe(0)
      expect(input.werkStrategie.sprongen).toHaveLength(0)
      expect(input.werkStrategie.deeltijd).toHaveLength(0)

      // Partner uit in basis.
      expect(input.partner.aanwezig).toBe(false)
      expect(input.box3.personen).toBe(1)
    })
  })
}
