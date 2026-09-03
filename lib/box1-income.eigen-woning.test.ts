/**
 * REGRESSIESLOT — "één motor, één invoer" voor Box 1 (bevinding C8).
 *
 * DE FOUT die dit bestand vastlegt was géén rekenfout. `computeBox1Tax` klopte;
 * hij kreeg op twee oppervlakken verschillende INVOER. De Box 1-subpagina deed
 * zelf de `eigen_huis`/`mortgage`-lookup en gaf `wozValue`/`hypotheekRente` mee;
 * de belasting-hub (via `loadFiscaleKansen`) niet. Zelfde bruto, zelfde motor,
 * twee heffingen — €4.357 uit elkaar bij een netto aftrekpost van €8.803. En
 * omdat de hub-heffing dóórstroomt naar "TOTALE DRUK", de boxverdeling, de
 * bruto→netto-balk en de Box 1-tegel, stond dat verschil op vier plekken.
 *
 * DRIE LAGEN, want een unittest op de rekenregel had deze bug NOOIT gevangen:
 *  1. de pure mapping van de twee query-uitkomsten naar de motor-invoer
 *     (`buildEigenWoningBox1Input`) — de randgevallen;
 *  2. de resolutie zelf (`resolveEigenWoningBox1Input`) op een nagebootste
 *     supabase-client — bewijst dat beide queries in de mapping landen;
 *  3. een BRON-GRENDEL op de twee oppervlakken: allebei moeten ze de gedeelde
 *     resolutie consumeren én haar velden in de motor-aanroep spreiden, en
 *     geen van beide mag de lookup nog zelf doen. Precedent voor deze vorm:
 *     `components/app/horizon/horizon-client.hero-fire-age.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildEigenWoningBox1Input,
  resolveEigenWoningBox1Input,
  GEEN_EIGEN_WONING,
} from './box1-income'
import { computeBox1Tax, estimateMortgageRenteJaar } from './box1-tax'

// ── 1. De pure mapping ─────────────────────────────────────────────────────

describe('buildEigenWoningBox1Input — de randgevallen van de eigen-woning-invoer', () => {
  it('geen eigen woning → beide motorvelden undefined (de motor rekent zuiver over het bruto)', () => {
    expect(buildEigenWoningBox1Input([], [])).toEqual(GEEN_EIGEN_WONING)
    expect(buildEigenWoningBox1Input(null, null)).toEqual(GEEN_EIGEN_WONING)
  })

  it('woning zonder WOZ-waarde telt NIET mee — ook niet als er een hypotheek op staat', () => {
    // Zonder forfait-grondslag is de renteaftrek niet te plaatsen; hem tóch
    // meegeven zou een aftrekpost zonder bijtelling opleveren.
    const r = buildEigenWoningBox1Input(
      [{ id: 'huis', woz_value: null }],
      [{ linked_asset_id: 'huis', current_balance: 300_000, interest_rate: 3.5 }],
    )
    expect(r).toEqual(GEEN_EIGEN_WONING)
  })

  it('woning zonder hypotheek → WOZ mee, rente 0 (forfait-bijtelling, Wet Hillen doet de rest)', () => {
    const r = buildEigenWoningBox1Input([{ id: 'huis', woz_value: 400_000 }], [])
    expect(r).toEqual({ wozValue: 400_000, hypotheekRente: 0, hasEigenWoning: true })
  })

  it('sommeert meerdere leningdelen op dezelfde woning', () => {
    const r = buildEigenWoningBox1Input(
      [{ id: 'huis', woz_value: 400_000 }],
      [
        { linked_asset_id: 'huis', current_balance: 200_000, interest_rate: 3 }, // 6.000
        { linked_asset_id: 'huis', current_balance: 100_000, interest_rate: 4 }, // 4.000
      ],
    )
    expect(r.hypotheekRente).toBe(10_000)
  })

  it('negeert een hypotheek die aan een ANDERE asset hangt (bv. een tweede pand)', () => {
    const r = buildEigenWoningBox1Input(
      [{ id: 'huis', woz_value: 400_000 }],
      [
        { linked_asset_id: 'huis', current_balance: 200_000, interest_rate: 3 },
        { linked_asset_id: 'ander-pand', current_balance: 500_000, interest_rate: 5 },
        { linked_asset_id: null, current_balance: 500_000, interest_rate: 5 },
      ],
    )
    expect(r.hypotheekRente).toBe(6_000)
  })

  it('rekent door NUMERIC-als-string heen (Postgres levert NUMERIC als JSON-string)', () => {
    // Zonder expliciete coercie zou `"200000" * (…)` nog werken maar
    // `Number(x) || 0`-guards en de vergelijkingen niet — dit is de klassieke
    // stille bron van een €0-aftrek.
    const r = buildEigenWoningBox1Input(
      [{ id: 'huis', woz_value: '385000' }],
      [{ linked_asset_id: 'huis', current_balance: '290000', interest_rate: '3.5' }],
    )
    expect(r.wozValue).toBe(385_000)
    expect(r.hypotheekRente).toBe(10_150)
  })
})

describe('estimateMortgageRenteJaar — de invoerkant van Box1Input.hypotheekRente', () => {
  it('rondt af op hele euro', () => {
    expect(estimateMortgageRenteJaar(290_000, 3.5)).toBe(10_150)
  })

  it('nul of negatief saldo/rente → geen aftrek (geen negatieve rente-aftrek)', () => {
    expect(estimateMortgageRenteJaar(0, 3.5)).toBe(0)
    expect(estimateMortgageRenteJaar(290_000, 0)).toBe(0)
    expect(estimateMortgageRenteJaar(-1_000, 3.5)).toBe(0)
    expect(estimateMortgageRenteJaar(null, undefined)).toBe(0)
  })
})

// ── 2. De resolutie op een nagebootste client ──────────────────────────────

type Row = Record<string, unknown>

/** Chainbare stub die `assets` en `debts` uit elkaar houdt; beide takken zijn
 *  awaitbaar op elk punt in de keten (de debts-query eindigt op `.eq()`). */
