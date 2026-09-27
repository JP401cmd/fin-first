import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import type { StrategieEditorsData } from '@/components/future/strategie/strategie-editors'
import { RIJ_META, RIJ_SLEUTELS, type RijSleutel } from '@/lib/toekomst/instellingen-rij'
import { RIJ_LABEL, INFLATIE_LINK, MEER_OVER_JE_PLAN, INSTELLINGEN_SECTIE_KOP } from '@/lib/toekomst/instellingen-rijwaarden'

/**
 * InstellingenRijen (ADR 0179 fase 3) — één rij per instelling, elke ✎ opent de bestaande
 * body. De editors zijn hier verklikkers: ze tonen wat er open is en met welke props
 * (anker, kolom, snapshot, jaarruimte). De bodies zelf hebben eigen tests.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
  usePathname: () => '/toekomst/instellingen',
}))

type Stub = Record<string, unknown>
const laatst = vi.hoisted(() => ({ regel: null as Stub | null }))
vi.mock('@/components/future/regel-bewerken-pane', () => ({
  RegelBewerkenPane: (p: Stub) => {
    laatst.regel = p
    return p.open ? (
      <div data-testid="regel-pane">
        {String(p.regelId)}|{String(p.anker ?? '')}|{p.simSnapshot ? 'snap' : 'geen'}
      </div>
    ) : null
  },
}))
vi.mock('@/components/future/voorkeur-bewerken-sheet', () => ({
  VoorkeurBewerkenSheet: (p: Stub) => (
    <div data-testid="voorkeur-sheet">
      {String(p.column)}|{String(p.currentValuePct)}|{p.snapshot ? 'snap' : 'geen'}
    </div>
  ),
}))
vi.mock('@/components/future/box3-methode-sheet', () => ({
  Box3MethodeSheet: (p: Stub) => <div data-testid="box3-sheet">{String(p.current)}|{p.snapshot ? 'snap' : 'geen'}</div>,
}))
vi.mock('@/components/future/strategie/strategie-editors', () => ({
  StrategieEditors: (p: { open: string | null; autoOpenJaarruimte?: boolean; snapshot?: unknown; onClose: () => void }) => (
    <div>
      <div data-testid="strategie-open">{p.open ?? 'none'}</div>
      <div data-testid="strategie-jaarruimte">{String(Boolean(p.autoOpenJaarruimte))}</div>
      <div data-testid="strategie-snapshot">{p.snapshot ? 'snap' : 'geen'}</div>
      <button type="button" onClick={p.onClose}>
        editor-sluiten
      </button>
    </div>
  ),
}))
vi.mock('./uitgaven-rij-pane', () => ({
  UitgavenRijPane: (p: { open: boolean; snapshot: unknown }) =>
    p.open ? <div data-testid="uitgaven-pane">{p.snapshot ? 'snap' : 'geen'}</div> : null,
}))

import { InstellingenRijen, type InstellingenRijenProps } from './instellingen-rijen'

const strategieData = {
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
} as StrategieEditorsData

const PROPS: InstellingenRijenProps = {
  fireParams: { grossReturn: 0.05, inflationRate: 0.02, effectiveSwr: 0.034, box3Method: 'forfaitair', marginaalTarief: 0.37 },
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  firePlan: { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalStrategy: { strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  withdrawalProfiel: 'afnemend',
  simSnapshot: { rawContext: {} } as never,
  regelVoorkeuren: POT_RULES_DEFAULTS,
  potBalances: { spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0 },
  box3HeffingvrijInkomen: null,
  events: [],
  strategieData,
  housingStrategy: { mode: 'include_full' },
  retirementMethod: 'essential_budgets',
  uitgaveNaPensioen: 30_000,
  geenTekortLening: true,
  tekortLeningRente: 0.05,
}

function renderRijen(mode: 'full' | 'simple' = 'full', props = PROPS) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <InstellingenRijen {...props} />
    </DisplayModeProvider>,
  )
}

const rijKnop = (r: RijSleutel) => document.querySelector(`button[data-rij="${r}"]`) as HTMLButtonElement

beforeEach(() => {
  nav.search = new URLSearchParams()
  nav.replace.mockClear()
  nav.refresh.mockClear()
  laatst.regel = null
})
afterEach(cleanup)

describe('InstellingenRijen — drie secties, vijftien rijen', () => {
  it('Volledig: elke rij staat er als knop met label, waarde en "aanpassen"', () => {
    renderRijen()
    for (const r of RIJ_SLEUTELS) {
      const knop = rijKnop(r)
      expect(knop, r).toBeTruthy()
      expect(knop.textContent).toContain(RIJ_LABEL[r])
      expect(knop.textContent).toContain('aanpassen')
    }
    for (const kop of Object.values(INSTELLINGEN_SECTIE_KOP)) {
      expect(screen.getByRole('heading', { level: 2, name: kop })).toBeTruthy()
    }
    expect(document.querySelector('h1')).toBeNull()
  })

  it('Stopmoment noemt geen leeftijdsgetal (de kop draagt het, §4.9)', () => {
    renderRijen()
    expect(rijKnop('stopmoment').textContent).toContain('zo vroeg als het kan')
    expect(rijKnop('stopmoment').textContent).not.toMatch(/\d/)
  })

  it('de uitgave-rij draagt het bedrag uit de bron van KPI 4', () => {
    renderRijen()
    expect(rijKnop('uitgave-na-pensioen').textContent).toMatch(/30\.000/)
  })

  it('sectie I draagt het oude anker #voorkeuren', () => {
    const { container } = renderRijen()
    expect(container.querySelector('#voorkeuren')?.contains(rijKnop('stopmoment'))).toBe(true)
  })

  it('de inflatierij linkt naar inflatie-koopkracht (besluit §11 #8)', () => {
    renderRijen()
    expect(screen.getByRole('link', { name: new RegExp(INFLATIE_LINK.label) }).getAttribute('href')).toBe(INFLATIE_LINK.href)
  })

  it('de afgeleide opnamerate is een leesrij zonder ✎', () => {
    renderRijen()
    const leesrij = document.querySelector('[data-rij="effectief-swr"]')!
    expect(leesrij.tagName).toBe('DIV')
    expect(leesrij.textContent).toContain('3,4%')
  })

  it('Eenvoudig: plan-kern, alle vier levensstrategieën open; meer-over-je-plan en markt ingeklapt met leesregel', () => {
    renderRijen('simple')
    for (const r of ['stopmoment', 'eindleeftijd', 'onttrekking', 'uitgave-na-pensioen', 'aow', 'pensioen', 'werk', 'huis'] as const) {
      expect(rijKnop(r), r).toBeTruthy()
    }
    const ingeklapt = (r: RijSleutel) =>
      (rijKnop(r).closest('[data-testid="depth-section"]') as HTMLElement | null)?.dataset.collapsed
    for (const r of ['geen-tekort-lening', 'onttrekkingsvolgorde', 'inflatie', 'box3'] as const) {
      expect(ingeklapt(r), r).toBe('true')
    }
    for (const r of ['stopmoment', 'aow'] as const) expect(ingeklapt(r), r).toBeUndefined()
    const meer = screen.getByRole('button', { name: new RegExp(MEER_OVER_JE_PLAN) })
    expect(document.body.textContent).toContain('Geen tekort-lening: aan')
    fireEvent.click(meer)
    expect(ingeklapt('geen-tekort-lening')).toBe('false')
    // Ook ingeklapt blijft de sectie een h2 (koppenvolgorde, ADR 0110).
    expect(screen.getByRole('heading', { level: 2, name: INSTELLINGEN_SECTIE_KOP.markt })).toBeTruthy()
  })
})

describe('InstellingenRijen — elke ✎ opent de bestaande body, met de snapshot', () => {
  it.each(RIJ_SLEUTELS)('%s', (r) => {
    renderRijen()
    fireEvent.click(rijKnop(r))
    const e = RIJ_META[r].editor
    switch (e.soort) {
      case 'regel':
        expect(screen.getByTestId('regel-pane').textContent).toBe(`${e.regel}|${e.anker ?? ''}|snap`)
        break
      case 'voorkeur':
        expect(screen.getByTestId('voorkeur-sheet').textContent).toBe(
          `${e.kolom}|${e.kolom === 'inflation_rate' ? 2 : 5}|snap`,
        )
        break
      case 'box3':
        expect(screen.getByTestId('box3-sheet').textContent).toBe('forfaitair|snap')
        break
      case 'strategie':
        expect(screen.getByTestId('strategie-open').textContent).toBe(e.strategie)
        expect(screen.getByTestId('strategie-snapshot').textContent).toBe('snap')
        // Via de rij geopend: geen automatische factor-A-uitvraag.
        expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('false')
        break
      case 'uitgaven':
        expect(screen.getByTestId('uitgaven-pane').textContent).toBe('snap')
        break
    }
  })

  it('één overlay tegelijk: een andere rij sluit de vorige', () => {
    renderRijen()
    fireEvent.click(rijKnop('aow'))
    expect(screen.getByTestId('strategie-open').textContent).toBe('aow')
    fireEvent.click(screen.getByText('editor-sluiten'))
    fireEvent.click(rijKnop('stopmoment'))
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
    expect(screen.getByTestId('regel-pane')).toBeTruthy()
  })

  it('na opslaan in een regel-body ververst de bundel', () => {
    renderRijen()
    fireEvent.click(rijKnop('onttrekking'))
    ;(laatst.regel!.onSaved as () => void)()
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('InstellingenRijen — deeplinks (?rij= met aliassen)', () => {
  it.each([
    ['rij=eindleeftijd', 'eindstrategie|stop-plan-eindleeftijd|snap'],
    ['rij=geen-tekort-lening', 'eindstrategie|geen-tekort-lening|snap'],
    ['regel=eindstrategie', 'eindstrategie|stop-plan-stopmoment|snap'],
    ['regel=onttrekkingsstrategie', 'onttrekkingsstrategie||snap'],
    ['regel=verdeling-toename', 'verdeling-toename||snap'],
  ])('?%s opent de regel-pane', (q, verwacht) => {
    nav.search = new URLSearchParams(q)
    renderRijen()
    expect(screen.getByTestId('regel-pane').textContent).toBe(verwacht)
  })

  it('S6 — ?strategie=pensioen (en ?rij=pensioen) opent de editor mét factor-A-uitvraag', () => {
    nav.search = new URLSearchParams('strategie=pensioen&x=1')
    renderRijen('simple')
    expect(screen.getByTestId('strategie-open').textContent).toBe('pensioen')
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('true')
    // De param verdwijnt bij het openen; de rest blijft.
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen?x=1', { scroll: false })
    fireEvent.click(screen.getByText('editor-sluiten'))
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
  })

  it.each(['aow', 'huis', 'werk'] as const)('?strategie=%s opent die editor zonder factor-A-uitvraag', (key) => {
    nav.search = new URLSearchParams(`strategie=${key}`)
    renderRijen()
    expect(screen.getByTestId('strategie-open').textContent).toBe(key)
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('false')
  })

  it('?rij=uitgave-na-pensioen opent de uitgaven-pane', () => {
    nav.search = new URLSearchParams('rij=uitgave-na-pensioen')
    renderRijen()
    expect(screen.getByTestId('uitgaven-pane')).toBeTruthy()
  })

  it('?rij=inflatie werkt ook in Eenvoudig (de rij staat ingeklapt)', () => {
    nav.search = new URLSearchParams('rij=inflatie')
    renderRijen('simple')
    expect(screen.getByTestId('voorkeur-sheet').textContent).toMatch(/^inflation_rate/)
  })

  it('?strategie=open opent niets maar wordt wel opgeruimd', () => {
    nav.search = new URLSearchParams('strategie=open')
    renderRijen()
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
    expect(screen.queryByTestId('regel-pane')).toBeNull()
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen', { scroll: false })
  })

  it('met ?modal= (redirect van ?modal=strategie|withdrawal) wacht de rij-deeplink op de overlay-opruimer: één keer open', () => {
    const geopend: string[] = []
    laatst.regel = null
    nav.search = new URLSearchParams('modal=withdrawal&rij=onttrekking')
    const { rerender } = renderRijen()
    expect(screen.queryByTestId('regel-pane')).toBeNull()
    expect(nav.replace).not.toHaveBeenCalled()
    // De overlay-state ruimt `modal` op; daarna ziet de rij-hook een schone URL.
    nav.search = new URLSearchParams('rij=onttrekking')
    rerender(
      <DisplayModeProvider initialMode="full">
        <InstellingenRijen {...PROPS} />
      </DisplayModeProvider>,
    )
    geopend.push(screen.getByTestId('regel-pane').textContent ?? '')
    expect(geopend).toEqual(['onttrekkingsstrategie||snap'])
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen', { scroll: false })
  })

  it('met ?planreview= wacht de rij-deeplink op de opruimer van de review', () => {
    nav.search = new URLSearchParams('planreview=open&rij=box3')
    renderRijen()
    expect(screen.queryByTestId('box3-sheet')).toBeNull()
    expect(nav.replace).not.toHaveBeenCalled()
  })
})

describe('InstellingenRijen — geen losse Tailwind-kleuren voor module-identiteit', () => {
  it('rendert zonder standaardpaletten', () => {
    const { container } = renderRijen()
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(violet|emerald|amber|sky|teal|purple)-\d/)
    expect(within(container).getAllByRole('button').length).toBeGreaterThanOrEqual(RIJ_SLEUTELS.length)
  })
})
