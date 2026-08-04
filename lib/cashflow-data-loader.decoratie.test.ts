/**
 * DE FEED-DECORATIE KAPT NIET MEER AF (T3.4 · deel A).
 *
 * `loadCashflowData` toont de transactie-feed uit de PERSPECTIEF-set (die is
 * volledig gepagineerd) maar haalde de rekening-/categorienaam uit een aparte
 * join-query met een vast `.limit(500)` over het 3-maands venster. Zodra iemand
 * meer rijen in dat venster had dan die grens, vielen de OUDSTE feed-rijen
 * buiten de join: ze verschenen wél, maar zonder `account_name`/`category`.
 * Geen fout, geen signaal — het zag eruit als ontbrekende data.
 *
 * Het lastige eraan: naamloos is óók LEGITIEM. Partner-persoonlijke rijen komen
 * uit de privacy-gated RPC en zijn onder de eigen RLS onzichtbaar; die hóren
 * zonder rekening-/categorienaam te blijven. Een fix die simpelweg "alles krijgt
 * een naam" zou dat wegpoetsen. Deze test houdt de twee gevallen daarom
 * expliciet uit elkaar:
 *
 *   · eigen + gedeelde rijen (eigen-RLS-set)  → MOETEN een naam hebben
 *   · partner-persoonlijke rijen (`_provenance: 'partner'`) → MOETEN naamloos zijn
 *
 * Naast de uitkomst wordt ook de BEDRADING vastgelegd: de decoratie-query wordt
 * gedreven door de id's die de feed daadwerkelijk toont (`.in('id', …)` in
 * batches), niet door een venster-met-limiet. Zonder die tweede laag zou een
 * herintroductie van de afkap via een ruimere limiet ongemerkt kunnen slagen.
 *
 * React `cache()` is buiten een RSC-render een passthrough (zie
 * lib/supabase/cached-user.dedupe.test.ts); per aanroep krijgt de loader
 * niettemin een verse mock-client, zodat cache-identiteit nooit meespeelt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'

const { mockLoadPerspectiveTransactionsServer } = vi.hoisted(() => ({
  mockLoadPerspectiveTransactionsServer: vi.fn(),
}))

// De perspectief-loader is hier NIET het onderwerp: die levert de rijen-set
// (ownership/privacy al toegepast) en wordt gestubd, zodat deze test puur gaat
// over wat `loadCashflowData` met die set doet — welke id's het decoreert en
// welke het bewust naamloos laat.
vi.mock('@/lib/household/perspective-loader-server', () => ({
  loadPerspectiveTransactionsServer: mockLoadPerspectiveTransactionsServer,
}))

import { loadCashflowData } from './cashflow-data-loader'

// ── Fixture ────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
/** ISO-datum (yyyy-mm-dd) van `daysAgo` dagen geleden, zelfde UTC-basis als de loader. */
const dayIso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString().split('T')[0]

/**
 * Aantal eigen rijen in het 3-maands feed-venster. Bewust ruim boven de oude
 * afkapgrens van de join-query, zodat de oudste rijen er gegarandeerd buiten
 * vielen. Geen productiecijfer — een fixture-omvang.
 */
const OWN_ROWS = 620
/** ~11 rijen per dag ⇒ de oudste rij ligt ~57 dagen terug: ruim binnen 3 maanden. */
const ROWS_PER_DAY = 11

const ACCOUNT_NAME = 'Betaalrekening'
const CATEGORY_NAME = 'Boodschappen'
/** Gedeelde rij op naam van de PARTNER — zichtbaar via de huishoud-RLS. */
const SHARED_ID = 'shared-partner-owned'
const OUT_OF_WINDOW_ID = 'own-buiten-venster'
const PARTNER_IDS = ['partner-0', 'partner-1', 'partner-2']

type JoinRow = {
  id: string
  date: string
  bank_accounts: { name: string } | null
  budgets: { name: string } | null
}

