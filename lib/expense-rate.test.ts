import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  recentDailyExpenseRateFromRows,
  getRecentDailyExpenseRate,
} from './expense-rate'
import { CREDIBLE_MONTHLY_BASIS_MIN, dailyExpenseRate } from './format'
import { EXPENSE_RATE_ROLLING_MONTHS } from './constants'

afterEach(() => {
  vi.restoreAllMocks()
})

// Vast referentiepunt zodat dataMonths deterministisch is.
const REF = new Date('2026-06-15T12:00:00Z')

describe('recentDailyExpenseRateFromRows', () => {
  it('geeft nul + source "none" bij geen rijen en geen schatting', () => {
    const r = recentDailyExpenseRateFromRows([], REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  it('valt terug op de maand-schatting wanneer er geen transacties zijn', () => {
    const r = recentDailyExpenseRateFromRows([], REF, 3000)
    expect(r.source).toBe('estimate')
    expect(r.monthlyExpenses).toBe(3000)
    expect(r.dataMonths).toBe(0)
    // Canonieke conversie ×12/365, NIET /30.
    expect(r.dailyRate).toBeCloseTo((3000 * 12) / 365, 6)
    expect(r.dailyRate).toBe(dailyExpenseRate(3000))
  })

  it('negeert de schatting zodra er transacties zijn', () => {
    const rows = [{ amount: -100, date: '2026-06-10' }]
    const r = recentDailyExpenseRateFromRows(rows, REF, 9999)
    expect(r.source).toBe('transactions')
    // 1 maand data → maanduitgaven = totaal (niet de schatting van 9999).
    expect(r.dataMonths).toBe(1)
    expect(r.monthlyExpenses).toBe(100)
  })

  it('middelt over het aantal maanden met data (rolling gemiddelde)', () => {
    const rows = [
      { amount: -100, date: '2026-04-10' },
      { amount: -200, date: '2026-05-10' },
      { amount: -300, date: '2026-06-10' },
    ]
    const r = recentDailyExpenseRateFromRows(rows, REF)
    // apr..jun t.o.v. juni = 3 maanden; totaal 600 / 3 = 200 per maand.
    expect(r.dataMonths).toBe(3)
    expect(r.monthlyExpenses).toBe(200)
    expect(r.dailyRate).toBeCloseTo((200 * 12) / 365, 6)
    // Bundel-invariant (KRUIS-17): dailyRate en monthlyExpenses komen uit één
    // berekening, dus dailyRate === dailyExpenseRate(monthlyExpenses). Widgets
    // consumeren DashboardData.dailyExpenseRate, de briefing consumeert
    // DashboardData.recentMonthlyExpenses — beide tracen naar dit ene punt.
    expect(r.dailyRate).toBe(dailyExpenseRate(r.monthlyExpenses))
  })

  it('klemt dataMonths op EXPENSE_RATE_ROLLING_MONTHS ook bij oudere earliest', () => {
    const rows = [
      { amount: -12000, date: '2024-01-01' }, // ~30 mnd terug
      { amount: -12000, date: '2026-06-01' },
    ]
    const r = recentDailyExpenseRateFromRows(rows, REF)
    expect(r.dataMonths).toBe(EXPENSE_RATE_ROLLING_MONTHS)
    // 24000 / 12 = 2000 per maand.
    expect(r.monthlyExpenses).toBe(2000)
  })

  it('rekent op de absolute waarde en accepteert string-bedragen', () => {
    const rows = [
      { amount: '-50.5', date: '2026-06-01' },
      { amount: -49.5, date: '2026-06-02' },
    ]
    const r = recentDailyExpenseRateFromRows(rows, REF)
    expect(r.dataMonths).toBe(1)
    expect(r.monthlyExpenses).toBe(100)
  })

  it('minstens 1 maand data, ook bij één transactie op de referentiemaand', () => {
    const r = recentDailyExpenseRateFromRows([{ amount: -365, date: '2026-06-15' }], REF)
    expect(r.dataMonths).toBe(1)
    expect(r.monthlyExpenses).toBe(365)
    expect(r.dailyRate).toBeCloseTo((365 * 12) / 365, 6) // = 12
  })

  /**
   * GELOOFWAARDIGHEIDSVLOER BIJ DE PRODUCENT (UR2-03, ADR 0126). De consumptie-
   * grondslag laat een account met vooral overboekingen een piepklein-maar-niet-
   * nul tarief over (bv. €2/mnd bankkosten, ongecategoriseerd). Consumenten die
   * alleen op `source === 'transactions'`/`dailyRate > 0` toetsen (assets-widget,
   * freedom-time-label, budgets-client, totaalplan-blocks, …) zouden dan
   * "414 jaar vrijheid" voor €10.000 tonen. De vloer (`CREDIBLE_MONTHLY_BASIS_MIN`,
   * lib/format.ts) woont daarom in de bron: onder de vloer = "geen rijen".
   */
  describe('geloofwaardigheidsvloer (CREDIBLE_MONTHLY_BASIS_MIN)', () => {
    // Twaalf maanden van €2 bankkosten: 24 / 12 = €2/mnd — de artefact-regio.
    const bankkosten = Array.from({ length: 12 }, (_, i) => ({
      amount: -2,
      date: `${i < 6 ? '2025' : '2026'}-${String(((i + 6) % 12) + 1).padStart(2, '0')}-01`,
    }))

    it('onder de vloer MET schatting → door naar de schatting-tak (source "estimate")', () => {
      const r = recentDailyExpenseRateFromRows(bankkosten, REF, 2500)
      expect(r).toEqual({
        dailyRate: dailyExpenseRate(2500),
        monthlyExpenses: 2500,
        dataMonths: 0,
        source: 'estimate',
      })
    })

    it('onder de vloer ZONDER schatting → source "none", geen verzonnen tarief', () => {
      const r = recentDailyExpenseRateFromRows(bankkosten, REF)
      expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
    })

    it('exact op de vloer is geloofwaardig (≥), er net onder niet', () => {
      const op = recentDailyExpenseRateFromRows([{ amount: -CREDIBLE_MONTHLY_BASIS_MIN, date: '2026-06-10' }], REF, 3000)
      expect(op.source).toBe('transactions')
      expect(op.monthlyExpenses).toBe(CREDIBLE_MONTHLY_BASIS_MIN)
      const onder = recentDailyExpenseRateFromRows([{ amount: -(CREDIBLE_MONTHLY_BASIS_MIN - 0.01), date: '2026-06-10' }], REF, 3000)
      expect(onder.source).toBe('estimate')
      expect(onder.monthlyExpenses).toBe(3000)
    })

    it('dezelfde vloer geldt voor de schatting zelf: €50/mnd uit het profiel is óók geen basis', () => {
      expect(recentDailyExpenseRateFromRows([], REF, 50)).toEqual({
        dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none',
      })
      expect(recentDailyExpenseRateFromRows(bankkosten, REF, 50).source).toBe('none')
    })

    it('invariant: monthlyExpenses is altijd 0 óf ≥ de vloer, in elke tak', () => {
      const varianten = [
        recentDailyExpenseRateFromRows(bankkosten, REF),
        recentDailyExpenseRateFromRows(bankkosten, REF, 50),
        recentDailyExpenseRateFromRows(bankkosten, REF, 2500),
        recentDailyExpenseRateFromRows([{ amount: -1200, date: '2026-06-01' }], REF),
      ]
      for (const v of varianten) {
        expect(v.monthlyExpenses === 0 || v.monthlyExpenses >= CREDIBLE_MONTHLY_BASIS_MIN).toBe(true)
        expect(v.dailyRate === 0 || v.dailyRate >= dailyExpenseRate(CREDIBLE_MONTHLY_BASIS_MIN)).toBe(true)
      }
    })
  })
})

describe('getRecentDailyExpenseRate (server-variant)', () => {
  /**
   * Minimale Supabase-mock op de RPC-rand. Sinds bevinding L10 loopt de
   * server-variant NIET meer over `.from('transactions')` maar over het
   * maandaggregaat `tx_month_aggregate` — een rauwe rij-fetch werd door PostgREST
   * stil op max_rows = 1000 afgekapt en loog het dagtarief omhoog.
   *
   * `from('transactions')` gooit hier expres: dat is de grendel die een terugval
   * naar de rauwe rij-route zichtbaar maakt in plaats van 'm stilzwijgend te laten
   * slagen. `from('budgets')` is de ENIGE toegestane tabel-lees: de
   * consumptie-grondslag (ADR 0126 D2) heeft het budgettype nodig om archief-,
   * inkomsten- en spaarbudgetten uit het dagtarief te houden, en haalt dat via de
   * gedeelde `getBudgets` (lib/server-data/base.ts) — geen rij-fetch die kan afkappen.
   */
  function makeSupabase(
    rows: Array<Record<string, unknown>>,
    budgets: Array<Record<string, unknown>> = [],
    budgetsError: unknown = null,
  ) {
    const calls: Record<string, unknown> = {}
    const tables: string[] = []
    const client = {
      rpc: (fn: string, params: Record<string, unknown>) => {
        calls.fn = fn
        calls.params = params
        return Promise.resolve({ data: rows, error: null })
      },
      from: (table: string) => {
        tables.push(table)
        if (table !== 'budgets') {
          throw new Error(`rauwe ${table}-fetch: de afkap-bug (L10) is terug`)
        }
        const chain = {
          select: () => chain,
          order: () =>
            Promise.resolve(budgetsError ? { data: null, error: budgetsError } : { data: budgets, error: null }),
        }
        return chain
      },
      __calls: calls,
      __tables: tables,
    }
    return client as unknown as Parameters<typeof getRecentDailyExpenseRate>[0] & {
      __calls: Record<string, unknown>
    }
  }

  /** Aggregaat-rij zoals `tx_month_aggregate` 'm teruggeeft. */
  function aggRow(month: string, negatief: number, type: string | null = null) {
    return {
      month,
      budget_id: null,
      transaction_type: type,
      sum_positief: 0,
      sum_negatief: negatief,
      count: 1,
    }
  }

  it('haalt het 12-mnd venster uit het maandaggregaat en delegeert naar de pure helper', async () => {
    const supabase = makeSupabase([aggRow('2026-05', -300), aggRow('2026-06', -300)])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    // mei + juni t.o.v. juni = 2 mnd; 600/2 = 300.
    expect(r.source).toBe('transactions')
    expect(r.dataMonths).toBe(2)
    expect(r.monthlyExpenses).toBe(300)

    const calls = (supabase as unknown as { __calls: Record<string, unknown> }).__calls
    expect(calls.fn).toBe('tx_month_aggregate')
    const params = calls.params as Record<string, unknown>
    // Venster: 11 maanden terug t/m het EINDE van de referentiemaand (`to` exclusief).
    expect(params.p_from).toBe('2025-07-01')
    expect(params.p_to).toBe('2026-07-01')
    // RLS-breed (eigen + gedeeld huishouden), zoals de rauwe fetch ook was.
    expect(params.p_own_only).toBe(false)
    // Geen service-role-scope op dit sessie-pad.
    expect(params.p_user_id).toBeUndefined()
  })

  /**
   * CONSUMPTIE-GRONDSLAG (ADR 0126, besluit D2). Een aggregaatrij telt in het
   * dagtarief wanneer (1) sum_negatief < 0, (2) geen (joint_)transfer, en (3) het
   * geërfde budgettype niet in EXCLUDED_BUDGET_TYPES ('archive','income','savings')
   * zit. Ongecategoriseerd (budget_id null) telt MEE (blocklist, niet allowlist);
   * 'debt' telt mee (aflossing is een uitgave).
   *
   * BEKENDE BEPERKING (rand `b-partner-onzichtbaar`): een niet-null budget_id die
   * niet in de type-map staat valt door de blocklist en telt mee. Dat is GEEN
   * verwijderd budget — `transactions.budget_id` is `ON DELETE SET NULL`, dus een
   * verwijderd budget levert nooit een onbekende id — maar een RLS-onzichtbaar
   * PARTNER-budget: shared transacties zijn binnen het huishouden zichtbaar,
   * partnerbudgetten in het default model 'separate' niet. Een partner-hypotheek
   * op diens archiefbudget telt zo als jouw consumptie. Vandaag onbereikbaar (nul
   * huishoudens in productie); hier vastgelegd als beperking, niet als norm.
   * TODO(ADR 0126-vervolg): zie de kop van lib/expense-rate.ts.
   *
   * De productiecase die dit afdwong: ~60% van het 12-maands "uitgaven"-totaal
   * bestond uit één hypotheekaflossing (transaction_type NULL, archief-budget
   * "Eigen rekening") plus één terugbetaald voorschot (type transfer, archief-
   * budget). Het dagtarief stond daardoor ~2,6× te hoog en élke €→vrijheidstijd
   * in de app dus ~2,6× te kort.
   */
  it('rekent op gezuiverde consumptie: archief/inkomsten/spaar-budgetten en transfers tellen NIET mee', async () => {
    const budgets = [
      { id: 'b-huur', parent_id: null, budget_type: 'expense' },
      { id: 'b-eigen', parent_id: null, budget_type: 'archive' },
      // Child ERFT het type van zijn parent (buildBudgetTypeMap) — óók als zijn
      // eigen kolom iets anders zegt; de erfregel is de canonieke.
      { id: 'b-eigen-kind', parent_id: 'b-eigen', budget_type: 'expense' },
      { id: 'b-sparen', parent_id: null, budget_type: 'savings' },
      { id: 'b-schuld', parent_id: null, budget_type: 'debt' },
      { id: 'b-inkomen', parent_id: null, budget_type: 'income' },
    ]
    const row = (budgetId: string | null, negatief: number, type: string | null = null) => ({
      ...aggRow('2026-06', negatief, type),
      budget_id: budgetId,
    })
    const supabase = makeSupabase(
      [
        row('b-huur', -1200), //                 huur — TELT (expense)
        row('b-eigen', -60000), //               hypotheekaflossing, type NULL op archief — TELT NIET
        row('b-eigen', -5000, 'transfer'), //    terugbetaald voorschot — TELT NIET (transfer én archief)
        row(null, -300, 'joint_transfer'), //    overboeking zonder budget — TELT NIET (transfer)
        row(null, -80), //                       ongecategoriseerd — TELT (blocklist-semantiek)
        row('b-eigen-kind', -40), //             kind van archief — TELT NIET (erfregel)
        row('b-sparen', -500), //                storting op spaarbudget — TELT NIET (savings)
        row('b-schuld', -300), //                aflossing op schuldbudget — TELT (debt)
        row('b-inkomen', -100), //               salaris-storno op inkomstenbudget — TELT NIET (income)
        row('b-partner-onzichtbaar', -60), //    RLS-onzichtbaar partnerbudget — TELT (bekende beperking, zie docstring)
      ],
      budgets,
    )
    const r = await getRecentDailyExpenseRate(supabase, REF)
    // 1200 + 80 + 300 + 60 = 1640; de oude "alles negatief"-grondslag gaf 67.580.
    expect(r.monthlyExpenses).toBe(1640)
    expect(r.dailyRate).toBe(dailyExpenseRate(1640))
    expect(r.dataMonths).toBe(1)
    expect(r.source).toBe('transactions')
    // De budgettypes komen via de gedeelde `getBudgets`-getter, niet via een
    // eigen query per aanroeper.
    const tables = (supabase as unknown as { __tables: string[] }).__tables
    expect(tables).toEqual(['budgets'])
  })

  /**
   * De exposure die de zuivering zélf creëert: een account met vooral
   * overboekingen houdt na de fix alleen €2/mnd ongecategoriseerde bankkosten
   * over. Zonder vloer zou dat `source: 'transactions'` met €0,07/dag zijn —
   * "414 jaar vrijheid" voor €10.000. Met de vloer bij de producent valt het
   * door naar de profielschatting, of naar 'none'.
   */
  it('vloer bij de producent: overboekingen + €2 bankkosten → schatting, of "none" zonder schatting', async () => {
    const rijen = [
      { ...aggRow('2026-05', -9000, 'transfer') },
      { ...aggRow('2026-06', -9000, 'transfer') },
      { ...aggRow('2026-05', -2) },
      { ...aggRow('2026-06', -2) },
    ]
    const metSchatting = await getRecentDailyExpenseRate(makeSupabase(rijen), REF, 2200)
    expect(metSchatting.source).toBe('estimate')
    expect(metSchatting.monthlyExpenses).toBe(2200)
    expect(metSchatting.dataMonths).toBe(0)

    const zonderSchatting = await getRecentDailyExpenseRate(makeSupabase(rijen), REF)
    expect(zonderSchatting).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  /**
   * FOUT NIET SLIKKEN: zonder budgettypes zou een lege type-map alles behalve
   * transfers weer laten meetellen — de oude, ~2,6× te hoge grondslag, stil.
   * Een mislukte budgets-fetch is daarom "geen data": gelogd, en door naar de
   * schatting of 'none'. Nooit "alles is consumptie".
   */
  it('budgets-fetch faalt → gelogd en behandeld als "geen data", niet als "alles is consumptie"', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rijen = [
      { ...aggRow('2026-06', -1200), budget_id: 'b-huur' },
      { ...aggRow('2026-06', -60000), budget_id: 'b-eigen' }, // archief — zou zonder type-map meetellen
    ]
    const dbFout = { message: 'permission denied for table budgets', code: '42501' }

    const zonderSchatting = await getRecentDailyExpenseRate(makeSupabase(rijen, [], dbFout), REF)
    expect(zonderSchatting).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })

    const metSchatting = await getRecentDailyExpenseRate(makeSupabase(rijen, [], dbFout), REF, 2500)
    expect(metSchatting.source).toBe('estimate')
    expect(metSchatting.monthlyExpenses).toBe(2500)

    expect(error).toHaveBeenCalledTimes(2)
    expect(String(error.mock.calls[0][0])).toContain('[expense-rate]')
    expect(error.mock.calls[0][1]).toBe(dbFout)
  })

  it('telt (joint_)transfers NIET mee — een overboeking naar eigen rekening is geen consumptie', async () => {
    // Consumptie-grondslag (ADR 0126 D2): `consumptionExpenseRows` filtert via
    // de gedeelde `isRealAggRow`, dezelfde transfer-definitie als de spaarquote-
    // en maandsommen. Dit is dezelfde grondslag als `DashboardData.dailyExpenseRate`:
    // alle loaders lopen door dezelfde functie.
    const supabase = makeSupabase([
      aggRow('2026-06', -300, 'expense'),
      aggRow('2026-06', -300, 'transfer'),
      aggRow('2026-06', -200, 'joint_transfer'),
    ])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r.monthlyExpenses).toBe(300)
  })

  it('negeert groepen zonder negatieve som (spiegelt de vroegere amount<0-filter)', async () => {
    const supabase = makeSupabase([
      { month: '2026-06', budget_id: null, transaction_type: null, sum_positief: 4000, sum_negatief: 0, count: 1 },
    ])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  it('geeft source "none" bij een lege dataset', async () => {
    const supabase = makeSupabase([])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  it('gebruikt de gedeelde getTxAgg12m-entry voor een peildatum in de huidige maand', async () => {
    // Zelfde venster als dashboard/cashflow/core → één RPC per request i.p.v. vier.
    const now = new Date()
    const supabase = makeSupabase([])
    await getRecentDailyExpenseRate(supabase, now)
    const params = (supabase as unknown as { __calls: Record<string, unknown> })
      .__calls.params as Record<string, unknown>
    expect(params.p_to).toBe(
      `${new Date(now.getFullYear(), now.getMonth() + 1, 1).getFullYear()}-${String(
        new Date(now.getFullYear(), now.getMonth() + 1, 1).getMonth() + 1,
      ).padStart(2, '0')}-01`,
    )
  })
})
