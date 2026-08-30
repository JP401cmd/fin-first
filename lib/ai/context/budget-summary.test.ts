import { describe, it, expect } from 'vitest'
import {
  summarizeBudgets,
  type BudgetRow,
  type BudgetSplitRow,
  type BudgetTransactionRow,
} from './budget-summary'

/**
 * De gedeelde budgetgrondslag (fase C2b), sinds 30 aug 2026 gevoed door de
 * canonieke som in `lib/budget-spending.ts`. Deze suite legt vast dat de AI
 * DEZELFDE euro's citeert als het scherm toont — getekend, met richting per
 * budget, split-regels op hun eigen budget en een ÓF/ÓF-rollup.
 *
 * Voedt twee oppervlakken tegelijk: `buildKernContext` (cloud-Fin) en
 * `buildLocalChatOverview` (on-device chat).
 */

const BUDGETS: BudgetRow[] = [
  { id: 'p1', parent_id: null, name: 'Vaste lasten', default_limit: 1950, budget_type: 'expense' },
  { id: 'c1', parent_id: 'p1', name: 'Hypotheek', default_limit: 1000, budget_type: 'expense' },
  { id: 'c2', parent_id: 'p1', name: 'Energie', default_limit: 200, budget_type: 'expense' },
  { id: 'p2', parent_id: null, name: 'Inkomen', default_limit: 4000, budget_type: 'income' },
  { id: 'c3', parent_id: 'p2', name: 'Salaris', default_limit: 4000, budget_type: 'income' },
]

