import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regressie voor de jaarruimte-suppressie in de cloud tax-context.
 *
 * Achtergrond (bug "AI-tip 'benut je jaarruimte' blijft na reeds genomen acties"):
 * de tax-context bouwde het "Jaarruimte (aftrekbare lijfrente-/pensioeninleg)"-
 * blok direct uit `computeJaarruimte`, ZONDER de actie-kruising die de
 * aandachtspunten-context wél doet. Voor een gebruiker die de jaarruimte-kans al
 * als actie nam, kreeg het model dus tegenstrijdige context: de aandachtspunten
 * verborgen de kans, maar de fiscale-situatie herhaalde "je hebt onbenutte
 * jaarruimte" — waardoor Fin bleef tippen. Fix: consumeer dezelfde
 * `loadActionedAandachtspuntIds`-bron en laat het blok weg zodra `tax:jaarruimte`
 * geactioneerd is.
 *
 * De zware/DB-afhankelijke bronnen worden gemockt; de pure fiscale motoren
 * (`computeJaarruimte`, `jaarruimteBesparing`, `estimateGrossYearly`) blijven
 * ECHT zodat het jaarruimte-blok end-to-end wordt opgebouwd.
 */

const loadActionedMock = vi.fn<() => Promise<ReadonlySet<string>>>()
const loadPerspectiveBox3Mock = vi.fn()
const hasBox2RelevanceMock = vi.fn()
const resolveBox1GrossIncomeMock = vi.fn()
const resolveEigenWoningMock = vi.fn()

vi.mock('@/lib/aandachtspunten-actions', () => ({
  loadActionedAandachtspuntIds: () => loadActionedMock(),
}))
vi.mock('@/lib/household-tax', () => ({
  loadPerspectiveBox3: (...args: unknown[]) => loadPerspectiveBox3Mock(...args),
}))
vi.mock('@/lib/box2-relevance', () => ({
  hasBox2Relevance: (...args: unknown[]) => hasBox2RelevanceMock(...args),
}))
// De twee DB-resoluties van de Box 1-invoer (C8-vervolg). De MOTOR blijft echt,
// zodat de context-heffing end-to-end door `computeBox1Tax` loopt en we 'm in de
// test naast dezelfde motor-aanroep kunnen leggen.
vi.mock('@/lib/box1-income', () => ({
  GEEN_EIGEN_WONING: { wozValue: undefined, hypotheekRente: undefined, hasEigenWoning: false },
  resolveBox1GrossIncome: (...args: unknown[]) => resolveBox1GrossIncomeMock(...args),
  resolveEigenWoningBox1Input: (...args: unknown[]) => resolveEigenWoningMock(...args),
}))

import { buildTaxContext } from './tax-context'
import { computeBox1Tax } from '@/lib/box1-tax'
import { formatCurrency } from './formatter'
import { JAARRUIMTE_BOVENGRENS_SUFFIX } from '@/lib/jaarruimte-facts'

const GEEN_WONING = { wozValue: undefined, hypotheekRente: undefined, hasEigenWoning: false }

/** Standaard-invoer: bruto uit de canonieke resolutie, geen eigen woning. */
function stubBox1Sources(gross = 62_000, eigenWoning: Record<string, unknown> = GEEN_WONING) {
  resolveBox1GrossIncomeMock.mockResolvedValue({
    grossYearly: gross,
    estimateGross: gross,
    estimateNetYearly: Math.round(gross * 0.65),
    estimateNetBasis: 'profile',
    isManual: false,
  })
  resolveEigenWoningMock.mockResolvedValue(eigenWoning)
}

/**
 * Minimale fake-Supabase: een echte user + een `profiles`-rij met een gezond
 * netto maandinkomen (→ bruto ruim boven de franchise → jaarruimte > 0) en een
 * bekende factor A. Zo verschijnt het jaarruimte-blok zónder suppressie.
 */
function makeSupabase(
  profile: Record<string, unknown> = {
    net_monthly_income: 4000,
    pension_factor_a: 1200,
    pension_factor_a_source: 'upo',
  },
) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: profile, error: null }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as never
}

describe('buildTaxContext — jaarruimte-suppressie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadPerspectiveBox3Mock.mockResolvedValue({
      personal: { tax: 0, rendementsgrondslag: 0, heffingsvrijVermogen: 0 },
      dailyExpenses: 100,
    })
    hasBox2RelevanceMock.mockResolvedValue(false)
    stubBox1Sources()
  })

  it('toont het jaarruimte-blok wanneer de kans NIET geactioneerd is', async () => {
    loadActionedMock.mockResolvedValue(new Set<string>())
    const ctx = await buildTaxContext(makeSupabase())
    expect(ctx).toContain('Jaarruimte (aftrekbare lijfrente-/pensioeninleg)')
  })

  it('onderdrukt het jaarruimte-blok wanneer de kans al geactioneerd is', async () => {
    loadActionedMock.mockResolvedValue(new Set(['tax:jaarruimte']))
    const ctx = await buildTaxContext(makeSupabase())
    expect(ctx).not.toContain('Jaarruimte (aftrekbare lijfrente-/pensioeninleg)')
    // De rest van de fiscale sectie blijft wél staan (alleen jaarruimte valt weg).
    expect(ctx).toContain('Box 1')
  })
})

