import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { VoorkeurenView } from './voorkeuren-view'

// VoorkeurenView mount nu VoorkeurBewerkenSheet (markt-aannames) + RegelBewerkenPane
// (de 5 regels). Mock next/navigation + supabase client, en stub de pane (die op
// matchMedia/ShellOverlay leunt) zodat de card-tests gefocust blijven.
// Stuurbare searchParams + replace-mock voor de ?strategie=-deeplink (S6).
const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
  usePathname: () => '/toekomst/voorkeuren',
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  }),
}))
vi.mock('./regel-bewerken-pane', () => ({
  RegelBewerkenPane: () => null,
}))
// StrategieEditors gestubd: registreert welke strategie open is en of de
// jaarruimte-uitvraag (S6) automatisch openstaat, plus een sluitknop.
vi.mock('./strategie/strategie-editors', () => ({
  StrategieEditors: ({
    open,
    autoOpenJaarruimte,
    onClose,
  }: {
    open: string | null
    autoOpenJaarruimte?: boolean
    onClose: () => void
  }) => (
    <div>
      <div data-testid="strategie-editors-open">{open ?? 'none'}</div>
      <div data-testid="strategie-jaarruimte">{String(Boolean(autoOpenJaarruimte))}</div>
      <button type="button" onClick={onClose}>
        editor-sluiten
      </button>
    </div>
  ),
}))
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'
import type { StrategieEditorsData } from './strategie/strategie-editors'

/**
 * Tests voor VoorkeurenView — Voorkeuren-tab op /toekomst. Toont de vijf
 * "Regels op de hele tijdas" (elk opent RegelBewerkenPane) + markt-aannames.
 */

const mockFireParams: FireParams = {
  grossReturn: 0.07,
  inflationRate: 0.025,
  effectiveSwr: 0.04,
  box3Method: 'forfaitair',
  marginaalTarief: 0.3697,
}

const mockFireStrategy: FireStrategyConfig = {
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

const mockWithdrawal: WithdrawalStrategyConfig = {
  strategy: 'guardrails',
  guardrailFloor: 0.8,
  guardrailCeiling: 1.2,
  guardrailCutStep: 0.1,
}

const mockPotBalances: Record<WealthGroup, number> = {
  spaargeld: 10000,
  beleggingen: 50000,
  pensioen: 20000,
  vastgoed: 0,
  overig: 0,
}

const mockStrategieData: StrategieEditorsData = {
  baseline: null,
  dailyExpenses: 0,
  aowRows: [],
  dateOfBirth: null,
  grossYearlyIncome: 0,
  pensioenFactorA: 0,
  currentAge: null,
  inflationRate: 0,
  currentNetMonthly: 0,
  housingPreview: null,
}

beforeEach(() => {
  nav.search = new URLSearchParams()
  nav.replace.mockClear()
})

const baseProps = {
  events: [],
  strategieData: mockStrategieData,
  fireParams: mockFireParams,
  fireStrategy: mockFireStrategy,
  withdrawalStrategy: mockWithdrawal,
  simSnapshot: null,
  regelVoorkeuren: POT_RULES_DEFAULTS,
  potBalances: mockPotBalances,
}

describe('VoorkeurenView — toekomst-regels', () => {
  it('rendert vijf toekomst-regel cards', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText('Eindstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsvolgorde')).toBeTruthy()
    expect(screen.getByText('Verdeling bij toename')).toBeTruthy()
    expect(screen.getByText('Onttrekking bij afname')).toBeTruthy()
  })

  it('toont eindstrategie-naam uit STRATEGY_LABELS', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    // 'deplete' → "Vermogen opeten"
    expect(screen.getByText('Vermogen opeten')).toBeTruthy()
  })

  it('toont onttrekkingsstrategie-naam (guardrails)', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getAllByText('Guardrails').length).toBeGreaterThan(0)
  })

  // B-042 — het PROFIEL (uit withdrawal_profile_config, zoals de kernel het leest) wint
  // van de enum: enum 'static' + profiel 'afnemend' toonde "Vast (4%)" waar de motor
  // Afnemend rekende. Zonder de prop blijft de enum-terugval gelden (oude callers).
  it('toont het meegegeven onttrekkingsprofiel (Afnemend) en dan géén guardrails-badge', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} withdrawalStrategy={{ ...mockWithdrawal, strategy: 'static' }} withdrawalProfiel="afnemend" />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Afnemend')).toBeTruthy()
    expect(screen.queryByText('Vast (4%)')).toBeNull()
    expect(screen.queryByText(/Floor 80\.0%/)).toBeNull()
  })

  it('toont guardrail floor/ceiling-badge bij guardrails-strategie', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText(/Floor 80\.0%/)).toBeTruthy()
    expect(screen.getByText(/Ceiling 120\.0%/)).toBeTruthy()
  })

  it('toont endAge-badge op eindstrategie-card', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText('Tot 90 jaar')).toBeTruthy()
  })
})

