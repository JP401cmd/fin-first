import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  ToekomstNavCards,
  deriveDoelenStatus,
  nextEventLabel,
  formatPct,
  type GoalProgress,
} from './toekomst-nav-cards'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

/**
 * Tests voor ToekomstNavCards — de vier navigatiekaarten bovenaan de
 * /toekomst-landing (Doelen · Gebeurtenissen · Voorkeuren · Rekenhulp).
 *
 * ToekomstNavCards is een server-component zónder hooks (alle data komt via
 * props, KPI/status worden afgeleid door pure helpers). Geen next/navigation-
 * of supabase-mock nodig — alleen <Link> rendert naar een <a href>.
 */

// ── Mock-fabrieken ──────────────────────────────────────────────────────

function mockGoal(overrides: Partial<GoalWithBudget> = {}): GoalWithBudget {
  return {
    id: 'g1',
    name: 'Spaargeld voor woning',
    description: '',
    goal_type: 'savings',
    target_value: 50000,
    current_value: 20000,
    target_date: '2027-12-31',
    color: 'teal',
    icon: 'Target',
    is_completed: false,
    sort_order: 0,
    user_id: 'u1',
    created_at: '2026-01-01',
    custom_unit: null,
    budgets: null,
    ...overrides,
  } as unknown as GoalWithBudget
}

function mockProgress(overrides: Partial<GoalProgress> = {}): GoalProgress {
  return {
    current: 20000,
    target: 50000,
    pct: 40,
    onTrack: false,
    eta: null,
    ...overrides,
  }
}

function mockEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e1',
    name: 'Tweede kind',
    event_type: 'child',
    target_age: null,
    target_date: '2028-06-15',
    one_time_cost: 5000,
    monthly_cost_change: 350,
    monthly_income_change: 0,
    duration_months: 240,
    icon: 'child',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    ...overrides,
  }
}

const mockFireParams: FireParams = {
  grossReturn: 0.07,
  inflationRate: 0.02,
  effectiveSwr: 0.034,
  box3Method: 'forfaitair',
  marginaalTarief: 0.3697,
}

const mockFireStrategy: FireStrategyConfig = {
  strategy: 'perpetual',
  endAge: 90,
  legacyAmount: 0,
}

const mockWithdrawal: WithdrawalStrategyConfig = {
  strategy: 'static',
  guardrailFloor: 0.8,
  guardrailCeiling: 1.2,
  guardrailCutStep: 0.1,
  guardrailRaiseStep: 0.1,
}

type RenderProps = Partial<Parameters<typeof ToekomstNavCards>[0]>

function renderCards(overrides: RenderProps = {}) {
  return render(
    <ToekomstNavCards
      goals={[mockGoal()]}
      goalProgresses={[mockProgress()]}
      events={[mockEvent()]}
      fireStrategy={mockFireStrategy}
      withdrawalStrategy={mockWithdrawal}
      fireParams={mockFireParams}
      calculatorCount={4}
      {...overrides}
    />,
  )
}

/** Vind de kaart-<a> op zijn href (de hele kaart is een Link). */
function cardByHref(container: HTMLElement, href: string): HTMLAnchorElement {
  const el = container.querySelector(`a[href="${href}"]`)
  if (!el) throw new Error(`Geen kaart met href ${href}`)
  return el as HTMLAnchorElement
}

/** De status-dot-span heeft een bg-<kleur>-500/300 class; haal die op. */
function dotClass(card: HTMLAnchorElement): string {
  const dot = card.querySelector('span[aria-hidden="true"][class*="rounded-full"]')
  return dot?.getAttribute('class') ?? ''
}

// ── Render: vier kaarten + hrefs ──────────────────────────────────────────

