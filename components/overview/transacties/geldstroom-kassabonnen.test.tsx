/**
 * UR3-28 fase 2b — de kassabonnen op de transactiepagina.
 *
 * Wat hier hard vastligt is de RUNTIME-ASSERTIE op het getoonde getal: elke
 * regel en elke totaalregel wordt gepind tegen `summarizeFlow` over dezelfde
 * input. Een verkeerd veld, een verkeerde grondslag of een stale mapping is
 * anders onzichtbaar tot een gebruiker het meldt.
 *
 * Concreet:
 *  1. de inkomsten-bon somt per rekening op tot `summarizeFlow(...).income`,
 *     inclusief de restpost "Overige rekeningen" voor rijen zonder (bekende)
 *     rekening;
 *  2. de uitgaven-bon rolt kindbudgetten op naar hun parent en somt op tot
 *     `summarizeFlow(...).expense`, met "Ongecategoriseerd" voor rijen zonder
 *     (bekend) budget;
 *  3. transfers tellen in géén van beide mee — dezelfde uitsluiting als de
 *     periode-samenvatting;
 *  4. de doorklik naar de kindbudgetten bestaat en toont de juiste verdeling.
 *     (Op de cashflow-hub was die derde bon onbereikbaar: er was geen enkele
 *     aanroeper die het parent-id zette.)
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { summarizeFlow, type AnalysisTransaction } from '@/lib/transaction-insights'
import type { Budget } from '@/lib/budget-data'
import { formatCurrencyDecimals } from '@/lib/format'
import { GeldstroomKassabonnen } from './geldstroom-kassabonnen'

afterEach(cleanup)

function tx(over: Partial<AnalysisTransaction> & { id: string; amount: number }): AnalysisTransaction {
  return {
    date: '2026-06-10',
    description: 'Boeking',
    counterparty_name: null,
    counterparty_iban: null,
    budget_id: null,
    category: null,
    account_id: null,
    account_name: null,
    is_income: over.amount > 0,
    transaction_type: null,
    bank_code: null,
    running_balance: null,
    creditor_id: null,
    fx_amount: null,
    fx_currency: null,
    fx_rate: null,
    ...over,
  }
}

function budget(over: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    user_id: 'u1',
    parent_id: null,
    slug: null,
    icon: '',
    description: null,
    default_limit: 0,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 0,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    ...over,
  } as Budget
}

// ── Vaste testset ────────────────────────────────────────────────────────────
// Twee rekeningen (één bekend, één onbekend), een budgetboom met parent +
// twee kinderen, een los budget, een rij zonder budget en één transfer.
const BOODSCHAPPEN = budget({ id: 'b-parent', name: 'Boodschappen', default_limit: 100 })
const SUPER = budget({ id: 'b-child-1', name: 'Supermarkt', parent_id: 'b-parent', default_limit: 250 })
const MARKT = budget({ id: 'b-child-2', name: 'Markt', parent_id: 'b-parent', default_limit: 50 })
const WONEN = budget({ id: 'b-wonen', name: 'Wonen', default_limit: 900 })
const BUDGETS = [BOODSCHAPPEN, SUPER, MARKT, WONEN]

const TXNS: AnalysisTransaction[] = [
  tx({ id: 't1', amount: 2400, account_id: 'acc-1' }), // salaris, bekende rekening
  tx({ id: 't2', amount: 150, account_id: 'acc-onbekend' }), // rekening buiten accountMap
  tx({ id: 't3', amount: 75 }), // inkomen zonder rekening
  tx({ id: 't4', amount: -120, account_id: 'acc-1', budget_id: 'b-child-1' }),
  tx({ id: 't5', amount: -40, account_id: 'acc-1', budget_id: 'b-child-2' }),
  tx({ id: 't6', amount: -900, account_id: 'acc-1', budget_id: 'b-wonen' }),
  tx({ id: 't7', amount: -30, account_id: 'acc-1' }), // zonder budget
  tx({ id: 't8', amount: -66, account_id: 'acc-1', budget_id: 'b-weg' }), // budget onbekend
  tx({ id: 't9', amount: -5000, account_id: 'acc-1', transaction_type: 'transfer' }), // telt niet mee
  // Positief én joint_transfer: precies de twee assen waarop de oude toets
  // niets bewees. Een negatieve overboeking kan sowieso nooit in de
  // inkomstenbon staan, dus die toonde de uitsluiting niet aan.
  tx({ id: 't10', amount: 7000, account_id: 'acc-1', transaction_type: 'transfer' }),
  tx({ id: 't11', amount: 4000, account_id: 'acc-2', transaction_type: 'joint_transfer' }),
  tx({ id: 't12', amount: -4000, account_id: 'acc-2', transaction_type: 'joint_transfer' }),
]

const ACCOUNT_MAP = new Map([['acc-1', 'Betaalrekening']])
const SUMMARY = summarizeFlow(TXNS)

function renderBon(open: 'income' | 'expense') {
  return render(
    <GeldstroomKassabonnen
      open={open}
      onClose={() => {}}
      transactions={TXNS}
      budgets={BUDGETS}
      accountMap={ACCOUNT_MAP}
      summary={SUMMARY}
      windowLabel="juni 2026"
    />,
  )
}

/** Alle bedragen uit een bon, in de volgorde waarin ze staan. */
function amountsIn(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.tabular-nums'))
    .map((el) => el.textContent?.trim() ?? '')
    .filter((t) => t.startsWith('€'))
}