describe('VoorkeurenView — markt-aannames', () => {
  it('rendert vier markt-aanname cards (incl. Box 3-methode)', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText('Inflatie')).toBeTruthy()
    expect(screen.getByText('Bruto rendement')).toBeTruthy()
    expect(screen.getByText('Box 3-methode')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Effectief/)
    expect(document.body.textContent).toMatch(/SWR/)
  })

  // TPR-10 — box3_method had een PUT-pad maar geen scherm. De kaart leest dezelfde
  // resolver-uitkomst als de adapter (fireParams.box3Method) en opent de sheet.
  it('Box 3-kaart toont de opgeslagen methode en opent de bewerk-sheet', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText('Forfaitair')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Box 3-methode'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    // Beide opties staan in de sheet; de huidige is voorgeselecteerd.
    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed.map((b) => b.textContent)).toEqual([expect.stringContaining('Forfaitair')])
    expect(document.body.textContent).toMatch(/Werkelijk rendement/)
  })

  it('Box 3-kaart volgt de props (werkelijk) en toont dan het heffingvrij inkomen (TPR-12)', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} fireParams={{ ...mockFireParams, box3Method: 'werkelijk' }} />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Werkelijk rendement')).toBeTruthy()
    expect(screen.queryByText('Forfaitair')).toBeNull()
    // Zonder eigen keuze: de kernel-default, gemarkeerd als standaard.
    expect(document.body.textContent).toMatch(/Heffingvrij inkomen € 1\.800 per persoon per jaar \(standaard\)/)
  })

  it('Box 3-kaart toont een eigen heffingvrij inkomen zonder "standaard"', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView
          {...baseProps}
          fireParams={{ ...mockFireParams, box3Method: 'werkelijk' }}
          box3HeffingvrijInkomen={2500}
        />
      </DisplayModeProvider>,
    )
    expect(document.body.textContent).toMatch(/Heffingvrij inkomen € 2\.500 per persoon per jaar/)
    expect(document.body.textContent).not.toMatch(/\(standaard\)/)
  })

  it('formatteert percentages met 1 decimaal', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText('2.5%')).toBeTruthy() // inflatie
    expect(screen.getByText('7.0%')).toBeTruthy() // grossReturn
    expect(screen.getByText('4.0%')).toBeTruthy() // effectiveSwr
  })

  // TPR-02 — de kaart zegt wat de kern doet: het profielrendement is de TERUGVAL voor
  // bezittingen zonder eigen rendement; per-bezitting-rendement gaat vóór. De oude
  // ondertitel ("Verwacht jaarrendement op het belegbaar vermogen") beloofde een
  // groeicurve die de kern niet uit dit veld las.
  it('rendementkaart benoemt de terugval-rol en de voorrang van het per-bezitting-rendement', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.getByText(/Terugval voor bezittingen zonder eigen rendement/)).toBeTruthy()
    expect(screen.queryByText('Verwacht jaarrendement op het belegbaar vermogen')).toBeNull()
    expect(document.body.textContent).toMatch(/gaat vóór/)
  })
})

describe('VoorkeurenView — pot-regels zijn nu instelbaar', () => {
  it('cards bevatten geen /identity/parameters-href', () => {
    const { container } = render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href') ?? '',
    )
    expect(hrefs.some((h) => h.includes('/identity/parameters'))).toBe(false)
  })

  it('linkt expliciet naar /overzicht/bezittingen voor per-groep rendement', () => {
    const { container } = render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    const link = container.querySelector('a[href="/overzicht/bezittingen"]')
    expect(link).toBeTruthy()
  })

  it('toont geen "Binnenkort instelbaar"-placeholders meer', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    expect(screen.queryByText('Binnenkort instelbaar')).toBeNull()
  })

  it('toont de live pot-regel-waarden (verdeling → beleggingen)', () => {
    render(<DisplayModeProvider initialMode="full"><VoorkeurenView {...baseProps} /></DisplayModeProvider>)
    // surplusGroup 'beleggingen' → "Naar beleggingen"
    expect(screen.getByText('Naar beleggingen')).toBeTruthy()
  })
})

