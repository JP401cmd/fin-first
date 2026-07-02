import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findSheet,
  getSheet,
  listFixtures,
  loadFixture,
} from '@/lib/horizon-kernel/oracle/fixture-load'
import { isOracleFixture, type OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'

/**
 * Structurele integriteits-suite over ALLE echte oracle-fixtures in
 * `test/fixtures/horizon-oracle/`. Bewaakt dat wat de Python-extractor
 * wegschrijft bruikbaar is als parity-oracle (ADR 0032) — vorm, herkomst,
 * verse solver-staat, aanwezige kern-tabs en volledige maandreeksen.
 *
 * Diepe wiskundige/parity-checks horen hier NIET (dat is FASE 2). Bestaat de
 * fixture-map niet of is hij leeg, dan skipt de suite met een duidelijke
 * melding zodat CI groen blijft tot de extractor gedraaid heeft.
 */

// Kern-tabs die in elke fixture aanwezig moeten zijn (genormaliseerde lookup).
const KERN_SHEETS = [
  'P',
  'CF',
  'Bel',
  'Ont',
  'Af',
  'Verdeling',
  'Bez',
  'S',
  'Prognose',
  'Geb',
  'TS',
  'bens',
  'Controle',
] as const

// Maandtabellen die per maand (index 0..1199) minstens 1200 datarijen leveren.
const MAAND_TABELLEN = ['CF', 'Bel', 'Ont', 'Af', 'Bez', 'S', 'Prognose', 'Verdeling'] as const

const MIN_MAAND_RIJEN = 1200

// Signalen (lowercase-substrings) die aangeven dat de Excel-solver herdraaid
// moet worden. Aanname: een verse fixture bevat GEEN van deze in `staleText`.
// Tolerant qua formulering — we asserten de AFWEZIGHEID van een herdraai-signaal.
const STALE_SIGNALS = ['opnieuw', 'stale', 'herdraai', 'rerun', 'verouderd', 'out of date'] as const

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const fixtureFiles = existsSync(FIXTURE_DIR) ? listFixtures(FIXTURE_DIR) : []

if (fixtureFiles.length === 0) {
  // Geen fixtures → skip (niet falen): de extractor is nog niet gedraaid.
  describe.skip('horizon-oracle fixture-integriteit (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(fixtureFiles.length).toBe(0)
    })
  })
} else {
  // Laad alles vooraf; een laad-/schemafout wordt een falende (a)-test i.p.v.
  // een collectie-crash die de hele run onbruikbaar maakt.
  const loaded = fixtureFiles.map((file) => {
    try {
      return { file, fixture: loadFixture(file) as OracleFixture | null, error: null as string | null }
    } catch (err) {
      return { file, fixture: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  describe('horizon-oracle fixture-integriteit', () => {
    it('(h) geen twee fixtures met dezelfde scenario-naam', () => {
      const namen = loaded
        .map((l) => l.fixture?.meta.scenario)
        .filter((n): n is string => typeof n === 'string')
      expect(new Set(namen).size).toBe(namen.length)
    })

    for (const entry of loaded) {
      describe(path.basename(entry.file), () => {
        it('(a) laadt en voldoet aan het OracleFixture-schema', () => {
          expect(entry.error, entry.error ?? undefined).toBeNull()
          expect(entry.fixture).not.toBeNull()
          expect(isOracleFixture(entry.fixture)).toBe(true)
        })

        // Diepere checks vereisen een geldige fixture; is (a) mislukt, dan
        // registreren we de rest niet (voorkomt ruis bovenop de echte fout).
        const fx = entry.fixture
        if (!fx) return

        it('(b) meta compleet: fixtureVersion 1 + herkomst gevuld', () => {
          expect(fx.meta.fixtureVersion).toBe(1)
          expect(fx.meta.scenario.length).toBeGreaterThan(0)
          expect(fx.meta.sourceFile.length).toBeGreaterThan(0)
          expect(fx.meta.sourceSha256).toMatch(/^[0-9a-f]{64}$/i)
          expect(fx.meta.extractedAt.length).toBeGreaterThan(0)
          expect(Array.isArray(fx.meta.macros)).toBe(true)
        })

        it('(c) controleK1 begint met "OK"', () => {
          expect(fx.meta.controleK1.trimStart().toUpperCase().startsWith('OK')).toBe(true)
        })

        it('(d) solver aantoonbaar vers (geen herdraai-signaal, óf idempotentie-bewijs)', () => {
          // Versheids-protocol van de extractor: de Excel-detector P!B95 hanteert een
          // 5%-van-doel-drempel en geeft vals alarm op het maand-granulariteits-restant
          // van de bisectie. De extractor bewijst versheid dan via idempotentie
          // (BepaalFIRE opnieuw draaien laat B16/B38 exact ongewijzigd) en logt dat
          // bewijs als warning. Vers = geen stale-signaal, ÓF signaal mét bewijs.
          const stale = fx.meta.solver.staleText.toLowerCase()
          const gevonden = STALE_SIGNALS.filter((s) => stale.includes(s))
          if (gevonden.length === 0) return
          const bewijs = fx.meta.warnings.some((w) => {
            const t = w.toLowerCase()
            return t.includes('idempotent') || t.includes('aantoonbaar vers')
          })
          expect(
            bewijs,
            `staleText bevat herdraai-signaal (${gevonden.join(', ')}) zonder idempotentie-bewijs in warnings: "${fx.meta.solver.staleText}"`,
          ).toBe(true)
        })

        it('(e) alle kern-tabs aanwezig', () => {
          const ontbrekend = KERN_SHEETS.filter((naam) => findSheet(fx, naam) === undefined)
          expect(ontbrekend, `ontbrekende tabs: ${ontbrekend.join(', ')}`).toEqual([])
        })

        it(`(f) maandtabellen hebben ≥ ${MIN_MAAND_RIJEN} rijen`, () => {
          for (const naam of MAAND_TABELLEN) {
            const sheet = getSheet(fx, naam)
            expect(
              sheet.values.length,
              `${naam} heeft ${sheet.values.length} rijen`,
            ).toBeGreaterThanOrEqual(MIN_MAAND_RIJEN)
          }
        })

        it('(g) solver.fireAge is een leeftijd 18–100 of null bij een status', () => {
          const { fireAge, statusText } = fx.meta.solver
          if (fireAge === null) {
            // Onbereikbaar/shortfall: er moet een status zijn die dit verklaart.
            expect(statusText.length).toBeGreaterThan(0)
          } else {
            expect(typeof fireAge).toBe('number')
            expect(fireAge).toBeGreaterThanOrEqual(18)
            expect(fireAge).toBeLessThanOrEqual(100)
          }
        })
      })
    }
  })
}
