import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { Box3OptimizerClient } from './optimizer-client'

// Privacy-maskering: default zichtbaar, individuele tests zetten 'm aan.
// Zelfde idioom als netto-vermogen-widget.test.tsx.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// De rendement-chip opent de gedeelde VoorkeurBewerkenSheet; die roept na
// opslaan `router.refresh()` aan zodat de server de scenario's opnieuw
// doorrekent met de nieuwe aanname.
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))
import { generateBox3Strategies, synthBox3Input } from '@/lib/tax-optimizer/box3-strategies'
import { buildCurrentStanding, pickBest } from '@/lib/tax-optimizer'
import { calculateBox3 } from '@/lib/box3-data'
import { DEFAULT_RETURN } from '@/lib/constants'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import { GOAL_BY_ID } from '@/lib/tax-optimizer/goals'
import type {
  GoalSection,
  OptimizerCurrentStanding,
  OptimizerStrategy,
  OptimizerTopChoice,
  ShiftCurvePoint,
} from '@/lib/tax-optimizer/types'

/**
 * Currency-rendering gebruikt een non-breaking space tussen € en het bedrag
 * (Intl.NumberFormat('nl-NL')). Testing-library's whitespace-normalizer
 * collapst die naar een gewone spatie bij het lezen van de DOM, dus een exacte
 * string-match met de nbsp zelf faalt stil. Idioom uit jaarruimte-card.test.tsx:
 * match op een `€\s*<bedrag>`-regex i.p.v. de exacte geformatteerde string.
 */
function euroPattern(amount: number): RegExp {
  const digits = Math.round(amount).toLocaleString('nl-NL').replace(/\./g, '\\.')
  return new RegExp(`€\\s*${digits}`)
}

const DAILY_EXPENSES = 100
const YEAR = 2026 as const

/** Schrijfpad van de editor: PUT /api/parameters (geen client-directe DB-write). */
const mockFetch = vi.fn()

beforeEach(() => {
  mockPrivacy.masked = false
  mockRefresh.mockReset()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
  } as unknown as Response)
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Fixture uit de ÉCHTE motor (calculateBox3 + generateBox3Strategies +
 * buildCurrentStanding) — geen handgeschreven objecten. Zo pinnen de tests
 * zowel "de weergave klopt" als "de motor levert de velden waar de weergave op
 * rust" (netto effect, rendementskosten, huidige situatie).
 *
 * Groot beleggingen-blok zonder spaargeld: garandeert een "beleggingen →
 * spaargeld"-shift die de heffing verlaagt (lager forfait) maar verwacht
 * rendement kost — dus een NEGATIEF netto effect.
 */
function buildFixture(): {
  baseline: OptimizerStrategy
  shift: OptimizerStrategy
  shiftCurve: ShiftCurvePoint[]
  standing: OptimizerCurrentStanding
} {
  const current = calculateBox3(synthBox3Input(0, 300_000, 0, false, DAILY_EXPENSES, YEAR))
  const { baseline, strategies, shiftCurve } = generateBox3Strategies({
    goalId: 'box3-minimaal',
    year: YEAR,
    dailyExpenses: DAILY_EXPENSES,
    hasPartner: false,
    current,
  })
  const shift = strategies.find((s) => s.kind === 'samenstelling-shift')
  if (!shift) {
    throw new Error(
      'fixture-fout: generateBox3Strategies leverde geen samenstelling-shift op — pas de fixture-bedragen aan',
    )
  }
  // Meet vóór je assert: bevestig dat de motor écht een rendement-kostend
  // scenario met positieve besparing én negatief netto effect teruggeeft.
  expect(shift.hasReturnCost).toBe(true)
  expect(shift.savings).toBeGreaterThan(0)
  expect(shift.returnCostEur).toBeGreaterThan(0)
  expect(shift.netEffect).toBeLessThan(0)
  // …en dat er een curve mét meerdere doorgerekende punten uitkomt, anders
  // bewijzen de verkenner-tests hieronder niets.
  if (!shiftCurve || shiftCurve.length < 2) {
    throw new Error('fixture-fout: generateBox3Strategies leverde geen bruikbare shiftCurve op')
  }
  // Het verloop is de basis van de nieuwe "Verloop"-rij in de vergelijking.
  expect(baseline.trajectory).not.toBeNull()
  expect(shift.trajectory).not.toBeNull()

  return { baseline, shift, shiftCurve, standing: buildCurrentStanding(current, DAILY_EXPENSES) }
}