describe('ToekomstNavCards — kaarten & hrefs', () => {
  it('rendert exact vier kaarten met de juiste labels', () => {
    const { container } = renderCards()
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(4)
    expect(screen.getByText('Doelen')).toBeTruthy()
    expect(screen.getByText('Gebeurtenissen')).toBeTruthy()
    expect(screen.getByText('Voorkeuren')).toBeTruthy()
    expect(screen.getByText('Rekenhulp')).toBeTruthy()
  })

  it('linkt elke kaart naar zijn eigen subpagina', () => {
    const { container } = renderCards()
    expect(cardByHref(container, '/toekomst/doelen')).toBeTruthy()
    expect(cardByHref(container, '/toekomst/gebeurtenissen')).toBeTruthy()
    expect(cardByHref(container, '/toekomst/voorkeuren')).toBeTruthy()
    expect(cardByHref(container, '/toekomst/rekenhulp')).toBeTruthy()
  })
})

// ── Doelen-kaart: KPI + status-dot-kleur ──────────────────────────────────

describe('ToekomstNavCards — Doelen-kaart', () => {
  it('toont het aantal actieve doelen als KPI', () => {
    const { container } = renderCards({
      goals: [mockGoal({ id: 'a' }), mockGoal({ id: 'b' }), mockGoal({ id: 'c' })],
      goalProgresses: [
        mockProgress({ pct: 60, onTrack: true }),
        mockProgress({ pct: 60, onTrack: true }),
        mockProgress({ pct: 60, onTrack: true }),
      ],
    })
    const card = cardByHref(container, '/toekomst/doelen')
    expect(within(card).getByText('3 doelen')).toBeTruthy()
  })

  it('toont singular "1 doel" bij precies één actief doel', () => {
    const { container } = renderCards({
      goals: [mockGoal()],
      goalProgresses: [mockProgress({ pct: 60, onTrack: true })],
    })
    const card = cardByHref(container, '/toekomst/doelen')
    expect(within(card).getByText('1 doel')).toBeTruthy()
  })

  it('emerald-dot + "Allemaal op koers" wanneer alle doelen on-track zijn', () => {
    const { container } = renderCards({
      goals: [mockGoal({ id: 'a' }), mockGoal({ id: 'b' })],
      goalProgresses: [
        mockProgress({ pct: 40, onTrack: true }),
        mockProgress({ pct: 80, onTrack: true }),
      ],
    })
    const card = cardByHref(container, '/toekomst/doelen')
    expect(dotClass(card)).toContain('bg-emerald-500')
    expect(within(card).getByText('Allemaal op koers')).toBeTruthy()
  })

  it('amber-dot wanneer ≥1 doel niet on-track is met pct ≥ 50', () => {
    const { container } = renderCards({
      goals: [mockGoal({ id: 'a' }), mockGoal({ id: 'b' })],
      goalProgresses: [
        mockProgress({ pct: 80, onTrack: true }),
        mockProgress({ pct: 60, onTrack: false }),
      ],
    })
    const card = cardByHref(container, '/toekomst/doelen')
    expect(dotClass(card)).toContain('bg-amber-500')
    expect(within(card).getByText('1 vraagt aandacht')).toBeTruthy()
  })

  it('red-dot wanneer ≥1 doel niet on-track is met pct < 50', () => {
    const { container } = renderCards({
      goals: [mockGoal({ id: 'a' }), mockGoal({ id: 'b' })],
      goalProgresses: [
        mockProgress({ pct: 60, onTrack: false }),
        mockProgress({ pct: 10, onTrack: false }),
      ],
    })
    const card = cardByHref(container, '/toekomst/doelen')
    // Eén achter (pct<50) → rood domineert amber.
    expect(dotClass(card)).toContain('bg-red-500')
    expect(within(card).getByText('2 vraagt aandacht')).toBeTruthy()
  })

  it('neutrale (stone) dot + "Stel je eerste doel in" zonder doelen', () => {
    const { container } = renderCards({ goals: [], goalProgresses: [] })
    const card = cardByHref(container, '/toekomst/doelen')
    expect(dotClass(card)).toContain('bg-stone-300')
    expect(within(card).getByText('Geen')).toBeTruthy()
    expect(within(card).getByText('Stel je eerste doel in')).toBeTruthy()
  })

  it('negeert voltooide doelen (pct ≥ 100) bij status + telling', () => {
    const { container } = renderCards({
      goals: [mockGoal({ id: 'done' }), mockGoal({ id: 'active' })],
      goalProgresses: [
        mockProgress({ pct: 100, onTrack: true }),
        mockProgress({ pct: 70, onTrack: true }),
      ],
    })
    const card = cardByHref(container, '/toekomst/doelen')
    // Eén actief doel telt, voltooide telt niet mee → "1 doel".
    expect(within(card).getByText('1 doel')).toBeTruthy()
    expect(dotClass(card)).toContain('bg-emerald-500')
  })
})

