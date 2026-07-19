import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { NL_AOW_AGE } from '@/lib/constants'
import { getAowLeeftijden, _clearReferenceCacheForTests } from '@/lib/reference-cache'

/**
 * Regressie voor de bug "Verkeerde tabelnaam: AOW-leeftijd valt stil terug op 67".
 *
 * `lib/dashboard-data-loader.ts` (/overzicht) en `lib/core-data-loader.ts` (/core)
 * queryden per abuis `.from('aow_leeftijden')` (meervoud) terwijl de tabel
 * `aow_leeftijd` heet. De leesfout werd stil geslikt (`data ?? []`), waardoor
 * `lookupAowAge` op een lege array terugviel op de fallback (67 jaar). De
 * /toekomst-pagina (`lib/fire-target-shared.ts`) las wél de juiste tabel, dus twee
 * schermen konden verschillende AOW-leeftijden gebruiken voor dezelfde gebruiker.
 *
 * SINDS Task 1.7 (module-TTL-cache, `lib/reference-cache.ts`): de drie oppervlakken
 * queryen niet langer elk hun eigen `.from('aow_leeftijd').select(...)` — ze
 * delegeren allemaal naar de gedeelde `getAowLeeftijden()`. Dat maakt de kans op
 * hernieuwde drift (verkeerde tabelnaam op één oppervlak) juist kleiner, maar deze
 * suite moet wél blijven bewaken dat niemand stiekem weer een eigen losse query
 * introduceert. Bewaakt nu vier dingen:
 *  1. de drie oppervlakken delegeren naar de gedeelde cache-functie (geen eigen
 *     losse query meer — bron-scan);
 *  2. de gedeelde cache-functie queryt zelf de juiste tabel: aow_leeftijd;
 *  3. op dezelfde AOW-input resolvet de gedeelde functie tot dezelfde,
 *     niet-fallback leeftijd (gedrag);
 *  4. het bug-mechanisme zelf: een query op de foute naam valt terug op 67.
 */

// Seed-rijen, gespiegeld uit supabase/migrations/20260315000001_create_aow_leeftijd.sql
// (SVB / Rijksoverheid, maart 2026). Bron-van-waarheid voor de leeftijd-lookup.
const AOW_SEED_ROWS: AowLeeftijdRow[] = [
  { id: '01', birth_date_from: '1956-06-01', birth_date_through: '1957-02-28', aow_years: 66, aow_months: 10, is_definitive: true, source: 'SVB 2026' },
  { id: '02', birth_date_from: '1957-03-01', birth_date_through: '1960-12-31', aow_years: 67, aow_months: 0, is_definitive: true, source: 'SVB 2026' },
  { id: '03', birth_date_from: '1961-01-01', birth_date_through: '1964-09-30', aow_years: 67, aow_months: 3, is_definitive: true, source: 'SVB 2026' },
  { id: '04', birth_date_from: '1964-10-01', birth_date_through: '1966-09-30', aow_years: 67, aow_months: 3, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '05', birth_date_from: '1966-10-01', birth_date_through: '1970-06-30', aow_years: 67, aow_months: 6, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '06', birth_date_from: '1970-07-01', birth_date_through: '1973-03-31', aow_years: 67, aow_months: 9, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '07', birth_date_from: '1973-04-01', birth_date_through: '1975-12-31', aow_years: 68, aow_months: 0, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '08', birth_date_from: '1976-01-01', birth_date_through: '1978-09-30', aow_years: 68, aow_months: 3, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '09', birth_date_from: '1978-10-01', birth_date_through: '1982-06-30', aow_years: 68, aow_months: 6, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '10', birth_date_from: '1982-07-01', birth_date_through: '1985-03-31', aow_years: 68, aow_months: 9, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '11', birth_date_from: '1985-04-01', birth_date_through: '1988-12-31', aow_years: 69, aow_months: 0, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '12', birth_date_from: '1989-01-01', birth_date_through: '1991-09-30', aow_years: 69, aow_months: 3, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '13', birth_date_from: '1991-10-01', birth_date_through: '1995-06-30', aow_years: 69, aow_months: 6, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '14', birth_date_from: '1995-07-01', birth_date_through: '1999-03-31', aow_years: 69, aow_months: 9, is_definitive: false, source: 'CBS-prognose 2026' },
  { id: '15', birth_date_from: '1999-04-01', birth_date_through: '2000-12-31', aow_years: 70, aow_months: 0, is_definitive: false, source: 'CBS-prognose 2026' },
]

// Kolommen exact zoals de loaders selecteren (bevat aow_years → herkenbaar als AOW-query).
const AOW_SELECT = 'id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source'

type AowQueryResult = { data: AowLeeftijdRow[] | null; error: { code: string; message: string } | null }

