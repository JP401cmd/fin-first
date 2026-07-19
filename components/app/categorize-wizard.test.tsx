/**
 * Component test voor CategorizeWizard — de "Vraag Will"-wizard (WP-C/WP-E2,
 * feature #881): bulk-kaart voor stage-1 (regel/overboeking/spiegel) + AI-
 * groepkaarten voor de rest, één tegelijk in largest-first-volgorde.
 *
 * De wizard is een PURE presentatiecomponent: hij bezit géén rijen-state en
 * roept enkel de meegegeven callbacks aan (de sheet doet het echte opslaan).
 * Deze tests toetsen dus het presentatie- en routeringscontract op basis van
 * `rows`/`budgetGroups`-props, niet de save-laag (die hoort bij
 * ai-categorize-sheet.test.tsx).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { CategorizeWizard } from './categorize-wizard'
import type { RowState, SheetSuggestion, Transaction } from '@/components/app/categorize-row'
import type { Budget } from '@/lib/budget-data'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const boodschappenBudget = {
  id: 'b-boodschappen',
  name: 'Boodschappen',
  slug: 'boodschappen',
  budget_type: 'expense',
  ownership: 'personal',
  parent_id: null,
} as unknown as Budget

const overigBudget = {
  id: 'b-overig',
  name: 'Overig',
  slug: 'overig',
  budget_type: 'expense',
  ownership: 'personal',
  parent_id: null,
} as unknown as Budget

const budgetGroups: { parent: Budget; children: Budget[] }[] = [
  { parent: boodschappenBudget, children: [boodschappenBudget, overigBudget] },
]

function makeTx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: '2026-07-01',
    description: `Tx ${id}`,
    counterparty_name: null,
    counterparty_iban: null,
    amount: -10,
    import_hash: `hash-${id}`,
    budget_id: null,
    reference: null,
    account_id: null,
    ...overrides,
  }
}

function makeSuggestion(overrides: Partial<SheetSuggestion> = {}): SheetSuggestion {
  return {
    budget_id: boodschappenBudget.id,
    budget_name: boodschappenBudget.name,
    confidence: 0.9,
    reasoning: 'Lijkt op een supermarkt',
    source: 'ai',
    category_source: 'ai',
    ...overrides,
  }
}

function makeRow(tx: Transaction, suggestion: SheetSuggestion | null, overrides: Partial<RowState> = {}): RowState {
  return {
    tx,
    suggestion,
    accepted: false,
    acceptedBudgetId: null,
    acceptedBudgetName: null,
    acceptedCategorySource: null,
    makeRule: false,
    ...overrides,
  }
}

/** Regel-rij voor de bulk-kaart (stage-1). */
function makeRuleRow(id: string): RowState {
  return makeRow(
    makeTx(id, { counterparty_name: `Bekende Winkel ${id}` }),
    makeSuggestion({ source: 'rule', category_source: 'rule', reasoning: null }),
  )
}

type WizardProps = ComponentProps<typeof CategorizeWizard>

function makeProps(overrides: Partial<WizardProps> = {}): WizardProps {
  return {
    rows: [],
    budgetGroups,
    eigenRekeningBudgetId: null,
    aiPhaseActive: false,
    localMode: false,
    localSessionState: 'idle',
    repBatchSize: 3,
    onAcceptSuggestion: vi.fn(),
    onManualBudget: vi.fn(),
    onToggleMakeRule: vi.fn(),
    onBulkAcceptStage1: vi.fn(),
    onAcceptGroup: vi.fn(),
    onSetGroupBudget: vi.fn(),
    onAcceptOne: vi.fn(),
    onSplitGroup: vi.fn(),
    onStop: vi.fn(),
    onAdvanceRound: vi.fn(),
    ...overrides,
  }
}

function renderWizard(overrides: Partial<WizardProps> = {}) {
  const props = makeProps(overrides)
  render(<CategorizeWizard {...props} />)
  return props
}

