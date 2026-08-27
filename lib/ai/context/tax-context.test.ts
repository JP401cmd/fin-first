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

vi.mock('@/lib/aandachtspunten-actions', () => ({
  loadActionedAandachtspuntIds: () => loadActionedMock(),
}))
vi.mock('@/lib/household-tax', () => ({
  loadPerspectiveBox3: (...args: unknown[]) => loadPerspectiveBox3Mock(...args),
}))
vi.mock('@/lib/box2-relevance', () => ({
  hasBox2Relevance: (...args: unknown[]) => hasBox2RelevanceMock(...args),
}))

import { buildTaxContext } from './tax-context'

/**
 * Minimale fake-Supabase: een echte user + een `profiles`-rij met een gezond
 * netto maandinkomen (→ bruto ruim boven de franchise → jaarruimte > 0) en een
 * bekende factor A. Zo verschijnt het jaarruimte-blok zónder suppressie.
 */
function makeSupabase() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    net_monthly_income: 4000,
                    pension_factor_a: 1200,
                    pension_factor_a_source: 'upo',
                  },
                  error: null,
                }),
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