/**
 * Generieke thenable query-builder: ondersteunt willekeurige chains
 * (`.select().order()` etc.) door zichzelf terug te geven; `then` levert het
 * opgegeven { data, error }-resultaat op — zowel bruikbaar als
 * `await supabase.from(x).select(y)` (rechtstreeks) als
 * `await supabase.from(x).select(y).order(z)` (extra chain-stap, zoals
 * `getAowLeeftijden` gebruikt).
 */
interface AowQueryBuilder extends PromiseLike<AowQueryResult> {
  select(cols: string): AowQueryBuilder
  order(col: string, opts?: { ascending: boolean }): AowQueryBuilder
}

function makeQueryResult(result: AowQueryResult): AowQueryBuilder {
  const builder: AowQueryBuilder = {
    select: () => builder,
    order: () => builder,
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return builder
}

/**
 * Minimale Supabase-mock: levert de seed-rijen ALLEEN voor de echte tabel
 * `aow_leeftijd`. Een query op elke andere naam (o.a. de historische fout
 * `aow_leeftijden`) geeft `{ data: null, error }` terug — precies wat Postgres doet
 * bij een niet-bestaande relatie en wat de stille `[]`-fallback vóór de fix triggerde.
 */
function makeAowSupabase() {
  return {
    from(table: string) {
      if (table === 'aow_leeftijd') return makeQueryResult({ data: AOW_SEED_ROWS, error: null })
      return makeQueryResult({ data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } })
    },
  }
}

/**
 * Spiegelt de gedeelde AOW-resolutie die ELK oppervlak (via de mock) uitvoert:
 *   const { data } = await supabase.from(<tabel>).select(<kolommen incl. aow_years>)
 *   lookupAowAge(data ?? [], dob)
 */
async function resolveSurfaceAow(supabase: ReturnType<typeof makeAowSupabase>, table: string, dob: string) {
  const { data } = await supabase.from(table).select(AOW_SELECT)
  return lookupAowAge((data ?? []) as AowLeeftijdRow[], dob)
}

/**
 * Controleert dat een oppervlak-bestand delegeert naar de gedeelde
 * `getAowLeeftijden()` (uit `lib/reference-cache.ts`) in plaats van een eigen
 * losse `.from('aow_leeftijd')`-query te doen — zodat deze test breekt zodra een
 * oppervlak weer een eigen (mogelijk verkeerde) query introduceert.
 */
