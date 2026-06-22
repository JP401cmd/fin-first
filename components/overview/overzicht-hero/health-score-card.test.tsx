import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthScoreCard } from './health-score-card'
import type { HealthScore, HealthPillar, PillarGroup } from '@/lib/financial-health'

/**
 * Tests voor HealthScoreCard (v2, ADR 0010).
 *
 * matchMedia + IntersectionObserver worden globaal gemocked in test/setup.ts
 * voor de useInViewAnimation hook.
 *
 * Dekt:
 * - Basis: total-score, label, trend, time-anchor
 * - v2: 4 mini-bars renderen bij pillars mét pillarGroup
 * - Mini-bars ontbreken bij pillars zónder pillarGroup
 * - Samengestelde score meest prominent (>= 2 subscores → mini-bars tonen)
 */

function makePillar(
  id: string,
  score: number,
  weight: number,
  pillarGroup?: PillarGroup,
): HealthPillar {
  return {
    id,
    name: id,
    score,
    weight,
    explanation: '',
    improvementTip: '',
    actionHref: '/x',
    actionLabel: 'X',
    rawValue: `${score}%`,
    pillarGroup,
    groupLabel: pillarGroup
      ? { rondkomen: 'Rondkomen', buffer: 'Buffer', schuld: 'Schuld', vrijheid: 'Vrijheid' }[pillarGroup]
      : undefined,
  } as HealthPillar
}

function makeHealth(overrides: Partial<HealthScore> = {}): HealthScore {
  return {
    total: 72,
    label: 'Sterk',
    pillars: [
      makePillar('fire_progress', 50, 0.2, 'vrijheid'),
      makePillar('emergency_fund', 60, 0.15, 'buffer'),
    ],
    previousMonth: 65,
    trend: 7,
    activePillarCount: 2,
    budgetingActive: true,
    ...overrides,
  }
}

