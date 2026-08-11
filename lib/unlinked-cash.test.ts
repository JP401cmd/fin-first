import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  unlinkedCashTotal,
  unlinkedCashFractionFor,
  hasSharedUnlinkedCash,
  selectUnlinkedBankAccounts,
  selectUnlinkedBankAccountsForUser,
  loadHouseholdSharesByUser,
  SOLO_UNLINKED_CASH_SHARE,
  FAIL_CLOSED_SHARE_PCT,
  type UnlinkedCashRow,
} from './unlinked-cash'
import type { Perspective } from '@/lib/household-data'

/**
 * Deze suite bewaakt de GRONDSLAG, niet de opmaak: welke rijen meetellen in de
 * losse-cash-optelling, met welk AANDEEL ze meetellen, en — belangrijker — welke
 * filters daarbij WEL en NIET op de query mogen staan.
 *
 * Twee regressies worden hier gevangen:
 *  1. een `.eq('user_id', …)` die terugsluipt: die maakt de query strikt smaller
 *     dan de huishoud-verbrede SELECT-policy en laat gedeelde huishoudrekeningen
 *     wegvallen, waarna check-in en snapshots een ander netto vermogen tonen dan
 *     het dashboard;
 *  2. een ONGEWOGEN optelling: een gedeelde rekening is voor béíde partners
 *     zichtbaar, dus ongewogen telt hetzelfde saldo op huishoudniveau voor 200%.
 */

type Call = { method: string; args: unknown[] }
type TableResults = Record<string, unknown>

/**
 * Minimale PostgREST-dubbelganger die registreert wat er op 'm wordt aangeroepen
 * en per TABEL een eigen resultaat teruggeeft (nodig sinds
 * `loadHouseholdSharesByUser` meerdere tabellen leest).
 */
function makeFakeSupabase(results: unknown | TableResults = { data: [], error: null }) {
  const calls: Call[] = []
  const byTable = (table: string): unknown => {
    const map = results as TableResults
    if (map && typeof map === 'object' && !('data' in (map as object))) {
      return map[table] ?? { data: [], error: null }
    }
    return results
  }

  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] })
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is', 'or', 'in', 'order']) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args })
          return builder
        }
      }
      // Thenable, zodat `await`-ende consumers werken.
      builder.then = (resolve: (value: unknown) => unknown) => resolve(byTable(table))
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const called = (calls: Call[], method: string) => calls.filter(c => c.method === method)
const userIdFilters = (calls: Call[]) => called(calls, 'eq').filter(c => c.args[0] === 'user_id')

const SOLO = SOLO_UNLINKED_CASH_SHARE
const HALF = { perspective: 'personal' as Perspective, mySharePct: 50 }