describe('GeldstroomKassabonnen — inkomsten per rekening', () => {
  it('somt de regels op tot summarizeFlow(...).income', () => {
    renderBon('income')
    const dialog = screen.getByRole('dialog')

    // De canonieke uitkomst — niet met de hand overgetypt.
    const perAccount = summarizeFlow(TXNS.filter((t) => t.account_id === 'acc-1')).income
    const rest = summarizeFlow(
      TXNS.filter((t) => t.account_id !== 'acc-1'),
    ).income

    expect(within(dialog).getByText('Betaalrekening')).toBeTruthy()
    expect(within(dialog).getByText('Overige rekeningen')).toBeTruthy()
    expect(perAccount + rest).toBe(SUMMARY.income)

    const shown = amountsIn(dialog)
    expect(shown).toContain(formatCurrencyDecimals(perAccount))
    expect(shown).toContain(formatCurrencyDecimals(rest))
    // Totaalregel = het periode-aggregaat, niet de opsomming.
    expect(shown[shown.length - 1]).toBe(formatCurrencyDecimals(SUMMARY.income))
  })

  it('sluit transfers uit — eigen rekening ÉN partner, beide richtingen', () => {
    renderBon('income')
    const inkomsten = amountsIn(screen.getByRole('dialog'))
    // Een POSITIEVE overboeking is de enige die de inkomstenbon kan halen als de
    // uitsluiting ontbreekt; daarom staan die er nu in de fixture.
    expect(inkomsten).not.toContain(formatCurrencyDecimals(7000))
    expect(inkomsten).not.toContain(formatCurrencyDecimals(4000))

    cleanup()
    renderBon('expense')
    const uitgaven = amountsIn(screen.getByRole('dialog'))
    expect(uitgaven).not.toContain(formatCurrencyDecimals(5000))
    expect(uitgaven).not.toContain(formatCurrencyDecimals(4000))
  })
})

describe('GeldstroomKassabonnen — uitgaven per budget', () => {
  it('rolt kindbudgetten op naar de parent en somt op tot summarizeFlow(...).expense', () => {
    renderBon('expense')
    const dialog = screen.getByRole('dialog')

    const boodschappen = summarizeFlow(
      TXNS.filter((t) => t.budget_id === 'b-child-1' || t.budget_id === 'b-child-2'),
    ).expense
    const wonen = summarizeFlow(TXNS.filter((t) => t.budget_id === 'b-wonen')).expense
    const ongecategoriseerd = summarizeFlow(
      TXNS.filter((t) => !t.budget_id || t.budget_id === 'b-weg'),
    ).expense

    // De drie emmers dekken samen exact het periodetotaal.
    expect(boodschappen + wonen + ongecategoriseerd).toBe(SUMMARY.expense)

    const shown = amountsIn(dialog)
    expect(shown).toContain(formatCurrencyDecimals(boodschappen))
    expect(shown).toContain(formatCurrencyDecimals(wonen))
    expect(shown).toContain(formatCurrencyDecimals(ongecategoriseerd))
    expect(shown[shown.length - 1]).toBe(formatCurrencyDecimals(SUMMARY.expense))

    expect(within(dialog).getByText('Boodschappen')).toBeTruthy()
    expect(within(dialog).getByText('Ongecategoriseerd')).toBeTruthy()
    // Kinderen staan NIET als losse regel in de hoofdbon.
    expect(within(dialog).queryByText('Supermarkt')).toBeNull()
  })

  it('toont de limiet als parent + kinderen bij elkaar', () => {
    renderBon('expense')
    const dialog = screen.getByRole('dialog')
    // 100 (parent) + 250 + 50 (kinderen) = 400.
    expect(within(dialog).getByText(/400/)).toBeTruthy()
  })
})

