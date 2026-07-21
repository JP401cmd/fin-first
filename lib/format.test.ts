import { describe, it, expect } from 'vitest'
import {
  dailyExpenseRate,
  calculateFreedomTime,
  formatFreedomTimeString,
  formatWithFreedom,
  roundCents,
  roundEuro,
  roundTenths,
  roundToDecimals,
  CENT_EPSILON,
} from './format'

describe('dailyExpenseRate — canonieke dagtarief-conversie', () => {
  it('rekent maanduitgaven × 12 / 365 (jaar/365-grondslag)', () => {
    // €3000/maand → €36.000/jaar → /365 = €98,63/dag
    expect(dailyExpenseRate(3000)).toBeCloseTo((3000 * 12) / 365, 10)
    expect(dailyExpenseRate(3000)).toBeCloseTo(98.6301, 3)
  })

  it('wijkt bewust af van de oude /30-basis (= jaar/360, ~1,4% té laag)', () => {
    const monthly = 3000
    const canonical = dailyExpenseRate(monthly) // €98,63/dag
    const oude30 = monthly / 30 // €100/dag (impliciet 360-dagenjaar)
    expect(canonical).toBeLessThan(oude30)
    // 365/360 − 1 ≈ 1,389% afwijking
    expect(oude30 / canonical - 1).toBeCloseTo(365 / 360 - 1, 6)
  })

  it('is gelijk aan jaaruitgaven / 365 (consistent met calculateFreedomTime-input)', () => {
    const monthly = 2500
    const yearly = monthly * 12
    expect(dailyExpenseRate(monthly)).toBeCloseTo(yearly / 365, 10)
  })

  it('geeft 0 voor niet-positieve of niet-eindige input', () => {
    expect(dailyExpenseRate(0)).toBe(0)
    expect(dailyExpenseRate(-100)).toBe(0)
    expect(dailyExpenseRate(NaN)).toBe(0)
    expect(dailyExpenseRate(Infinity)).toBe(0)
    // @ts-expect-error — runtime-safety voor undefined
    expect(dailyExpenseRate(undefined)).toBe(0)
  })

  it('voedt calculateFreedomTime zodat een maand vermogen ~30 vrijheidsdagen geeft', () => {
    // Vermogen = één maand uitgaven → ~30,4 dagen (jaar/365 ÷ 12 maanden)
    const monthly = 3000
    const rate = dailyExpenseRate(monthly)
    const bd = calculateFreedomTime(monthly, rate)
    // 3000 / 98,63 = 30,42 dagen → net over de 30-dagen-maandgrens
    expect(bd.totalDays).toBeCloseTo(30.4, 1)
    expect(formatFreedomTimeString(bd)).toBe('1 maand')
  })
})

describe('formatFreedomTimeString — includeDays:false liegt niet met "0 dagen" (sub-maand)', () => {
  // BUG: de tekort-lening-banner op /toekomst gaf `includeDays: false` mee. Bij een
  // POSITIEVE piek die minder dan één maand vrijheid vertegenwoordigt (bv. €3.342 ≈
  // 30 dagen) bleef `parts` leeg en viel de functie terug op "0 dagen" — een leugen,
  // want een positief bedrag = altijd > 0 dagen. `includeDays` mag alleen sub-maand-
  // dagen weglaten als er ánders óók een eenheid overblijft; hier zijn dagen de enige.
  it('long: 28 dagen met includeDays=false → "28 dagen" (niet "0 dagen")', () => {
    const bd = calculateFreedomTime(2800, 100) // 28 dagen exact
    expect(bd).toMatchObject({ years: 0, months: 0, days: 28 })
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('28 dagen')
  })

  it('short: 28 dagen met includeDays=false → "28d" (niet "0d")', () => {
    const bd = calculateFreedomTime(2800, 100)
    expect(formatFreedomTimeString(bd, 'short', false)).toBe('28d')
  })

  it('long: 1 dag met includeDays=false → "1 dag" (enkelvoud, niet "0 dagen")', () => {
    const bd = calculateFreedomTime(100, 100) // 1 dag
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('1 dag')
  })

  it('echt nul blijft "0 dagen" (0 euro = 0 dagen, geen regressie)', () => {
    const bd = calculateFreedomTime(0, 100)
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('0 dagen')
    expect(formatFreedomTimeString(bd, 'short', false)).toBe('0d')
  })

  it('≥1 maand blijft ongewijzigd door includeDays=false (dagen sowieso onderdrukt)', () => {
    const bd = calculateFreedomTime(9000, 100) // 90 dagen → 3 maanden
    expect(formatFreedomTimeString(bd, 'long', false)).toBe('3 maanden')
  })
})