describe('unlinkedCashTotal', () => {
  it('telt saldi op', () => {
    expect(unlinkedCashTotal([{ balance: 100 }, { balance: 250.5 }], SOLO)).toBe(350.5)
  })

  it('accepteert numerieke strings (numeric-kolom komt als string terug)', () => {
    expect(unlinkedCashTotal([{ balance: '100.25' }, { balance: '9.75' }], SOLO)).toBe(110)
  })

  it('telt negatieve saldi (roodstand) gewoon mee', () => {
    expect(unlinkedCashTotal([{ balance: 500 }, { balance: -200 }], SOLO)).toBe(300)
  })

  it('behandelt ontbrekend saldo als 0', () => {
    expect(unlinkedCashTotal([{ balance: null }, {}, { balance: 40 }], SOLO)).toBe(40)
  })

  it('levert 0 bij een gefaalde leesronde (null/undefined)', () => {
    expect(unlinkedCashTotal(null, SOLO)).toBe(0)
    expect(unlinkedCashTotal(undefined, SOLO)).toBe(0)
    expect(unlinkedCashTotal([], SOLO)).toBe(0)
  })

  it('negeert een meegestuurd net_worth_inclusion_pct', () => {
    // Die kolom bestaat niet op bank_accounts en is bovendien een ÁNDER begrip
    // (handmatige schuif voor gedeeltelijk eigendom, geen huishoudsplitsing).
    const rows: UnlinkedCashRow[] = [
      { balance: 1000, net_worth_inclusion_pct: 50 } as UnlinkedCashRow,
    ]
    expect(unlinkedCashTotal(rows, SOLO)).toBe(1000)
  })

  it('laat een EIGEN rekening ongemoeid, ook bij een aandeel van 50%', () => {
    expect(unlinkedCashTotal([{ balance: 1000, ownership: 'personal' }], HALF)).toBe(1000)
    expect(unlinkedCashTotal([{ balance: 1000 }], HALF)).toBe(1000)
  })

  it('weegt een GEDEELDE rekening op het eigen aandeel', () => {
    expect(unlinkedCashTotal([{ balance: 1000, ownership: 'shared' }], HALF)).toBe(500)
  })

  it('toont een gedeelde rekening VOL in de huishoud-blik', () => {
    expect(
      unlinkedCashTotal([{ balance: 1000, ownership: 'shared' }], {
        perspective: 'household',
        mySharePct: 50,
      }),
    ).toBe(1000)
  })

  it('partner-blik: alleen gedeeld, op het partner-aandeel', () => {
    const rows: UnlinkedCashRow[] = [
      { balance: 1000, ownership: 'shared' },
      { balance: 400, ownership: 'personal' },
    ]
    // 1000 × (1 − 0,6) = 400; de eigen persoonlijke rekening valt weg.
    expect(unlinkedCashTotal(rows, { perspective: 'partner', mySharePct: 60 })).toBe(400)
  })
})

/**
 * DE KERN VAN DEZE KAART: het huishoud-totaal van één gedeelde rekening.
 *
 * Beide partners zien dezelfde rij via de huishoud-verbrede SELECT-policy. Tel je
 * hun persoonlijke blikken op, dan moet daar exact één keer het saldo uitkomen —
 * niet twee keer.
 */
describe('gedeelde rekening telt op huishoudniveau precies één keer', () => {
  const gedeeld: UnlinkedCashRow[] = [{ balance: 2400, ownership: 'shared' }]

  it('50/50: partner A + partner B = 100% van het saldo', () => {
    const a = unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 50 })
    const b = unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 50 })
    expect(a).toBe(1200)
    expect(b).toBe(1200)
    expect(a + b).toBe(2400)
  })

  it('scheve verdeling (custom 70/30) telt óók tot exact 100%', () => {
    // A draagt 70%, dus B's context levert mySharePct = 30 (computeSharePct).
    const a = unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 70 })
    const b = unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 30 })
    expect(a + b).toBe(2400)
  })

  it('one_carries_all (100/0) telt tot exact 100%', () => {
    const a = unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 100 })
    const b = unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 0 })
    expect(a).toBe(2400)
    expect(b).toBe(0)
    expect(a + b).toBe(2400)
  })

  it('eigen-persoonlijke rekeningen blijven volledig bij hun eigenaar', () => {
    const rowsA: UnlinkedCashRow[] = [
      { balance: 2400, ownership: 'shared' },
      { balance: 500, ownership: 'personal' },
    ]
    // B ziet de gedeelde rij + zijn eigen rekening (die van A ziet hij niet).
    const rowsB: UnlinkedCashRow[] = [
      { balance: 2400, ownership: 'shared' },
      { balance: 300, ownership: 'personal' },
    ]
    const a = unlinkedCashTotal(rowsA, { perspective: 'personal', mySharePct: 50 })
    const b = unlinkedCashTotal(rowsB, { perspective: 'personal', mySharePct: 50 })
    expect(a + b).toBe(2400 + 500 + 300)
  })

  it('REGRESSIE: ongewogen zou 200% opleveren', () => {
    const ongewogen = gedeeld.reduce((s, r) => s + Number(r.balance ?? 0), 0) * 2
    const gewogen =
      unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 50 }) +
      unlinkedCashTotal(gedeeld, { perspective: 'personal', mySharePct: 50 })
    expect(ongewogen).toBe(4800)
    expect(gewogen).toBe(2400)
  })
})