function fakeSupabase(assetRows: Row[], debtRows: Row[]): SupabaseClient {
  const make = (rows: Row[]) => {
    const result = { data: rows, error: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (
        onOk: (v: typeof result) => unknown,
        onErr?: (e: unknown) => unknown,
      ) => Promise.resolve(result).then(onOk, onErr),
    }
    return builder
  }
  return {
    from: (table: string) => make(table === 'assets' ? assetRows : debtRows),
  } as unknown as SupabaseClient
}

describe('resolveEigenWoningBox1Input — beide queries landen in dezelfde mapping', () => {
  it('koppelt de hypotheek aan de gevonden woning', async () => {
    const r = await resolveEigenWoningBox1Input(
      fakeSupabase(
        [{ id: 'huis-1', woz_value: 385_000 }],
        [{ linked_asset_id: 'huis-1', current_balance: 290_000, interest_rate: 3.5 }],
      ),
    )
    expect(r).toEqual({ wozValue: 385_000, hypotheekRente: 10_150, hasEigenWoning: true })
  })

  it('geen woning → de inerte uitkomst, ongeacht de schuldenrijen', async () => {
    const r = await resolveEigenWoningBox1Input(
      fakeSupabase([], [{ linked_asset_id: 'x', current_balance: 1, interest_rate: 1 }]),
    )
    expect(r).toEqual(GEEN_EIGEN_WONING)
  })
})

// ── 3. Waaróm het uitmaakt: de heffingsdelta die de bug zichtbaar maakte ───