function delegatesToSharedAowCache(relPath: string): boolean {
  const src = readFileSync(path.resolve(process.cwd(), relPath), 'utf8')
  const importsFromCache = /from\s+['"]@\/lib\/reference-cache['"]/.test(src)
  const callsGetAowLeeftijden = /getAowLeeftijden\s*\(/.test(src)
  return importsFromCache && callsGetAowLeeftijden
}

/**
 * Leest de tabelnaam die de gedeelde cache-functie `getAowLeeftijden` ECHT queryt,
 * rechtstreeks uit `lib/reference-cache.ts` — zodat deze test breekt zodra de ENE
 * canonieke query terugvalt op de foute naam (of wordt hernoemd/verplaatst).
 */
function canonicalAowTable(): string {
  const src = readFileSync(path.resolve(process.cwd(), 'lib/reference-cache.ts'), 'utf8')
  const fnMatch = src.match(/export async function getAowLeeftijden[\s\S]*?\n}/)
  if (!fnMatch) {
    throw new Error('getAowLeeftijden niet gevonden in lib/reference-cache.ts — is de cache-functie hernoemd/verplaatst? Herzie deze regressietest.')
  }
  const tableMatch = fnMatch[0].match(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/)
  if (!tableMatch) {
    throw new Error('Geen .from(...) query gevonden binnen getAowLeeftijden — herzie deze regressietest.')
  }
  return tableMatch[1]
}

// De drie oppervlakken die op dezelfde AOW-leeftijd moeten uitkomen.
const SURFACES: Record<string, string> = {
  '/overzicht (dashboard-data-loader)': 'lib/dashboard-data-loader.ts',
  '/core (core-data-loader)': 'lib/core-data-loader.ts',
  '/toekomst (fire-target-shared, canoniek)': 'lib/fire-target-shared.ts',
}

describe('AOW-leeftijd — één tabel, drie oppervlakken (regressie stille fallback naar 67)', () => {
  it('alle drie oppervlakken delegeren naar de gedeelde cache-functie getAowLeeftijden (lib/reference-cache.ts) — geen eigen losse query meer', () => {
    for (const [label, rel] of Object.entries(SURFACES)) {
      expect(delegatesToSharedAowCache(rel), label).toBe(true)
    }
  })

  it('de gedeelde cache-functie queryt de juiste tabel: aow_leeftijd (niet de historische fout aow_leeftijden)', () => {
    expect(canonicalAowTable()).toBe('aow_leeftijd')
  })

  it('resolvet op dezelfde AOW-input tot dezelfde, niet-fallback leeftijd via de gedeelde functie (persona 1975 → 68j, ≠ fallback 67)', async () => {
    _clearReferenceCacheForTests()
    const supabase = makeAowSupabase()
    const dob = '1975-06-15' // valt in 1973-04-01..1975-12-31 → 68j0m
    const rows = await getAowLeeftijden(supabase as never)
    const age = lookupAowAge(rows, dob)

    // Alle drie oppervlakken roepen dezelfde functie aan — één AOW-leeftijd is
    // hier geen aparte assertie meer, maar een architectuur-garantie (zie test
    // hierboven). Dit bewaakt dat die ENE functie de ECHTE leeftijd teruggeeft,
    // niet de stille fallback.
    expect(age.fractional).toBe(68)
    expect(age.fractional).not.toBe(NL_AOW_AGE) // 67
  })

  it('/core split-brain opgelost: het aowAge-displayveld en het FIRE-doel (fireTargetFromHorizon) delegeren allebei naar dezelfde gedeelde cache-functie', () => {
    // Op /core komt aowAge (de AOW-marker in de netto-vermogen-projectiegrafiek) uit
    // core-data-loader, terwijl fireTargetFromHorizon via fire-target-shared komt.
    // Vóór de fix las alleen de eerste de foute tabel → marker (67) ≠ doel (echte AOW).
    // Sinds Task 1.7 delegeren beide naar getAowLeeftijden() — geen drift mogelijk.
    expect(delegatesToSharedAowCache('lib/core-data-loader.ts')).toBe(true)
    expect(delegatesToSharedAowCache('lib/fire-target-shared.ts')).toBe(true)
  })

  it('repro bug-mechanisme: een query op de foute tabelnaam valt stil terug op 67, de juiste niet', async () => {
    const supabase = makeAowSupabase()
    const dob = '1975-06-15'
    const wrong = await resolveSurfaceAow(supabase, 'aow_leeftijden', dob) // historische foute naam
    const right = await resolveSurfaceAow(supabase, 'aow_leeftijd', dob)

    expect(wrong.fractional).toBe(NL_AOW_AGE) // 67 — precies de gemelde bug
    expect(wrong.isDefinitive).toBe(false) // fallback is nooit definitief
    expect(right.fractional).toBe(68)
    expect(right.fractional).not.toBe(wrong.fractional)
  })
})

describe('lookupAowAge — kern-primitief (fallback-grens + boundary-matching)', () => {
  it('lege rijen → fallback 67 (het exacte stille-fallback-pad van de bug)', () => {
    const age = lookupAowAge([], '1975-06-15')
    expect(age).toEqual({ years: NL_AOW_AGE, months: 0, fractional: NL_AOW_AGE, isDefinitive: false })
  })

  it('null geboortedatum → fallback 67', () => {
    expect(lookupAowAge(AOW_SEED_ROWS, null).fractional).toBe(NL_AOW_AGE)
  })

  it('geboortedatum vóór alle ranges → fallback 67', () => {
    expect(lookupAowAge(AOW_SEED_ROWS, '1950-01-01').fractional).toBe(NL_AOW_AGE)
  })

  it('geboortedatum ná alle ranges → fallback 67', () => {
    expect(lookupAowAge(AOW_SEED_ROWS, '2010-01-01').fractional).toBe(NL_AOW_AGE)
  })

  it('smalle band 1957-1960 → toevallig 67j0m (waarom de bug daar onzichtbaar was)', () => {
    const age = lookupAowAge(AOW_SEED_ROWS, '1958-06-15')
    expect(age.fractional).toBe(67)
    expect(age.isDefinitive).toBe(true)
  })

  it('definitief niet-67-cohort 1962 → 67j3m (fractional 67.25)', () => {
    const age = lookupAowAge(AOW_SEED_ROWS, '1962-05-01')
    expect(age.years).toBe(67)
    expect(age.months).toBe(3)
    expect(age.fractional).toBeCloseTo(67.25, 10)
    expect(age.isDefinitive).toBe(true)
  })

  it('inclusieve ondergrens: birth_date_from matcht exact', () => {
    const age = lookupAowAge(AOW_SEED_ROWS, '1973-04-01')
    expect(age.fractional).toBe(68)
  })

  it('inclusieve bovengrens: birth_date_through matcht exact', () => {
    const age = lookupAowAge(AOW_SEED_ROWS, '1975-12-31')
    expect(age.fractional).toBe(68)
  })

  it('ISO-datum met tijdcomponent wordt genormaliseerd naar YYYY-MM-DD', () => {
    const age = lookupAowAge(AOW_SEED_ROWS, '1975-06-15T23:30:00.000Z')
    expect(age.fractional).toBe(68)
  })
})