/**
 * Anti-drift: dezelfde tabel werd al gewogen in
 * `lib/cashflow-data-loader.ts#startingBalance` (scope + fractie), maar ongewogen
 * geteld in deze module. Die twee bedragen moeten identiek zijn. We spiegelen de
 * cashflow-formule hier letterlijk; wijkt onze fractie af, dan valt deze test om.
 */
describe('anti-drift met de cashflow-loader (zelfde tabel, zelfde bedrag)', () => {
  const cashflowFormule = (
    rows: UnlinkedCashRow[],
    perspective: Perspective,
    mySharePct: number,
  ): number =>
    rows
      .filter(a => {
        const own = a.ownership ?? 'personal'
        if (perspective === 'partner') return own === 'shared'
        return true
      })
      .reduce((s, a) => {
        const own = a.ownership ?? 'personal'
        let frac = 1
        if (own === 'shared' && perspective !== 'household') {
          frac = perspective === 'personal' ? mySharePct / 100 : 1 - mySharePct / 100
        }
        return s + Number(a.balance ?? 0) * frac
      }, 0)

  const rows: UnlinkedCashRow[] = [
    { balance: 2400, ownership: 'shared' },
    { balance: 500, ownership: 'personal' },
    { balance: -120, ownership: 'shared' },
  ]

  for (const perspective of ['personal', 'household', 'partner'] as Perspective[]) {
    for (const pct of [0, 30, 50, 70, 100]) {
      it(`${perspective} @ ${pct}% levert hetzelfde bedrag als de cashflow-formule`, () => {
        expect(unlinkedCashTotal(rows, { perspective, mySharePct: pct })).toBeCloseTo(
          cashflowFormule(rows, perspective, pct),
          10,
        )
      })
    }
  }
})

describe('unlinkedCashFractionFor', () => {
  it('klemt een buiten-bereik-aandeel (nooit >100% of negatief)', () => {
    expect(unlinkedCashFractionFor('personal', 'shared', 150)).toBe(1)
    expect(unlinkedCashFractionFor('personal', 'shared', -20)).toBe(0)
  })

  it('valt bij een onbruikbaar aandeel terug op de helft', () => {
    expect(unlinkedCashFractionFor('personal', 'shared', NaN)).toBe(0.5)
  })

  it('behandelt een ontbrekende ownership als persoonlijk', () => {
    expect(unlinkedCashFractionFor('personal', null, 50)).toBe(1)
    expect(unlinkedCashFractionFor('personal', undefined, 50)).toBe(1)
  })
})

describe('hasSharedUnlinkedCash', () => {
  it('herkent een gedeelde rij', () => {
    expect(hasSharedUnlinkedCash([{ balance: 1, ownership: 'shared' }])).toBe(true)
  })

  it('is false zonder gedeelde rij (fast path: geen extra query)', () => {
    expect(hasSharedUnlinkedCash([{ balance: 1 }, { balance: 2, ownership: 'personal' }])).toBe(false)
    expect(hasSharedUnlinkedCash(null)).toBe(false)
    expect(hasSharedUnlinkedCash([])).toBe(false)
  })
})

