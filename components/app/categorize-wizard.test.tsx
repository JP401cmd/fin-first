/**
 * Component test voor CategorizeWizard — de "Vraag Fin"-wizard (WP-C/WP-E2,
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
    // Zonder step/onStepChange beheert de wizard z'n eigen stap (uncontrolled);
    // stage1Resolved default true zodat de wizard direct de stap-structuur pint.
    stage1Resolved: true,
    onAcceptSuggestion: vi.fn(),
    onManualBudget: vi.fn(),
    onToggleMakeRule: vi.fn(),
    onBulkAcceptStage1: vi.fn(),
    onAcceptGroup: vi.fn(),
    onSetGroupBudget: vi.fn(),
    onAcceptOne: vi.fn(),
    onSplitGroup: vi.fn(),
    onStop: vi.fn(),
    onSave: vi.fn(),
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

/** Leest de StepIndicator-kicker "Stap N van M" als genormaliseerde string. */
function stepHeaderLabel(): string {
  const el = screen.getByText((_content, node) => {
    const text = (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!/^Stap \d+ van \d+$/.test(text)) return false
    return Array.from(node?.children ?? []).every((c) => (c.textContent ?? '') !== text)
  })
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// ── Bulk-kaart (stage-1) ────────────────────────────────────────────────────

describe('CategorizeWizard — stap 1 · bulk-kaart (stage-1)', () => {
  it('verschijnt bij ≥1 stage-1-voorstel en "Alle X toepassen" accepteert alle stage-1-rijen', () => {
    // Flow-revisie #881: de bulk-actie heet nu "Alle X toepassen" (i.p.v. het oude
    // "Akkoord, allemaal") en staat in de stap-1-footer.
    const rows = [makeRuleRow('r1'), makeRuleRow('r2')]
    const props = renderWizard({ rows })

    expect(screen.getByText(/Fin herkende/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Alle 2 toepassen/i }))
    expect(props.onBulkAcceptStage1).toHaveBeenCalledTimes(1)
  })

  it('"Stuk voor stuk bekijken" toont de rijenlijst (boven de auto-expand-drempel)', () => {
    // > BULK_AUTO_EXPAND_MAX (8) zodat de kaart standaard ingeklapt is en de
    // toggle-knop verschijnt — anders is de test triviaal (auto-open).
    const rows = Array.from({ length: 9 }, (_, i) => makeRuleRow(`r${i}`))
    renderWizard({ rows })

    // Ingeklapt: geen enkele rij-content ("OK"-knoppen van TransactionRow) zichtbaar.
    expect(screen.queryByRole('button', { name: /^OK$/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Stuk voor stuk bekijken/i }))

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
  it('0 AI-groepen: alleen stap 1 + stap 3 (geen "Fin\'s voorstellen"-stap)', () => {
    renderWizard({ rows: [makeRuleRow('r1')] })

    expect(screen.getByText(/Fin herkende/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Akkoord & verder/i })).toBeNull()
    // Zonder AI-rijen bestaat stap 2 niet: de stap-indicator toont 'm niet.
    expect(screen.queryByText(/Fin's voorstellen/i)).toBeNull()
    expect(screen.getByText('Automatisch')).toBeInTheDocument()
    expect(screen.getByText('Controle')).toBeInTheDocument()
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

  it('lokale opstart (localSessionState=starten): het opstartblok, niet de gewone laadregel', () => {
    renderWizard({
      rows: [makeRow(makeTx('p1', { counterparty_name: 'Pending Winkel' }), null)],
      aiPhaseActive: true,
      localMode: true,
      localSessionState: 'starten',
    })

    // Eén-malige GPU-warmup: een visueel onderscheiden opstartblok (geen subregel).
    expect(screen.getByText(/Lokale AI wordt gestart/i)).toBeInTheDocument()
    // Tijdens 'starten' NIET de gewone "Fin beoordeelt groep…"-status.
    expect(screen.queryByText(/Fin beoordeelt groep/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Akkoord & verder/i })).toBeNull()
  })

  it('groep zonder voorstel + AI actief (sessie klaar): de gewone laadregel', () => {
    renderWizard({
      rows: [makeRow(makeTx('p2', { counterparty_name: 'Pending Twee' }), null)],
      aiPhaseActive: true,
      localMode: true,
      localSessionState: 'klaar',
    })

    expect(screen.getByText(/Fin beoordeelt groep/i)).toBeInTheDocument()
    expect(screen.queryByText(/Lokale AI wordt gestart/i)).toBeNull()
  })

  it('no-match (aiNoMatch): meteen de handmatige fallback, óók terwijl de AI nog draait', () => {
    // De kern-bugfix: een no-match-rij hoeft niet op het einde van de run te
    // wachten — de kaart springt direct naar de handmatige keuze.
    const props = renderWizard({
      rows: [makeRow(makeTx('nm1', { counterparty_name: 'No-Match Winkel' }), null, { aiNoMatch: true })],
      aiPhaseActive: true,
    })

    expect(screen.getByText(/Fin kon dit niet zeker plaatsen/i)).toBeInTheDocument()
    // Geen laadstatus meer voor deze groep.
    expect(screen.queryByText(/Fin beoordeelt groep/i)).toBeNull()
    const select = screen.getByRole('combobox', { name: /Categorie kiezen voor deze groep/i })
    fireEvent.change(select, { target: { value: boodschappenBudget.id } })
    fireEvent.click(screen.getByRole('button', { name: /Deze groep indelen/i }))
    expect(props.onSetGroupBudget).toHaveBeenCalledWith(['nm1'], boodschappenBudget.id, false)
  })

  it('groep zonder voorstel + AI niet (meer) actief: fallback-indeling, wizard blokkeert niet', () => {
    const props = renderWizard({
      rows: [makeRow(makeTx('f1', { counterparty_name: 'Fallback Winkel' }), null)],
      aiPhaseActive: false,
    })

    // Eén no-match-bewoording app-breed (UX-5): ook het "AI klaar zonder
    // voorstel"-pad gebruikt exact dezelfde tekst als het aiNoMatch-pad.
    expect(screen.getByText(/Fin kon dit niet zeker plaatsen/i)).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: /Categorie kiezen voor deze groep/i })
    fireEvent.change(select, { target: { value: boodschappenBudget.id } })
    fireEvent.click(screen.getByRole('button', { name: /Deze groep indelen/i }))

    expect(props.onSetGroupBudget).toHaveBeenCalledWith(['f1'], boodschappenBudget.id, false)
  })

  it('"Alle AI-voorstellen goedkeuren" accepteert elke groep-met-voorstel (advance per groep)', () => {
    const rows = [
      makeRow(makeTx('a1', { counterparty_name: 'Winkel A' }), makeSuggestion()),
      makeRow(makeTx('b1', { counterparty_name: 'Winkel B' }), makeSuggestion()),
      makeRow(makeTx('c1', { counterparty_name: 'Winkel C' }), null), // geen voorstel → blijft in wachtrij
    ]
    const props = renderWizard({ rows, aiPhaseActive: true })

    fireEvent.click(screen.getByRole('button', { name: /Alle AI-voorstellen goedkeuren/i }))

    // Twee groepen met voorstel geaccepteerd; de derde (zonder) niet.
    expect(props.onAcceptGroup).toHaveBeenCalledTimes(2)
    expect(props.onAcceptGroup).toHaveBeenCalledWith(['a1'])
    expect(props.onAcceptGroup).toHaveBeenCalledWith(['b1'])
    // advance() per geaccepteerde groep (prefetch-telling blijft kloppen).
    expect(props.onAdvanceRound).toHaveBeenCalledTimes(2)
  })
})

// ── Bulk-transparantie: "waarvan N minder zeker" ────────────────────────────
//
// Eigenaarsbesluit: de bulk-knop pakt ÓÓK de minder-zekere voorstellen mee; de
// knop toont daarom een subtiele telling zodat de gebruiker weet wat 'ie bulk-
// goedkeurt. Het knopgedrag verandert niet (accepteert alle voorstellen).

describe('CategorizeWizard — bulk-transparantie "waarvan N minder zeker"', () => {
  it('toont "waarvan 1 minder zeker" bij één 0,6-voorstel naast één 0,95-voorstel', () => {
    renderWizard({
      rows: [
        makeRow(makeTx('lc1', { counterparty_name: 'Onzeker Winkel' }), makeSuggestion({ confidence: 0.6 })),
        makeRow(makeTx('hc1', { counterparty_name: 'Zekere Winkel' }), makeSuggestion({ confidence: 0.95 })),
      ],
    })

    const bulk = screen.getByRole('button', { name: /Alle AI-voorstellen goedkeuren/i })
    expect(bulk).toBeInTheDocument()
    // Subtiele telling: één van de twee wachtende voorstellen is minder zeker.
    expect(
      screen.getByText((_content, node) => {
        const text = (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!/^waarvan 1 minder zeker$/.test(text)) return false
        return Array.from(node?.children ?? []).every((c) => (c.textContent ?? '').trim() !== text)
      }),
    ).toBeInTheDocument()
  })

  it('geen telling wanneer alle voorstellen zeker zijn (N=0)', () => {
    renderWizard({
      rows: [
        makeRow(makeTx('h1', { counterparty_name: 'Zeker Een' }), makeSuggestion({ confidence: 0.9 })),
        makeRow(makeTx('h2', { counterparty_name: 'Zeker Twee' }), makeSuggestion({ confidence: 0.92 })),
      ],
    })
    expect(screen.getByRole('button', { name: /Alle AI-voorstellen goedkeuren/i })).toBeInTheDocument()
    expect(screen.queryByText(/minder zeker/i)).toBeNull()
  })
})

// ── Uitklapbare ledenlijst (stap 2) ──────────────────────────────────────────

describe('CategorizeWizard — uitklapbare ledenlijst', () => {
  it('"N transacties" is een toggle die de leden (datum/omschrijving/bedrag) read-only toont', () => {
    const rows = [
      makeRow(makeTx('m1', { counterparty_name: 'Multi Winkel', description: 'Aankoop een' }), makeSuggestion()),
      makeRow(makeTx('m2', { counterparty_name: 'Multi Winkel', description: 'Aankoop twee' }), null),
    ]
    renderWizard({ rows })

    // Ingeklapt: de omschrijvingen van de leden zijn nog niet zichtbaar.
    expect(screen.queryByText('Aankoop twee')).toBeNull()

    const toggle = screen.getByRole('button', { expanded: false, name: /2\s*transacties/i })
    fireEvent.click(toggle)

    // Uitgeklapt: elke lid-omschrijving verschijnt (read-only).
    expect(screen.getByText('Aankoop een')).toBeInTheDocument()
    expect(screen.getByText('Aankoop twee')).toBeInTheDocument()
  })
})

// ── Twee traps: "minder zeker"-label + details tonen om zelf te kiezen ───────
//
// De resolver zet budget_id vanaf confidence 0,5 maar behoudt de confidence;
// LOCAL_MIN_CONFIDENCE (0,8) blijft de "zeker"-grens die de UI gebruikt om een
// voorstel met lage confidence subtiel als "minder zeker" te labelen. Path-
// agnostisch: geldt ook voor cloud-voorstellen (source 'ai') met lage confidence.

describe('CategorizeWizard — twee traps · "minder zeker"-label', () => {
  it('(a) ai-voorstel met confidence 0,6 → toont "minder zeker" naast de WILL-badge', () => {
    renderWizard({
      rows: [makeRow(makeTx('lc1', { counterparty_name: 'Onzeker Winkel' }), makeSuggestion({ confidence: 0.6 }))],
    })
    // Het kaart-label (met middot-prefix); de bulk-telling "waarvan N minder zeker"
    // is een aparte tekst — daarom scopen we hier op exact het kaart-label.
    expect(screen.getByText('· minder zeker')).toBeInTheDocument()
  })

  it('(b) ai-voorstel met confidence 0,95 → GEEN label (gewoon voorstel)', () => {
    renderWizard({
      rows: [makeRow(makeTx('hc1', { counterparty_name: 'Zekere Winkel' }), makeSuggestion({ confidence: 0.95 }))],
    })
    expect(screen.queryByText(/minder zeker/i)).toBeNull()
  })

  it('(d) cloud-voorstel (source ai) met lage confidence → óók het label (consistentie)', () => {
    renderWizard({
      rows: [
        makeRow(
          makeTx('cl1', { counterparty_name: 'Cloud Onzeker' }),
          makeSuggestion({ source: 'ai', category_source: 'ai', confidence: 0.55, reasoning: 'cloud-oordeel' }),
        ),
      ],
    })
    expect(screen.getByText('· minder zeker')).toBeInTheDocument()
  })

  it('(e) gepropageerd voorstel (source propagated) met lage confidence → óók het label', () => {
    // Een zustergroep erft hetzelfde AI-oordeel via de naam-/IBAN-key (source
    // 'propagated') mét dezelfde geërfde confidence (0,5–0,8). Dat moet dezelfde
    // "minder zeker"-duiding krijgen als de AI-twin — anders is de UI inconsistent.
    renderWizard({
      rows: [
        makeRow(
          makeTx('pr1', { counterparty_name: 'Afgeleide Winkel' }),
          makeSuggestion({ source: 'propagated', category_source: 'propagated', confidence: 0.6 }),
        ),
      ],
    })
    expect(screen.getByText('· minder zeker')).toBeInTheDocument()
  })

  it('een zeker voorstel (≥0,8) toont géén "Bekijk"-affordance; een minder-zeker-groep wel', () => {
    // Zeker (0,9): neutrale teller, geen "Bekijk".
    const { unmount } = render(
      <CategorizeWizard
        {...makeProps({
          rows: [
            makeRow(makeTx('z1', { counterparty_name: 'Zeker', description: 'Aankoop een' }), makeSuggestion({ confidence: 0.9 })),
            makeRow(makeTx('z2', { counterparty_name: 'Zeker', description: 'Aankoop twee' }), null),
          ],
        })}
      />,
    )
    expect(screen.getByRole('button', { expanded: false, name: /2\s*transacties/i })).toBeInTheDocument()
    expect(screen.queryByText(/^Bekijk$/)).toBeNull()
    unmount()

    // Minder zeker (0,6): uitnodigende "Bekijk N transacties"-affordance, nog ingeklapt.
    renderWizard({
      rows: [
        makeRow(makeTx('m1', { counterparty_name: 'Onzeker', description: 'Aankoop een' }), makeSuggestion({ confidence: 0.6 })),
        makeRow(makeTx('m2', { counterparty_name: 'Onzeker', description: 'Aankoop twee' }), null),
      ],
    })
    const toggle = screen.getByRole('button', { expanded: false, name: /Bekijk.*2\s*transacties/i })
    expect(toggle).toBeInTheDocument()
    // Verifiëren vóór akkoord: klikken toont de leden (datum/omschrijving/bedrag).
    fireEvent.click(toggle)
    expect(screen.getByText('Aankoop een')).toBeInTheDocument()
    expect(screen.getByText('Aankoop twee')).toBeInTheDocument()
  })
})

describe('CategorizeWizard — twee traps · details bij no-match', () => {
  it('(c) no-match-kaart met meerdere transacties → ledenlijst standaard UITGEKLAPT', () => {
    renderWizard({
      rows: [
        makeRow(makeTx('nm1', { counterparty_name: 'No-Match', description: 'Betaling een' }), null, { aiNoMatch: true }),
        makeRow(makeTx('nm2', { counterparty_name: 'No-Match', description: 'Betaling twee' }), null),
      ],
      aiPhaseActive: true,
    })

    // Zonder klik zijn de lid-details zichtbaar (de gebruiker moet zelf kiezen).
    expect(screen.getByText('Betaling een')).toBeInTheDocument()
    expect(screen.getByText('Betaling twee')).toBeInTheDocument()
    // De toggle staat op expanded (kan weer inklappen).
    expect(screen.getByRole('button', { expanded: true, name: /2\s*transacties/i })).toBeInTheDocument()
    // En de handmatige keuze staat klaar.
    expect(screen.getByText(/Fin kon dit niet zeker plaatsen/i)).toBeInTheDocument()
  })
})

// ── Stap 3 · Controle & opslaan ──────────────────────────────────────────────

describe('CategorizeWizard — stap 3 · controle & opslaan', () => {
  it('groepeert per doelcategorie en Opslaan is enabled met ≥1 geaccepteerde rij', () => {
    const rows = [
      makeRow(makeTx('x1', { counterparty_name: 'Winkel X' }), makeSuggestion(), {
        accepted: true,
        acceptedBudgetId: boodschappenBudget.id,
        acceptedBudgetName: boodschappenBudget.name,
        acceptedCategorySource: 'ai',
      }),
      makeRow(makeTx('x2', { counterparty_name: 'Winkel X' }), makeSuggestion()), // openstaand voorstel
    ]
    const props = renderWizard({ rows, step: 3 })

    // De doelcategorie verschijnt in het overzicht.
    expect(screen.getAllByText(/Boodschappen/).length).toBeGreaterThan(0)

    const opslaan = screen.getByRole('button', { name: /^Opslaan$/i })
    expect(opslaan).not.toBeDisabled()
    fireEvent.click(opslaan)
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('Opslaan is uitgeschakeld zonder geaccepteerde rijen', () => {
    const rows = [makeRow(makeTx('y1', { counterparty_name: 'Winkel Y' }), makeSuggestion())]
    renderWizard({ rows, step: 3 })

    expect(screen.getByRole('button', { name: /^Opslaan$/i })).toBeDisabled()
  })
})

// ── Afronden ─────────────────────────────────────────────────────────────────

describe('CategorizeWizard — afronden', () => {
  it('"Stoppen en controleren" roept onStop aan', () => {
    const props = renderWizard({
      rows: [makeRow(makeTx('z1', { counterparty_name: 'Zet Winkel' }), makeSuggestion())],
    })
    fireEvent.click(screen.getByRole('button', { name: /Stoppen en controleren/i }))
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
      expect(footer.getByRole('button', { name: /Stoppen en controleren/i })).toBeInTheDocument()
    } finally {
      document.body.removeChild(container)
    }
  })
})

// ── GWT-1: stepper toont alle 3 stappen ──────────────────────────────────────

describe('CategorizeWizard — GWT-1 · stepper met alle 3 stappen', () => {
  it('toont "Automatisch" › "Fin\'s voorstellen" › "Controle" wanneer stage-1 én AI-rijen bestaan', () => {
    const rows = [
      makeRuleRow('r1'),
      makeRow(makeTx('a1', { counterparty_name: 'AI Winkel' }), makeSuggestion()),
    ]
    renderWizard({ rows })

    expect(screen.getByText('Automatisch')).toBeInTheDocument()
    expect(screen.getByText("Fin's voorstellen")).toBeInTheDocument()
    expect(screen.getByText('Controle')).toBeInTheDocument()
    expect(stepHeaderLabel()).toBe('Stap 1 van 3')
  })
})

// ── GWT-2: 0 stage-1-rijen → stap 1 bestaat niet, start direct op stap 2 ─────

describe('CategorizeWizard — GWT-2 · 0 stage-1-voorstellen slaat stap 1 over', () => {
  it('start direct op "Fin\'s voorstellen" (stap 1 van 2) zonder enige stage-1-bulk-kaart', () => {
    const rows = [makeRow(makeTx('a1', { counterparty_name: 'AI Alleen' }), makeSuggestion())]
    renderWizard({ rows })

    expect(screen.queryByText('Automatisch')).toBeNull()
    expect(screen.queryByText(/Fin herkende/i)).toBeNull()
    expect(screen.getByText("Fin's voorstellen")).toBeInTheDocument()
    expect(screen.getByText('AI Alleen')).toBeInTheDocument()
    expect(stepHeaderLabel()).toBe('Stap 1 van 2')
  })
})

// ── GWT-4: "Alle X toepassen" navigeert door naar stap 2 ─────────────────────

describe('CategorizeWizard — GWT-4 · "Alle X toepassen" gaat door naar stap 2', () => {
  it('toont de AI-groepkaart van stap 2 na klikken, óók al is onBulkAcceptStage1 een mock', () => {
    const rows = [
      makeRuleRow('r1'),
      makeRow(makeTx('a1', { counterparty_name: 'AI Winkel' }), makeSuggestion()),
    ]
    const props = renderWizard({ rows })

    fireEvent.click(screen.getByRole('button', { name: /Alle 1 toepassen/i }))

    expect(props.onBulkAcceptStage1).toHaveBeenCalledTimes(1)
    // De wizard navigeert zelf door (goNext), onafhankelijk van of de parent de
    // rijen al heeft bijgewerkt — dat is precies het in-memory→stap-2-contract.
    expect(screen.getByText('AI Winkel')).toBeInTheDocument()
    expect(screen.queryByText(/Fin herkende/i)).toBeNull()
  })
})

// ── GWT-5: "Verder zonder toepassen" laat stage-1-rijen openstaand in stap 3 ─

describe('CategorizeWizard — GWT-5 · "Verder zonder toepassen"', () => {
  it('roept onBulkAcceptStage1 NIET aan en toont de stage-1-rijen openstaand (niet-geaccepteerd) in stap 3', () => {
    const rows = [makeRuleRow('r1'), makeRuleRow('r2')]
    const props = renderWizard({ rows })

    fireEvent.click(screen.getByRole('button', { name: /Verder zonder toepassen/i }))

    expect(props.onBulkAcceptStage1).not.toHaveBeenCalled()
    // Zonder AI-rijen bestaat stap 2 niet: direct naar stap 3 (Controle).
    expect(screen.getByText('Controleer en sla op')).toBeInTheDocument()
    // De rijen staan open (badge "Regel", niet "Gekeurd") en Opslaan is uit — er
    // is niets geaccepteerd, alleen "verder gegaan zonder toepassen".
    expect(screen.getAllByText('Regel').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^Opslaan$/i })).toBeDisabled()
  })
})

// ── GWT-7 (randgeval): later gearriveerde voorstellen tijdens een lopende ronde ──

describe('CategorizeWizard — GWT-7 (randgeval) · later gearriveerde voorstellen', () => {
  it('"Alle AI-voorstellen goedkeuren" werkt opnieuw zodra een eerder wachtende groep alsnog een voorstel krijgt', () => {
    const initialRows: RowState[] = [
      makeRow(makeTx('a1', { counterparty_name: 'Winkel A' }), makeSuggestion()),
      makeRow(makeTx('b1', { counterparty_name: 'Winkel B' }), makeSuggestion({ budget_id: overigBudget.id, budget_name: overigBudget.name })),
      makeRow(makeTx('c1', { counterparty_name: 'Winkel C' }), null), // nog geen voorstel — AI draait nog
    ]
    const props = makeProps({ rows: initialRows, aiPhaseActive: true })
    const { rerender } = render(<CategorizeWizard {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /Alle AI-voorstellen goedkeuren/i }))
    expect(props.onAcceptGroup).toHaveBeenCalledTimes(2)
    expect(props.onAcceptGroup).toHaveBeenCalledWith(['a1'])
    expect(props.onAcceptGroup).toHaveBeenCalledWith(['b1'])
    ;(props.onAcceptGroup as ReturnType<typeof vi.fn>).mockClear()
    ;(props.onAdvanceRound as ReturnType<typeof vi.fn>).mockClear()

    // Simuleer: de sheet verwerkt de twee acceptaties én de derde groep krijgt
    // alsnog een voorstel — de AI-fase draait nog steeds.
    const updatedRows: RowState[] = [
      { ...initialRows[0], accepted: true, acceptedBudgetId: boodschappenBudget.id },
      { ...initialRows[1], accepted: true, acceptedBudgetId: overigBudget.id },
      { ...initialRows[2], suggestion: makeSuggestion({ budget_id: boodschappenBudget.id }) },
    ]
    rerender(<CategorizeWizard {...props} rows={updatedRows} />)

    // Precies 1 wachtende groep mét voorstel → de knop verschijnt weer en
    // accepteert alléén die derde groep — de eerdere twee blijven met rust.
    fireEvent.click(screen.getByRole('button', { name: /Alle AI-voorstellen goedkeuren/i }))
    expect(props.onAcceptGroup).toHaveBeenCalledTimes(1)
    expect(props.onAcceptGroup).toHaveBeenCalledWith(['c1'])
  })
})