describe('formatWithFreedom — deficit-loan-banner scenario (includeDays:false)', () => {
  // Reproduceert de gemelde banner: piek €3.342, includeCurrency:false, includeDays:false.
  // Vóór de fix: "0 dagen". Ná de fix: het werkelijke aantal dagen vrijheid.
  it('positieve sub-maand-piek → dagen i.p.v. "0 dagen"', () => {
    // dagtarief zo gekozen dat €3.342 < 1 maand vrijheid is (dRate €120/dag → 27,85 dagen)
    const out = formatWithFreedom(3342, 120, {
      includeCurrency: false,
      format: 'long',
      includeDays: false,
    })
    expect(out).not.toBe('0 dagen')
    expect(out).toMatch(/dag/)
  })
})

// ── Centrale afrondingshelpers ([Arch F4]) ────────────────────────────

describe('roundCents — hele centen (2 decimalen)', () => {
  it('rondt normale bedragen op 2 decimalen', () => {
    expect(roundCents(1.234)).toBe(1.23)
    expect(roundCents(1.236)).toBe(1.24)
    expect(roundCents(100)).toBe(100)
    expect(roundCents(0)).toBe(0)
  })

  it('behandelt negatieve bedragen (Math.round rondt half naar +∞)', () => {
    expect(roundCents(-1.234)).toBe(-1.23)
    expect(roundCents(-1.236)).toBe(-1.24)
  })

  it('.5-cent-randgevallen: spiegelt exact het vervangen idioom Math.round(x*100)/100', () => {
    for (const v of [0.005, 1.255, 35.855, -0.5, 2.675, 8.575, 0.615]) {
      expect(roundCents(v)).toBe(Math.round(v * 100) / 100)
    }
  })

  it('niet-eindige/undefined input → 0 (safeNumber-guard, geen NaN-lek)', () => {
    expect(roundCents(NaN)).toBe(0)
    expect(roundCents(Infinity)).toBe(0)
    expect(roundCents(-Infinity)).toBe(0)
    // @ts-expect-error — runtime-safety voor undefined
    expect(roundCents(undefined)).toBe(0)
  })
})

describe('roundEuro — hele euro’s (0 decimalen)', () => {
  it('rondt op hele euro’s (half naar +∞)', () => {
    expect(roundEuro(1.49)).toBe(1)
    expect(roundEuro(1.5)).toBe(2)
    expect(roundEuro(2.5)).toBe(3)
    expect(roundEuro(-1.5)).toBe(-1)
  })

  it('.5-randgeval spiegelt Math.round exact (incl. -0 via Object.is)', () => {
    for (const v of [0.5, -0.5, 35.855, -2.5]) {
      expect(roundEuro(v)).toBe(Math.round(v))
    }
  })

  it('niet-eindige/undefined input → 0', () => {
    expect(roundEuro(NaN)).toBe(0)
    expect(roundEuro(Infinity)).toBe(0)
    // @ts-expect-error — runtime-safety voor undefined
    expect(roundEuro(undefined)).toBe(0)
  })
})

describe('roundTenths — tienden (1 decimaal)', () => {
  it('rondt op 1 decimaal', () => {
    expect(roundTenths(1.24)).toBe(1.2)
    expect(roundTenths(1.25)).toBe(1.3)
    expect(roundTenths(0)).toBe(0)
  })

  it('spiegelt exact het vervangen idioom Math.round(x*10)/10', () => {
    for (const v of [1.25, 98.63, 0.05, -0.05, 30.45]) {
      expect(roundTenths(v)).toBe(Math.round(v * 10) / 10)
    }
  })

  it('niet-eindige input → 0', () => {
    expect(roundTenths(NaN)).toBe(0)
    expect(roundTenths(Infinity)).toBe(0)
  })
})