/**
 * Regressie voor bevinding L8 — interne tegenspraak in dezelfde payload.
 *
 * `getTaxDeadlines` had geen relevantiefilter, dus de Box 2-deadline "Leengrens
 * DGA + dividendtiming" belandde in de top-3 fiscale deadlines van ÉLKE
 * gebruiker — óók direct onder de regel "Box 2 (aanmerkelijk belang in een BV):
 * nee". Het model kreeg zo twee tegenstrijdige signalen over dezelfde positie.
 * Het filter zit nu in de lib zelf; deze test bewaakt dat de context-builder hem
 * daadwerkelijk voedt met de uitkomst van `hasBox2Relevance`.
 */
describe('buildTaxContext — Box 2-deadlines volgen de AB-relevantie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadPerspectiveBox3Mock.mockResolvedValue({
      personal: { tax: 0, rendementsgrondslag: 0, heffingsvrijVermogen: 0 },
      dailyExpenses: 100,
    })
    loadActionedMock.mockResolvedValue(new Set<string>())
    stubBox1Sources()
  })

  it('zonder aanmerkelijk belang staat de DGA-leengrens NIET bij de deadlines', async () => {
    hasBox2RelevanceMock.mockResolvedValue(false)
    const ctx = await buildTaxContext(makeSupabase())
    expect(ctx).toContain('Box 2 (aanmerkelijk belang in een BV): nee')
    expect(ctx).not.toContain('Leengrens DGA')
  })

  it('mét aanmerkelijk belang mag de DGA-leengrens gewoon meereizen', async () => {
    hasBox2RelevanceMock.mockResolvedValue(true)
    const ctx = await buildTaxContext(makeSupabase())
    expect(ctx).toContain('ja — DGA/AB-positie aanwezig')
    // De deadline-sectie bestaat; of 'Leengrens DGA' in de TOP-3 valt is
    // runtime-datum-afhankelijk, dus daar hangen we geen vaste verwachting aan.
    expect(ctx).toContain('Eerstvolgende fiscale deadlines')
  })

  it('een falende relevantie-query onderdrukt de DGA-deadline (faal-zacht)', async () => {
    hasBox2RelevanceMock.mockRejectedValue(new Error('boom'))
    const ctx = await buildTaxContext(makeSupabase())
    // Geen Box 2-regel én geen Box 2-deadline: bij twijfel niets beweren.
    expect(ctx).not.toContain('aanmerkelijk belang in een BV')
    expect(ctx).not.toContain('Leengrens DGA')
  })
})

/**
 * Regressie voor H23 in de CLOUD-context — factor A onbekend ≠ factor A €0.
 *
 * `resolvePensionFactorA` scheidt "niet ingevuld" (`isKnown: false`) van
 * "expliciet geen werkgeverspensioen" (`isKnown: true`); beide leveren
 * `factorA: 0`, dus de motor rekent zonder aftrek en de uitkomst is een
 * BOVENGRENS. Deze builder gooide `.isKnown` weg en noemde het bedrag als hard
 * feit, terwijl `components/overview/jaarruimte-card.tsx` er een badge + bereik
 * bij toont. De kwalificatie is presentatie, nooit motor: de bedragen blijven
 * identiek.
 */
describe('buildTaxContext — jaarruimte-kwalificatie bij onbekende factor A', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadPerspectiveBox3Mock.mockResolvedValue({
      personal: { tax: 0, rendementsgrondslag: 0, heffingsvrijVermogen: 0 },
      dailyExpenses: 100,
    })
    hasBox2RelevanceMock.mockResolvedValue(false)
    loadActionedMock.mockResolvedValue(new Set<string>())
    stubBox1Sources()
  })

  const ONBEKEND = { net_monthly_income: 4000, pension_factor_a: null, pension_factor_a_source: null }
  const EXPLICIET_NUL = {
    net_monthly_income: 4000,
    pension_factor_a: 0,
    pension_factor_a_source: 'upo',
  }

  it('factor A niet ingevuld → de ruimte én de besparing dragen de bovengrens-bijzin', async () => {
    const ctx = await buildTaxContext(makeSupabase(ONBEKEND))
    expect(ctx).toContain('Jaarruimte (aftrekbare lijfrente-/pensioeninleg)')
    const jaarruimteRegels = ctx
      .split('\n')
      .filter((l) => l.startsWith('- Onbenutte ruimte') || l.startsWith('- Geschatte belastingbesparing'))
    expect(jaarruimteRegels.length).toBe(2)
    for (const regel of jaarruimteRegels) {
      expect(regel).toContain(JAARRUIMTE_BOVENGRENS_SUFFIX.trim())
    }
  })

  it('een EXPLICIETE 0 (geen werkgeverspensioen) is bekend → geen bijzin, zelfde bedragen', async () => {
    const onbekend = await buildTaxContext(makeSupabase(ONBEKEND))
    const expliciet = await buildTaxContext(makeSupabase(EXPLICIET_NUL))

    expect(expliciet).not.toContain('bovengrens')
    // De kwalificatie stuurt uitsluitend de weergave: dezelfde onbenutte ruimte.
    const ruimte = (s: string) => s.split('\n').find((l) => l.startsWith('- Onbenutte ruimte'))
    expect(ruimte(onbekend)).toBe(`${ruimte(expliciet)}${JAARRUIMTE_BOVENGRENS_SUFFIX}`)
  })
})

