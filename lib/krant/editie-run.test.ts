import { describe, expect, it, vi } from 'vitest'
import { standaardImpactContext } from './impact'

// Het transactie-inkomen loopt via het maandaggregaat (RPC); de nep-client
// kent geen rpc — de helper is hier gemockt (leeg venster: het profiel hieronder
// heeft een handmatig inkomen, dus de uitkomst hangt er niet van af).
vi.mock('@/lib/budget-realized', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/budget-realized')>()
  return { ...orig, fetchRealizedBudgetAmounts: vi.fn(async () => orig.EMPTY_REALIZED_WINDOW) }
})
import { matchEditie } from './matcher'
import { AOW_RIJEN, ARTIKELEN, NU } from './editie.fixture'
import { maakNepClient, type NepRij } from './nep-client.fixture'
import { laadAfleidingBronnen, leidProfielAf } from './profiel-afleiding'
import { meetOverlap, runEditieVoor } from './editie-run'

const UID = 'user-tessa'
const WEEK = '2026-W39'

/** Een Tessa-achtige eigenaar in tabelvorm: rijk profiel zodat de editie gevuld is. */
function tabellen(extra: Partial<Record<string, NepRij[]>> = {}): Record<string, NepRij[]> {
  return {
    profiles: [{ id: UID, date_of_birth: '1984-05-20', household_type: 'gezin', number_of_children: 2, income_source: 'manual', net_monthly_income: 7_600, onboarding_completed: true }],
    assets: [
      { id: 'a1', user_id: UID, is_active: true, asset_type: 'cash', subtype: 'savings_account', current_value: 75_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
      { id: 'a2', user_id: UID, is_active: true, asset_type: 'investment', subtype: 'indexfonds', current_value: 300_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
      { id: 'a3', user_id: UID, is_active: true, asset_type: 'eigen_huis', subtype: null, current_value: 560_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
      { id: 'a4', user_id: UID, is_active: true, asset_type: 'retirement', subtype: 'uitkeringsregeling', current_value: 120_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
    ],
    debts: [
      { id: 'd1', user_id: UID, is_active: true, debt_type: 'mortgage', current_balance: 410_000, fixed_rate_end_date: null },
      { id: 'd2', user_id: UID, is_active: true, debt_type: 'student_loan', current_balance: 3_800, fixed_rate_end_date: null },
    ],
    bank_accounts: [],
    nieuwsprofiel: [],
    app_settings: [],
    news_feedback: [],
    krant_edities: [],
    krant_editie_items: [],
    ...extra,
  }
}

async function verwachteUitkomst(tabel: Record<string, NepRij[]>, lezer: { gezien?: string[]; gedempt?: string[] } = {}) {
  const nep = maakNepClient(tabel)
  const bronnen = await laadAfleidingBronnen(nep.client as never, UID)
  const { profiel } = leidProfielAf(bronnen, { now: NU, aowRows: AOW_RIJEN })
  const uitkomst = matchEditie(profiel, ARTIKELEN, {
    now: NU,
    gezienArtikelIds: new Set(lezer.gezien ?? []),
    gedemptRubrieken: new Set(lezer.gedempt ?? []),
    impact: standaardImpactContext(AOW_RIJEN, NU.getUTCFullYear()),
  })
  return { profiel, uitkomst }
}

describe('editie-run — één lezer van profiel tot rij', () => {
  it('schrijft precies de editie die de pure matcher op het afgeleide profiel geeft (geen eigen som onderweg)', async () => {
    const { profiel, uitkomst } = await verwachteUitkomst(tabellen())
    expect(uitkomst.leeg).toBe(false)

    const nep = maakNepClient(tabellen())
    const run = await runEditieVoor(nep.client as never, { userId: UID, weekKey: WEEK, bron: 'schaduw', now: NU, aowRows: AOW_RIJEN, kandidaten: ARTIKELEN })

    expect(run).toMatchObject({ leeg: false, items: uitkomst.items.length, profielType: uitkomst.profielType, overlap: null })
    const editie = nep.rijen('krant_edities')[0]
    expect(editie).toMatchObject({ id: run.editieId, user_id: UID, week_key: WEEK, bron: 'schaduw', met_ai: false })
    expect(editie.profiel_snapshot).toEqual(profiel)
    expect(nep.rijen('nieuwsprofiel')[0]).toMatchObject({ user_id: UID, inkomen: 'boven-5500', wonen: 'koop-met-hypotheek' })

    const items = nep.rijen('krant_editie_items')
    expect(items.map((r) => [r.article_id, r.tekst, r.score])).toEqual(uitkomst.items.map((i) => [i.artikelId, i.tekst, i.score]))
  })

  it('een teruggetrokken artikel (uitsluitArtikelId) telt niet mee, ook als de rij nog op geduid staat', async () => {
    const { uitkomst } = await verwachteUitkomst(tabellen())
    const weg = uitkomst.items[0].artikelId
    const nep = maakNepClient(tabellen())
    const run = await runEditieVoor(nep.client as never, { userId: UID, weekKey: WEEK, bron: 'schaduw', now: NU, aowRows: AOW_RIJEN, kandidaten: ARTIKELEN, uitsluitArtikelId: weg })
    const ids = nep.rijen('krant_editie_items').map((r) => r.article_id)
    expect(ids).not.toContain(weg)
    expect(run.items).toBe(uitkomst.items.length - 1)
  })

  it('gezien (news_read, lokaal item-id) en gedempt (news_feedback) sturen de editie via de lezerscontext', async () => {
    // Uit de data: het eerste item is "gezien", de rubriek van het tweede is
    // "gedempt" — zo bijt de proef ongeacht welke artikelen dit profiel haalt.
    const { uitkomst: zonder } = await verwachteUitkomst(tabellen())
    expect(zonder.items.length).toBeGreaterThanOrEqual(2)
    const gezien = zonder.items[0].artikelId
    const gedempt = zonder.items[1].rubriek!
    expect(gedempt).toBeTruthy()
    const dag = (n: number) => `2026-09-${String(n).padStart(2, '0')}T00:00:00Z`
    const nep = maakNepClient(
      tabellen({
        app_settings: [{ key: `news_read:${UID}`, value: { ids: [`news-local-${gezien}`] } }],
        news_feedback: [
          { id: 'f1', user_id: UID, verdict: 'less', category: gedempt, created_at: dag(1) },
          { id: 'f2', user_id: UID, verdict: 'less', category: gedempt, created_at: dag(2) },
          // Andermans "minder" op een andere rubriek mag de eigen editie niet raken.
          { id: 'f3', user_id: 'user-ander', verdict: 'less', category: zonder.items[0].rubriek ?? 'fiscaal', created_at: dag(2) },
          { id: 'f4', user_id: 'user-ander', verdict: 'less', category: zonder.items[0].rubriek ?? 'fiscaal', created_at: dag(3) },
        ],
      }),
    )
    await runEditieVoor(nep.client as never, { userId: UID, weekKey: WEEK, bron: 'schaduw', now: NU, aowRows: AOW_RIJEN, kandidaten: ARTIKELEN })
    const items = nep.rijen('krant_editie_items').map((r) => r.article_id)
    expect(items).not.toContain(gezien)
    const feedbackQuery = nep.queriesOp('news_feedback')[0]
    expect(feedbackQuery.stappen.some((s) => s.m === 'eq' && s.args[0] === 'user_id' && s.args[1] === UID)).toBe(true)
    // De rijen zijn exact de pure matcher-uitkomst met déze lezerscontext …
    const { uitkomst: met } = await verwachteUitkomst(tabellen(), { gezien: [gezien], gedempt: [gedempt] })
    expect(items).toEqual(met.items.map((i) => i.artikelId))
    // … en die context deed er toe (anders bewaakt de proef niets).
    expect(items).not.toEqual(zonder.items.map((i) => i.artikelId))
  })

  it('meetOverlap vergelijkt op genormaliseerde bron-url met de LLM-editie in news_cache; zonder cache null', async () => {
    const { uitkomst } = await verwachteUitkomst(tabellen())
    const [eerste, tweede] = uitkomst.items
    const cache = {
      items: [
        { id: 'news-1', sourceUrl: `${eerste.url}/` }, // trailing slash: normalizeUrl maakt 'm gelijk
        { id: 'news-2', sourceUrl: 'https://voorbeeld.nl/alleen-in-het-model' },
        { id: 'news-3' }, // zonder url: telt niet
      ],
      generatedAt: NU.toISOString(),
    }
    const nep = maakNepClient(tabellen({ app_settings: [{ key: `news_cache:${UID}`, value: JSON.stringify(cache) }] }))
    const run = await runEditieVoor(nep.client as never, { userId: UID, weekKey: WEEK, bron: 'schaduw', now: NU, aowRows: AOW_RIJEN, kandidaten: ARTIKELEN, meetOverlap: true })
    expect(run.overlap).toEqual({ beide: 1, alleenMatcher: uitkomst.items.length - 1, alleenModel: 1 })
    expect(tweede).toBeDefined()

    const leeg = maakNepClient(tabellen())
    expect(await meetOverlap(leeg.client as never, UID, uitkomst)).toBeNull()
  })
})