/** v2-conforme health: alle 4 groepen aanwezig */
function makeHealthV2(total = 72, label = 'Sterk'): HealthScore {
  return {
    total,
    label,
    pillars: [
      makePillar('savings_rate', 75, 0.2105, 'rondkomen'),
      makePillar('budget_discipline', 80, 0.1053, 'rondkomen'),
      makePillar('emergency_fund', 60, 0.2105, 'buffer'),
      makePillar('debt_service_ratio', 100, 0.1263, 'schuld'),
      makePillar('debt_ratio', 90, 0.0842, 'schuld'),
      makePillar('fire_progress', 50, 0.1895, 'vrijheid'),
      makePillar('asset_concentration', 80, 0.0737, 'vrijheid'),
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 7,
    budgetingActive: true,
  }
}

describe('HealthScoreCard', () => {
  it('toont total-score afgerond + "van 100"', () => {
    const onOpen = vi.fn()
    render(<HealthScoreCard health={makeHealth()} onOpenReceipt={onOpen} />)
    expect(screen.getByText('72')).toBeTruthy()
    expect(screen.getByText('van 100')).toBeTruthy()
  })

  it('toont band-label uit BAND_STYLES', () => {
    const onOpen = vi.fn()
    render(<HealthScoreCard health={makeHealth({ label: 'Sterk' })} onOpenReceipt={onOpen} />)
    expect(screen.getByText('Sterk')).toBeTruthy()
  })

  it('valt terug op "Redelijk" bij onbekend label', () => {
    const onOpen = vi.fn()
    render(
      <HealthScoreCard
        health={makeHealth({ label: 'Onbekendelabel' })}
        onOpenReceipt={onOpen}
      />,
    )
    expect(screen.getByText('Redelijk')).toBeTruthy()
  })

  it('toont trend-label bij trend > 0', () => {
    const onOpen = vi.fn()
    render(
      <HealthScoreCard
        health={makeHealth({ trend: 7, previousMonth: 65 })}
        onOpenReceipt={onOpen}
      />,
    )
    expect(screen.getByText(/\+7 punten/)).toBeTruthy()
  })

  it('toont trend-label bij trend < 0', () => {
    const onOpen = vi.fn()
    render(
      <HealthScoreCard
        health={makeHealth({ trend: -5, previousMonth: 77 })}
        onOpenReceipt={onOpen}
      />,
    )
    expect(screen.getByText(/-5 punten/)).toBeTruthy()
  })

  it('toont "gelijk aan vorige maand" bij trend = 0', () => {
    const onOpen = vi.fn()
    render(
      <HealthScoreCard
        health={makeHealth({ trend: 0, previousMonth: 72 })}
        onOpenReceipt={onOpen}
      />,
    )
    expect(screen.getByText('gelijk aan vorige maand')).toBeTruthy()
  })

  it('verbergt trend-label bij previousMonth null', () => {
    const onOpen = vi.fn()
    render(
      <HealthScoreCard
        health={makeHealth({ previousMonth: null, trend: 0 })}
        onOpenReceipt={onOpen}
      />,
    )
    expect(screen.queryByText(/punten/)).toBeNull()
    expect(screen.queryByText(/gelijk aan/)).toBeNull()
  })

  it('toont time-anchor uit fire_progress pillar', () => {
    const onOpen = vi.fn()
    render(<HealthScoreCard health={makeHealth()} onOpenReceipt={onOpen} />)
    expect(screen.getByText('50% op weg')).toBeTruthy()
  })

  it('toont buffer-anchor uit emergency_fund als fire_progress 0', () => {
    const onOpen = vi.fn()
    const h = makeHealth({
      pillars: [
        makePillar('fire_progress', 0, 0.2, 'vrijheid'),
        {
          id: 'emergency_fund',
          name: 'Noodfonds',
          score: 60,
          weight: 0.15,
          explanation: '',
          improvementTip: '',
          actionHref: '/x',
          actionLabel: 'X',
          rawValue: '4 mnd',
          pillarGroup: 'buffer',
          groupLabel: 'Buffer',
        },
      ],
    })
    render(<HealthScoreCard health={h} onOpenReceipt={onOpen} />)
    expect(screen.getByText('4 mnd buffer')).toBeTruthy()
  })

  it('button heeft aria-label', () => {
    const onOpen = vi.fn()
    const { container } = render(<HealthScoreCard health={makeHealth()} onOpenReceipt={onOpen} />)
    const btn = container.querySelector('button')
    expect(btn?.getAttribute('aria-label')).toBe(
      'Open detail van financiële gezondheidsscore',
    )
  })
})

// ── v2: mini-bars bij pillarGroup ─────────────────────────────────────────

describe('HealthScoreCard — 4 mini-bars (v2, ADR 0010)', () => {
  // De mini-bars-<ul> is aria-hidden (de SVG-ring draagt het canonieke
  // screenreader-label), dus query via querySelector i.p.v. getByRole('list').
  const SUBSCORES_SELECTOR = 'ul[aria-label="Subscores per pijler"]'

  it('rendert de mini-bar lijst bij ≥2 groepen met pillarGroup', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    expect(container.querySelector(SUBSCORES_SELECTOR)).toBeTruthy()
  })

  it('mini-bar lijst is aria-hidden (SVG-ring is de canonieke screenreader-bron)', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    const list = container.querySelector(SUBSCORES_SELECTOR)
    expect(list?.getAttribute('aria-hidden')).toBe('true')
    // Niet meer in de accessibility-tree → niet vindbaar via role.
    expect(screen.queryByRole('list', { name: 'Subscores per pijler' })).toBeNull()
  })

  it('toont Rondkomen-label in de mini-bar lijst', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    const list = container.querySelector(SUBSCORES_SELECTOR)
    expect(list?.textContent).toContain('Rondkomen')
  })

  it('toont Buffer-label in de mini-bar lijst', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    const list = container.querySelector(SUBSCORES_SELECTOR)
    expect(list?.textContent).toContain('Buffer')
  })

  it('toont Schuld-label in de mini-bar lijst', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    const list = container.querySelector(SUBSCORES_SELECTOR)
    expect(list?.textContent).toContain('Schuld')
  })

  it('toont Vrijheid-label in de mini-bar lijst', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    const list = container.querySelector(SUBSCORES_SELECTOR)
    expect(list?.textContent).toContain('Vrijheid')
  })

  it('rendert GEEN mini-bars bij pillars zónder pillarGroup (backward-compat)', () => {
    const onOpen = vi.fn()
    // Alle pillars zonder pillarGroup → buildGroupSubscores levert lege array → geen list
    const healthNoGroups = makeHealth({
      pillars: [
        makePillar('savings_rate', 70, 0.5), // geen pillarGroup
        makePillar('emergency_fund', 60, 0.5), // geen pillarGroup
      ],
    })
    const { container } = render(
      <HealthScoreCard health={healthNoGroups} onOpenReceipt={onOpen} />,
    )
    expect(container.querySelector(SUBSCORES_SELECTOR)).toBeNull()
  })

  it('rendert GEEN mini-bars bij slechts 1 groep (< 2 subscores)', () => {
    const onOpen = vi.fn()
    // Slechts 1 groep (alleen buffer) → subscores.length < 2 → geen list
    const healthOneGroup = makeHealth({
      pillars: [
        makePillar('emergency_fund', 60, 1.0, 'buffer'),
      ],
    })
    const { container } = render(
      <HealthScoreCard health={healthOneGroup} onOpenReceipt={onOpen} />,
    )
    expect(container.querySelector(SUBSCORES_SELECTOR)).toBeNull()
  })

  it('samengestelde score (72) zichtbaar naast de mini-bars', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2(72)} onOpenReceipt={onOpen} />,
    )
    // Total-score in de ring is de prominente waarde
    expect(screen.getByText('72')).toBeTruthy()
    // Mini-bars staan eronder (na de ring)
    const list = container.querySelector(SUBSCORES_SELECTOR)
    expect(list).toBeTruthy()
  })
})