describe('summarizeBudgets', () => {
  it('geen budgetten → hasBudgets false', () => {
    expect(summarizeBudgets([], [], [])).toEqual({ hasBudgets: false, parents: [] })
  })

  it('telt per kind op en rolt naar de ouder', () => {
    const tx: BudgetTransactionRow[] = [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'c2', amount: -150 },
      { budget_id: 'c2', amount: -30 },
    ]
    const { parents } = summarizeBudgets(BUDGETS, tx, [])
    const vasteLasten = parents.find((p) => p.id === 'p1')!

    expect(vasteLasten.children.map((c) => [c.name, c.spent])).toEqual([
      ['Hypotheek', 1000],
      ['Energie', 180],
    ])
    expect(vasteLasten.spent).toBe(1180)
  })

  // Een overboeking naar je eigen spaarrekening is geen uitgave. Zonder deze
  // uitsluiting telt elke interne verschuiving mee en klopt het hele beeld niet.
  it('overboekingen tellen niet als uitgave', () => {
    const tx: BudgetTransactionRow[] = [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'c1', amount: -500, transaction_type: 'transfer' },
      { budget_id: 'c1', amount: -500, transaction_type: 'joint_transfer' },
    ]
    const { parents } = summarizeBudgets(BUDGETS, tx, [])
    expect(parents.find((p) => p.id === 'p1')!.children[0].spent).toBe(1000)
  })

  // NORM 30 aug 2026 (lib/budget-spending.ts): op een UITGAVEN-budget gaat een
  // inkomst van de besteding AF. Vóór de convergentie telde de AI hier 1000
  // (alles absoluut) en het scherm 200 — precies de kloof die dit sluit.
  it('op een uitgaven-budget gaat een inkomst van de besteding af', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -600 },
      { budget_id: 'c1', amount: 400 },
    ], [])
    expect(parents.find((p) => p.id === 'p1')!.children[0].spent).toBe(200)
  })

  // Het gemelde scenario: één uitgave van 1.265 met 8.000 aan inkomsten op
  // hetzelfde uitgaven-budget. Het bedrag is ECHT negatief (niet geklemd) en
  // levert daarom géén OVER-status op — de prompt-regel "n% — OVER" verdwijnt.
  it('netto inkomsten op een uitgaven-budget → negatief bedrag, géén OVER-status', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -1265 },
      { budget_id: 'c1', amount: 8000 },
    ], [])
    const hypotheek = parents.find((p) => p.id === 'p1')!.children[0]

    expect(hypotheek.spent).toBe(-6735)
    expect(hypotheek.pct).toBe(0)
    expect(hypotheek.status).toBe('OK')
  })

  // Spiegelbeeld: op een INKOMSTEN-budget IS de positieve rij de realisatie en
  // gaat een correctie/storno eraf. Absoluut tellen zou hier +3.300 opleveren.
  it('op een inkomsten-budget telt de positieve rij op en gaat een correctie eraf', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c3', amount: 3200 },
      { budget_id: 'c3', amount: -100 },
    ], [])
    expect(parents.find((p) => p.id === 'p2')!.children[0].spent).toBe(3100)
  })

  // Canonieke rollup is ÓF/ÓF (`spentForBudget`). De oude regel "kinderen PLUS
  // eigen boekingen" telde een rechtstreeks op de ouder geboekte rij dubbel
  // zodra er ook kinderen waren.
  it('ouder MÉT kinderen = som van de kinderen; eigen boeking telt niet extra', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'p1', amount: -75 },
    ], [])
    expect(parents.find((p) => p.id === 'p1')!.spent).toBe(1000)
  })

  it('ouder ZONDER kinderen = zijn eigen boekingen', () => {
    const losseOuder: BudgetRow[] = [
      { id: 'p9', parent_id: null, name: 'Los', default_limit: 100, budget_type: 'expense' },
    ]
    const { parents } = summarizeBudgets(losseOuder, [{ budget_id: 'p9', amount: -75 }], [])
    expect(parents[0].spent).toBe(75)
  })

  // Een split-OUDER heeft budget_id NULL en is_split true; de bedragen leven op
  // `transaction_splits` (daar POSITIEF opgeslagen) en horen op hun eigen budget.
  it('split-regels tellen op hun eigen budget, de ouderrij wordt overgeslagen', () => {
    const tx: BudgetTransactionRow[] = [
      { id: 'tx1', budget_id: null, amount: -29.24, is_split: true },
    ]
    const splits: BudgetSplitRow[] = [
      { budget_id: 'c1', amount: 4.5 },
      { budget_id: 'c2', amount: 24.74 },
    ]
    const { parents } = summarizeBudgets(BUDGETS, tx, splits)
    const kinderen = parents.find((p) => p.id === 'p1')!.children

    expect(kinderen[0].spent).toBe(4.5)
    expect(kinderen[1].spent).toBe(24.74)
    expect(parents.find((p) => p.id === 'p1')!.spent).toBeCloseTo(29.24, 2)
  })

  it('geeft per kind een percentage en een status', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: 'c1', amount: -1000 },
      { budget_id: 'c2', amount: -170 },
    ], [])
    const kinderen = parents.find((p) => p.id === 'p1')!.children
    expect(kinderen[0]).toMatchObject({ pct: 100, status: 'OVER' })
    expect(kinderen[1]).toMatchObject({ pct: 85, status: 'BIJNA' })
  })

  // De overschrijdingsstaart blijft zichtbaar: bovenaan wordt NIET geklemd,
  // anders verdwijnt elk signaal over hóé ver een budget over is.
  it('een overschrijding houdt zijn percentage boven de 100', () => {
    const { parents } = summarizeBudgets(BUDGETS, [{ budget_id: 'c2', amount: -400 }], [])
    expect(parents.find((p) => p.id === 'p1')!.children[1]).toMatchObject({
      pct: 200,
      status: 'OVER',
    })
  })

  it('zonder limiet geen percentage en geen valse OVER-status', () => {
    const zonderLimiet: BudgetRow[] = [
      { id: 'p1', parent_id: null, name: 'Los', default_limit: null, budget_type: 'expense' },
      { id: 'c1', parent_id: 'p1', name: 'Kind', default_limit: 0, budget_type: 'expense' },
    ]
    const { parents } = summarizeBudgets(zonderLimiet, [{ budget_id: 'c1', amount: -500 }], [])
    expect(parents[0].children[0]).toMatchObject({ limit: 0, pct: 0, status: 'OK' })
  })

  it('rijen zonder budget_id worden genegeerd', () => {
    const { parents } = summarizeBudgets(BUDGETS, [
      { budget_id: null, amount: -900 },
      { budget_id: 'c1', amount: -100 },
    ], [])
    expect(parents.find((p) => p.id === 'p1')!.spent).toBe(100)
  })

  // De inkomstencategorie blijft in de samenvatting staan; wie 'm niet wil
  // tonen filtert bij het RENDEREN (zoals kern-context en de lokale prompt doen).
  // Zo hoeft de extractor niet te weten hoe elke consument hem gebruikt.
  it('houdt de inkomsten-ouder in de samenvatting', () => {
    const { parents } = summarizeBudgets(BUDGETS, [], [])
    expect(parents.map((p) => p.type)).toContain('income')
  })
})