// ── Gebeurtenissen-kaart: count + volgende event ──────────────────────────

describe('ToekomstNavCards — Gebeurtenissen-kaart', () => {
  it('toont count + "Volgende: ..." voor een toekomstig event', () => {
    const { container } = renderCards({
      events: [mockEvent({ name: 'Kind', target_date: '2028-01-01' })],
    })
    const card = cardByHref(container, '/toekomst/gebeurtenissen')
    expect(within(card).getByText('1 gebeurtenis')).toBeTruthy()
    expect(within(card).getByText('Volgende: Kind · 2028')).toBeTruthy()
  })

  it('toont "Geen" + "Nog niets gepland" zonder events', () => {
    const { container } = renderCards({ events: [] })
    const card = cardByHref(container, '/toekomst/gebeurtenissen')
    expect(within(card).getByText('Geen')).toBeTruthy()
    expect(within(card).getByText('Nog niets gepland')).toBeTruthy()
  })

  it('heeft altijd een neutrale (stone) status-dot', () => {
    const { container } = renderCards()
    const card = cardByHref(container, '/toekomst/gebeurtenissen')
    expect(dotClass(card)).toContain('bg-stone-300')
  })
})

// ── Voorkeuren-kaart: eindstrategie-naam als KPI ──────────────────────────