describe('roundToDecimals — variabel aantal decimalen', () => {
  it('rondt op het gevraagde aantal decimalen', () => {
    expect(roundToDecimals(1.23456, 3)).toBe(1.235)
    expect(roundToDecimals(1.23456, 2)).toBe(roundCents(1.23456))
    expect(roundToDecimals(12.34, 1)).toBe(roundTenths(12.34))
  })

  it('niet-positief/niet-eindig aantal decimalen → 0 decimalen (hele getallen)', () => {
    expect(roundToDecimals(1.5, 0)).toBe(2)
    expect(roundToDecimals(1.5, -1)).toBe(2)
    expect(roundToDecimals(1.5, NaN)).toBe(2)
  })

  it('niet-eindige waarde → 0', () => {
    expect(roundToDecimals(NaN, 2)).toBe(0)
    expect(roundToDecimals(Infinity, 2)).toBe(0)
  })
})

describe('afronders spiegelen de vervangen lokale helpers exact (gedragsbehoud)', () => {
  // De oude lokale round2 (vaste-lasten-insights/-summary, schuld-checks, debt-data
  // inline) = Math.round(n*100)/100 → roundCents is byte-identiek voor eindige input.
  const oldRound2 = (n: number) => Math.round(n * 100) / 100
  // De oude round0 in lib/check/build-report.ts = Math.round met finite-guard.
  const oldRound0 = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0)

  it('roundCents ≡ oude round2 over een realistische bedragen-set', () => {
    for (const n of [0, 12.5, 249.999, 750.005, -60.006, 14200.42, 3.8, 0.46]) {
      expect(roundCents(n)).toBe(oldRound2(n))
    }
  })

  it('roundEuro ≡ oude round0 (incl. finite-guard: NaN/∞ → 0)', () => {
    for (const n of [0, 1.4, 1.6, -2.5, 450000.49, NaN, Infinity]) {
      expect(roundEuro(n)).toBe(oldRound0(n))
    }
  })
})

describe('CENT_EPSILON — halve-cent-drempel', () => {
  it('is een halve cent', () => {
    expect(CENT_EPSILON).toBe(0.005)
  })

  it('twee bedragen binnen een halve cent gelden als gelijk, daarbuiten niet', () => {
    expect(Math.abs(1.234 - 1.2345) < CENT_EPSILON).toBe(true)
    expect(Math.abs(1.234 - 1.24) < CENT_EPSILON).toBe(false)
  })
})

describe('Slice 2 characterization — idioom B → A (holdings/dividends-routes)', () => {
  // De gemigreerde routes gingen van parseFloat(x.toFixed(2)) (idioom B) naar
  // roundCents (idioom A). Deze twee idiomen zijn NIET altijd gelijk: op halve-
  // cent-FP-randen (bv. 0.615, 249.005) rondt idioom A naar boven en idioom B —
  // dat op de string-representatie rondt — naar beneden. TriFinity kiest hier
  // BEWUST idioom A als canoniek ([Arch F4] + de F2-lint die idioom B verbiedt).
  // Deze test pint die keuze en bewijst dat de afwijking begrensd is (≤ 1 cent),
  // zodat een grondslag nooit ongemerkt méér dan één cent verschuift.
  const idiomB = (v: number) => parseFloat(v.toFixed(2))

  it('idioom A en B verschillen alleen op FP-randen, en dan hooguit één cent', () => {
    let maxDelta = 0
    let sawDivergence = false
    for (let i = 0; i < 500000; i++) {
      const v = i / 10000 // 0 .. 50, stap 0.0001
      const delta = Math.abs(roundCents(v) - idiomB(v))
      if (delta > 0) sawDivergence = true
      if (delta > maxDelta) maxDelta = delta
    }
    expect(maxDelta).toBeLessThanOrEqual(0.01 + 1e-9)
    // Ze verschillen daadwerkelijk — dát is waarom één canoniek idioom nodig was.
    expect(sawDivergence).toBe(true)
  })

  it('canonieke keuze vastgepind: idioom A (roundCents) op de bekende halve-cent-randen', () => {
    // Idioom A rondt naar boven; idioom B (string-toFixed) naar beneden.
    expect(roundCents(0.615)).toBe(0.62)
    expect(idiomB(0.615)).toBe(0.61)
    expect(roundCents(249.005)).toBe(249.01)
    expect(idiomB(249.005)).toBe(249)
    expect(roundCents(2.675)).toBe(2.68)
    expect(idiomB(2.675)).toBe(2.67)
  })

  it('op niet-rand-bedragen (het gros van de route-waarden) zijn beide idiomen identiek', () => {
    for (const v of [12.34, 105.9, 1000, 3.8, 14200.42, 9592.59, 250.0, 1234.56]) {
      expect(roundCents(v)).toBe(idiomB(v))
    }
  })
})