/** Leest de kicker "Groep N van M" als genormaliseerde string. */
function progressLabel(): string {
  const el = screen.getByText((_content, node) => {
    const text = (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!/^Groep \d+ van \d+$/.test(text)) return false
    return Array.from(node?.children ?? []).every((c) => (c.textContent ?? '') !== text)
  })
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// ── Bulk-kaart (stage-1) ────────────────────────────────────────────────────

describe('CategorizeWizard — bulk-kaart (stage-1)', () => {
  it('verschijnt bij ≥1 stage-1-voorstel en "Akkoord, allemaal" accepteert alle stage-1-rijen', () => {
    const rows = [makeRuleRow('r1'), makeRuleRow('r2')]
    const props = renderWizard({ rows })

    expect(screen.getByText(/Will herkende/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Akkoord, allemaal/i }))
    expect(props.onBulkAcceptStage1).toHaveBeenCalledTimes(1)
  })

  it('"Bekijk stuk voor stuk" toont de rijenlijst (boven de auto-expand-drempel)', () => {
    // > BULK_AUTO_EXPAND_MAX (8) zodat de kaart standaard ingeklapt is en de
    // toggle-knop verschijnt — anders is de test triviaal (auto-open).
    const rows = Array.from({ length: 9 }, (_, i) => makeRuleRow(`r${i}`))
    renderWizard({ rows })

    // Ingeklapt: geen enkele rij-content ("OK"-knoppen van TransactionRow) zichtbaar.
    expect(screen.queryByRole('button', { name: /^OK$/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Bekijk stuk voor stuk/i }))

    // Uitgeklapt: elke stage-1-rij toont zijn eigen "OK"-knop (TransactionRow).
    expect(screen.getAllByRole('button', { name: /^OK$/i })).toHaveLength(9)
  })
})

// ── AI-groepkaart: volgorde + inhoud ────────────────────────────────────────

describe('CategorizeWizard — AI-groepkaart', () => {
  it('toont de grootste groep eerst, met tegenpartij/aantal/voorstel', () => {
    const groupA = [
      makeRow(makeTx('a1', { counterparty_name: 'Winkel Groot' }), makeSuggestion({ reasoning: 'r-a' })),
      makeRow(makeTx('a2', { counterparty_name: 'Winkel Groot' }), null),
      makeRow(makeTx('a3', { counterparty_name: 'Winkel Groot' }), null),
    ]
    const groupB = [
      makeRow(
        makeTx('b1', { counterparty_name: 'Winkel Klein' }),
        makeSuggestion({ budget_id: overigBudget.id, budget_name: overigBudget.name, reasoning: 'r-b' }),
      ),
    ]
    // Insertievolgorde bewust omgekeerd (B vóór A): de largest-first-comparator
    // moet dit corrigeren, niet de rij-volgorde overnemen.
    renderWizard({ rows: [...groupB, ...groupA] })

    // Grootste groep (3 leden) staat voorop: tegenpartij + aantal + voorstel.
    expect(screen.getByText('Winkel Groot')).toBeInTheDocument()
    expect(screen.getByText('Boodschappen')).toBeInTheDocument()
    expect(screen.getByText(/r-a/i)).toBeInTheDocument()
    expect(screen.queryByText('Winkel Klein')).toBeNull()
    // "3 transacties" — tekst verdeeld over een <span> (count) + tekstnode (label).
    expect(
      screen.getByText((_content, node) => {
        if (!node || !/3\s*transacties/.test(node.textContent ?? '')) return false
        return Array.from(node.children).every((c) => !/3\s*transacties/.test(c.textContent ?? ''))
      }),
    ).toBeInTheDocument()
  })
})

// ── De vier keuzes per groep ─────────────────────────────────────────────────

