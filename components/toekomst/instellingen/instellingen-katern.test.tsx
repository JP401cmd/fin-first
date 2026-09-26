import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { PlanReviewContext } from '@/components/future/plan-review/plan-review-provider'
import { PLAN_REVIEW_HREF, PLAN_REVIEW_NAAM, type PlanReviewProgress } from '@/lib/plan-review/types'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import type { StrategieEditorsData } from '@/components/future/strategie/strategie-editors'

/**
 * InstellingenKatern (ADR 0179) — compositie van wizard-ingang en de rijen (fase 3). Bewaakt:
 * sectie I met het oude anker `#voorkeuren`, de wizard-kaart (naam uit PLAN_REVIEW_NAAM +
 * voortgang "N van M", opent de pane state-gedreven), en dat een deeplink-param
 * (`?strategie=`, alias van `?rij=`) nog steeds zijn editor opent.
 *
 * Addendum 26 sep: de levensgebeurtenissen staan niet meer hier maar onder het plan
 * (`/toekomst#gebeurtenissen`); de katern rendert ze niet en kent hun anker niet meer.
 *
 * De rijen renderen echt (editors gestubd, zie instellingen-rijen.test.tsx). De
 * GebeurtenissenView is gestubd als verklikker: rendert hij toch, dan valt dat op.
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
      useSearchParams()
      return <section data-testid="gebeurtenissen-view">Levensgebeurtenissen</section>
    },
  }
})
vi.mock('./uitgaven-rij-pane', () => ({ UitgavenRijPane: () => null }))
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

const rijen = {
  events: [],
  firePlan: null,
  withdrawalProfiel: 'guardrails' as const,
  box3HeffingvrijInkomen: null,
  housingStrategy: null,
  retirementMethod: null,
  uitgaveNaPensioen: 0,
  geenTekortLening: true,
  tekortLeningRente: null,
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

function progress(over: Partial<PlanReviewProgress> = {}): PlanReviewProgress {
  return { stappen: [], bevestigd: 2, totaal: 6, eersteOpen: 'uitgaven', voltooid: false, ...over }
}

function renderKatern(planReviewProgress: PlanReviewProgress | null, opener?: { open: (s?: string) => void }) {
  const tree = (
    <DisplayModeProvider initialMode="full">
      <InstellingenKatern
        planReviewProgress={planReviewProgress}
        rijen={rijen}
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
  it('toont sectie I (Je plan) onder het oude anker #voorkeuren', () => {
    const { container } = renderKatern(null)
    const voorkeurenAnker = container.querySelector('#voorkeuren')
    expect(voorkeurenAnker).toBeTruthy()
    expect(voorkeurenAnker!.textContent).toContain('Stopmoment')
  })

  it('rendert de levensgebeurtenissen niet meer: die staan onder het plan (addendum 26 sep)', () => {
    const { container } = renderKatern(progress(), { open: vi.fn() })
    expect(container.querySelector('#gebeurtenissen')).toBeNull()
    expect(screen.queryByTestId('gebeurtenissen-view')).toBeNull()
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
  it('?strategie=aow (alias van ?rij=aow) opent de AOW-editor', () => {
    nav.search = new URLSearchParams('strategie=aow')
    renderKatern(null)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('aow')
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

  it('#voorkeuren: na hydratie scrollt de pagina naar het anker', () => {
    window.history.replaceState(null, '', '/toekomst/instellingen#voorkeuren')
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    const { container } = renderKatern(null)
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(container.querySelector('#voorkeuren'))
  })

  it('een vreemde hash laat de scrollpositie met rust — ook de oude #gebeurtenissen', () => {
    window.history.replaceState(null, '', '/toekomst/instellingen#gebeurtenissen')
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