function box3Section(
  goalId: 'box3-minimaal' | 'box3-geen-rendementsverlies',
  baseline: OptimizerStrategy,
  ranked: OptimizerStrategy[],
  best: OptimizerStrategy | null,
  shiftCurve: ShiftCurvePoint[] | null = null,
): GoalSection {
  return { kind: 'box3', goalId, goal: GOAL_BY_ID[goalId], baseline, ranked, shiftCurve, best }
}

function jaarruimteSection(besparing: number, freedomDays: number): GoalSection {
  return {
    kind: 'jaarruimte',
    goalId: 'jaarruimte-maximaal',
    goal: GOAL_BY_ID['jaarruimte-maximaal'],
    grossYearlyIncome: 60_000,
    pensionFactorA: 0,
    dailyExpenses: DAILY_EXPENSES,
    hasData: true,
    besparing,
    freedomDays,
    netEffect: besparing,
    netFreedomDays: freedomDays,
  }
}

describe('Box3OptimizerClient — katern I: waar je nu staat', () => {
  it('pint de getoonde referentie-cijfers op de canonieke buildCurrentStanding-uitvoer', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('Heffing nu')).toBeTruthy()
    // Het getoonde bedrag is exact de heffing uit de motor.
    expect(screen.getAllByText(euroPattern(standing.tax)).length).toBeGreaterThan(0)
    // Vrijheidstijd-framing: de heffing in dagen, uit hetzelfde standing-veld.
    expect(screen.getByText(`${standing.taxFreedomDays} dagen`)).toBeTruthy()
    // Vermogensmix uit standing (beleggingen-only fixture).
    expect(screen.getAllByText(euroPattern(standing.totaalBeleggingen)).length).toBeGreaterThan(0)
  })

  it('toont de aannames waarop de vergelijking rust als chips', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
        year={YEAR}
      />,
    )

    expect(screen.getByText('verwacht rendement beleggen')).toBeTruthy()
    expect(screen.getByText('spaarrente-aanname')).toBeTruthy()
    expect(screen.getByText('belastingjaar')).toBeTruthy()
  })
})

/**
 * De rendement-chip toonde `DEFAULT_RETURN` (7,0%) uit lib/constants.ts, terwijl
 * de server de scenario's met de PROFIEL-instelling van de gebruiker doorrekent.
 * Het getoonde percentage moet het gebruikte percentage zijn — daarom leest de
 * chip nu uitsluitend de geleverde prop.
 */
