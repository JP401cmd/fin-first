import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthScoreCard } from './health-score-card'
import type { HealthScore } from '@/lib/financial-health'

/**
 * Tests voor HealthScoreCard. matchMedia + IntersectionObserver worden
 * globaal gemocked in test/setup.ts voor de useInViewAnimation hook.
 */

function makeHealth(overrides: Partial<HealthScore> = {}): HealthScore {
  return {
    total: 72,
    label: 'Sterk',
    pillars: [
      {
        id: 'fire_progress',
        name: 'FIRE',
        score: 50,
        weight: 0.2,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '50%',
      },
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
      },
    ],
    previousMonth: 65,
    trend: 7,
    activePillarCount: 2,
    budgetingActive: true,
    ...overrides,
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
        {
          id: 'fire_progress',
          name: 'FIRE',
          score: 0,
          weight: 0.2,
          explanation: '',
          improvementTip: '',
          actionHref: '/x',
          actionLabel: 'X',
          rawValue: '0%',
        },
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