describe('CategorizeWizard — de vier keuzes routeren correct', () => {
  function multiTxGroup() {
    return [
      makeRow(makeTx('g1', { counterparty_name: 'Groep X' }), makeSuggestion()),
      makeRow(makeTx('g2', { counterparty_name: 'Groep X' }), null),
      makeRow(makeTx('g3', { counterparty_name: 'Groep X' }), null),
    ]
  }

  it('"Akkoord & verder" roept onAcceptGroup aan met exact de groep-tx-id\'s', () => {
    const props = renderWizard({ rows: multiTxGroup() })
    fireEvent.click(screen.getByRole('button', { name: /Akkoord & verder/i }))
    expect(props.onAcceptGroup).toHaveBeenCalledWith(['g1', 'g2', 'g3'])
    expect(props.onAdvanceRound).toHaveBeenCalledTimes(1)
  })

  it('"Andere categorie" + regel-toggle → onSetGroupBudget met budget en makeRule', () => {
    const props = renderWizard({ rows: multiTxGroup() })
    fireEvent.click(screen.getByRole('button', { name: /Andere categorie/i }))

    const select = screen.getByRole('combobox', { name: /Categorie kiezen voor deze groep/i })
    fireEvent.change(select, { target: { value: overigBudget.id } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Maak hier ook een regel van/i }))
    fireEvent.click(screen.getByRole('button', { name: /Toepassen op deze groep/i }))

    expect(props.onSetGroupBudget).toHaveBeenCalledWith(['g1', 'g2', 'g3'], overigBudget.id, true)
  })

  it('"Alleen deze ene" roept onAcceptOne aan met de representant-id (groep >1)', () => {
    const props = renderWizard({ rows: multiTxGroup() })
    fireEvent.click(screen.getByRole('button', { name: /Alleen deze ene/i }))
    expect(props.onAcceptOne).toHaveBeenCalledWith('g1')
  })

  it('"Zelf indelen (sleepmodus)" roept onSplitGroup aan met exact de groep-tx-id\'s', () => {
    const props = renderWizard({ rows: multiTxGroup() })
    fireEvent.click(screen.getByRole('button', { name: /Zelf indelen \(sleepmodus\)/i }))
    expect(props.onSplitGroup).toHaveBeenCalledWith(['g1', 'g2', 'g3'])
    // Splitsen "verbruikt" geen ronde — de motor-voortgang beweegt hier niet.
    expect(props.onAdvanceRound).not.toHaveBeenCalled()
  })
})

// ── Randgevallen ─────────────────────────────────────────────────────────────

describe('CategorizeWizard — randgevallen', () => {
  it('0 AI-groepen: alleen de bulk-kaart, met een rustige afsluitregel', () => {
    renderWizard({ rows: [makeRuleRow('r1')] })

    expect(screen.getByText(/Will herkende/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Akkoord & verder/i })).toBeNull()
    expect(screen.getByText(/Geen onbekende tegenpartijen meer/i)).toBeInTheDocument()
  })

  it('singleton-groep: GEEN "Alleen deze ene"-knop', () => {
    renderWizard({
      rows: [makeRow(makeTx('s1', { counterparty_name: 'Solo Winkel' }), makeSuggestion())],
    })

    expect(screen.getByText('Solo Winkel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Alleen deze ene/i })).toBeNull()
    // De overige drie keuzes blijven wel beschikbaar.
    expect(screen.getByRole('button', { name: /Akkoord & verder/i })).toBeInTheDocument()
  })

  it('groep zonder voorstel + AI actief: laadstatus, wizard blokkeert niet', () => {
    renderWizard({
      rows: [makeRow(makeTx('p1', { counterparty_name: 'Pending Winkel' }), null)],
      aiPhaseActive: true,
      localMode: true,
      localSessionState: 'starten',
    })

    expect(screen.getByText(/Will denkt na over/i)).toBeInTheDocument()
    expect(screen.getByText(/Lokale AI wordt gestart/i)).toBeInTheDocument()
    // Zonder voorstel zijn de vier keuzes (nog) niet zinvol — geen "Akkoord & verder".
    expect(screen.queryByRole('button', { name: /Akkoord & verder/i })).toBeNull()
  })

  it('groep zonder voorstel + AI niet (meer) actief: fallback-indeling, wizard blokkeert niet', () => {
    const props = renderWizard({
      rows: [makeRow(makeTx('f1', { counterparty_name: 'Fallback Winkel' }), null)],
      aiPhaseActive: false,
    })

    expect(screen.getByText(/Will wist het niet zeker/i)).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: /Categorie kiezen voor deze groep/i })
    fireEvent.change(select, { target: { value: boodschappenBudget.id } })
    fireEvent.click(screen.getByRole('button', { name: /Deze groep indelen/i }))

    expect(props.onSetGroupBudget).toHaveBeenCalledWith(['f1'], boodschappenBudget.id, false)
  })
})

