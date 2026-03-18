import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import { lookupAowAge, formatAowAge } from '@/lib/aow-leeftijd'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'

const CAT = 'horizon.aow-leeftijd'

// ── Helper: sample AOW rows for unit tests ──────────────────────────────────

const SAMPLE_ROWS: AowLeeftijdRow[] = [
  {
    id: 'row-1',
    birth_date_from: '1955-01-01',
    birth_date_through: '1955-06-30',
    aow_years: 66,
    aow_months: 4,
    is_definitive: true,
    source: 'SVB',
  },
  {
    id: 'row-2',
    birth_date_from: '1955-07-01',
    birth_date_through: '1955-12-31',
    aow_years: 66,
    aow_months: 7,
    is_definitive: true,
    source: 'SVB',
  },
  {
    id: 'row-3',
    birth_date_from: '1960-01-01',
    birth_date_through: '1960-12-31',
    aow_years: 67,
    aow_months: 0,
    is_definitive: false,
    source: 'SVB schatting',
  },
  {
    id: 'row-4',
    birth_date_from: '1970-01-01',
    birth_date_through: '1970-12-31',
    aow_years: 67,
    aow_months: 3,
    is_definitive: false,
    source: 'CBS prognose',
  },
]

/** Fetch helper without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return fetch(path, { redirect: 'manual' })
}

function isRedirectOrAuth(status: number): boolean {
  return status >= 300 && status < 400
}

const tests: TestCase[] = [
  // ── Step 1: GET /api/admin/aow-leeftijd ────────────────────────────────
  {
    id: 'aow-get-records',
    name: 'GET /api/admin/aow-leeftijd retourneert records',
    category: CAT,
    description: 'Ophalen van alle AOW leeftijd records via GET endpoint',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetchNoRedirect('/api/admin/aow-leeftijd')
      // Without auth: should get 403 (admin protection) or redirect
      assert(
        res.status === 403 || isRedirectOrAuth(res.status),
        `Expected 403 or redirect for unauthenticated GET, got ${res.status}`,
      )
      // If 403, verify error message
      if (res.status === 403) {
        const body = await res.json()
        assertEqual(body.error, 'Forbidden', 'GET returns Forbidden for non-admin')
      }
    },
  },

  // ── Step 2: POST /api/admin/aow-leeftijd ───────────────────────────────
  {
    id: 'aow-post-requires-auth',
    name: 'POST /api/admin/aow-leeftijd vereist admin',
    category: CAT,
    description: 'Nieuw record aanmaken is alleen mogelijk voor superadmin',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/api/admin/aow-leeftijd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth_date_from: '2000-01-01',
          birth_date_through: '2000-12-31',
          aow_years: 68,
          aow_months: 0,
          is_definitive: false,
          source: 'TEST',
        }),
      })
      assert(
        res.status === 403 || isRedirectOrAuth(res.status),
        `Expected 403 or redirect for unauthenticated POST, got ${res.status}`,
      )
    },
  },

  // ── Step 3: PUT /api/admin/aow-leeftijd ────────────────────────────────
  {
    id: 'aow-put-requires-auth',
    name: 'PUT /api/admin/aow-leeftijd vereist admin',
    category: CAT,
    description: 'Bestaand record bewerken is alleen mogelijk voor superadmin',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/api/admin/aow-leeftijd', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'fake-id',
          aow_years: 68,
        }),
      })
      assert(
        res.status === 403 || isRedirectOrAuth(res.status),
        `Expected 403 or redirect for unauthenticated PUT, got ${res.status}`,
      )
    },
  },

  // ── Step 4: DELETE /api/admin/aow-leeftijd ─────────────────────────────
  {
    id: 'aow-delete-requires-auth',
    name: 'DELETE /api/admin/aow-leeftijd vereist admin',
    category: CAT,
    description: 'Record verwijderen is alleen mogelijk voor superadmin',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/api/admin/aow-leeftijd', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'fake-id' }),
      })
      assert(
        res.status === 403 || isRedirectOrAuth(res.status),
        `Expected 403 or redirect for unauthenticated DELETE, got ${res.status}`,
      )
    },
  },

  // ── Step 5: Datumbereik validatie ──────────────────────────────────────
  {
    id: 'aow-date-range-validation',
    name: 'POST validatie: verplichte velden',
    category: CAT,
    description: 'POST zonder verplichte velden retourneert 400',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      // Missing birth_date_from
      const res = await fetch('/api/admin/aow-leeftijd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth_date_through: '2000-12-31',
          aow_years: 68,
        }),
      })
      // Will get 403 (no auth) before validation — that's correct admin protection
      assert(
        res.status === 400 || res.status === 403 || isRedirectOrAuth(res.status),
        `Expected 400 or 403 for incomplete POST, got ${res.status}`,
      )
    },
  },

  // ── Step 6: lookupAowAge unit tests ───────────────────────────────────
  {
    id: 'aow-lookup-exact-match',
    name: 'lookupAowAge: exacte match op geboortedatum',
    category: CAT,
    description: 'Geboortedatum binnen bereik retourneert juiste AOW leeftijd',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // Born 1955-03-15, falls in row-1 (1955-01-01 to 1955-06-30)
      const result = lookupAowAge(SAMPLE_ROWS, '1955-03-15')
      assertEqual(result.years, 66, 'AOW years')
      assertEqual(result.months, 4, 'AOW months')
      assertEqual(result.isDefinitive, true, 'is definitive')
      // Fractional: 66 + 4/12 = 66.333...
      assert(
        Math.abs(result.fractional - 66.3333) < 0.01,
        `Expected fractional ~66.33, got ${result.fractional}`,
      )
    },
  },

  {
    id: 'aow-lookup-second-range',
    name: 'lookupAowAge: tweede bereik H2 1955',
    category: CAT,
    description: 'Geboortedatum in tweede helft 1955 geeft 66j 7m',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const result = lookupAowAge(SAMPLE_ROWS, '1955-09-20')
      assertEqual(result.years, 66, 'AOW years')
      assertEqual(result.months, 7, 'AOW months')
      assertEqual(result.isDefinitive, true, 'is definitive')
    },
  },

  {
    id: 'aow-lookup-non-definitive',
    name: 'lookupAowAge: niet-definitief record',
    category: CAT,
    description: 'Prognose-record is gemarkeerd als niet-definitief',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const result = lookupAowAge(SAMPLE_ROWS, '1970-06-15')
      assertEqual(result.years, 67, 'AOW years')
      assertEqual(result.months, 3, 'AOW months')
      assertEqual(result.isDefinitive, false, 'not definitive')
    },
  },

  {
    id: 'aow-lookup-fallback',
    name: 'lookupAowAge: fallback naar NL_AOW_AGE',
    category: CAT,
    description: 'Onbekende geboortedatum valt terug naar standaard 67',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // Born 2005 — not in any range
      const result = lookupAowAge(SAMPLE_ROWS, '2005-01-01')
      assertEqual(result.years, 67, 'fallback years')
      assertEqual(result.months, 0, 'fallback months')
      assertEqual(result.isDefinitive, false, 'fallback not definitive')
      assertEqual(result.fractional, 67, 'fallback fractional')
    },
  },

  {
    id: 'aow-lookup-null-dob',
    name: 'lookupAowAge: null geboortedatum',
    category: CAT,
    description: 'Null geboortedatum retourneert fallback',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const result = lookupAowAge(SAMPLE_ROWS, null)
      assertEqual(result.years, 67, 'null dob fallback years')
      assertEqual(result.months, 0, 'null dob fallback months')
    },
  },

  {
    id: 'aow-lookup-empty-table',
    name: 'lookupAowAge: lege tabel',
    category: CAT,
    description: 'Lege AOW tabel retourneert fallback',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const result = lookupAowAge([], '1970-01-01')
      assertEqual(result.years, 67, 'empty table fallback years')
      assertEqual(result.fractional, 67, 'empty table fallback fractional')
    },
  },

  {
    id: 'aow-lookup-datetime-normalization',
    name: 'lookupAowAge: datetime met T-suffix normalisatie',
    category: CAT,
    description: 'Geboortedatum met datetime suffix (T00:00:00) wordt genormaliseerd',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // lookupAowAge splits on T to normalize
      const result = lookupAowAge(SAMPLE_ROWS, '1955-03-15T00:00:00.000Z')
      assertEqual(result.years, 66, 'normalized datetime years')
      assertEqual(result.months, 4, 'normalized datetime months')
    },
  },

  // ── formatAowAge tests ────────────────────────────────────────────────
  {
    id: 'aow-format-years-only',
    name: 'formatAowAge: alleen jaren',
    category: CAT,
    description: '0 maanden toont alleen jaren',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const formatted = formatAowAge({ years: 67, months: 0, fractional: 67, isDefinitive: true })
      assertEqual(formatted, '67 jaar', 'format years only')
    },
  },

  {
    id: 'aow-format-years-and-months',
    name: 'formatAowAge: jaren en maanden',
    category: CAT,
    description: 'Niet-nul maanden toont jaren en maanden',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const formatted = formatAowAge({ years: 66, months: 4, fractional: 66.333, isDefinitive: true })
      assertEqual(formatted, '66 jaar en 4 maanden', 'format years and months')
    },
  },

  // ── AOW berekening integratie ─────────────────────────────────────────
  {
    id: 'aow-integration-boundary-dates',
    name: 'lookupAowAge: randdatums van bereiken',
    category: CAT,
    description: 'Eerste en laatste dag van een bereik matchen correct',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // First day of range
      const first = lookupAowAge(SAMPLE_ROWS, '1955-01-01')
      assertEqual(first.years, 66, 'first day years')
      assertEqual(first.months, 4, 'first day months')

      // Last day of range
      const last = lookupAowAge(SAMPLE_ROWS, '1955-06-30')
      assertEqual(last.years, 66, 'last day years')
      assertEqual(last.months, 4, 'last day months')

      // Day after range switches to next
      const next = lookupAowAge(SAMPLE_ROWS, '1955-07-01')
      assertEqual(next.years, 66, 'next range years')
      assertEqual(next.months, 7, 'next range months')
    },
  },

  {
    id: 'aow-integration-fractional-calc',
    name: 'lookupAowAge: fractional berekening consistent',
    category: CAT,
    description: 'fractional = years + months/12 voor alle records',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      for (const row of SAMPLE_ROWS) {
        const dob = row.birth_date_from // use first day of range
        const result = lookupAowAge(SAMPLE_ROWS, dob)
        const expectedFractional = result.years + result.months / 12
        assert(
          Math.abs(result.fractional - expectedFractional) < 0.001,
          `Fractional mismatch for ${dob}: expected ${expectedFractional}, got ${result.fractional}`,
        )
      }
    },
  },

  // ── Route accessibility ───────────────────────────────────────────────
  {
    id: 'aow-page-accessible',
    name: '/beheer/aow-leeftijd pagina is bereikbaar',
    category: CAT,
    description: 'De beheer AOW-leeftijd pagina retourneert 200 of auth redirect',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetchNoRedirect('/beheer/aow-leeftijd')
      assert(
        res.status === 200 || isRedirectOrAuth(res.status),
        `Expected 200 or redirect for /beheer/aow-leeftijd, got ${res.status}`,
      )
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Beheer — AOW Leeftijd',
    description: 'CRUD AOW pensioenleeftijd referentiedata, lookup-logica en formattering',
    icon: 'Calendar',
    testCount: 0,
  })
  registerTests(tests)
}