describe('selectUnlinkedBankAccounts (RLS-client)', () => {
  it('filtert op actieve, niet-gekoppelde rekeningen', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    expect(called(calls, 'from')[0].args[0]).toBe('bank_accounts')
    expect(called(calls, 'eq')).toContainEqual({ method: 'eq', args: ['is_active', true] })
    expect(called(calls, 'is')).toContainEqual({ method: 'is', args: ['linked_asset_id', null] })
  })

  it('zet GEEN user-filter — RLS doet de huishoud-verbrede scoping', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    expect(userIdFilters(calls)).toHaveLength(0)
  })

  it('leest een letterlijke kolomset MET ownership (anders is weging onmogelijk)', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    expect(typeof called(calls, 'select')[0].args[0]).toBe('string')
    expect(called(calls, 'select')[0].args[0]).toContain('balance')
    expect(called(calls, 'select')[0].args[0]).toContain('ownership')
  })

  it('vraagt GEEN ciphertext/blind-index-kolommen op (iban_encrypted/iban_hash)', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccounts(client)

    const columns = called(calls, 'select')[0].args[0] as string
    expect(columns).not.toContain('*')
    expect(columns).not.toContain('encrypted')
    expect(columns).not.toContain('hash')
  })
})

describe('selectUnlinkedBankAccountsForUser (service-role, RLS scoopt niet)', () => {
  const USER = '11111111-1111-4111-8111-111111111111'
  const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'

  it('spiegelt de policy: eigen rijen OF gedeeld binnen het huishouden', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, HOUSEHOLD)

    expect(called(calls, 'or')).toHaveLength(1)
    expect(called(calls, 'or')[0].args[0]).toBe(
      `user_id.eq.${USER},and(ownership.eq.shared,household_id.eq.${HOUSEHOLD})`,
    )
    // De or() DRAAGT de user-scope; een losse eq zou 'm juist weer dichttrekken.
    expect(userIdFilters(calls)).toHaveLength(0)
  })

  it('houdt de grondslag-filters ook in service-role-context aan', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, HOUSEHOLD)

    expect(called(calls, 'eq')).toContainEqual({ method: 'eq', args: ['is_active', true] })
    expect(called(calls, 'is')).toContainEqual({ method: 'is', args: ['linked_asset_id', null] })
  })

  it('zonder huishouden: alleen eigen rijen, geen or()', () => {
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, null)

    expect(called(calls, 'or')).toHaveLength(0)
    expect(userIdFilters(calls)).toEqual([{ method: 'eq', args: ['user_id', USER] }])
  })

  it('degradeert fail-closed bij een niet-UUID huishoud-id', () => {
    // Een waarde met leestekens zou het komma-gescheiden or()-predicaat kunnen
    // herschrijven. Dan liever alleen-eigen-rijen dan een opengebroken filter.
    const { client, calls } = makeFakeSupabase()
    selectUnlinkedBankAccountsForUser(client, USER, 'x,ownership.eq.shared')

    expect(called(calls, 'or')).toHaveLength(0)
    expect(userIdFilters(calls)).toEqual([{ method: 'eq', args: ['user_id', USER] }])
  })
})