describe('Box3OptimizerClient — de rendementsaanname is de GEBRUIKTE aanname', () => {
  function renderMetRendement(expectedReturn: number, isPersonal: boolean) {
    const { baseline, shift, standing } = buildFixture()
    return render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
        year={YEAR}
        expectedReturn={expectedReturn}
        expectedReturnIsPersonal={isPersonal}
      />,
    )
  }

  /** De rendement-chip als element (knop-variant: opent de inline editor). */
  function rendementChip(): HTMLButtonElement {
    const el = screen.getByText('verwacht rendement beleggen').closest('button')
    if (!el) throw new Error('fixture-fout: de rendement-chip is geen knop')
    return el as HTMLButtonElement
  }

  /** De aannames-voetnoot uit katern IV — dezelfde grootheid, tweede plek. */
  function aannamesVoetnoot(): HTMLElement {
    return screen.getByText('Aannames').parentElement as HTMLElement
  }

  it('toont de geleverde eigen instelling (5,5%) — niet de constante 7,0%', () => {
    renderMetRendement(0.055, true)

    // Chip: het GETOONDE percentage is het GELEVERDE percentage.
    expect(rendementChip().textContent).toContain('5,5%')
    expect(rendementChip().textContent).not.toContain('7,0%')
    expect(rendementChip().textContent).toContain('eigen instelling')

    // Voetnoot (katern IV) draagt dezelfde grootheid en moet dus hetzelfde
    // zeggen — anders spreekt de pagina zichzelf tegen.
    expect(aannamesVoetnoot().textContent).toContain('5,5%')
    expect(aannamesVoetnoot().textContent).not.toContain('7,0%')
    expect(aannamesVoetnoot().textContent).toContain('je eigen instelling')
  })

  it('markeert de app-standaard als standaard, met hetzelfde percentage', () => {
    renderMetRendement(DEFAULT_RETURN, false)

    expect(rendementChip().textContent).toContain('7,0%')
    expect(rendementChip().textContent).toContain('standaard')
    expect(rendementChip().textContent).not.toContain('eigen instelling')
    expect(aannamesVoetnoot().textContent).toContain('7,0%')
    expect(aannamesVoetnoot().textContent).toContain('(standaard)')
  })

  it('maakt de rendement-chip een toegankelijke bewerk-knop', () => {
    renderMetRendement(0.055, true)
    const chip = rendementChip()

    // Het aria-label VERVANGT de accessible name, dus het moet de waarde en de
    // herkomst dragen — anders is dit de enige chip op de rij waarvan een
    // screenreader-gebruiker het percentage niet hoort.
    const naam = chip.getAttribute('aria-label') ?? ''
    expect(naam).toContain('verwacht rendement beleggen')
    expect(naam).toContain('5,5%')
    expect(naam).toContain('eigen instelling')
    expect(naam).toContain('aanpassen')
    expect(screen.getByRole('button', { name: /5,5%.*aanpassen/ })).toBeTruthy()
    // 44px touch-target op klein scherm; op desktop blijft de chip compact.
    expect(chip.className).toContain('min-h-[44px]')
    expect(chip.className).toContain('sm:min-h-0')
    // Zichtbare focus-ring.
    expect(chip.className).toContain('focus-visible:outline')
    // De chip zelf bewerkt niet inline — hij opent de editor.
    expect(chip.querySelector('input')).toBeNull()
  })

  it('laat de twee andere chips read-only (geen knop, geen herkomst-markering)', () => {
    renderMetRendement(0.055, true)

    expect(screen.getByText('spaarrente-aanname').closest('button')).toBeNull()
    expect(screen.getByText('belastingjaar').closest('button')).toBeNull()
    // De spaarrente blijft de constante — daar bestaat geen instelling voor.
    expect(screen.getAllByText('1,3%').length).toBeGreaterThan(0)
  })

  it('valt zonder prop terug op de app-standaard (regressie: geen kale/NaN-chip)', () => {
    const { baseline, shift, standing } = buildFixture()
    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
        year={YEAR}
      />,
    )

    expect(rendementChip().textContent).toContain('7,0%')
    expect(rendementChip().textContent).toContain('standaard')
  })
})

/**
 * De chip is een inline editor: hij opent dezelfde `VoorkeurBewerkenSheet` als
 * /toekomst/voorkeuren, met dezelfde kolom en hetzelfde schrijfpad
 * (PUT /api/parameters). Deze suite pint de bedrading: openen, startwaarde,
 * opslaan-als-fractie, en dat een serverfout de envelope-tekst toont.
 */
