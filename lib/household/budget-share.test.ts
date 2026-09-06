import { describe, it, expect, vi } from 'vitest'
import {
  hasSharedBudget,
  budgetShareFractionById,
  SOLO_BUDGET_SHARE,
  selectBudgetsForBasis,
  selectBudgetsForBasisForUser,
  BUDGET_BASIS_COLUMNS,
} from './budget-share'
import { computeBudgetBasis, type BudgetBasisRow } from '@/lib/budget-basis'

function row(p: Partial<BudgetBasisRow> & { id: string }): BudgetBasisRow {
  return {
    parent_id: null,
    budget_type: 'income',
    name: p.id,
    default_limit: 0,
    interval: 'monthly',
    is_archived: false,
    merged_into: null,
    ownership: 'personal',
    ...p,
  }
}

describe('hasSharedBudget — de fast path', () => {
  it('geen gedeeld budget → niets te wegen (en dus geen huishoud-query)', () => {
    expect(hasSharedBudget([row({ id: 'a' }), row({ id: 'b' })])).toBe(false)
    expect(hasSharedBudget([])).toBe(false)
    expect(hasSharedBudget(null)).toBe(false)
  })

  it('ontbrekend ownership telt als persoonlijk', () => {
    expect(hasSharedBudget([{ id: 'a' }, { id: 'b', ownership: null }])).toBe(false)
  })

  it('één gedeelde rij is genoeg', () => {
    expect(hasSharedBudget([row({ id: 'a' }), row({ id: 'b', ownership: 'shared' })])).toBe(true)
  })
})

describe('budgetShareFractionById', () => {
  it('alleen GEDEELDE budgetten komen in de map; persoonlijke blijven impliciet 1', () => {
    const map = budgetShareFractionById(
      [row({ id: 'eigen' }), row({ id: 'gedeeld', ownership: 'shared' })],
      { perspective: 'personal', mySharePct: 60 },
    )
    expect(map).toEqual({ gedeeld: 0.6 })
    expect(map.eigen).toBeUndefined()
  })

  it('solo-aandeel levert een LEGE map — de weging is aantoonbaar inert', () => {
    const map = budgetShareFractionById(
      [row({ id: 'a' }), row({ id: 'b', ownership: 'shared' })],
      SOLO_BUDGET_SHARE,
    )
    expect(map).toEqual({})
  })

  it("huishoud-blik telt gedeelde budgetten vol (×1)", () => {
    const map = budgetShareFractionById([row({ id: 'gedeeld', ownership: 'shared' })], {
      perspective: 'household',
      mySharePct: 60,
    })
    expect(map).toEqual({})
  })

  it('partner-blik is de spiegel van personal', () => {
    const rows = [row({ id: 'gedeeld', ownership: 'shared' })]
    const mine = budgetShareFractionById(rows, { perspective: 'personal', mySharePct: 60 })
    const theirs = budgetShareFractionById(rows, { perspective: 'partner', mySharePct: 60 })
    expect(mine.gedeeld + theirs.gedeeld).toBeCloseTo(1, 10)
  })
})