describe('GeldstroomKassabonnen — doorklik naar kindbudgetten', () => {
  it('opent de deelbudgetten van een parent met kinderen', () => {
    renderBon('expense')
    fireEvent.click(screen.getByLabelText('Toon deelbudgetten van Boodschappen'))

    // Bij naam, niet op volgorde: de uitgaven-bon blijft één animatie-frame
    // gemount terwijl hij uitgaat, dus er staan er kortstondig twee.
    const dialog = screen.getByRole('dialog', { name: 'Boodschappen' })
    expect(within(dialog).getByText('Supermarkt')).toBeTruthy()
    expect(within(dialog).getByText('Markt')).toBeTruthy()

    const supermarkt = summarizeFlow(TXNS.filter((t) => t.budget_id === 'b-child-1')).expense
    const markt = summarizeFlow(TXNS.filter((t) => t.budget_id === 'b-child-2')).expense
    const shown = amountsIn(dialog)
    expect(shown).toContain(formatCurrencyDecimals(supermarkt))
    expect(shown).toContain(formatCurrencyDecimals(markt))
    // Totaal van de detailbon = de parent-regel uit de hoofdbon.
    expect(shown[shown.length - 1]).toBe(formatCurrencyDecimals(supermarkt + markt))
  })

  it('geeft een budget zonder kinderen geen doorklik', () => {
    renderBon('expense')
    expect(screen.queryByLabelText('Toon deelbudgetten van Wonen')).toBeNull()
  })
})

// ── Volgorde van de inkomstenbon ─────────────────────────────────────────────
//
// De bon liep na de verhuizing op BEDRAG te sorteren, met de restpost
// "Overige rekeningen" in die sortering mee. De opgeheven cashflow-hub liep de
// rekeningen af in hun eigen volgorde (`sort_order`) en zette de restpost
// altijd onderaan. Dat is ook de leesbare vorm: een bon die zichzelf elke maand
// hersorteert laat je telkens opnieuw zoeken, en een restpost middenin leest
// als een gewone rekening.
describe('GeldstroomKassabonnen — volgorde van de inkomstenbon', () => {
  // Twee rekeningen in bewuste volgorde, waarbij de EERSTE het kleinste bedrag
  // heeft: op bedrag gesorteerd zouden ze omdraaien.
  const MAP = new Map([
    ['acc-klein', 'Eerst in de lijst'],
    ['acc-groot', 'Tweede in de lijst'],
  ])
  const RIJEN: AnalysisTransaction[] = [
    tx({ id: 'i1', amount: 100, account_id: 'acc-klein' }),
    tx({ id: 'i2', amount: 900, account_id: 'acc-groot' }),
    tx({ id: 'i3', amount: 400, account_id: 'acc-onbekend' }), // → restpost
  ]

  function renderInkomsten() {
    return render(
      <GeldstroomKassabonnen
        open="income"
        onClose={() => {}}
        transactions={RIJEN}
        budgets={BUDGETS}
        accountMap={MAP}
        summary={summarizeFlow(RIJEN)}
        windowLabel="juni 2026"
      />,
    )
  }

  it('volgt de volgorde van de rekeningenlijst, niet het bedrag', () => {
    renderInkomsten()
    const namen = Array.from(
      screen.getByRole('dialog').querySelectorAll('span'),
    )
      .map((el) => el.textContent?.trim() ?? '')
      .filter((t) => t === 'Eerst in de lijst' || t === 'Tweede in de lijst')
    expect(namen).toEqual(['Eerst in de lijst', 'Tweede in de lijst'])
  })

  it('zet de restpost altijd onderaan, ook als hij niet het kleinst is', () => {
    renderInkomsten()
    const dialog = screen.getByRole('dialog')
    const regels = Array.from(dialog.querySelectorAll('span'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter((t) => ['Eerst in de lijst', 'Tweede in de lijst', 'Overige rekeningen'].includes(t))
    expect(regels[regels.length - 1]).toBe('Overige rekeningen')
  })
})
