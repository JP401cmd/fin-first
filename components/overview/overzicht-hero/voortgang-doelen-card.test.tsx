import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  VoortgangDoelenCard,
  type GoalProgress,
} from './voortgang-doelen-card'
import type { GoalWithBudget } from '@/lib/will-data-loader'

/**
 * Tests voor VoortgangDoelenCard — list-view actieve doelen met
 * status-iconen (CheckCircle2 onTrack / AlertCircle achter) + progress-bar.
 */

function makeGoal(id: string, name: string): GoalWithBudget {
  return {
    id,
    user_id: 'u1',
    name,
    target_amount: 100_000,
    current_amount: 0,
    target_date: '2030-12-31',
    created_at: new Date().toISOString(),
    is_active: true,
  } as GoalWithBudget
}

function makeProgress(pct: number, onTrack: boolean): GoalProgress {
  return { current: pct * 1000, target: 100_000, pct, onTrack, eta: null }
}

describe('VoortgangDoelenCard', () => {
  it('toont aantal doelen in header', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
      { goal: makeGoal('2', 'Huis'), progress: makeProgress(30, false) },
    ]
    render(<VoortgangDoelenCard items={items} />)
    expect(screen.getByText('Voortgang doelen')).toBeTruthy()
    expect(screen.getByText('2 doelen actief')).toBeTruthy()
  })

  it('singular bij 1 doel', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
    ]
    render(<VoortgangDoelenCard items={items} />)
    expect(screen.getByText('1 doel actief')).toBeTruthy()
  })

  it('toont totalActive in header wanneer kaarten gecapt zijn', () => {
    // 3 getoonde kaarten maar 4 actieve doelen totaal — de kop moet het
    // wáre aantal tonen (gelijk aan /toekomst/doelen), niet de cap.
    const items = [
      { goal: makeGoal('1', 'Huis'), progress: makeProgress(62, false) },
      { goal: makeGoal('2', 'Buffer'), progress: makeProgress(40, false) },
      { goal: makeGoal('3', 'FIRE'), progress: makeProgress(18, true) },
    ]
    render(<VoortgangDoelenCard items={items} totalActive={4} />)
    expect(screen.getByText('4 doelen actief')).toBeTruthy()
    // Maar nog steeds maar 3 kaarten/rijen getoond.
    expect(screen.queryByText('5 doelen actief')).toBeNull()
  })

  it('valt terug op items.length zonder totalActive', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
      { goal: makeGoal('2', 'Huis'), progress: makeProgress(30, false) },
    ]
    render(<VoortgangDoelenCard items={items} />)
    expect(screen.getByText('2 doelen actief')).toBeTruthy()
  })

  it('rendert per doel: naam + percentage + bar', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    expect(screen.getByText('Vrijheid')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    // Bar onder de naam
    const bars = container.querySelectorAll('.bg-emerald-500')
    expect(bars.length).toBeGreaterThanOrEqual(1)
  })

  it('onTrack=true gebruikt emerald-bar', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy()
    expect(container.querySelector('.bg-amber-500')).toBeNull()
  })

  it('onTrack=false gebruikt amber-bar', () => {
    const items = [
      { goal: makeGoal('1', 'Huis'), progress: makeProgress(30, false) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    expect(container.querySelector('.bg-amber-500')).toBeTruthy()
    expect(container.querySelector('.bg-emerald-500')).toBeNull()
  })

  it('progress-bar width klopt met pct', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(75, true) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    const bar = container.querySelector('.bg-emerald-500')
    expect(bar?.getAttribute('style')).toContain('width: 75%')
  })

  it('progress-bar capt op 100%', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(150, true) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    const bar = container.querySelector('.bg-emerald-500')
    expect(bar?.getAttribute('style')).toContain('width: 100%')
  })

  it('progress-bar floor op 0%', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(-10, false) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    const bar = container.querySelector('.bg-amber-500')
    expect(bar?.getAttribute('style')).toContain('width: 0%')
  })

  it('"Bekijk →" link wijst naar /toekomst', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
    ]
    const { container } = render(<VoortgangDoelenCard items={items} />)
    const link = container.querySelector('a[href="/toekomst"]')
    expect(link).toBeTruthy()
    expect(link?.textContent).toContain('Bekijk')
  })

  it('skipt doelen zonder progress', () => {
    const items = [
      { goal: makeGoal('1', 'Vrijheid'), progress: makeProgress(50, true) },
      { goal: makeGoal('2', 'Onbekend'), progress: null },
    ]
    render(<VoortgangDoelenCard items={items} />)
    expect(screen.getByText('Vrijheid')).toBeTruthy()
    expect(screen.queryByText('Onbekend')).toBeNull()
  })

  it('fallback naam "Doel" bij ontbrekende name', () => {
    const goal = { ...makeGoal('1', ''), name: '' } as GoalWithBudget
    const items = [{ goal, progress: makeProgress(40, true) }]
    render(<VoortgangDoelenCard items={items} />)
    expect(screen.getByText('Doel')).toBeTruthy()
  })
})
