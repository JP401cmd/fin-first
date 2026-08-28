import { describe, it, expect } from 'vitest'
import {
  dailyExpenseRate,
  calculateFreedomTime,
  carryFreedomUnits,
  formatFreedomTimeString,
  formatWithFreedom,
  formatTimestamp,
  roundCents,
  roundEuro,
  roundTenths,
  roundToDecimals,
  roundToSignificant,
  formatApproxCurrency,
  formatMaskedApproxCurrency,
  formatFreedomRateFootnote,
  formatCurrency,
  APPROX_PREFIX,
  MASKED_AMOUNT_PLACEHOLDER,
  maskCurrencyInText,
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

describe('formatTimestamp — tijdzone-deterministisch (React #418 hydration-mismatch)', () => {
  // Productiebug: 41 × "Minified React error #418" (hydration-mismatch op TEKST)
  // op /overzicht, over 4 gebruikers. Bron: de dateline "Bijgewerkt {…}" in
  // components/overview/briefing-panel.tsx, die formatTimestamp aanroept.
  //
  // formatTimestamp las de datumdelen met LOKALE getters (getHours/getDate/…).
  // De server draait op Vercel in UTC, de browser in Europe/Amsterdam — dus
  // rende de server "Bijgewerkt 08:00" en de client "Bijgewerkt 10:00".
  //
  // De invariant die deze suite bewaakt: de uitkomst hangt UITSLUITEND van het
  // moment af, niet van de tijdzone van de runtime. Server-render en eerste
  // client-render leveren daardoor per definitie dezelfde tekst.
  //
  // Zelfde TZ-projectregel als lib/overview/greeting.ts (de eerder gefixte
  // #418 op dezelfde pagina): uur- en daggrenzen in Europe/Amsterdam bepalen,
  // nooit uit een UTC-afknip.

  /** Draait `fn` alsof de runtime in tijdzone `tz` staat (Node herleest TZ per Date-operatie). */
  function withTZ<T>(tz: string, fn: () => T): T {
    const prev = process.env.TZ
    process.env.TZ = tz
    try {
      return fn()
    } finally {
      process.env.TZ = prev
    }
  }

  it('geeft dezelfde tekst op een UTC-server als in een Europe/Amsterdam-browser', () => {
    const refreshedAt = '2026-08-04T08:00:00.000Z'
    const now = new Date('2026-08-04T12:00:00.000Z')

    const serverText = withTZ('UTC', () => formatTimestamp(refreshedAt, now))
    const clientText = withTZ('Europe/Amsterdam', () => formatTimestamp(refreshedAt, now))

    expect(clientText).toBe(serverText)
    // En wel de Amsterdamse wandkloktijd (CEST = UTC+2), niet de UTC-tijd.
    expect(serverText).toBe('10:00')
  })

  it('kiest dezelfde dag-tak rond de Amsterdamse middernacht (server vs. client)', () => {
    // 22:30Z op 4 aug = 00:30 Amsterdam op 5 aug. In UTC valt dit op een ANDERE
    // kalenderdag dan de referentie, in Amsterdam op dezelfde → de buggy versie
    // koos server-side de "dag + tijd"-tak ("di 22:30") en client-side de
    // "vandaag"-tak ("00:30"): een maximaal zichtbare tekst-mismatch.
    const refreshedAt = '2026-08-04T22:30:00.000Z'
    const now = new Date('2026-08-05T09:00:00.000Z')

    const serverText = withTZ('UTC', () => formatTimestamp(refreshedAt, now))
    const clientText = withTZ('Europe/Amsterdam', () => formatTimestamp(refreshedAt, now))

    expect(clientText).toBe(serverText)
    expect(serverText).toBe('00:30')
  })

  it('formatteert de oudere takken (dag / maand / jaar) ook tijdzone-onafhankelijk', () => {
    const now = new Date('2026-08-05T09:00:00.000Z')
    // Ruim een week terug, zelfde jaar → "d MMM" in Amsterdamse kalender.
    const older = '2026-07-20T23:30:00.000Z' // = 21 juli 01:30 Amsterdam
    const vorigJaar = '2025-12-31T23:30:00.000Z' // = 1 jan 2026 00:30 Amsterdam

    expect(withTZ('UTC', () => formatTimestamp(older, now))).toBe(
      withTZ('Europe/Amsterdam', () => formatTimestamp(older, now)),
    )
    expect(withTZ('Europe/Amsterdam', () => formatTimestamp(older, now))).toBe('21 jul')

    // Valt in Amsterdam al in 2026 (= het jaar van `now`), dus zonder jaarsuffix.
    expect(withTZ('UTC', () => formatTimestamp(vorigJaar, now))).toBe(
      withTZ('Europe/Amsterdam', () => formatTimestamp(vorigJaar, now)),
    )
    expect(withTZ('Europe/Amsterdam', () => formatTimestamp(vorigJaar, now))).toBe('1 jan')
  })

  it('gebruikt de Amsterdamse weekdag-afkorting voor de "deze week"-tak', () => {
    // 2026-08-01T23:30Z = zondag 2 aug 01:30 Amsterdam (zaterdag in UTC).
    const refreshedAt = '2026-08-01T23:30:00.000Z'
    const now = new Date('2026-08-05T09:00:00.000Z')

    expect(withTZ('UTC', () => formatTimestamp(refreshedAt, now))).toBe(
      withTZ('Europe/Amsterdam', () => formatTimestamp(refreshedAt, now)),
    )
    expect(withTZ('Europe/Amsterdam', () => formatTimestamp(refreshedAt, now))).toBe('zo 01:30')
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

// ── H3 / M37 — twaalf maanden rollen door naar een jaar ────────────────
//
// `remainingAfterYears` loopt tot net onder 365 dagen, terwijl twaalf maanden in
// deze decompositie maar 12 × 30 = 360 dagen beslaan. In dat venster van bijna
// vijf dagen (~1,4% van elk jaar, terugkerend bij ELKE jaargrens) kwam de
// maandteller op 12 uit: "10 jaar en 12 maanden" — een hoeveelheid tijd die niet
// bestaat, op het merkgetal van de app.
describe('calculateFreedomTime — jaar/maand-carry (H3/M37)', () => {
  it('exacte repro H3: 4014 dagen is 11 jaar, niet 10 jaar en 12 maanden', () => {
    const bd = calculateFreedomTime(4014, 1)
    expect(bd.years).toBe(11)
    expect(bd.months).toBe(0)
    expect(formatFreedomTimeString(bd, 'long')).toBe('11 jaar')
  })

  it('exacte repro M37: €401.000 bij €100/dag is 11 jaar', () => {
    const bd = calculateFreedomTime(401000, 100)
    expect(bd.years).toBe(11)
    expect(bd.months).toBe(0)
    expect(formatFreedomTimeString(bd, 'long')).toBe('11 jaar')
    expect(formatFreedomTimeString(bd, 'short')).toBe('11j')
  })

  it('eerste-jaar-randgeval: 362 dagen is "1 jaar", niet "12 maanden"', () => {
    const bd = calculateFreedomTime(362, 1)
    expect(bd.years).toBe(1)
    expect(bd.months).toBe(0)
    expect(formatFreedomTimeString(bd, 'long')).toBe('1 jaar')
  })

  it('grenssweep 355–370 restdagen: de maandteller haalt nooit 12', () => {
    for (let rest = 355; rest <= 370; rest++) {
      const bd = calculateFreedomTime(10 * 365 + rest, 1)
      expect(bd.months).toBeLessThan(12)
      expect(formatFreedomTimeString(bd, 'long')).not.toContain('12 maanden')
    }
    // De carry pakt precies waar hij hoort: 359 rest → nog 11 maanden, 360 → jaar.
    expect(calculateFreedomTime(10 * 365 + 359, 1).months).toBe(11)
    expect(calculateFreedomTime(10 * 365 + 360, 1)).toMatchObject({ years: 11, months: 0 })
  })

  it('invariant over 20 jaar aan dagtotalen: months blijft 0..11', () => {
    for (let d = 0; d <= 7300; d++) {
      const bd = calculateFreedomTime(d, 1)
      expect(bd.months).toBeGreaterThanOrEqual(0)
      expect(bd.months).toBeLessThanOrEqual(11)
    }
  })

  it('tekort (negatief bedrag) draagt net zo goed over — zelfde decompositie', () => {
    const bd = calculateFreedomTime(-4014, 1)
    expect(bd.isDeficit).toBe(true)
    expect(bd).toMatchObject({ years: 11, months: 0 })
    expect(formatWithFreedom(-4014, 1, { includeCurrency: false })).toBe('11 jaar achter')
  })

  it('totalDays blijft de onafgeronde waarheid — alleen de weergave rondt op', () => {
    const bd = calculateFreedomTime(4014, 1)
    expect(bd.totalDays).toBe(4014)
    // De carry verklaart de restdagen tot een vol jaar; ze mogen niet nóg eens
    // los meetellen (11 × 365 + 4 = 4019 zou het totaal overschrijden).
    expect(bd.days).toBe(0)
  })

  it('raakt de gewone gevallen niet: geen carry, geen wijziging', () => {
    expect(calculateFreedomTime(4000, 1)).toMatchObject({ years: 10, months: 11, days: 20 })
    expect(formatFreedomTimeString(calculateFreedomTime(9000, 100), 'long')).toBe('3 maanden')
    expect(formatFreedomTimeString(calculateFreedomTime(2800, 100), 'long')).toBe('28 dagen')
  })
})

describe('carryFreedomUnits — gedeelde carry-regel', () => {
  it('laat een decompositie onder de twaalf maanden ongemoeid', () => {
    expect(carryFreedomUnits(10, 11, 20)).toEqual({ years: 10, months: 11, days: 20 })
    expect(carryFreedomUnits(0, 0, 5)).toEqual({ years: 0, months: 0, days: 5 })
  })

  it('rolt twaalf maanden door naar een jaar en nult de restdagen', () => {
    expect(carryFreedomUnits(10, 12, 4)).toEqual({ years: 11, months: 0, days: 0 })
    expect(carryFreedomUnits(0, 12, 0)).toEqual({ years: 1, months: 0, days: 0 })
  })

  it('dekt de AI-context-optelling: 11 maanden + een afgeronde restmaand', () => {
    // lib/ai/context/{tax,aandachtspunten}-context.ts tellen zelf een maand op bij
    // ≥15 restdagen en kunnen zo op 12 uitkomen met een correcte breakdown.
    const bd = calculateFreedomTime(10 * 365 + 350, 1) // 11 maanden + 20 restdagen
    expect(bd.months).toBe(11)
    expect(bd.days).toBeGreaterThanOrEqual(15)
    expect(carryFreedomUnits(bd.years, bd.months + 1, 0)).toEqual({ years: 11, months: 0, days: 0 })
  })
})

// ── M5: eerlijke precisie op prognose-kopgetallen ─────────────────────────
describe('roundToSignificant — afronding achter een prognose-kopgetal', () => {
  it('rondt af op twee significante cijfers (de gemelde bedragen)', () => {
    // De letterlijke getallen uit bevinding M5.
    expect(roundToSignificant(887_689)).toBe(890_000)
    expect(roundToSignificant(676_698)).toBe(680_000)
    expect(roundToSignificant(391_910)).toBe(390_000)
  })

  it('laat een bedrag dat al op twee cijfers staat ongemoeid', () => {
    expect(roundToSignificant(45_000)).toBe(45_000)
    expect(roundToSignificant(950)).toBe(950)
  })

  it('respecteert een afwijkend aantal cijfers', () => {
    expect(roundToSignificant(887_689, 3)).toBe(888_000)
    expect(roundToSignificant(887_689, 1)).toBe(900_000)
  })

  it('valt onder de afrondingsdrempel terug op hele euro’s', () => {
    // Verder afronden zou kleine bedragen onherkenbaar maken, niet eerlijker.
    expect(roundToSignificant(95)).toBe(95)
    expect(roundToSignificant(12.4)).toBe(12)
  })

  it('is symmetrisch in het teken en veilig bij niet-eindige invoer', () => {
    expect(roundToSignificant(-676_698)).toBe(-680_000)
    expect(roundToSignificant(0)).toBe(0)
    expect(roundToSignificant(NaN)).toBe(0)
    expect(roundToSignificant(Infinity)).toBe(0)
  })
})

describe('formatApproxCurrency — kopgetal mét voorbehoud', () => {
  it('zet "ca." vóór het afgeronde bedrag', () => {
    expect(formatApproxCurrency(676_698)).toBe(`${APPROX_PREFIX}${formatCurrency(680_000)}`)
    expect(formatApproxCurrency(887_689)).toBe(`${APPROX_PREFIX}${formatCurrency(890_000)}`)
  })

  it('gebruikt een harde spatie, zodat "ca." nooit alleen op een regel valt', () => {
    expect(APPROX_PREFIX).toBe('ca.\u00a0')
  })

  it('maskeert zonder voorbehoud — bullets zijn geen bedrag om te benaderen', () => {
    expect(formatMaskedApproxCurrency(676_698, true)).toBe(MASKED_AMOUNT_PLACEHOLDER)
    expect(formatMaskedApproxCurrency(676_698, false)).toBe(formatApproxCurrency(676_698))
    expect(formatMaskedApproxCurrency(null, false)).toBe(formatApproxCurrency(0))
  })
})

describe('formatFreedomRateFootnote', () => {
  it('benoemt het tarief en zijn grondslag', () => {
    const s = formatFreedomRateFootnote(124, 'transactions', false)
    expect(s).toContain(formatCurrency(124))
    expect(s).toContain('afgelopen 12 maanden')
  })

  it('markeert een profielschatting als schatting', () => {
    expect(formatFreedomRateFootnote(80, 'estimate', false)).toContain('schatting')
  })

  it('zwijgt zonder eerlijke dagbasis', () => {
    expect(formatFreedomRateFootnote(0, 'transactions', false)).toBeNull()
    expect(formatFreedomRateFootnote(100, 'none', false)).toBeNull()
  })

  // ADR 0091 laag 4: het dagtarief is de wisselkoers waarmee "N vrijheidsdagen"
  // terugrekent naar het gemaskeerde bedrag (bedrag = dagen x tarief). De
  // maskering woont in deze functie, niet bij de vier call-sites, zodat een
  // vergeten gate het lek niet opnieuw kan openen.
  it('verdwijnt volledig in privacymodus — ook de "short"-vorm', () => {
    expect(formatFreedomRateFootnote(124, 'transactions', true)).toBeNull()
    expect(formatFreedomRateFootnote(124, 'estimate', true)).toBeNull()
    expect(formatFreedomRateFootnote(124, 'transactions', true, 'short')).toBeNull()
  })

  it('lekt het bedrag ook niet via de korte vorm wanneer zichtbaar', () => {
    expect(formatFreedomRateFootnote(124, 'transactions', false, 'short')).toContain('/dag')
  })
})

describe('maskCurrencyInText (S4)', () => {
  it('laat de tekst ongemoeid wanneer masking uit staat', () => {
    expect(maskCurrencyInText('€ 1.056/mnd', false)).toBe('€ 1.056/mnd')
  })

  it('maskeert het bedrag maar behoudt de eenheid en de rest van de zin', () => {
    const masked = maskCurrencyInText(`${formatCurrency(1056)}/mnd`, true)
    expect(masked).toBe(`${MASKED_AMOUNT_PLACEHOLDER}/mnd`)
    expect(masked).not.toContain('1.056')
  })

  it('dekt het signed()-patroon van de cashflow-kaarten (+€ / -€)', () => {
    expect(maskCurrencyInText(`+${formatCurrency(1100)}`, true)).toBe(
      MASKED_AMOUNT_PLACEHOLDER,
    )
    expect(maskCurrencyInText(formatCurrency(-340), true)).toBe(
      MASKED_AMOUNT_PLACEHOLDER,
    )
  })

  it('maskeert élk bedrag in een samengestelde zin', () => {
    const tip = `Inkomen ${formatCurrency(4200)} · uitgaven ${formatCurrency(3100)}.`
    const masked = maskCurrencyInText(tip, true)
    expect(masked).toBe(
      `Inkomen ${MASKED_AMOUNT_PLACEHOLDER} · uitgaven ${MASKED_AMOUNT_PLACEHOLDER}.`,
    )
  })

  it('laat percentages, aantallen en venster-labels staan — dat zijn geen bedragen', () => {
    expect(maskCurrencyInText('33% van inkomen', true)).toBe('33% van inkomen')
    expect(maskCurrencyInText('12 terugkerende posten.', true)).toBe(
      '12 terugkerende posten.',
    )
    expect(maskCurrencyInText('in augustus tot nu toe', true)).toBe(
      'in augustus tot nu toe',
    )
  })

  it('geeft null/undefined ongewijzigd terug', () => {
    expect(maskCurrencyInText(null, true)).toBeNull()
    expect(maskCurrencyInText(undefined, true)).toBeUndefined()
  })
})