describe('Box3OptimizerClient — inline editor voor de rendements-aanname', () => {
  function renderEnOpen(expectedReturn = 0.055) {
    const { baseline, shift, standing } = buildFixture()
    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
        year={YEAR}
        expectedReturn={expectedReturn}
        expectedReturnIsPersonal
      />,
    )
    // De accessible name draagt de waarde én de herkomst; match op het
    // onderscheidende deel i.p.v. op een vaste string.
    fireEvent.click(screen.getByRole('button', { name: /verwacht rendement.*aanpassen/i }))
  }

  it('opent de editor bij een klik op de chip, gestart op de GELEVERDE waarde', () => {
    renderEnOpen(0.055)

    expect(screen.getByRole('dialog')).toBeTruthy()
    // 0,055 → 5.5 procent: de editor start op wat de server heeft gebruikt,
    // niet op een constante.
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('5.5')
    // Grenzen volgen de API-band voor expected_return.
    expect(input.getAttribute('min')).toBe('1')
    expect(input.getAttribute('max')).toBe('15')
  })

  it('legt uit dat dezelfde aanname de Toekomst-projectie voedt', () => {
    renderEnOpen()
    expect(screen.getByText(/projectie op Toekomst/i)).toBeTruthy()
    // Secundaire uitgang: beheer van álle aannames blijft vindbaar.
    expect(
      screen.getByRole('link', { name: /Beheer al je aannames/i }).getAttribute('href'),
    ).toBe('/toekomst/voorkeuren')
  })

  it('slaat op via PUT /api/parameters met de fractie, sluit en refresht', async () => {
    renderEnOpen(0.055)

    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '6.5' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/parameters')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ expected_return: 0.065 })
    // De editor gaat dicht. De sheet blijft bewust GEMOUNT (open-prop i.p.v.
    // conditioneel renderen, zodat de focus-trap de focus terugzet op de chip),
    // dus het dialoog-element verdwijnt pas ná de sluit-animatie — vandaar
    // waitFor in plaats van een directe assertie.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('toont bij een serverfout de envelope-tekst, géén rauwe DB-message, en blijft open', async () => {
    renderEnOpen(0.055)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Verwacht rendement moet tussen 1% en 15% liggen' }),
    } as unknown as Response)

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('Verwacht rendement moet tussen 1% en 15% liggen')
    expect(text).not.toMatch(/violates|constraint|PGRST|relation/i)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe('Box3OptimizerClient — katern II: de vergelijking', () => {
  it('zet elke kans op één netto-effect-as en toont het geleverde netto effect (niet de bruto besparing)', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    // Het netto effect (besparing − misgelopen rendement) staat er, met teken.
    expect(screen.getAllByText(euroPattern(Math.abs(shift.netEffect))).length).toBeGreaterThan(0)
    // De bruto besparing blijft zichtbaar als attribuut in de tabel.
    expect(screen.getAllByText(euroPattern(shift.savings)).length).toBeGreaterThan(0)
    // De rendementskosten staan als eigen rij (eigen as, geen samengesteld cijfer).
    expect(screen.getByText('Verwacht rendementseffect')).toBeTruthy()
    expect(screen.getAllByText(euroPattern(shift.returnCostEur)).length).toBeGreaterThan(0)
  })

  it('zet "Niets doen" als eerste kolom en de netto-effect-rij als sluitrij', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const headers = screen.getAllByRole('columnheader')
    // [0] = lege hoek-cel voor de attribuut-kolom, [1] = de referentie.
    expect(headers[1].textContent).toContain('Niets doen')
    expect(headers[2].textContent).toContain(shift.title)

    const nettoRow = screen.getByText('Netto effect per jaar').closest('tr')
    expect(nettoRow).toBeTruthy()
    expect(nettoRow?.querySelector('.border-double')).toBeTruthy()
  })

  it('markeert de topkans in de rij zelf met een badge én een motiveringsregel', () => {
    const { baseline, shift, standing } = buildFixture()
    const jaarruimte = jaarruimteSection(1_800, 18)
    const topChoice: OptimizerTopChoice = {
      goalId: 'jaarruimte-maximaal',
      title: 'Benut je jaarruimte (lijfrente)',
      savings: 1_800,
      netEffect: 1_800,
      freedomDays: 18,
      caveat: 'Je zet dit bedrag vast tot je pensioen.',
      kind: 'jaarruimte',
      opportunityId: 'jaarruimte-maximaal',
    }

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), jaarruimte]}
        topChoice={topChoice}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('grootste kans')).toBeTruthy()
    expect(screen.getByText(/hoogste netto voordeel/i)).toBeTruthy()
    // Geen losse "Je grootste kans nu"-hero meer boven de vergelijking.
    expect(screen.queryByText(/Je grootste kans nu/i)).toBeNull()
  })

  it('filtert met de stand "Zonder rendementsverlies" de rendement-kostende kans weg', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getAllByText(shift.title).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Zonder rendementsverlies' }))

    expect(screen.queryAllByText(shift.title).length).toBe(0)
    expect(screen.getByText(/geen kans over/i)).toBeTruthy()
  })

  it('toont voor de jaarruimte-kans de netto-velden van de SECTIE, niet een eigen afleiding', () => {
    const { baseline, shift, standing } = buildFixture()
    // Netto-velden bewust ONGELIJK aan besparing/freedomDays: leidt de client
    // netto weer zelf af, dan valt deze test om.
    const jaarruimte: GoalSection = {
      ...(jaarruimteSection(1_800, 18) as Extract<GoalSection, { kind: 'jaarruimte' }>),
      netEffect: 1_242,
      netFreedomDays: 12,
    }

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), jaarruimte]}
        standing={standing}
        hasPartner={false}
      />,
    )

    // Netto-effect-as én de netto-sluitrij tonen het geleverde netEffect…
    expect(screen.getAllByText(euroPattern(1_242)).length).toBeGreaterThan(0)
    // …de vrijheidsdagen komen uit netFreedomDays…
    expect(screen.getByText(/≈ 12 vrijheidsdagen/)).toBeTruthy()
    // …en de bruto besparing blijft apart zichtbaar.
    expect(screen.getAllByText(euroPattern(1_800)).length).toBeGreaterThan(0)
  })

  it('toont de Wft-callout één keer, onder de vergelijking', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getAllByText('Indicatie, geen advies.').length).toBe(1)
  })
})

