import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { PlanReviewContext } from '@/components/future/plan-review/plan-review-provider'
import { PLAN_REVIEW_HREF, PLAN_REVIEW_NAAM, type PlanReviewProgress } from '@/lib/plan-review/types'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import type { StrategieEditorsData } from '@/components/future/strategie/strategie-editors'
import type { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'

/**
 * InstellingenKatern (ADR 0179, fase 1) — compositie van wizard-ingang, Voorkeuren en
 * Gebeurtenissen op één route. Bewaakt: beide secties met hun anker, de wizard-kaart
 * (naam uit PLAN_REVIEW_NAAM + voortgang "N van M", opent de pane state-gedreven), en dat
 * een deeplink-param (`?strategie=`) op de samengevoegde route nog steeds zijn editor opent.
 *
 * VoorkeurenView rendert echt (met dezelfde stubs als voorkeuren-view.test.tsx);
 * GebeurtenissenView is gestubd — die leunt op de client-side kernel-run
 * (`useHorizonFireSim`) en heeft zijn eigen suite. De stub leest wél `?nieuw=`, zodat
 * zichtbaar blijft dat beide views naast elkaar hun eigen, disjuncte param lezen.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
  usePathname: () => '/toekomst/instellingen',
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}))
vi.mock('@/components/future/regel-bewerken-pane', () => ({ RegelBewerkenPane: () => null }))
vi.mock('@/components/future/strategie/strategie-editors', () => ({
  StrategieEditors: ({ open }: { open: string | null }) => (
    <div data-testid="strategie-editors-open">{open ?? 'none'}</div>
  ),
}))
vi.mock('@/components/future/gebeurtenissen-view', async () => {
  const { useSearchParams } = await import('next/navigation')
  return {
    GebeurtenissenView: () => {
      const sp = useSearchParams()
      return (
        <section>
          <h2>Levensgebeurtenissen</h2>
          <div data-testid="gebeurtenissen-nieuw">{sp.get('nieuw') ?? 'geen'}</div>
        </section>
      )
    },
  }
})
// De echte pane zou matchMedia/ShellOverlay nodig hebben; de kaart praat alleen met de context.
vi.mock('@/components/future/plan-review/plan-review-pane', () => ({ PlanReviewPane: () => null }))

import { InstellingenKatern } from './instellingen-katern'

const strategieData: StrategieEditorsData = {
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

const voorkeuren = {
  events: [],
  strategieData,
  fireParams: {
    grossReturn: 0.07,
    inflationRate: 0.025,
    effectiveSwr: 0.04,
    box3Method: 'forfaitair' as const,
    marginaalTarief: 0.3697,
  },
  fireStrategy: { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 },
  withdrawalStrategy: {
    strategy: 'guardrails' as const,
    guardrailFloor: 0.8,
    guardrailCeiling: 1.2,
    guardrailCutStep: 0.1,
  },
  simSnapshot: null,
  regelVoorkeuren: POT_RULES_DEFAULTS,
  potBalances: { spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0 },
}

// De stub negeert zijn props; het type bewaakt alleen dat de katern ze doorgeeft.
const gebeurtenissen = {} as ComponentProps<typeof GebeurtenissenView>

function progress(over: Partial<PlanReviewProgress> = {}): PlanReviewProgress {
  return { stappen: [], bevestigd: 2, totaal: 6, eersteOpen: 'uitgaven', voltooid: false, ...over }
}

function renderKatern(planReviewProgress: PlanReviewProgress | null, opener?: { open: (s?: string) => void }) {
  const tree = (
    <DisplayModeProvider initialMode="full">
      <InstellingenKatern
        planReviewProgress={planReviewProgress}
        voorkeuren={voorkeuren}
        gebeurtenissen={gebeurtenissen}
      />
    </DisplayModeProvider>
  )
  return render(
    opener ? (
      <PlanReviewContext.Provider value={opener as never}>{tree}</PlanReviewContext.Provider>
    ) : (
      tree
    ),
  )
}

beforeEach(() => {
  nav.search = new URLSearchParams()
  nav.replace.mockClear()
})
afterEach(cleanup)

describe('InstellingenKatern — compositie', () => {
  it('stapelt Voorkeuren en Gebeurtenissen als secties met ankers', () => {
    const { container } = renderKatern(null)
    const voorkeurenAnker = container.querySelector('#voorkeuren')
    const gebeurtenissenAnker = container.querySelector('#gebeurtenissen')
    expect(voorkeurenAnker).toBeTruthy()
    expect(gebeurtenissenAnker).toBeTruthy()
    expect(voorkeurenAnker!.textContent).toContain('Regels op de hele tijdas')
    expect(gebeurtenissenAnker!.textContent).toContain('Levensgebeurtenissen')
    // Volgorde: Voorkeuren boven Gebeurtenissen.
    expect(
      voorkeurenAnker!.compareDocumentPosition(gebeurtenissenAnker!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('toont geen wizard-ingang als de review niets kan bewaren (progress null)', () => {
    renderKatern(null)
    expect(screen.queryByText(PLAN_REVIEW_NAAM)).toBeNull()
  })
})

describe('InstellingenKatern — wizard-ingang', () => {
  it('toont de naam en de voortgang "N van M", bovenaan vóór de secties', () => {
    const { container } = renderKatern(progress(), { open: vi.fn() })
    const naam = screen.getByText(PLAN_REVIEW_NAAM)
    expect(screen.getByText('2 van 6 bevestigd')).toBeTruthy()
    expect(
      naam.compareDocumentPosition(container.querySelector('#voorkeuren')!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opent de review state-gedreven bij de eerste open stap', () => {
    const open = vi.fn()
    renderKatern(progress(), { open })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(PLAN_REVIEW_NAAM) }))
    expect(open).toHaveBeenCalledWith()
  })

  it('voltooide review: "Opnieuw doorlopen" start bij stap 1', () => {
    const open = vi.fn()
    renderKatern(progress({ bevestigd: 6, eersteOpen: null, voltooid: true }), { open })
    fireEvent.click(screen.getByRole('button', { name: /Opnieuw doorlopen/ }))
    expect(open).toHaveBeenCalledWith('plan')
  })

  it('zonder provider valt de kaart terug op de deeplink', () => {
    renderKatern(progress())
    const link = screen.getByRole('link', { name: new RegExp(PLAN_REVIEW_NAAM) })
    expect(link.getAttribute('href')).toBe(PLAN_REVIEW_HREF)
  })
})

describe('InstellingenKatern — deeplinks op de samengevoegde route', () => {
  it('?strategie=aow opent de AOW-editor in de Voorkeuren-sectie', () => {
    nav.search = new URLSearchParams('strategie=aow')
    renderKatern(null)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('aow')
  })

  it('?strategie= en ?nieuw= botsen niet: elke view leest zijn eigen sleutel', () => {
    nav.search = new URLSearchParams('strategie=huis&nieuw=1')
    renderKatern(null)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('huis')
    expect(screen.getByTestId('gebeurtenissen-nieuw').textContent).toBe('1')
  })
})

describe('InstellingenKatern — deeplink ruimt zich op en het anker klopt (C3 punt 7)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('?strategie=aow: de editor opent en de param verdwijnt meteen, met behoud van de hash', () => {
    window.history.replaceState(null, '', '/toekomst/instellingen?strategie=aow#voorkeuren')
    nav.search = new URLSearchParams('strategie=aow')
    renderKatern(null)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('aow')
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen#voorkeuren', { scroll: false })
  })

  it('een ongeldige ?strategie= opent niets maar blijft ook niet hangen', () => {
    nav.search = new URLSearchParams('strategie=onzin&x=1')
    renderKatern(null)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('none')
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen?x=1', { scroll: false })
  })

  it('#gebeurtenissen: na hydratie scrollt de pagina naar het anker', () => {
    window.history.replaceState(null, '', '/toekomst/instellingen?nieuw=1#gebeurtenissen')
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    const { container } = renderKatern(null)
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(container.querySelector('#gebeurtenissen'))
  })

  it('een vreemde hash laat de scrollpositie met rust', () => {
    window.history.replaceState(null, '', '/toekomst/instellingen#iets-anders')
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    renderKatern(null)
    expect(scroll).not.toHaveBeenCalled()
  })
})