/** De rijen die de EIGEN RLS op `transactions` teruggeeft (join-gedecoreerd). */
function ownRlsRows(): JoinRow[] {
  const rows: JoinRow[] = []
  for (let i = 0; i < OWN_ROWS; i++) {
    rows.push({
      id: `own-${String(i).padStart(3, '0')}`,
      date: dayIso(Math.floor(i / ROWS_PER_DAY) + 1),
      bank_accounts: { name: ACCOUNT_NAME },
      budgets: { name: CATEGORY_NAME },
    })
  }
  // Gedeelde rij van de partner: hoort net zo goed gedecoreerd te worden.
  rows.push({
    id: SHARED_ID,
    date: dayIso(2),
    bank_accounts: { name: 'Gedeelde huishoudrekening' },
    budgets: { name: 'Wonen' },
  })
  // Buiten het 3-maands feed-venster: mag niet in de feed en niet opgevraagd worden.
  rows.push({
    id: OUT_OF_WINDOW_ID,
    date: dayIso(150),
    bank_accounts: { name: ACCOUNT_NAME },
    budgets: { name: CATEGORY_NAME },
  })
  return rows
}

/** De perspectief-set: dezelfde eigen/gedeelde rijen + partner-persoonlijke rijen. */
function perspectiveRows() {
  const own = ownRlsRows().map((r) => ({
    id: r.id,
    date: r.date,
    description: `Boeking ${r.id}`,
    amount: -12.5,
    ownership: r.id === SHARED_ID ? ('shared' as const) : ('personal' as const),
    user_id: r.id === SHARED_ID ? 'partner' : 'me',
    _provenance: r.id === SHARED_ID ? ('gezamenlijk' as const) : ('eigen' as const),
    _myShareFraction: 1,
    _aggregated: false,
  }))
  const partner = PARTNER_IDS.map((id, i) => ({
    id,
    date: dayIso(i + 1),
    description: `Partner-boeking ${i}`,
    amount: -30,
    ownership: 'personal' as const,
    user_id: 'partner',
    _provenance: 'partner' as const,
    _myShareFraction: 1,
    _aggregated: false,
  }))
  return [...own, ...partner]
}

/** Alle id's die de feed hoort te tonen ÉN die onder de eigen RLS zichtbaar zijn. */
function decorableIds(): string[] {
  return ownRlsRows()
    .filter((r) => r.id !== OUT_OF_WINDOW_ID)
    .map((r) => r.id)
    .sort()
}

// ── Mock-client ────────────────────────────────────────────────

interface TxQuery {
  columns: string | null
  gteDate: string | null
  inIds: string[] | null
  limit: number | null
  ordered: boolean
}

/**
 * Mock-Supabase die de PostgREST-semantiek nabootst die de afkap veroorzaakte:
 * `.gte('date', …)`, `.order('date', desc)`, `.limit(n)` en `.in('id', […])`
 * worden echt toegepast op de eigen-RLS-rijenset. Alleen zó kan de test rood
 * staan op de oude code én groen op de nieuwe.
 */