/**
 * Household-fixture met TWEE kansen die onder 'netto' en 'besparing' echt
 * verschillend geordend zijn: de shift bespaart bruto meer maar kost per saldo
 * rendement (netEffect < 0), de partnerverdeling bespaart bruto minder maar
 * kost niets (netEffect = savings > 0). Zo bewijst de test dat de sorteer-
 * toggle de kolomvolgorde in de vergelijkingstabel echt omdraait — een pure
 * `sortOpportunities`-unit-test dekt de sorteerlogica, niet de bedrading naar
 * de DOM.
 */
function buildTwoOpportunityFixture(): {
  section: GoalSection
  baseline: OptimizerStrategy
  shift: OptimizerStrategy
  partner: OptimizerStrategy
  standing: OptimizerCurrentStanding
} {
  const current = calculateBox3({
    assets: [
      { id: 'a1', asset_type: 'savings', current_value: 150_000, is_active: true } as never,
      { id: 'a2', asset_type: 'investment', current_value: 150_000, is_active: true } as never,
    ],
    debts: [],
    hasPartner: true,
    dailyExpenses: DAILY_EXPENSES,
    year: YEAR,
  })
  const { baseline, strategies, shiftCurve } = generateBox3Strategies({
    goalId: 'box3-minimaal',
    year: YEAR,
    dailyExpenses: DAILY_EXPENSES,
    hasPartner: true,
    current,
    optimalAllocation: { totalTax: 5_000, savingsVsEqual: 800 },
  })
  const shift = strategies.find((s) => s.kind === 'samenstelling-shift')
  const partner = strategies.find((s) => s.kind === 'partnerverdeling')
  if (!shift || !partner) {
    throw new Error('fixture-fout: verwacht zowel een shift- als een partnerverdeling-scenario')
  }
  // Meet vóór je assert: bevestig dat de fixture de twee sorteerstanden echt
  // uit elkaar trekt, anders bewijst de klik-test niets.
  expect(shift.savings).toBeGreaterThan(partner.savings)
  expect(shift.netEffect).toBeLessThan(0)
  expect(partner.netEffect).toBe(partner.savings)
  expect(partner.netEffect).toBeGreaterThan(0)
  // De partnerverdeling is bewust niet over de jaren doorgerekend — dat is de
  // "—"-kolom die de verloop-rij hieronder moet tonen.
  expect(partner.trajectory).toBeNull()

  return {
    section: box3Section(
      'box3-minimaal',
      baseline,
      strategies,
      pickBest(strategies, 'box3-minimaal'),
      shiftCurve,
    ),
    baseline,
    shift,
    partner,
    standing: buildCurrentStanding(current, DAILY_EXPENSES),
  }
}

describe('Box3OptimizerClient — sorteer-toggle wijzigt de kolomvolgorde', () => {
  it('"Netto effect" (default) zet de partnerverdeling vóór de shift; "Grootste besparing" draait dat om', () => {
    const { section, shift, partner, standing } = buildTwoOpportunityFixture()

    render(<Box3OptimizerClient sections={[section]} standing={standing} hasPartner={true} />)

    const opportunityHeaderTitles = () =>
      screen.getAllByRole('columnheader').slice(2).map((h) => h.textContent ?? '')

    // Default sortMode = 'netto': partnerverdeling (netto positief) eerst.
    const before = opportunityHeaderTitles()
    expect(before[0]).toContain(partner.title)
    expect(before[1]).toContain(shift.title)

    fireEvent.click(screen.getByRole('button', { name: 'Grootste besparing' }))

    // Na de toggle: de shift (grotere bruto besparing) staat nu vooraan.
    const after = opportunityHeaderTitles()
    expect(after[0]).toContain(shift.title)
    expect(after[1]).toContain(partner.title)
  })
})