describe('loadHouseholdSharesByUser', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '33333333-3333-4333-8333-333333333333'
  const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'

  const members = { data: [{ user_id: A, household_id: HOUSEHOLD }, { user_id: B, household_id: HOUSEHOLD }], error: null }

  it('bouwt scope + aandeel: equal → 50/50', async () => {
    const { client, calls } = makeFakeSupabase({
      household_members: members,
      households: { data: [{ id: HOUSEHOLD, split_mode: 'equal', custom_split_pct: null, primary_payer_id: null }], error: null },
    })

    const map = await loadHouseholdSharesByUser(client, [A, B])

    expect(map.get(A)).toEqual({ householdId: HOUSEHOLD, mySharePct: 50 })
    expect(map.get(B)).toEqual({ householdId: HOUSEHOLD, mySharePct: 50 })
    expect(called(calls, 'from')[0].args[0]).toBe('household_members')
  })

  it('custom split: primary payer krijgt het percentage, de ander de rest', async () => {
    const { client } = makeFakeSupabase({
      household_members: members,
      households: { data: [{ id: HOUSEHOLD, split_mode: 'custom', custom_split_pct: 70, primary_payer_id: A }], error: null },
    })

    const map = await loadHouseholdSharesByUser(client, [A, B])

    expect(map.get(A)?.mySharePct).toBe(70)
    expect(map.get(B)?.mySharePct).toBe(30)
  })

  it('income_ratio leest de income-budgetten mee (geen drift met het dashboard)', async () => {
    const { client, calls } = makeFakeSupabase({
      household_members: members,
      households: { data: [{ id: HOUSEHOLD, split_mode: 'income_ratio', custom_split_pct: null, primary_payer_id: null }], error: null },
      budgets: { data: [{ user_id: A, default_limit: 3000 }, { user_id: B, default_limit: 1000 }], error: null },
    })

    const map = await loadHouseholdSharesByUser(client, [A, B])

    expect(map.get(A)?.mySharePct).toBe(75)
    expect(map.get(B)?.mySharePct).toBe(25)
    expect(called(calls, 'from').some(c => c.args[0] === 'budgets')).toBe(true)
  })

  it('leest GEEN income-budgetten bij een niet-income_ratio-huishouden', async () => {
    const { client, calls } = makeFakeSupabase({
      household_members: members,
      households: { data: [{ id: HOUSEHOLD, split_mode: 'equal', custom_split_pct: null, primary_payer_id: null }], error: null },
    })

    await loadHouseholdSharesByUser(client, [A, B])

    expect(called(calls, 'from').some(c => c.args[0] === 'budgets')).toBe(false)
  })

  it('huishouden met één lid deelt met niemand → 100%', async () => {
    const { client } = makeFakeSupabase({
      household_members: { data: [{ user_id: A, household_id: HOUSEHOLD }], error: null },
      households: { data: [{ id: HOUSEHOLD, split_mode: 'equal', custom_split_pct: null, primary_payer_id: null }], error: null },
    })

    expect((await loadHouseholdSharesByUser(client, [A])).get(A)?.mySharePct).toBe(100)
  })

  it('houdt bij meerdere huishoudens het EERSTE (oudste) lidmaatschap', async () => {
    // household_members is uniek op (household_id, user_id), niet op user_id —
    // twee huishoudens is dus mogelijk. Deterministisch kiezen voorkomt dat twee
    // cron-runs een ander huishouden pakken.
    const OUDSTE = '44444444-4444-4444-8444-444444444444'
    const { client } = makeFakeSupabase({
      household_members: {
        data: [
          { user_id: A, household_id: OUDSTE },
          { user_id: A, household_id: HOUSEHOLD },
        ],
        error: null,
      },
      households: { data: [], error: null },
    })

    expect((await loadHouseholdSharesByUser(client, [A])).get(A)?.householdId).toBe(OUDSTE)
  })

  it('slaat rijen zonder huishouden over', async () => {
    const { client } = makeFakeSupabase({
      household_members: { data: [{ user_id: A, household_id: null }], error: null },
    })

    expect((await loadHouseholdSharesByUser(client, [A])).size).toBe(0)
  })

  it('levert een lege map bij een fout (fail-closed → alleen eigen rijen)', async () => {
    const { client } = makeFakeSupabase({
      household_members: { data: null, error: { message: 'boom' } },
    })

    expect((await loadHouseholdSharesByUser(client, [A])).size).toBe(0)
  })

  it('scope behouden maar aandeel fail-closed als de huishoud-instellingen falen', async () => {
    const { client } = makeFakeSupabase({
      household_members: members,
      households: { data: null, error: { message: 'boom' } },
    })

    const map = await loadHouseholdSharesByUser(client, [A, B])

    expect(map.get(A)).toEqual({ householdId: HOUSEHOLD, mySharePct: FAIL_CLOSED_SHARE_PCT })
  })

  it('doet geen query bij een lege gebruikerslijst', async () => {
    const { client, calls } = makeFakeSupabase()

    expect((await loadHouseholdSharesByUser(client, [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