// ── Weergavemodus: Eenvoudig vs. Volledig (audit TOE-3) ───────────────────

/**
 * S7 herziet dit blok bewust. TOE-3 pinde het oude gedrag: in Eenvoudig waren
 * de drie pot-regels en de markt-aannames hard weg (`HideInSimple`), dus
 * `cardCount === 2` en `queryByText('Onttrekkingsvolgorde') === null`. Dat is
 * precies de norm-overtreding die S7 repareert — het zijn bedieningsvlakken en
 * /toekomst/voorkeuren is de enige ingang, dus ADR 0026 schrijft `DepthSection`
 * voor. `DepthSection` rendert zijn kinderen áltijd (ingeklapt = `max-h-0` +
 * `inert`), dus die twee asserties konden niet blijven staan. Wat ervoor in de
 * plaats komt is strenger, niet losser: de kaarten moeten er zijn, ingeklapt
 * zitten, én de leesregel moet de huidige waarden dragen.
 *
 * De provider is hier niet optioneel: buiten een DisplayModeProvider valt
 * useDisplayMode() terug op 'simple' (ADR 0026), waardoor een Volledig-test
 * zonder wrapper de verkeerde tak zou keuren.
 */
describe('VoorkeurenView — weergavemodus (S7, herziet TOE-3)', () => {
  /** Kaarten zijn div[role="button"]; GlossaryTerm-buttons tellen zo niet mee. */
  function cardCount(container: HTMLElement): number {
    return container.querySelectorAll('[role="button"]').length
  }

  function renderSimple(props = baseProps) {
    return render(
      <DisplayModeProvider initialMode="simple">
        <VoorkeurenView {...props} />
      </DisplayModeProvider>,
    )
  }

  it('Eenvoudig: eindstrategie + onttrekkingsstrategie staan open', () => {
    renderSimple()
    expect(screen.getByText('Eindstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsstrategie')).toBeTruthy()
  })

  it('Eenvoudig: pot-regels en markt-aannames zitten in ingeklapte disclosures', () => {
    const { container } = renderSimple()
    const sections = container.querySelectorAll('[data-testid="depth-section"]')
    expect(sections.length).toBe(2)
    for (const section of Array.from(sections)) {
      expect(section.getAttribute('data-collapsed')).toBe('true')
    }
    const titles = Array.from(
      container.querySelectorAll('[data-testid="depth-section-title"]'),
    ).map((el) => el.textContent)
    expect(titles).toEqual(['Pot-regels', 'Markt-aannames'])

    // De ingang gaat níet verloren: de bedieningsvlakken staan in de DOM.
    expect(screen.getByText('Onttrekkingsvolgorde')).toBeTruthy()
    expect(screen.getByText('Verdeling bij toename')).toBeTruthy()
    expect(screen.getByText('Onttrekking bij afname')).toBeTruthy()
    expect(screen.getByText('Inflatie')).toBeTruthy()
    expect(screen.getByText('Bruto rendement')).toBeTruthy()
    expect(screen.getByText('Box 3-methode')).toBeTruthy()
  })

  it('Eenvoudig: de leesregels dragen de huidige waarden', () => {
    const { container } = renderSimple()
    const summaries = Array.from(
      container.querySelectorAll('[data-testid="depth-section-summary"]'),
    ).map((el) => el.textContent)
    // POT_RULES_DEFAULTS: afbouw begint bij spaargeld, overschot naar beleggingen.
    expect(summaries[0]).toBe('Bij afbouw eerst spaargeld · bij overschot naar beleggingen')
    expect(summaries[1]).toBe('Inflatie 2.5% · rendement 7.0% · SWR 4.0% · Box 3 forfaitair')
  })

  it('Eenvoudig: leesregel volgt de props (anti-drift, geen hardgecodeerde zin)', () => {
    const { container } = renderSimple({
      ...baseProps,
      regelVoorkeuren: {
        ...POT_RULES_DEFAULTS,
        withdrawalOrderGroups: ['beleggingen', 'spaargeld'],
        surplusGroup: 'schuld_aflossen',
      },
      fireParams: { ...mockFireParams, inflationRate: 0.031 },
    })
    const summaries = Array.from(
      container.querySelectorAll('[data-testid="depth-section-summary"]'),
    ).map((el) => el.textContent)
    expect(summaries[0]).toBe('Bij afbouw eerst beleggingen · bij overschot schulden aflossen')
    expect(summaries[1]).toMatch(/^Inflatie 3\.1%/)
  })

  it('Eenvoudig: openklappen maakt de pot-regels bereikbaar', () => {
    const { container } = renderSimple()
    const toggles = container.querySelectorAll('[data-testid="depth-section-toggle"]')
    fireEvent.click(toggles[0] as HTMLElement)
    const sections = container.querySelectorAll('[data-testid="depth-section"]')
    expect(sections[0]?.getAttribute('data-collapsed')).toBe('false')
    expect(sections[1]?.getAttribute('data-collapsed')).toBe('true')
  })

  it('Volledig: exact de bestaande boom — geen disclosures', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    for (const label of [
      'Eindstrategie',
      'Onttrekkingsstrategie',
      'Onttrekkingsvolgorde',
      'Verdeling bij toename',
      'Onttrekking bij afname',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    // 5 regel-kaarten + inflatie + bruto rendement + Box 3-methode (effectief SWR is statisch).
    expect(cardCount(container)).toBe(8)
    expect(container.querySelectorAll('[data-testid="depth-section"]').length).toBe(0)
  })
})

// ── Levensstrategieën (verhuisd van Gebeurtenissen, 17 sep 2026) ─────────────
//
// S6 / B-024 — Box 1 draagt in béide weergavemodi de opdracht "vul je factor A
// in bij je pensioen-strategie" en linkt naar /toekomst/voorkeuren?strategie=pensioen.
// Hard verbergen in Eenvoudig maakte daar een eenrichtingsdeeplink van (modal
// opende, maar ná sluiten geen zichtbare ingang). De eerste fix liet in Eenvoudig
// alléén de Pensioen-kaart staan; dat nam drie keuzes af (B-024). Besluit
// eigenaar: Eenvoudig maakt de vorm kleiner (compacter raster), niet de lijst korter.
describe('VoorkeurenView — levensstrategieën', () => {
  const VIER = ['AOW-strategie', 'Pensioen-strategie', 'Huis-strategie', 'Werk-strategie']

  it.each(['full', 'simple'] as const)('toont in %s alle vier de levensstrategieën als h3 onder een h2', (mode) => {
    render(
      <DisplayModeProvider initialMode={mode}>
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    for (const label of VIER) {
      expect(screen.getByRole('heading', { level: 3, name: label })).toBeTruthy()
    }
    expect(screen.getByRole('heading', { level: 2, name: 'AOW, pensioen, huis en werk' })).toBeTruthy()
  })

  it('Eenvoudig krijgt een compacter raster, geen kortere lijst (B-024)', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    const kaart = screen.getByText('AOW-strategie').closest('button')!
    expect(kaart.parentElement?.className).toContain('grid-cols-2')
    expect(container.textContent).not.toMatch(/Zet je de weergave op Volledig/i)
  })

  it('icoonvlak gebruikt horizon-tokens, geen Tailwind-standaardkleuren', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    const html = container.innerHTML
    expect(html).toContain('bg-horizon-50')
    expect(html).not.toMatch(/(bg|text)-(violet|emerald|amber|sky)-\d/)
  })

  it('de zichtbare ingang staat los van de editor-state (geen eenrichtingsdeeplink)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    fireEvent.click(screen.getByText('Pensioen-strategie').closest('button')!)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('pensioen')
    // Via een kaart geopend → geen automatische jaarruimte-uitvraag.
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('false')
    fireEvent.click(screen.getByText('editor-sluiten'))
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('none')
    expect(screen.getByText('Pensioen-strategie')).toBeTruthy()
  })

  it('S6 — ?strategie=pensioen opent de editor mét jaarruimte-uitvraag en sluiten ruimt de param op', () => {
    nav.search = new URLSearchParams('strategie=pensioen&x=1')
    render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('pensioen')
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('true')
    fireEvent.click(screen.getByText('editor-sluiten'))
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/voorkeuren?x=1', { scroll: false })
  })

  it.each(['aow', 'huis', 'werk'] as const)('?strategie=%s opent die editor zonder jaarruimte-uitvraag', (key) => {
    nav.search = new URLSearchParams(`strategie=${key}`)
    render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe(key)
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('false')
  })

  it('?strategie=open (horizon-strategiekiezer) opent hier niets', () => {
    nav.search = new URLSearchParams('strategie=open')
    render(
      <DisplayModeProvider initialMode="full">
        <VoorkeurenView {...baseProps} />
      </DisplayModeProvider>,
    )
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('none')
  })
})