describe('Box3OptimizerClient — katern II: de verloop-rij', () => {
  it('toont per kolom de geleverde 2025 · 2026 · ≈2028-heffing uit het trajectory', () => {
    const { baseline, shift, shiftCurve, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('Verloop')).toBeTruthy()
    expect(screen.getByText(/2028 = indicatie beoogd stelsel/)).toBeTruthy()

    const row = screen.getByText('Heffing over de jaren').closest('tr')
    expect(row).toBeTruthy()

    // De cellen tonen exact de GELEVERDE jaartal-waarden — baseline én kans.
    for (const t of [baseline.trajectory!, shift.trajectory!]) {
      expect(row!.textContent).toMatch(euroPattern(t.tax2026))
      if (t.tax2025 !== null) expect(row!.textContent).toMatch(euroPattern(t.tax2025))
      if (t.tax2028Indicatie !== null) {
        expect(row!.textContent).toMatch(euroPattern(t.tax2028Indicatie))
      }
    }
    // De 2028-waarde draagt de indicatie-prefix.
    expect(row!.textContent).toContain('≈')
  })

  it('toont "—" met een notitie voor de partnerverdeling (geen meerjarig verloop)', () => {
    const { section, standing } = buildTwoOpportunityFixture()

    render(<Box3OptimizerClient sections={[section]} standing={standing} hasPartner={true} />)

    const row = screen.getByText('Heffing over de jaren').closest('tr')
    expect(row).toBeTruthy()
    expect(row!.textContent).toContain('—')
    expect(row!.textContent).toContain('verdeling is voor 2026 doorgerekend')
  })

  it('toont "n.v.t." voor de jaarruimte-kans (die kans zit in Box 1)', () => {
    const { baseline, shift, shiftCurve, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[
          box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve),
          jaarruimteSection(1_800, 18),
        ]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const row = screen.getByText('Heffing over de jaren').closest('tr')
    expect(row!.textContent).toContain('n.v.t.')
  })
})

/**
 * "Heffing over de jaren" en "Netto effect (per jaar)" komen bewust in zowel
 * katern II (vergelijkingstabel) als katern III (uitwerking) voor — één woord
 * per concept. Queries in katern III scopen we daarom op het detail-paneel.
 */
function detailBody(id = 'samenstelling-shift'): HTMLElement {
  const el = document.getElementById(`optimizer-detail-body-${id}`)
  if (!el) throw new Error(`fixture-fout: detail-paneel ${id} is niet open`)
  return el as HTMLElement
}

describe('Box3OptimizerClient — katern III: de shift-verkenner', () => {
  it('rendert curve + slider en toont de waarden van het GELEVERDE curvepunt', () => {
    const { baseline, shift, shiftCurve, standing } = buildFixture()
    // Meet vóór je assert: bepaal welk punt de verkenner als default kiest —
    // het hoogste netEffect, of punt 0 als er geen positief netto punt is.
    let bestIndex = 0
    let best = -Infinity
    shiftCurve.forEach((p, i) => {
      if (p.netEffect > best) {
        best = p.netEffect
        bestIndex = i
      }
    })
    const expectedIndex = best > 0 ? bestIndex : 0
    const point = shiftCurve[expectedIndex]

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Toon uitwerking/i }))

    const body = detailBody()
    const slider = within(body).getByRole('slider', { name: /Hoeveel verschuiven/i })
    expect(slider.getAttribute('max')).toBe(String(shiftCurve.length - 1))
    expect((slider as HTMLInputElement).value).toBe(String(expectedIndex))

    // De uitlezing komt uit het curvepunt zelf — geen client-side som.
    expect(body.textContent).toMatch(euroPattern(point.shifted))
    expect(body.textContent).toMatch(euroPattern(point.savings))
    expect(within(body).getByText('Rendementskosten')).toBeTruthy()
    expect(within(body).getByText('Netto effect')).toBeTruthy()
  })

  it('schuift naar een ander GELEVERD punt en toont diens waarden', () => {
    const { baseline, shift, shiftCurve, standing } = buildFixture()
    const target = shiftCurve.length - 1
    const point = shiftCurve[target]

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Toon uitwerking/i }))
    const body = detailBody()
    const slider = within(body).getByRole('slider', { name: /Hoeveel verschuiven/i })
    fireEvent.change(slider, { target: { value: String(target) } })

    expect(slider.getAttribute('aria-valuetext')).toMatch(euroPattern(point.shifted))
    expect(body.textContent).toMatch(euroPattern(point.shifted))
    expect(body.textContent).toMatch(euroPattern(point.returnCostEur))
  })

  it('laat de kassabon de VOLLEDIGE shift tonen, met een notitie dat de slider een verkenning is', () => {
    const { baseline, shift, shiftCurve, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Toon uitwerking/i }))

    // De kassabon blijft op de geleverde strategy staan (alles verschoven).
    const body = detailBody()
    const receipt = within(body).getByText('Netto effect per jaar').closest('div')!
    expect(receipt.textContent).toMatch(euroPattern(Math.abs(shift.netEffect)))
    expect(
      within(body).getByText(/verkenner verkent tussenstanden.*volledige verschuiving/i),
    ).toBeTruthy()
  })

  it('toont de verloop-strip met de drie geleverde jaar-waarden in het detail', () => {
    const { baseline, shift, shiftCurve, standing } = buildFixture()
    const t = shift.trajectory!

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Toon uitwerking/i }))

    const body = detailBody()
    const strip = within(body).getByText('Heffing over de jaren').parentElement!
    expect(strip.textContent).toMatch(euroPattern(t.tax2026))
    if (t.tax2028Indicatie !== null) {
      expect(strip.textContent).toMatch(euroPattern(t.tax2028Indicatie))
    }
    expect(within(body).getByText('indicatie beoogd stelsel')).toBeTruthy()
  })

  it('toont geen verkenner wanneer er geen curve geleverd is', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, null)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Toon uitwerking/i }))

    const body = detailBody()
    expect(within(body).queryByRole('slider')).toBeNull()
    expect(within(body).queryByText('Verkenning')).toBeNull()
    // De kassabon staat er onverkort.
    expect(within(body).getByText('Netto effect per jaar')).toBeTruthy()
  })
})