describe('ToekomstNavCards — Voorkeuren-kaart', () => {
  it('toont de eindstrategie-naam als KPI', () => {
    const { container } = renderCards({
      fireStrategy: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
    const card = cardByHref(container, '/toekomst/voorkeuren')
    // STRATEGY_LABELS.perpetual.name → "Eeuwigdurend"
    expect(within(card).getByText('Eeuwigdurend')).toBeTruthy()
  })

  it('toont een andere eindstrategie-naam (deplete → "Vermogen opeten")', () => {
    const { container } = renderCards({
      fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const card = cardByHref(container, '/toekomst/voorkeuren')
    expect(within(card).getByText('Vermogen opeten')).toBeTruthy()
  })

  it('combineert onttrekkingsstrategie-naam + SWR in de substext', () => {
    const { container } = renderCards()
    const card = cardByHref(container, '/toekomst/voorkeuren')
    // static → "Vast (4%)", effectiveSwr 0.034 → "3.4%"
    expect(within(card).getByText(/Vast \(4%\) · SWR 3\.4%/)).toBeTruthy()
  })

  it('heeft altijd een neutrale (stone) status-dot', () => {
    const { container } = renderCards()
    const card = cardByHref(container, '/toekomst/voorkeuren')
    expect(dotClass(card)).toContain('bg-stone-300')
  })
})

// ── Rekenhulp-kaart: count / "Geen" ───────────────────────────────────────

describe('ToekomstNavCards — Rekenhulp-kaart', () => {
  it('toont het aantal rekenhulpen als KPI', () => {
    const { container } = renderCards({ calculatorCount: 4 })
    const card = cardByHref(container, '/toekomst/rekenhulp')
    expect(within(card).getByText('4 rekenhulpen')).toBeTruthy()
    expect(within(card).getByText('Nieuwe met Will')).toBeTruthy()
  })

  it('toont singular "1 rekenhulp" bij precies één', () => {
    const { container } = renderCards({ calculatorCount: 1 })
    const card = cardByHref(container, '/toekomst/rekenhulp')
    expect(within(card).getByText('1 rekenhulp')).toBeTruthy()
  })

  it('toont "Geen" + "Nog geen rekenhulpen" bij 0', () => {
    const { container } = renderCards({ calculatorCount: 0 })
    const card = cardByHref(container, '/toekomst/rekenhulp')
    expect(within(card).getByText('Geen')).toBeTruthy()
    expect(within(card).getByText('Nog geen rekenhulpen')).toBeTruthy()
  })
})

// ── Pure helpers ──────────────────────────────────────────────────────────

describe('deriveDoelenStatus', () => {
  it('good wanneer alle actieve doelen on-track zijn', () => {
    const r = deriveDoelenStatus(
      [mockGoal({ id: 'a' }), mockGoal({ id: 'b' })],
      [mockProgress({ pct: 30, onTrack: true }), mockProgress({ pct: 90, onTrack: true })],
    )
    expect(r.status).toBe('good')
    expect(r.activeCount).toBe(2)
    expect(r.attentionCount).toBe(0)
  })

  it('warn bij niet-on-track met pct ≥ 50', () => {
    const r = deriveDoelenStatus(
      [mockGoal()],
      [mockProgress({ pct: 55, onTrack: false })],
    )
    expect(r.status).toBe('warn')
    expect(r.attentionCount).toBe(1)
  })

  it('bad bij niet-on-track met pct < 50 (domineert warn)', () => {
    const r = deriveDoelenStatus(
      [mockGoal({ id: 'a' }), mockGoal({ id: 'b' })],
      [mockProgress({ pct: 55, onTrack: false }), mockProgress({ pct: 20, onTrack: false })],
    )
    expect(r.status).toBe('bad')
    expect(r.attentionCount).toBe(2)
  })

  it('neutral zonder actieve doelen', () => {
    expect(deriveDoelenStatus([], []).status).toBe('neutral')
    // alleen voltooide doelen → ook neutral
    const r = deriveDoelenStatus([mockGoal()], [mockProgress({ pct: 100, onTrack: true })])
    expect(r.status).toBe('neutral')
    expect(r.activeCount).toBe(0)
  })
})

describe('nextEventLabel', () => {
  const NOW = new Date('2026-06-01T00:00:00.000Z')

  it('kiest het chronologisch eerstvolgende gedateerde event ná nu', () => {
    const label = nextEventLabel(
      [
        mockEvent({ id: 'laat', name: 'Laat', target_date: '2030-01-01' }),
        mockEvent({ id: 'vroeg', name: 'Vroeg', target_date: '2027-03-01' }),
      ],
      NOW,
    )
    expect(label).toBe('Volgende: Vroeg · 2027')
  })

  it('negeert events in het verleden', () => {
    const label = nextEventLabel(
      [
        mockEvent({ id: 'verleden', name: 'Verleden', target_date: '2020-01-01' }),
        mockEvent({ id: 'toekomst', name: 'Toekomst', target_date: '2029-01-01' }),
      ],
      NOW,
    )
    expect(label).toBe('Volgende: Toekomst · 2029')
  })

  it('valt terug op leeftijd-events wanneer geen gedateerd toekomstig event', () => {
    const label = nextEventLabel(
      [mockEvent({ id: 'aow', name: 'AOW', target_date: null, target_age: 67 })],
      NOW,
    )
    expect(label).toBe('Volgende: AOW · leeftijd 67')
  })

  it('geeft null wanneer er geen geplande events zijn', () => {
    expect(nextEventLabel([], NOW)).toBeNull()
    expect(
      nextEventLabel([mockEvent({ target_date: '2020-01-01', target_age: null })], NOW),
    ).toBeNull()
  })
})

describe('formatPct', () => {
  it('formatteert een fractie naar 1 decimaal', () => {
    expect(formatPct(0.034)).toBe('3.4%')
    expect(formatPct(0.04)).toBe('4.0%')
    expect(formatPct(0)).toBe('0.0%')
  })
})