describe('budget-scope voor de grondslag — sessie vs. service-role', () => {
  /** Chainbare stub die vastlegt welke filters er op de query zijn gezet. */
  function fakeSupabase() {
    const calls = { table: '', columns: '', eq: [] as Array<[string, unknown]>, or: [] as string[] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: (cols: string) => {
        calls.columns = cols
        return builder
      },
      eq: (col: string, val: unknown) => {
        calls.eq.push([col, val])
        return builder
      },
      or: (filter: string) => {
        calls.or.push(filter)
        return builder
      },
    }
    const supabase = {
      from: vi.fn((t: string) => {
        calls.table = t
        return builder
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient
    return { supabase, calls }
  }

  const USER = '11111111-1111-4111-8111-111111111111'
  const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'

  it('sessie-variant zet GEEN user-filter — de policy verbreedt naar gedeelde rijen', () => {
    // Een eigen `.eq('user_id', …)` zou het gedeelde inkomstenbudget van de
    // partner wegsnijden en de snapshot laten driften met /overzicht/budget.
    const { supabase, calls } = fakeSupabase()
    selectBudgetsForBasis(supabase)
    expect(calls.table).toBe('budgets')
    expect(calls.columns).toBe(BUDGET_BASIS_COLUMNS)
    expect(calls.eq).toEqual([])
    expect(calls.or).toEqual([])
  })

  it('de kolomlijst dekt alles wat computeBudgetBasis leest', () => {
    for (const col of [
      'id', 'parent_id', 'budget_type', 'name', 'default_limit',
      'interval', 'ownership', 'is_archived', 'merged_into',
    ]) {
      expect(BUDGET_BASIS_COLUMNS).toContain(col)
    }
  })

  it('service-role-variant draagt de huishoud-scope met de hand mee', () => {
    const { supabase, calls } = fakeSupabase()
    selectBudgetsForBasisForUser(supabase, USER, HOUSEHOLD)
    expect(calls.eq).toEqual([])
    expect(calls.or).toEqual([
      `user_id.eq.${USER},and(ownership.eq.shared,household_id.eq.${HOUSEHOLD})`,
    ])
  })

  it('geen huishouden → alleen-eigen-rijen', () => {
    const { supabase, calls } = fakeSupabase()
    selectBudgetsForBasisForUser(supabase, USER, null)
    expect(calls.or).toEqual([])
    expect(calls.eq).toEqual([['user_id', USER]])
  })

  it('FAIL-CLOSED bij een niet-uuid: geen interpolatie in het or-filter', () => {
    // De PostgREST-`or`-grammatica is komma-/haakje-gescheiden; een waarde met
    // leestekens zou het predicaat kunnen herschrijven.
    const { supabase, calls } = fakeSupabase()
    selectBudgetsForBasisForUser(supabase, USER, 'x,or(user_id.neq.0)')
    expect(calls.or).toEqual([])
    expect(calls.eq).toEqual([['user_id', USER]])
  })
})

describe('de dubbeltelling die dit voorkomt (ADR 0103 + security-review)', () => {
  // De SELECT-policy op `budgets` is huishoud-verbreed, dus getBudgets levert óók
  // het gedeelde inkomstenbudget van de partner. Voor UITGAVEN was 100%-weging
  // bestaand gedrag; voor INKOMEN zou de budgetgrondslag de dubbeltelling NIEUW
  // introduceren — rechtstreeks in FIRE, spaarquote en bruto Box 1.
  const rows: BudgetBasisRow[] = [
    row({ id: 'eigen-salaris', default_limit: 3000, interval: 'monthly' }),
    row({ id: 'gedeelde-huurinkomsten', default_limit: 1000, interval: 'monthly', ownership: 'shared' }),
  ]

  it('ongewogen telt het gedeelde inkomstenbudget voor 100% mee', () => {
    const ongewogen = computeBudgetBasis(rows, 'income', [])
    expect(ongewogen.monthlyTotal).toBe(4000)
  })

  it('met een 50/50-huishouden telt het voor de helft — samen precies één keer', () => {
    const share = { perspective: 'personal' as const, mySharePct: 50 }
    const mij = computeBudgetBasis(rows, 'income', [], {
      shareFractionById: budgetShareFractionById(rows, share),
    })
    expect(mij.monthlyTotal).toBe(3500)

    // De partner ziet hetzelfde gedeelde budget vanuit zijn eigen blik; samen
    // tellen de twee helften op tot één keer €1.000, niet twee keer.
    const partnerDeel = budgetShareFractionById(rows, { perspective: 'partner', mySharePct: 50 })
    expect(1000 * partnerDeel['gedeelde-huurinkomsten'] + 1000 * 0.5).toBe(1000)
  })

  it('een scheve verdeling (70/30) volgt households.split_mode', () => {
    const share = { perspective: 'personal' as const, mySharePct: 70 }
    const r = computeBudgetBasis(rows, 'income', [], {
      shareFractionById: budgetShareFractionById(rows, share),
    })
    expect(r.monthlyTotal).toBe(3000 + 700)
  })

  it('de weging grijpt op KINDEREN, niet op de parent-kop', () => {
    // De post ontstaat op kindniveau; de fractie moet dus per kind gelden.
    const met: BudgetBasisRow[] = [
      row({ id: 'parent', ownership: 'shared', default_limit: 9999 }),
      row({ id: 'kind', parent_id: 'parent', ownership: 'shared', default_limit: 800 }),
    ]
    const r = computeBudgetBasis(met, 'income', [], {
      shareFractionById: budgetShareFractionById(met, { perspective: 'personal', mySharePct: 25 }),
    })
    expect(r.entries.map(e => e.id)).toEqual(['kind'])
    expect(r.monthlyTotal).toBe(200)
  })
})