describe('Box3OptimizerClient — privacy-maskering op de Fase 2-onderdelen (verloop-rij + verkenner)', () => {
  it('maskeert de verloop-rij (katern II) en de shift-verkenner (katern III) — geen kale bedragen', () => {
    mockPrivacy.masked = true
    const { baseline, shift, shiftCurve, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift, shiftCurve)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    // ── Katern II: de verloop-rij toont bullets, geen jaartal-bedragen. ──
    const verloopRow = screen.getByText('Heffing over de jaren').closest('tr')
    expect(verloopRow).toBeTruthy()
    expect(verloopRow!.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // Geen enkel €-teken: alle bedragen in deze rij komen uitsluitend via `fc`
    // (geen literal '€' elders in optimizer-compare.tsx), dus dit is de
    // scherpste vangrail — een gemiste fc-aanroep zou hier meteen breken.
    expect(verloopRow!.textContent).not.toContain('€')
    // Geen van de drie geleverde jaarbedragen lekt als kaal getal.
    for (const amount of [
      baseline.trajectory!.tax2025,
      baseline.trajectory!.tax2026,
      baseline.trajectory!.tax2028Indicatie,
      shift.trajectory!.tax2025,
      shift.trajectory!.tax2026,
      shift.trajectory!.tax2028Indicatie,
    ]) {
      if (amount === null) continue
      expect(verloopRow!.textContent).not.toMatch(euroPattern(amount))
    }

    // ── Katern III: kassabon + slider-uitlezing. ──
    //
    // BEWUST GESCOPED tot de `fc`-gedreven rekening en de verkenner-uitlezing
    // (dl), niet het hele detail-paneel: `opportunity.description`/`detail`/
    // `caveat` bakken hun bedragen server-side via `formatCurrency` (niet via
    // de client-`fc`) en zijn dus AL vóór Fase 2 nooit gemaskeerd — een
    // vastgesteld, niet in deze taak gefixt gedrag (zie eindrapport). Een
    // blanket "geen €" op `body` zou hier vals rood geven op bestaand gedrag,
    // niet op de nieuwe onderdelen.
    fireEvent.click(screen.getByRole('button', { name: /Toon uitwerking/i }))
    const body = detailBody()

    const receiptLabel = within(body).getByText('rekening')
    const receipt = receiptLabel.nextElementSibling as HTMLElement
    expect(receipt).toBeTruthy()
    expect(receipt.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(receipt.textContent).not.toContain('€')

    const slider = within(body).getByRole('slider', { name: /Hoeveel verschuiven/i })
    // De aria-valuetext (schermlezer-uitlezing) draagt ook geen kaal bedrag.
    expect(slider.getAttribute('aria-valuetext')).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(slider.getAttribute('aria-valuetext')).not.toMatch(/€\s*\d/)

    // De verkenner-uitlezing (Verschoven · Besparing · Rendementskosten ·
    // Netto effect) is volledig `fc`-gedreven en dus volledig gemaskeerd.
    const verkennerDl = within(body).getByText('Verschoven').closest('dl') as HTMLElement
    expect(verkennerDl).toBeTruthy()
    expect(verkennerDl.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(verkennerDl.textContent).not.toContain('€')

    // Geen van de curvepunt-bedragen lekt ongemaskeerd in díe twee gescopede
    // regio's (receipt + dl) — het echte lek-oppervlak van de nieuwe UI.
    for (const region of [receipt, verkennerDl]) {
      for (const point of shiftCurve) {
        if (point.shifted > 0) expect(region.textContent).not.toMatch(euroPattern(point.shifted))
        if (point.savings > 0) expect(region.textContent).not.toMatch(euroPattern(point.savings))
        if (point.returnCostEur > 0) {
          expect(region.textContent).not.toMatch(euroPattern(point.returnCostEur))
        }
      }
    }
  })
})

describe('Box3OptimizerClient — katern III: inzoomen per kans', () => {
  it('begint ingeklapt en toont na openen de kassabon met het netto effect', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const toggle = screen.getByRole('button', { name: /Toon uitwerking/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Verwacht misgelopen rendement')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Verwacht misgelopen rendement')).toBeTruthy()
    expect(screen.getByText('Belastingbesparing in dit scenario')).toBeTruthy()
    // Negatief netto effect → feitelijke verdict-regel, geen imperatief.
    expect(screen.getByText(/kost dit scenario je geld/i)).toBeTruthy()
  })

  it('houdt maximaal één kans tegelijk open', () => {
    const { baseline, shift, standing } = buildFixture()
    const jaarruimte = jaarruimteSection(1_800, 18)

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), jaarruimte]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const toggles = screen.getAllByRole('button', { name: /Toon uitwerking/i })
    expect(toggles.length).toBe(2)

    fireEvent.click(toggles[0])
    expect(screen.getAllByRole('button', { name: /Verberg/i }).length).toBe(1)

    fireEvent.click(screen.getAllByRole('button', { name: /Toon uitwerking/i })[0])
    expect(screen.getAllByRole('button', { name: /Verberg/i }).length).toBe(1)
  })

  it('opent de uitwerking vanuit de vergelijkingstabel', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Bekijk uitwerking/i }))
    expect(screen.getByText('Verwacht misgelopen rendement')).toBeTruthy()
  })
})