// ── Afronden ─────────────────────────────────────────────────────────────────

describe('CategorizeWizard — afronden', () => {
  it('"Stoppen en tot hier bewaren" roept onStop aan', () => {
    const props = renderWizard({
      rows: [makeRow(makeTx('z1', { counterparty_name: 'Zet Winkel' }), makeSuggestion())],
    })
    fireEvent.click(screen.getByRole('button', { name: /Stoppen en tot hier bewaren/i }))
    expect(props.onStop).toHaveBeenCalledTimes(1)
  })
})

// ── Voortgangsteller (M/N) ──────────────────────────────────────────────────
//
// M = het aantal unieke groepen bij de eerste bepaling (stabiel). N = de getoonde
// kaart = M − pendingGroups.length + 1. "Alleen deze ene" houdt de groep pending →
// N schuift NIET op; een via sleepmodus volledig weggewerkte groep verlaagt
// pending → N schuift wél op. (Regressie op de oude accumulator die dubbeltelde.)

describe('CategorizeWizard — voortgangsteller M/N', () => {
  it('M blijft constant en N stijgt niet bij "Alleen deze ene"; sleepmodus-afronding verlaagt pending', () => {
    // Groep X (3, grootste) + Groep Y (2). M = 2, eerste kaart = X → "Groep 1 van 2".
    const xRows = ['g1', 'g2', 'g3'].map((id) =>
      makeRow(makeTx(id, { counterparty_name: 'Groep X' }), makeSuggestion()),
    )
    const yRows = ['y1', 'y2'].map((id) =>
      makeRow(makeTx(id, { counterparty_name: 'Groep Y' }), makeSuggestion()),
    )
    let rows: RowState[] = [...xRows, ...yRows]

    const props = makeProps({ rows })
    const { rerender } = render(<CategorizeWizard {...props} />)
    expect(progressLabel()).toBe('Groep 1 van 2')

    // "Alleen deze ene" (accepteert de representant) — de groep blijft pending.
    const accept = (id: string) => {
      rows = rows.map((r) => (r.tx.id === id ? { ...r, accepted: true } : r))
      rerender(<CategorizeWizard {...props} rows={rows} />)
    }
    accept('g1')
    expect(progressLabel()).toBe('Groep 1 van 2') // M gelijk, N niet gestegen
    accept('g2')
    expect(progressLabel()).toBe('Groep 1 van 2')

    // Sleepmodus werkt de hele groep X weg (parent verwijdert die rijen uit `rows`)
    // → pending daalt naar 1 (alleen Y) → N schuift op naar 2, M blijft 2.
    rows = rows.filter((r) => !r.tx.id.startsWith('g'))
    rerender(<CategorizeWizard {...props} rows={rows} />)
    expect(progressLabel()).toBe('Groep 2 van 2')
  })
})

// ── Primaire acties in de sticky footer (footerContainer) ────────────────────
//
// Met een `footerContainer` portalt de wizard de vier keuzes + "Stoppen" DAAR
// naartoe (niet-scrollende sheet-footer) i.p.v. in de kaart-body.

describe('CategorizeWizard — footer-portal', () => {
  it('portalt de vier keuzes + "Stoppen" naar de meegegeven footerContainer', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      renderWizard({
        rows: [
          makeRow(makeTx('g1', { counterparty_name: 'Groep X' }), makeSuggestion()),
          makeRow(makeTx('g2', { counterparty_name: 'Groep X' }), makeSuggestion()),
        ],
        footerContainer: container,
      })
      const footer = within(container)
      expect(footer.getByRole('button', { name: /Akkoord & verder/i })).toBeInTheDocument()
      expect(footer.getByRole('button', { name: /Alleen deze ene/i })).toBeInTheDocument()
      expect(footer.getByRole('button', { name: /Stoppen en tot hier bewaren/i })).toBeInTheDocument()
    } finally {
      document.body.removeChild(container)
    }
  })
})