// ── Gesegmenteerde ring (4 boogsegmenten per gedragsgroep) ────────────────

describe('HealthScoreCard — gesegmenteerde ring', () => {
  it('rendert 4 boogsegmenten bij pillars mét pillarGroup (4 groepen)', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    // Elk segment is een <g> binnen de SVG (track + fill boog).
    const segments = container.querySelectorAll('svg g')
    expect(segments.length).toBe(4)
  })

  it('valt terug op enkelvoudige ring zónder pillarGroup (geen segment-groepen)', () => {
    const onOpen = vi.fn()
    const healthNoGroups = makeHealth({
      pillars: [
        makePillar('savings_rate', 70, 0.5), // geen pillarGroup
        makePillar('emergency_fund', 60, 0.5), // geen pillarGroup
      ],
    })
    const { container } = render(
      <HealthScoreCard health={healthNoGroups} onOpenReceipt={onOpen} />,
    )
    // Geen gesegmenteerde <g>'s → fallback-ring (twee kale <circle>'s, geen <g>).
    expect(container.querySelectorAll('svg g').length).toBe(0)
    const circles = container.querySelectorAll('svg circle')
    expect(circles.length).toBe(2)
  })

  it('ring heeft een samenvattend aria-label met de vier subscores', () => {
    const onOpen = vi.fn()
    render(<HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />)
    const ring = screen.getByRole('img')
    const label = ring.getAttribute('aria-label') ?? ''
    expect(label).toContain('Rondkomen')
    expect(label).toContain('Buffer')
    expect(label).toContain('Schuld')
    expect(label).toContain('Vrijheid')
    expect(label).toContain('van 100')
  })

  it('toont het totaalgetal prominent in het midden bij de gesegmenteerde ring', () => {
    const onOpen = vi.fn()
    render(<HealthScoreCard health={makeHealthV2(69)} onOpenReceipt={onOpen} />)
    expect(screen.getByText('69')).toBeTruthy()
    expect(screen.getByText('van 100')).toBeTruthy()
  })
})

// ── Eenvoudige weergave (display_mode simple): alleen getal + cirkel ───────

describe('HealthScoreCard — Eenvoudige weergave', () => {
  const SUBSCORES_SELECTOR = 'ul[aria-label="Subscores per pijler"]'

  it('toont nog steeds het getal + "van 100" in Eenvoudig', () => {
    const onOpen = vi.fn()
    render(<HealthScoreCard health={makeHealthV2(69)} onOpenReceipt={onOpen} simple />)
    expect(screen.getByText('69')).toBeTruthy()
    expect(screen.getByText('van 100')).toBeTruthy()
  })

  it('verbergt de per-categorie mini-bar-lijst in Eenvoudig', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} simple />,
    )
    expect(container.querySelector(SUBSCORES_SELECTOR)).toBeNull()
  })

  it('forceert de enkelvoudige ring in Eenvoudig (geen gesegmenteerde <g>-bogen)', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} simple />,
    )
    // Geen segment-<g>'s; de fallback-ring zijn twee kale <circle>'s.
    expect(container.querySelectorAll('svg g').length).toBe(0)
    expect(container.querySelectorAll('svg circle').length).toBe(2)
  })

  it('toont in Volledig (default) WEL de gesegmenteerde ring + mini-bars (geen regressie)', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <HealthScoreCard health={makeHealthV2()} onOpenReceipt={onOpen} />,
    )
    expect(container.querySelectorAll('svg g').length).toBe(4)
    expect(container.querySelector(SUBSCORES_SELECTOR)).toBeTruthy()
  })
})