describe('Box3OptimizerClient — lege staten', () => {
  it('toont zonder doorgerekende kansen een neutrale variant met de Fin-knop', () => {
    const { standing } = buildFixture()

    render(<Box3OptimizerClient sections={[]} standing={standing} hasPartner={false} />)

    expect(screen.getByText(/geen scenario dat je Box 3-heffing verlaagt/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Bespreek .* met Fin/i })).toBeTruthy()
    // Geen groene bedragen: de netto-effect-as ontbreekt volledig.
    expect(screen.queryByText('Netto effect per jaar')).toBeNull()
  })

  it('toont zonder topkans geen badge, wél de Fin-fallback', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        topChoice={null}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.queryByText('grootste kans')).toBeNull()
    expect(screen.getByRole('button', { name: /Bespreek .* met Fin/i })).toBeTruthy()
  })
})

describe('Box3OptimizerClient — katern IV: voetnoten', () => {
  it('sluit af met aannames, methode, binnenkort en geen-advies', () => {
    const { baseline, shift, standing } = buildFixture()
    const preview: GoalSection = {
      kind: 'preview',
      goalId: 'levenslang-minimaal',
      goal: GOAL_BY_ID['levenslang-minimaal'],
      previewNote: 'Straks vergelijkt TriFinity de onttrekkingsvolgordes.',
    }

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), preview]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('Aannames')).toBeTruthy()
    expect(screen.getByText('Methode')).toBeTruthy()
    expect(screen.getByText('Binnenkort')).toBeTruthy()
    expect(screen.getByText('Geen advies')).toBeTruthy()
    expect(screen.getByText(/onttrekkingsvolgordes/i)).toBeTruthy()
  })
})
