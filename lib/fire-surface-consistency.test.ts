import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * H21 — "Oppervlakken geven verschillende antwoorden op dezelfde vraag."
 *
 * De bevinding: /overzicht en /toekomst toonden verschillende vrijheidsleeftijden
 * en vrijheids-percentages, en op /toekomst stond "NETTO VERMOGEN €1.731.640"
 * vijf regels boven "€1.619.700 netto vermogen". Drie losse oorzaken:
 *
 *  1. PEILMOMENT — de kassabon las de EINDstand van projectieblok k=0 onder een
 *     label dat het huidige jaar noemde; de zin eronder las de stand van vandaag.
 *     +6,9% = precies één jaar rendement + inleg.
 *  2. EENHEID — de Marktcheck-badge toonde een kale `4,1%` die een
 *     RENDEMENT-MARGE is (procentpunt per jaar), naast een widget met "99%
 *     succeskans". Zonder eenheid draait de betekenis 180°.
 *  3. TWEE NOEMERS — `loadHorizonData` leidde `freedomPct` af met een closed-form
 *     benadering omdat de canonieke kernel-run (`computeHorizonFireSim`) zélf de
 *     loader aanriep: een structurele recursie. Gemeten afwijking: ~€108k doel en
 *     8,6pp vrijheids-%.
 *
 * Deze suite vergrendelt alle drie: het GEDRAG van de afgeleide laag (één motor,
 * één noemer, perspectief consistent) plus de bron-grendels die de recursie en
 * de motor-mix niet kunnen terugkeren.
 *
 * TOLERANTIE — bewust ABSOLUUT (0,01 pp op percentages, €0,01 op bedragen, 0,01
 * jaar op leeftijden), niet relatief. Het gaat hier om IDENTITEITEN tussen twee
 * representaties van hetzelfde getal (hero versus gezondheidsscore, bundel versus
 * oppervlak) — niet om een geschaalde vergelijking. Een relatieve tolerantie zou
 * op een FIRE-doel van miljoenen een afwijking van honderden euro's doorlaten,
 * precies de klasse fout die deze kaart beschrijft.
 */

const loadHorizonRawMock = vi.fn()
const computeHorizonFireSimMock = vi.fn()

vi.mock('./horizon/raw-data-loader', () => ({
  loadHorizonRaw: (...args: unknown[]) => loadHorizonRawMock(...args),
  HORIZON_SETUP_COMPLETED_SLUG: 'horizon_setup_completed',
  HORIZON_WELCOME_SHOWN_SLUG: 'horizon_welcome_shown',
  HORIZON_EXIT_NOTICE_DISMISSED_SLUG: 'horizon_exit_notice_dismissed',
  HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG: 'horizon_tips_first_close_navigated',
}))
vi.mock('./fire-target-shared', () => ({
  computeHorizonFireSim: (...args: unknown[]) => computeHorizonFireSimMock(...args),
}))

import { loadHorizonData } from './horizon-data-loader'

const SUPABASE = {} as never
const EPS_PCT = 0.01
const EPS_EUR = 0.01

/**
 * Eén fixture waarin de KERNEL en de CLOSED-FORM benadering meetbaar uit elkaar
 * lopen — anders zou de test niet kunnen zien wélke van de twee gewonnen heeft.
 *
 * Netto vermogen €500.000, geen eigen woning (fireEligible == inclHome).
 *  • kernel-doel      €1.000.000 → 50,0 %
 *  • scalar-benadering  €800.000 → 62,5 %
 * Verschil 12,5pp — ruim boven de weergave-afronding.
 */
const NET_WORTH = 500_000
const KERNEL_PORTFOLIO = 1_000_000
const KERNEL_NET_WORTH_TARGET = 1_000_000
const SCALAR_PORTFOLIO = 800_000
const KERNEL_FREEDOM_PCT = 50
const SCALAR_FREEDOM_PCT = 62.5
const KERNEL_FIRE_AGE = 57.75