describe('de ontbrekende invoer is GEEN afrondingsverschil', () => {
  const GROSS = 93_369 // de bruto uit de bevinding
  const EW = { wozValue: 385_000, hypotheekRente: 10_150 } as const

  it('dezelfde motor, dezelfde bruto, wél/niet eigen woning → materieel andere heffing', () => {
    const met = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026, ...EW })
    const zonder = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })

    // De hub liet de aftrekpost weg en stond daardoor structureel te HOOG.
    expect(zonder.tax).toBeGreaterThan(met.tax)
    expect(zonder.tax - met.tax).toBeGreaterThan(2_000)

    // En het verschil is exact het motorveld dat de eigen-woning-kaart toont —
    // niet |saldo| × een zelfgekozen tarief (ADR 0106).
    expect(zonder.tax - met.tax).toBeCloseTo(met.eigenwoningBelastingEffect, 6)
  })

  it('Wet Hillen-randgeval keert de RICHTING om (forfait > rente → bijtelling)', () => {
    // (Bijna) afgeloste hypotheek: de eigen woning kost dan per saldo belasting.
    // De hub stond daar dus te LAAG — zelfde oorzaak, andere kant op. Dit
    // randgeval was in de bevinding als ongetest gemarkeerd.
    const met = computeBox1Tax({
      grossYearlyIncome: GROSS,
      year: 2026,
      wozValue: 385_000,
      hypotheekRente: 200,
    })
    const zonder = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })

    expect(met.eigenwoningSaldo).toBeGreaterThan(0)
    expect(met.tax).toBeGreaterThan(zonder.tax)
    expect(met.eigenwoningBelastingEffect).toBeLessThan(0)
  })
})

// ── 4. BRON-GRENDEL: beide oppervlakken consumeren dezelfde resolutie ──────

const SURFACES: { label: string; path: string }[] = [
  {
    label: 'belasting-hub (loadFiscaleKansen)',
    path: join(process.cwd(), 'lib', 'tax-opportunities-loader.ts'),
  },
  {
    label: 'Box 1-subpagina',
    path: join(process.cwd(), 'app', '(app)', 'overzicht', 'belasting', 'box1', 'page.tsx'),
  },
  {
    // C8-vervolg (3-9-2026): het DERDE oppervlak. Fin kreeg zijn Box 1-heffing
    // uit een eigen invoer (bruto uit `estimateGrossYearly`, géén eigen woning)
    // en noemde daardoor een ander bedrag dan de twee schermen hierboven.
    label: 'Fin-context (buildTaxContext)',
    path: join(process.cwd(), 'lib', 'ai', 'context', 'tax-context.ts'),
  },
]

/**
 * Knipt het object-literal uit elke `computeBox1Tax({ … })`-aanroep in een
 * bron, door de accolades te balanceren. Zo toetsen we de INVOER van de
 * aanroep i.p.v. of de veldnaam ergens los in het bestand voorkomt.
 */
function box1TaxCallArgs(source: string): string[] {
  const out: string[] = []
  const needle = 'computeBox1Tax({'
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) break
    let depth = 0
    let i = start + needle.length - 1
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(source.slice(start, i + 1))
    from = i + 1
  }
  return out
}

describe('bron-grendel — geen enkel oppervlak stelt de Box 1-invoer nog zelf samen', () => {
  for (const surface of SURFACES) {
    describe(surface.label, () => {
      const source = readFileSync(surface.path, 'utf8')

      it('consumeert de gedeelde eigen-woning-resolutie', () => {
        expect(source).toContain('resolveEigenWoningBox1Input')
      })

      it('consumeert de gedeelde bruto-resolutie (de ándere helft van de invoer)', () => {
        // Bruto en eigen woning zijn samen de volledige Box 1-invoer; een
        // oppervlak dat er één van zelf afleidt levert opnieuw een eigen
        // heffing op. Fin zat vóór het C8-vervolg op `estimateGrossYearly`.
        expect(source).toContain('resolveBox1GrossIncome')
        // De AANROEP, niet de naam: een oppervlak mag in commentaar best
        // uitleggen waar het vandaan komt — het mag hem alleen niet gebruiken.
        expect(source).not.toContain('estimateGrossYearly(')
        expect(source).not.toMatch(/import .*estimateGrossYearly/)
      })

      it('geeft WOZ én hypotheekrente mee aan élke computeBox1Tax-aanroep', () => {
        const calls = box1TaxCallArgs(source)
        expect(calls.length).toBeGreaterThan(0)
        for (const call of calls) {
          expect(call).toContain('wozValue:')
          expect(call).toContain('hypotheekRente:')
        }
      })

      it('doet de eigen_huis-lookup NIET zelf (dat was de tweede waarheid)', () => {
        expect(source).not.toContain("'eigen_huis'")
        expect(source).not.toContain('woz_value')
      })
    })
  }
})
