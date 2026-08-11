/**
 * SWR-GRONDSLAG VAN DE HOLDINGS-HERO — anti-driftgrendel.
 *
 * ── DE BUG DIE HIER WORDT VASTGEPIND ────────────────────────────────────────
 * `components/core/holdings/portfolio-summary.tsx` deelde de FIRE-deck-regel
 * ("Bij X% onttrekking financiert deze portefeuille Y jaar …") door de
 * app-brede constante `NL_SWR`. Dat is de NO-PROFIEL-fallback, niet de
 * onttrekkingsvoet van deze gebruiker. Élk ander FIRE-oppervlak — inclusief de
 * SWR-monitor-widget die náást deze pagina op /overzicht kan staan — gebruikt
 * de gepersonaliseerde `effectiveSwr`. Dezelfde gebruiker zag daardoor twee
 * verschillende "veilige onttrekking"-percentages (illustratief bij een
 * groei-profiel: 2,8% vs 4,8%, en 1,2 vs 2,0 jaar dekking).
 *
 * Anders dan de vier horizon-componenten die óók `NL_SWR` noemen, was dit géén
 * last-resort-fallback naast een canonieke prop: het was hier de ENIGE bron.
 * De oorzaak zat in de loader — `loadHoldingsData` raadpleegde het profiel niet
 * en kón dus geen grondslag leveren.
 *
 * ── WAT DEZE SUITE TOETST ───────────────────────────────────────────────────
 *  1. BRONANKER — `loadHoldingsData` haalt de grondslag echt op (profielrij +
 *     jaarlaag) en laat 'm door de canonieke resolver lopen; de hero-component
 *     draagt geen eigen SWR-bron meer. `loadHoldingsData` is niet unit-draaibaar
 *     (vijf queries op een echte Supabase-client), vandaar het bronanker —
 *     hetzelfde patroon als lib/dashboard-data-loader.spend-limit-injectie.test.ts.
 *  2. CROSS-SURFACE PARITEIT — de gedeelde resolver levert voor elke
 *     profiel/jaarlaag-combinatie exact dezelfde voet als het inline
 *     shadow-blok dat /overzicht, /core en /toekomst gebruiken. Wijkt de ene
 *     keten van de andere af, dan valt dit bestand om in plaats van dat er weer
 *     twee percentages op twee schermen verschijnen.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveFireParams, resolveFireParamsWithAssumptions } from '@/lib/fire-params'
import { resolveFireAssumptions, type FireAssumptionRow } from '@/lib/fire-assumptions'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { NL_SWR } from '@/lib/constants'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOADER_PATH = join(REPO_ROOT, 'lib', 'holdings-data-loader.ts')
const HERO_PATH = join(REPO_ROOT, 'components', 'core', 'holdings', 'portfolio-summary.tsx')

/** Strip commentaar en normaliseer witruimte: het anker matcht op CODE, niet op
 *  proza (de toelichtingen in beide bestanden nóemen NL_SWR nog wél). */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
}

// ── 1. Bronanker ────────────────────────────────────────────────────────────

describe('bronanker — loadHoldingsData levert de FIRE-grondslag', () => {
  const code = codeOf(LOADER_PATH)

  it('leest een niet-lege bron (anders is elke assertie hieronder groen om niets)', () => {
    expect(code.length).toBeGreaterThan(1000)
    expect(code).toContain('export const loadHoldingsData')
  })

  it.each([
    ['eigen-rij profielquery', "from('profiles') .select('expected_return, inflation_rate')"],
    ['jaargelaagde markt-aannames', "from('fire_assumptions')"],
    ['canonieke resolver', 'resolveFireParamsWithAssumptions('],
    ['veld op de bundel', 'effectiveSwr,'],
  ])('bevat %s', (_label, fragment) => {
    expect(code).toContain(fragment)
  })

  it('rekent de voet niet zelf uit (geen lokale SWR-formule of -constante)', () => {
    expect(code).not.toContain('NL_SWR')
    expect(code).not.toContain('computeEffectiveSwr(')
    expect(code).not.toMatch(/0\.04\b/)
  })
})

