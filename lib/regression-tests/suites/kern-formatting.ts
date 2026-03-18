import { registerTests } from '../test-registry'
import { assertEqual, assert, assertFinite } from '../assert'
import type { TestCase } from '../test-types'
import {
  formatCurrency, formatCurrencyDecimals,
  calculateFreedomTime, formatFreedomTimeString,
} from '@/lib/format'

const CAT = 'kern-formatting'

const tests: TestCase[] = [
  // ── formatCurrency ────────────────────────────────────────────────────
  {
    id: 'fmt-cur-positive', name: 'formatCurrency: positief bedrag', category: CAT,
    description: 'Positieve bedragen correct geformateerd in nl-NL EUR',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrency(1234)
      assert(r.includes('1.234'), `bevat 1.234: ${r}`)
      assert(r.includes('€'), `bevat €: ${r}`)
    },
  },
  {
    id: 'fmt-cur-negative', name: 'formatCurrency: negatief bedrag', category: CAT,
    description: 'Negatieve bedragen tonen minteken',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrency(-5000)
      assert(r.includes('5.000'), `bevat 5.000: ${r}`)
      // Should contain a negative indicator (minus sign or accounting format)
      assert(r.includes('-') || r.includes('−'), `negatief indicator: ${r}`)
    },
  },
  {
    id: 'fmt-cur-zero', name: 'formatCurrency: nul', category: CAT,
    description: 'Nul correct weergegeven',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrency(0)
      assert(r.includes('€'), `bevat €: ${r}`)
      assert(r.includes('0'), `bevat 0: ${r}`)
    },
  },
  {
    id: 'fmt-cur-large', name: 'formatCurrency: zeer groot getal (>1M)', category: CAT,
    description: 'Grote bedragen correct geformateerd met punten',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrency(1_500_000)
      assert(r.includes('1.500.000'), `bevat 1.500.000: ${r}`)
    },
  },
  {
    id: 'fmt-cur-nan', name: 'formatCurrency: NaN input', category: CAT,
    description: 'NaN wordt behandeld als 0 (geen crash)',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrency(NaN)
      assert(r.includes('€'), `bevat €: ${r}`)
      assert(r.includes('0'), `NaN → 0: ${r}`)
    },
  },
  {
    id: 'fmt-cur-infinity', name: 'formatCurrency: Infinity input', category: CAT,
    description: 'Infinity wordt behandeld als 0 (geen crash)',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrency(Infinity)
      assert(r.includes('0'), `Infinity → 0: ${r}`)
      const rNeg = formatCurrency(-Infinity)
      assert(rNeg.includes('0'), `-Infinity → 0: ${rNeg}`)
    },
  },
  {
    id: 'fmt-cur-undefined', name: 'formatCurrency: undefined input', category: CAT,
    description: 'undefined wordt behandeld als 0 (geen crash)',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = formatCurrency(undefined as any)
      assert(r.includes('€'), `bevat €: ${r}`)
      assert(r.includes('0'), `undefined → 0: ${r}`)
    },
  },

  // ── formatCurrencyDecimals ────────────────────────────────────────────
  {
    id: 'fmt-dec-correct', name: 'formatCurrencyDecimals: correcte decimalen', category: CAT,
    description: 'Toont altijd 2 decimalen',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrencyDecimals(1234.5)
      assert(r.includes('€'), `bevat €: ${r}`)
      // nl-NL uses comma as decimal separator
      assert(r.includes('1.234,50') || r.includes('1234,50'), `decimalen: ${r}`)
    },
  },
  {
    id: 'fmt-dec-rounding', name: 'formatCurrencyDecimals: afronding', category: CAT,
    description: 'Correcte afronding op 2 decimalen',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrencyDecimals(99.999)
      // 99.999 → 100,00
      assert(r.includes('100,00'), `afgerond: ${r}`)

      const r2 = formatCurrencyDecimals(10.004)
      assert(r2.includes('10,00'), `naar beneden: ${r2}`)
    },
  },
  {
    id: 'fmt-dec-nan', name: 'formatCurrencyDecimals: NaN/undefined safe', category: CAT,
    description: 'Onveilige inputs worden 0,00',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = formatCurrencyDecimals(NaN)
      assert(r.includes('0,00'), `NaN → 0,00: ${r}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r2 = formatCurrencyDecimals(undefined as any)
      assert(r2.includes('0,00'), `undefined → 0,00: ${r2}`)
    },
  },

  // ── calculateFreedomTime ──────────────────────────────────────────────
  {
    id: 'fmt-ft-basic', name: 'calculateFreedomTime: basis berekening', category: CAT,
    description: 'Correcte breakdown bij normale input',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      // 365_000 / 100 = 3650 dagen = 10 jaar exact
      const b = calculateFreedomTime(365_000, 100)
      assertEqual(b.years, 10, '10 jaar')
      assertEqual(b.isDeficit, false, 'geen deficit')
      assertEqual(b.isInfinite, false, 'niet oneindig')
      assertFinite(b.totalDays, 'finite totalDays')
    },
  },
  {
    id: 'fmt-ft-partial', name: 'calculateFreedomTime: gedeeltelijk jaar', category: CAT,
    description: 'Correcte maanden en dagen bij onvolledig jaar',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // 50_000 / 100 = 500 dagen = 1 jaar (365d) + 135 dagen = 1j + 4m (120d) + 15d
      const b = calculateFreedomTime(50_000, 100)
      assertEqual(b.years, 1, '1 jaar')
      assert(b.months > 0, 'heeft maanden')
      assert(b.days >= 0, 'heeft dagen')
    },
  },
  {
    id: 'fmt-ft-zero-expenses', name: 'calculateFreedomTime: nul daguitgaven', category: CAT,
    description: 'Nul uitgaven met bedrag → isInfinite',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const b = calculateFreedomTime(100_000, 0)
      assertEqual(b.isInfinite, true, 'oneindig vrijheid')
      assertEqual(b.years, 0, 'geen jaren (oneindig)')
    },
  },
  {
    id: 'fmt-ft-negative', name: 'calculateFreedomTime: negatief bedrag', category: CAT,
    description: 'Negatief bedrag → isDeficit=true, absolute waarde voor berekening',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const b = calculateFreedomTime(-36_500, 100)
      assertEqual(b.isDeficit, true, 'is deficit')
      assertEqual(b.years, 1, '1 jaar (absoluut)')
      assertEqual(b.isInfinite, false, 'niet oneindig')
    },
  },
  {
    id: 'fmt-ft-nan', name: 'calculateFreedomTime: NaN/Infinity inputs', category: CAT,
    description: 'Onveilige inputs crashen niet',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const b1 = calculateFreedomTime(NaN, 100)
      assertEqual(b1.years, 0, 'NaN → 0 jaar')
      assertEqual(b1.totalDays, 0, 'NaN → 0 dagen')

      const b2 = calculateFreedomTime(100_000, NaN)
      assertEqual(b2.isInfinite, true, 'NaN expenses → infinite')

      const b3 = calculateFreedomTime(Infinity, 100)
      assertEqual(b3.years, 0, 'Infinity → safe 0')
    },
  },
  {
    id: 'fmt-ft-zero-both', name: 'calculateFreedomTime: beide nul', category: CAT,
    description: 'Nul bedrag + nul uitgaven',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const b = calculateFreedomTime(0, 0)
      assertEqual(b.years, 0, '0 jaar')
      assertEqual(b.months, 0, '0 maanden')
      assertEqual(b.days, 0, '0 dagen')
      assertEqual(b.isDeficit, false, 'geen deficit')
      // 0 amount with 0 expenses → isInfinite = false (amount is 0)
      assertEqual(b.isInfinite, false, 'niet oneindig (bedrag=0)')
    },
  },

  // ── formatFreedomTimeString ───────────────────────────────────────────
  {
    id: 'fmt-fts-long-plural', name: 'formatFreedomTimeString: meervoud (long)', category: CAT,
    description: 'Correcte Nederlandse meervoudsvormen',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      // "jaar" is always "jaar" in Dutch (no plural change)
      // "maand" → "maanden" (plural)
      const b2m = { years: 2, months: 3, days: 0, totalDays: 820, isDeficit: false, isInfinite: false }
      const r = formatFreedomTimeString(b2m, 'long')
      assert(r.includes('2 jaar'), `2 jaar: ${r}`)
      assert(r.includes('3 maanden'), `3 maanden: ${r}`)
      assert(r.includes(' en '), `bevat "en": ${r}`)
    },
  },
  {
    id: 'fmt-fts-long-singular', name: 'formatFreedomTimeString: enkelvoud (long)', category: CAT,
    description: '1 maand, 1 dag (enkelvoud)',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const b1m = { years: 0, months: 1, days: 0, totalDays: 30, isDeficit: false, isInfinite: false }
      const r = formatFreedomTimeString(b1m, 'long')
      assert(r.includes('1 maand'), `enkelvoud maand: ${r}`)
      assert(!r.includes('maanden'), `niet meervoud: ${r}`)

      const b1d = { years: 0, months: 0, days: 1, totalDays: 1, isDeficit: false, isInfinite: false }
      const rd = formatFreedomTimeString(b1d, 'long')
      assert(rd.includes('1 dag'), `enkelvoud dag: ${rd}`)
      assert(!rd.includes('dagen'), `niet meervoud dag: ${rd}`)
    },
  },
  {
    id: 'fmt-fts-zero', name: 'formatFreedomTimeString: edge case 0 dagen', category: CAT,
    description: 'Alles nul → "0 dagen"',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const b0 = { years: 0, months: 0, days: 0, totalDays: 0, isDeficit: false, isInfinite: false }
      assertEqual(formatFreedomTimeString(b0, 'long'), '0 dagen', 'long 0')
      assertEqual(formatFreedomTimeString(b0, 'short'), '0d', 'short 0')
    },
  },
  {
    id: 'fmt-fts-short', name: 'formatFreedomTimeString: kort formaat', category: CAT,
    description: 'Short format: "12j 3m"',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const b = { years: 12, months: 3, days: 15, totalDays: 4470, isDeficit: false, isInfinite: false }
      const r = formatFreedomTimeString(b, 'short')
      assert(r.includes('12j'), `12j: ${r}`)
      assert(r.includes('3m'), `3m: ${r}`)
      // Days not shown in short when years > 0
    },
  },
  {
    id: 'fmt-fts-days-only', name: 'formatFreedomTimeString: alleen dagen', category: CAT,
    description: 'Alleen dagen getoond wanneer < 1 maand',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const b = { years: 0, months: 0, days: 15, totalDays: 15, isDeficit: false, isInfinite: false }
      const r = formatFreedomTimeString(b, 'long', true)
      assert(r.includes('15 dagen'), `15 dagen: ${r}`)
      assert(!r.includes('jaar'), `geen jaar: ${r}`)
      assert(!r.includes('maand'), `geen maand: ${r}`)

      // Without includeDays
      const rNoD = formatFreedomTimeString(b, 'long', false)
      assertEqual(rNoD, '0 dagen', 'zonder dagen → 0 dagen')
    },
  },
  {
    id: 'fmt-fts-year-only', name: 'formatFreedomTimeString: alleen jaren', category: CAT,
    description: 'Geen "en" of komma bij alleen jaren',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const b = { years: 5, months: 0, days: 0, totalDays: 1825, isDeficit: false, isInfinite: false }
      const r = formatFreedomTimeString(b, 'long')
      assertEqual(r, '5 jaar', 'alleen jaren')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