function rawBundle() {
  return {
    budgetingActive: true,
    freedomBasis: {
      homeExcludedFromFire: false,
      netWorthInclHome: NET_WORTH,
      fireEligibleNetWorth: NET_WORTH,
      scalarRequiredPortfolioExclHome: SCALAR_PORTFOLIO,
    },
    healthScoreInputBase: {
      savingsRate6m: 20,
      totalAssets: NET_WORTH,
      totalDebts: 0,
      emergencyFundMonths: 6,
      emergencyTargetMonths: 3,
      netMonthlyIncome: 4000,
      debtMonthlyPayments: 0,
      largestAssetTypeShare: 0.4,
      budgetCategories: [{ limit: 500, spent: 400 }],
      assetTypeCount: 3,
    },
  }
}

function armKernel() {
  computeHorizonFireSimMock.mockResolvedValue({
    sim: {
      requiredFirePortfolio: KERNEL_PORTFOLIO,
      requiredFireNetWorth: KERNEL_NET_WORTH_TARGET,
      fireAgeFractional: KERNEL_FIRE_AGE,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  loadHorizonRawMock.mockResolvedValue(rawBundle())
  armKernel()
})

describe('H21/F4 — één noemer voor vrijheids-%, uit de kernel', () => {
  it('Given een kernel-run die afwijkt van de benadering, When de bundel wordt geladen, Then wint de kernel', async () => {
    const data = await loadHorizonData(SUPABASE)

    expect(data.freedomPct).toBeCloseTo(KERNEL_FREEDOM_PCT, 2)
    // Het getal dat de benadering zou hebben opgeleverd mag NIET meer verschijnen.
    expect(Math.abs(data.freedomPct - SCALAR_FREEDOM_PCT)).toBeGreaterThan(EPS_PCT)
    expect(data.requiredPortfolioExclHome).not.toBeNull()
    expect(Math.abs(data.requiredPortfolioExclHome! - KERNEL_PORTFOLIO)).toBeLessThanOrEqual(EPS_EUR)
    expect(data.fireEngine).toBe('kernel')
  })

  it('Given dezelfde bundel, When hero en gezondheidsscore worden gelezen, Then delen ze exact één vrijheids-%', async () => {
    const data = await loadHorizonData(SUPABASE)
    // /overzicht-hero leest `healthScoreInput.freedomPct`, de widget/strip
    // `freedomPct`. Twee velden, één getal — dat was het defect.
    expect(Math.abs(data.healthScoreInput.freedomPct - data.freedomPct)).toBeLessThanOrEqual(EPS_PCT)
  })

  it('Given een kernel-FIRE-leeftijd, When de bundel wordt geladen, Then draagt hij die leeftijd (first paint /toekomst)', async () => {
    const data = await loadHorizonData(SUPABASE)
    expect(data.fireAgeFractional).not.toBeNull()
    expect(Math.abs(data.fireAgeFractional! - KERNEL_FIRE_AGE)).toBeLessThanOrEqual(0.01)
  })

  it('Given een kernel-run die niet kán draaien (bv. privacy-aggregaatrijen), When de bundel wordt geladen, Then valt hij zichtbaar terug op de benadering', async () => {
    // Dit is óók de tak waarin de partner zijn privacyniveau op "totalen" heeft:
    // `computeHorizonFireSim` weigert dan te draaien op één synthetische rij, en
    // de benadering op de perspectief-TOTALEN neemt het over — met `fireEngine`
    // die dat zegt in plaats van een kernelgetal te suggereren.
    computeHorizonFireSimMock.mockResolvedValue(null)
    const data = await loadHorizonData(SUPABASE)

    expect(data.fireEngine).toBe('scalar')
    expect(data.freedomPct).toBeCloseTo(SCALAR_FREEDOM_PCT, 2)
    expect(data.fireAgeFractional).toBeNull()
    // Ook op de terugval-tak blijven hero en score op hetzelfde getal.
    expect(Math.abs(data.healthScoreInput.freedomPct - data.freedomPct)).toBeLessThanOrEqual(EPS_PCT)
  })

  it('Given een gefaalde kernel-aanroep, When de bundel wordt geladen, Then valt hij terug in plaats van te crashen', async () => {
    computeHorizonFireSimMock.mockRejectedValue(new Error('kernel stuk'))
    const data = await loadHorizonData(SUPABASE)
    expect(data.fireEngine).toBe('scalar')
    expect(data.freedomPct).toBeCloseTo(SCALAR_FREEDOM_PCT, 2)
  })

  it('Given een doel van 0 uit de kernel, When de bundel wordt geladen, Then telt dat als "geen kernel-doel"', async () => {
    computeHorizonFireSimMock.mockResolvedValue({
      sim: { requiredFirePortfolio: 0, requiredFireNetWorth: 0, fireAgeFractional: null },
    })
    const data = await loadHorizonData(SUPABASE)
    expect(data.fireEngine).toBe('scalar')
    expect(data.freedomPct).toBeCloseTo(SCALAR_FREEDOM_PCT, 2)
  })
})

describe('H21/F6 — perspectief loopt door naar DEZELFDE run', () => {
  it('Given geen perspectief, When de bundel wordt geladen, Then draaien laag én FIRE-run expliciet "personal"', async () => {
    await loadHorizonData(SUPABASE)
    expect(loadHorizonRawMock).toHaveBeenCalledWith(SUPABASE, 'personal')
    expect(computeHorizonFireSimMock).toHaveBeenCalledWith(SUPABASE, 'personal')
  })

  it('Given de huishoudblik, When de bundel wordt geladen, Then krijgen laag én FIRE-run hetzelfde perspectief', async () => {
    await loadHorizonData(SUPABASE, 'household')
    // Zou de FIRE-run persoonlijk blijven, dan zou de huishoud-hero een
    // persoonlijk doel delen door een huishoud-vermogen: 100%+ naast "nog jaren".
    expect(loadHorizonRawMock).toHaveBeenCalledWith(SUPABASE, 'household')
    expect(computeHorizonFireSimMock).toHaveBeenCalledWith(SUPABASE, 'household')
  })
})

describe('H21 — bron-grendels tegen terugkeer van de motor-mix', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')

  it('de rauwe laag roept de kernel niet aan (anders is de recursie terug)', () => {
    const src = read('lib', 'horizon', 'raw-data-loader.ts')
    expect(src).not.toMatch(/^import[\s\S]*?from '@\/lib\/fire-target-shared'/m)
    expect(src).not.toMatch(/^import[\s\S]*?from '@\/lib\/horizon-data-loader'/m)
  })

  it('de afgeleide laag draait geen eigen FIRE-doel-formule', () => {
    const src = read('lib', 'horizon-data-loader.ts')
    // `computeFireTarget` is de closed-form motor; die hoort alleen nog in de
    // rauwe laag te staan, als FALLBACK-ingrediënt.
    expect(src).not.toMatch(/\bcomputeFireTarget\s*\(/)
    expect(src).toMatch(/computeHorizonFireSim\s*\(/)
  })

  it('/toekomst leidt de first-paint-leeftijd niet meer uit snapshots af', () => {
    const src = read('components', 'app', 'horizon', 'horizon-client.tsx')
    // `net_worth_snapshots.fire_age` wordt door de RAUWE scalar-lus geschreven —
    // een andere motor dan de kernel-worker die daarna landt. Dat gaf de sprong.
    expect(src).not.toMatch(/resilienceSnapshots[\s\S]{0,200}?\.fire_age/)
    expect(src).toMatch(/serverFireAge\s*=\s*initialData\.fireAgeFractional/)
  })

  it('de kassabon leest de BEGINstand van het blok (één peilmoment)', () => {
    const src = read('components', 'app', 'horizon', 'horizon-client.tsx')
    expect(src).toMatch(/readoutNetWorth\s*=\s*row\.startNetWorth/)
    expect(src).toMatch(/netWorth:\s*readoutNetWorth/)
  })

  it('de Marktcheck-pil houdt haar label zolang de datawaarde er staat', () => {
    const src = read('components', 'app', 'horizon', 'horizon-client.tsx')
    // Een kale `4,1%` naast "99% succeskans" is het defect; het label mag dus
    // niet onvoorwaardelijk op `hidden sm:inline` staan wanneer er een waarde is.
    expect(src).not.toMatch(/className="hidden sm:inline">Marktcheck</)
    expect(src).toMatch(/mcExpanded && !mcPending && mcMarge \? 'inline' : 'hidden sm:inline'/)
  })
})