// ── GWT-9: cloud-pad toont nooit het lokale opstartblok ──────────────────────

describe('CategorizeWizard — GWT-9 · cloud-pad zonder opstartblok', () => {
  it('localMode=false: altijd de gewone laadregel, nooit "Lokale AI wordt gestart" — ook niet als localSessionState toevallig "starten" is', () => {
    renderWizard({
      rows: [makeRow(makeTx('c1', { counterparty_name: 'Cloud Winkel' }), null)],
      aiPhaseActive: true,
      localMode: false,
      localSessionState: 'starten',
    })

    expect(screen.getByText(/Fin beoordeelt groep/i)).toBeInTheDocument()
    expect(screen.queryByText(/Lokale AI wordt gestart/i)).toBeNull()
  })
})

// ── GWT-12: een rij in stap 3 blijft aanpasbaar ──────────────────────────────

describe('CategorizeWizard — GWT-12 · rij in stap 3 nog aanpasbaar', () => {
  it('een openstaande rij (met voorstel, nog niet geaccepteerd) kan in stap 3 alsnog een andere categorie krijgen', () => {
    const rows = [makeRow(makeTx('p1', { counterparty_name: 'Pending Rij' }), makeSuggestion())]
    const props = renderWizard({ rows, step: 3 })

    // TransactionRow's "andere categorie"-select voor een rij met voorstel.
    const select = screen.getByRole('combobox', { name: /Andere categorie kiezen/i })
    fireEvent.change(select, { target: { value: overigBudget.id } })

    // idx 0 (enige rij) + de nieuw gekozen budget-id landen in het save-payload-pad.
    expect(props.onManualBudget).toHaveBeenCalledWith(0, overigBudget.id)
  })

  it('een reeds GEACCEPTEERDE rij houdt in stap 3 de "andere categorie"-select en kan alsnog wijzigen (editableWhenAccepted)', () => {
    // UX-2: buiten stap 3 verbergt een geaccepteerde rij de select; in de controle-
    // stap moet wijzigen kunnen. De wizard geeft daar editableWhenAccepted mee.
    const rows = [
      makeRow(makeTx('acc1', { counterparty_name: 'Gekeurde Rij' }), makeSuggestion(), {
        accepted: true,
        acceptedBudgetId: boodschappenBudget.id,
        acceptedBudgetName: boodschappenBudget.name,
        acceptedCategorySource: 'ai',
      }),
    ]
    const props = renderWizard({ rows, step: 3 })

    // Een volledig gekeurde groep staat standaard ingeklapt — klap 'm open.
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    // De select is zichtbaar ondanks accepted=true → wijzigen loopt via onManualBudget.
    const select = screen.getByRole('combobox', { name: /Andere categorie kiezen/i })
    fireEvent.change(select, { target: { value: overigBudget.id } })
    expect(props.onManualBudget).toHaveBeenCalledWith(0, overigBudget.id)
  })
})

// ── GWT-13: automatische overgang stap 2 → 3 bij lege wachtrij ───────────────

describe('CategorizeWizard — GWT-13 · auto-overgang 2 → 3', () => {
  it('springt automatisch naar stap 3 (onStepChange(3)) zodra de laatste wachtende groep geaccepteerd is', () => {
    const onStepChange = vi.fn()
    const rows: RowState[] = [makeRow(makeTx('g1', { counterparty_name: 'Laatste Groep' }), makeSuggestion())]
    const props = makeProps({ rows, step: 2, onStepChange })
    const { rerender } = render(<CategorizeWizard {...props} />)

    expect(screen.getByText('Laatste Groep')).toBeInTheDocument()
    onStepChange.mockClear()

    // De laatste groep wordt geaccepteerd → pendingGroups wordt leeg.
    const acceptedRows = rows.map((r) => ({ ...r, accepted: true }))
    rerender(<CategorizeWizard {...props} rows={acceptedRows} step={2} />)

    expect(onStepChange).toHaveBeenCalledWith(3)
  })
})