function makeClient(
  joinRows: JoinRow[] = ownRlsRows(),
  /**
   * Laat een decoratie-batch falen zoals PostgREST dat doet: `{ data: null,
   * error }`. Krijgt de batch-index mee zodat een test één specifieke batch kan
   * laten omvallen en de rest kan laten slagen.
   */
  failBatch: (batchIndex: number) => boolean = () => false,
) {
  const txQueries: TxQuery[] = []
  let inFlight = 0
  let maxInFlight = 0

  function builder(table: string) {
    const q: TxQuery = { columns: null, gteDate: null, inIds: null, limit: null, ordered: false }
    const batchIndex = table === 'transactions' ? txQueries.length : -1
    if (table === 'transactions') txQueries.push(q)

    const resolve = (): Record<string, unknown>[] => {
      if (table !== 'transactions') return []
      let rows = joinRows.filter(
        (r) =>
          (q.gteDate == null || r.date >= q.gteDate) &&
          (q.inIds == null || q.inIds.includes(r.id)),
      )
      // Array.prototype.sort is stabiel: gelijke datums houden hun volgorde.
      if (q.ordered) rows = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      if (q.limit != null) rows = rows.slice(0, q.limit)
      return rows as unknown as Record<string, unknown>[]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: (columns: string) => {
        q.columns = columns
        return b
      },
      eq: () => b,
      gte: (col: string, val: string) => {
        if (col === 'date') q.gteDate = val
        return b
      },
      lte: () => b,
      in: (col: string, vals: string[]) => {
        if (col === 'id') q.inIds = [...vals]
        return b
      },
      order: () => {
        q.ordered = true
        return b
      },
      limit: (n: number) => {
        q.limit = n
        return b
      },
      single: () => Promise.resolve({ data: { full_name: 'Testgebruiker' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: { full_name: 'Testgebruiker' }, error: null }),
      // Resolutie op een macrotask (niet synchroon), zodat de GOLF-structuur van
      // de loader waarneembaar is: alles wat gelijktijdig onderweg is, is
      // opgehoogd vóór de eerste afronding. Daarmee meet `maxInFlight` echt de
      // fan-out en niet de aanroepvolgorde.
      then: (res: (v: { data: unknown; error: unknown }) => unknown) => {
        const payload =
          batchIndex >= 0 && failBatch(batchIndex)
            ? { data: null, error: { message: 'batch-storing (fixture)' } }
            : { data: resolve(), error: null }
        if (batchIndex < 0) return Promise.resolve(res(payload))
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise<void>((r) => setTimeout(r, 0)).then(() => {
          inFlight -= 1
          return res(payload)
        })
      },
    }
    return b
  }

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient

  return { supabase, txQueries, stats: () => ({ maxInFlight }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadPerspectiveTransactionsServer.mockImplementation(async (
    _supabase: SupabaseClient,
    perspective: Perspective,
  ) => ({
    perspective,
    context: {
      userId: 'me',
      hasHousehold: true,
      householdId: 'h1',
      partnerId: 'partner',
      partnerName: 'Partner',
      splitMode: 'equal' as const,
      customSplitPct: null,
      primaryPayerId: null,
      mySharePct: 50,
      partnerPrivacy: null,
      budgetModel: 'separate' as const,
    },
    transactions: perspectiveRows(),
    partnerMonthlyIncome: null,
  }))
})

// ── Uitkomst ───────────────────────────────────────────────────

describe('loadCashflowData — feed-decoratie kapt niet af', () => {
  it('geeft ELKE rij uit de eigen-RLS-set een rekening- en categorienaam', async () => {
    const { supabase } = makeClient()
    const { transactions } = await loadCashflowData(supabase, 'household')

    const eigenRijen = transactions.filter((t) => !PARTNER_IDS.includes(t.id))
    // Bewijs dat we ook echt de rijen VOORBIJ de oude afkapgrens beoordelen.
    expect(eigenRijen.length).toBe(OWN_ROWS + 1)

    const naamloos = eigenRijen.filter((t) => t.account_name == null || t.category == null)
    expect(naamloos.map((t) => t.id)).toEqual([])
  })

  it('decoreert ook de gedeelde rij die op naam van de PARTNER staat', async () => {
    // Vangt een decoratie-query die zichzelf met `.eq('user_id', me)` zou
    // versmallen: gedeelde rijen kunnen op naam van de partner staan.
    const { supabase } = makeClient()
    const { transactions } = await loadCashflowData(supabase, 'household')

    const gedeeld = transactions.find((t) => t.id === SHARED_ID)
    expect(gedeeld?.account_name).toBe('Gedeelde huishoudrekening')
    expect(gedeeld?.category).toBe('Wonen')
  })

  // LET OP wat deze test wél en niet bewijst: hij pint vast dat de loader geen
  // namen VERZINT voor rijen die de eigen RLS niet teruggeeft. Hij bewijst NIET
  // dat de `_provenance`-filter bestaat — die rijen zitten niet in de
  // RLS-fixture, dus ze blijven ook zonder filter naamloos. Dat bewijs zit in de
  // bedradings-assertie verderop (`expect(gevraagd).toEqual(decorableIds())`).
  it('laat partner-persoonlijke rijen bewust naamloos (privacy, geen defect)', async () => {
    const { supabase } = makeClient()
    const { transactions } = await loadCashflowData(supabase, 'household')

    const partnerRijen = transactions.filter((t) => PARTNER_IDS.includes(t.id))
    expect(partnerRijen).toHaveLength(PARTNER_IDS.length)
    for (const rij of partnerRijen) {
      expect(rij.account_name, `partner-rij ${rij.id} hoort naamloos te blijven`).toBeNull()
      expect(rij.category, `partner-rij ${rij.id} hoort naamloos te blijven`).toBeNull()
    }
  })

  it('houdt rijen buiten het 3-maands venster uit de feed', async () => {
    const { supabase } = makeClient()
    const { transactions } = await loadCashflowData(supabase, 'household')
    expect(transactions.some((t) => t.id === OUT_OF_WINDOW_ID)).toBe(false)
  })
})

// ── Bedrading ──────────────────────────────────────────────────

describe('loadCashflowData — decoratie volgt de getoonde ids', () => {
  it('vraagt exact de zichtbare feed-ids op, in batches, zonder limiet', async () => {
    const { supabase, txQueries } = makeClient()
    await loadCashflowData(supabase, 'household')

    expect(txQueries.length).toBeGreaterThan(0)
    for (const q of txQueries) {
      // Id-gedreven, niet venster-met-limiet: een afkap is per constructie
      // onmogelijk geworden.
      expect(q.inIds, 'decoratie hoort op id te selecteren').not.toBeNull()
      expect(q.limit, 'een limiet op de decoratie-query kan opnieuw afkappen').toBeNull()
      // URL-lengtegrens: id-lijsten gaan in behapbare batches de deur uit.
      expect(q.inIds!.length).toBeLessThanOrEqual(100)
    }
    // Met deze fixture past het niet in één batch — batching wordt echt gedaan.
    expect(txQueries.length).toBeGreaterThan(1)

    const gevraagd = txQueries.flatMap((q) => q.inIds ?? []).sort()
    // ⚠️ DIT IS DE DRAGENDE ASSERTIE VOOR DE `_provenance`-FILTER — de enige.
    // De uitkomst-test "laat partner-persoonlijke rijen bewust naamloos" bewijst
    // 'm NIET: die rijen zitten sowieso niet in de eigen-RLS-fixture, dus ze
    // blijven ook naamloos als de filter verdwijnt (nagemeten: filter weghalen
    // laat álles groen behalve deze regel). Zwak deze assertie dus niet af en
    // verwijder 'm niet zonder vervanging — dan test niets meer dat partner-
    // id's buiten de decoratie-query blijven.
    // Tevens: niets buiten het 3-maands venster.
    expect(gevraagd).toEqual(decorableIds())
  })

  it('haalt alleen de naam-kolommen op, geen rij-inhoud (die komt uit de perspectief-set)', async () => {
    const { supabase, txQueries } = makeClient()
    await loadCashflowData(supabase, 'household')

    for (const q of txQueries) {
      expect(q.columns).toBe('id, bank_accounts(name), budgets(name)')
    }
  })

  it('houdt de fan-out begrensd — niet alle batches tegelijk', async () => {
    const { supabase, txQueries, stats } = makeClient()
    await loadCashflowData(supabase, 'household')

    // Er zijn ruim meer batches dan de golfbreedte; zonder begrenzing zou
    // maxInFlight gelijk zijn aan het totale aantal batches.
    expect(txQueries.length).toBeGreaterThan(5)
    expect(stats().maxInFlight).toBeLessThanOrEqual(5)
  })

  it('doet géén decoratie-query als de feed leeg is', async () => {
    mockLoadPerspectiveTransactionsServer.mockImplementation(async (
      _supabase: SupabaseClient,
      perspective: Perspective,
    ) => ({
      perspective,
      context: {
        userId: 'me',
        hasHousehold: false,
        householdId: null,
        partnerId: null,
        partnerName: null,
        splitMode: 'equal' as const,
        customSplitPct: null,
        primaryPayerId: null,
        mySharePct: 100,
        partnerPrivacy: null,
        budgetModel: 'separate' as const,
      },
      transactions: [],
      partnerMonthlyIncome: null,
    }))

    const { supabase, txQueries } = makeClient()
    const { transactions } = await loadCashflowData(supabase, 'personal')
    expect(transactions).toEqual([])
    expect(txQueries).toEqual([])
  })
})

// ── Faalgedrag ─────────────────────────────────────────────────

/**
 * Een gefaalde batch mag niet stil zijn. Vóór de id-decoratie was de decoratie
 * één alles-of-niets-query: een fout liet de HELE feed naamloos — zichtbaar
 * kapot. Nu laat één gefaalde batch een blok naamloze rijen middenin een lange
 * feed achter, visueel niet te onderscheiden van de partner-rijen die legitiem
 * naamloos zijn. Dat is precies het faalbeeld van de bug die deze code dichtte,
 * terug via een smallere deur — dus het moet in de logs vindbaar zijn.
 */
describe('loadCashflowData — een gefaalde decoratie-batch is luidruchtig, niet stil', () => {
  it('logt server-side met een grep-bare tag', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Alleen de tweede batch valt om.
      const { supabase } = makeClient(ownRlsRows(), (i) => i === 1)
      await loadCashflowData(supabase, 'household')

      expect(spy).toHaveBeenCalledTimes(1)
      const [melding] = spy.mock.calls[0]
      expect(String(melding)).toContain('[cashflow:decorate]')
      expect(String(melding)).toContain('batch-storing (fixture)')
    } finally {
      spy.mockRestore()
    }
  })

  it('laat de overige batches gewoon hun namen leveren', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { supabase } = makeClient(ownRlsRows(), (i) => i === 1)
      const { transactions } = await loadCashflowData(supabase, 'household')

      const eigenRijen = transactions.filter((t) => !PARTNER_IDS.includes(t.id))
      const metNaam = eigenRijen.filter((t) => t.account_name != null)
      const zonderNaam = eigenRijen.filter((t) => t.account_name == null)

      // Precies één batch kwijt: de rest is er gewoon.
      expect(zonderNaam.length).toBeGreaterThan(0)
      expect(zonderNaam.length).toBeLessThanOrEqual(100)
      expect(metNaam.length).toBe(eigenRijen.length - zonderNaam.length)
      expect(metNaam.length).toBeGreaterThan(zonderNaam.length)
    } finally {
      spy.mockRestore()
    }
  })

  it('houdt élke feed-rij zichtbaar — de naam is verrijking, geen inhoud', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Álles valt om: de zwaarst denkbare storing.
      const { supabase } = makeClient(ownRlsRows(), () => true)
      const { transactions } = await loadCashflowData(supabase, 'household')

      expect(transactions).toHaveLength(OWN_ROWS + 1 + PARTNER_IDS.length)
      for (const rij of transactions) {
        expect(rij.account_name).toBeNull()
        // Bedrag en omschrijving komen uit de perspectief-set en blijven staan.
        expect(rij.description).not.toBe('')
      }
    } finally {
      spy.mockRestore()
    }
  })

  it('lekt geen DB-fouttekst naar de teruggegeven data (AVG/ADR 0044)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { supabase } = makeClient(ownRlsRows(), () => true)
      const data = await loadCashflowData(supabase, 'household')
      expect(JSON.stringify(data)).not.toContain('batch-storing')
    } finally {
      spy.mockRestore()
    }
  })
})