describe('bronanker — de hero draagt geen eigen SWR-bron meer', () => {
  const code = codeOf(HERO_PATH)

  it('leest een niet-lege bron', () => {
    expect(code.length).toBeGreaterThan(1000)
    expect(code).toContain('export function PortfolioSummary')
  })

  it('importeert NL_SWR niet meer en hardcodet geen voet', () => {
    // Dit was de kern van de drift: de constante als ENIGE bron op dit oppervlak.
    expect(code).not.toContain('NL_SWR')
    expect(code).not.toMatch(/0[.,]04\b/)
  })

  it('leest de voet uit de prop die de loader vult', () => {
    expect(code).toContain('effectiveSwr')
    expect(code).toContain('swr={effectiveSwr}')
  })
})

// ── 2. Cross-surface pariteit ───────────────────────────────────────────────

/**
 * Het inline shadow-blok zoals /overzicht (dashboard-data-loader.ts),
 * /core (core-data-loader.ts) en /toekomst (horizon-data-loader.ts) het
 * vandaag uitvoeren, letterlijk nagebouwd. Dit is de "andere kant" van de
 * vergelijking: de holdings-hero moet exact hierop uitkomen.
 */
function surfaceEigenKeten(
  profile: { expected_return?: number | null; inflation_rate?: number | null },
  rows: FireAssumptionRow[] | null,
): number {
  const fireAssumptions = resolveFireAssumptions(rows ?? [])
  const shadowedProfile = { ...profile }
  if (shadowedProfile.expected_return == null) shadowedProfile.expected_return = fireAssumptions.expectedReturn
  if (shadowedProfile.inflation_rate == null) shadowedProfile.inflation_rate = fireAssumptions.inflation
  return resolveFireParams(shadowedProfile).effectiveSwr
}

describe('cross-surface pariteit — holdings-hero vs. /overzicht, /core, /toekomst', () => {
  const jaarlaag: FireAssumptionRow[] = [
    { year: CURRENT_TAX_YEAR, expected_return: 0.085, inflation: 0.03, volatility: 0.15 },
  ]

  const gevallen: Array<[string, { expected_return?: number | null; inflation_rate?: number | null }, FireAssumptionRow[] | null]> = [
    ['leeg profiel, geen jaarlaag', {}, []],
    ['leeg profiel, jaarlaag gezet', { expected_return: null, inflation_rate: null }, jaarlaag],
    ['eigen rendement (de productie-afwijker)', { expected_return: 0.05, inflation_rate: 0.02 }, []],
    ['eigen rendement + jaarlaag', { expected_return: 0.05, inflation_rate: null }, jaarlaag],
    ['groei-profiel', { expected_return: 0.09, inflation_rate: 0.02 }, []],
    ['hoge inflatie (SWR-vloer)', { expected_return: 0.02, inflation_rate: 0.05 }, []],
    ['ontbrekende jaarlaag-tabel', {}, null],
  ]

  it.each(gevallen)('%s → identieke onttrekkingsvoet', (_label, profile, rows) => {
    const hero = resolveFireParamsWithAssumptions(profile, rows).effectiveSwr
    expect(hero).toBe(surfaceEigenKeten(profile, rows))
  })

  it('het default-geval landt exact op NL_SWR — de oude weergave blijft intact', () => {
    expect(resolveFireParamsWithAssumptions({}, []).effectiveSwr).toBeCloseTo(NL_SWR, 12)
  })

  it('een afwijkend profiel wijkt aantoonbaar AF van NL_SWR (anders bewijst de suite niets)', () => {
    const eigen = resolveFireParamsWithAssumptions({ expected_return: 0.09, inflation_rate: 0.02 }, []).effectiveSwr
    expect(eigen).not.toBeCloseTo(NL_SWR, 4)
  })
})