/**
 * Regressie voor het C8-vervolg — Fin noemde een DERDE Box 1-heffing.
 *
 * `computeBox1Tax` is één motor, maar deze context voedde 'm met een eigen
 * invoer: bruto via `estimateGrossYearly(net_monthly_income)` en HELEMAAL GEEN
 * eigen woning. /overzicht/belasting en /overzicht/belasting/box1 delen
 * `resolveBox1GrossIncome` + `resolveEigenWoningBox1Input`; Fin dus niet. Bij een
 * hypotheek met rente > forfait stond zijn bedrag structureel te hoog, bij een
 * (bijna) afgeloste hypotheek onder Wet Hillen juist te laag.
 *
 * Deze tests leggen vast dat de context-heffing exact de motor-uitkomst is op
 * dezelfde twee resoluties — beide kanten van het Hillen-scharnier.
 */
describe('buildTaxContext — de Box 1-heffing gebruikt de volledige, gedeelde invoer', () => {
  const GROSS = 93_369

  beforeEach(() => {
    vi.clearAllMocks()
    loadPerspectiveBox3Mock.mockResolvedValue({
      personal: { tax: 0, rendementsgrondslag: 0, heffingsvrijVermogen: 0 },
      dailyExpenses: 100,
    })
    hasBox2RelevanceMock.mockResolvedValue(false)
    loadActionedMock.mockResolvedValue(new Set<string>())
  })

  it('rente > forfait: dezelfde heffing als het scherm — niet de te hoge zonder-woning-som', async () => {
    stubBox1Sources(GROSS, { wozValue: 385_000, hypotheekRente: 10_150, hasEigenWoning: true })
    const ctx = await buildTaxContext(makeSupabase())

    const scherm = computeBox1Tax({
      grossYearlyIncome: GROSS,
      year: 2026,
      wozValue: 385_000,
      hypotheekRente: 10_150,
    })
    const zonderWoning = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })
    expect(zonderWoning.tax).toBeGreaterThan(scherm.tax) // de oude, foute waarde

    expect(ctx).toContain(`- Belasting: ${formatCurrency(scherm.tax)}`)
    expect(ctx).not.toContain(`- Belasting: ${formatCurrency(zonderWoning.tax)}`)
    expect(ctx).toContain('Eigen woning: verlaagt je Box 1-heffing')
  })

  it('forfait > rente (Wet Hillen): de heffing gaat juist OMHOOG, ook in Fins context', async () => {
    stubBox1Sources(GROSS, { wozValue: 385_000, hypotheekRente: 200, hasEigenWoning: true })
    const ctx = await buildTaxContext(makeSupabase())

    const scherm = computeBox1Tax({
      grossYearlyIncome: GROSS,
      year: 2026,
      wozValue: 385_000,
      hypotheekRente: 200,
    })
    const zonderWoning = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })
    expect(scherm.tax).toBeGreaterThan(zonderWoning.tax)

    expect(ctx).toContain(`- Belasting: ${formatCurrency(scherm.tax)}`)
    expect(ctx).toContain('Eigen woning: verhoogt je Box 1-heffing')
  })

  it('geen eigen woning → geen woningregel, en het bruto komt uit de canonieke resolutie', async () => {
    stubBox1Sources(GROSS)
    const ctx = await buildTaxContext(makeSupabase())

    expect(ctx).toContain(`- Bruto jaarinkomen: ${formatCurrency(GROSS)}`)
    expect(ctx).not.toContain('Eigen woning:')
    expect(resolveBox1GrossIncomeMock).toHaveBeenCalledWith(expect.anything(), 'u1', 2026)
  })

  it('faalt de resolutie, dan zwijgt het Box 1-blok (géén terugval op een eigen bruto-schatting)', async () => {
    resolveBox1GrossIncomeMock.mockRejectedValue(new Error('boom'))
    resolveEigenWoningMock.mockResolvedValue(GEEN_WONING)
    const ctx = await buildTaxContext(makeSupabase())

    expect(ctx).not.toContain('Box 1 (inkomen uit werk en woning)')
    // De rest van de fiscale sectie blijft staan.
    expect(ctx).toContain('Box 2 (aanmerkelijk belang in een BV)')
  })
})
