import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HybridTimelineTable } from '../hybrid-timeline-table'
import type { HybridYearRow } from '../../calc/hybrid-projection'

function makeRow(overrides: Partial<HybridYearRow> & { age: number }): HybridYearRow {
  const base: HybridYearRow = {
    age: overrides.age,
    year: overrides.age - 40 + 1,
    phase: 'opbouw',
    assets: 100_000,
    debts: 0,
    netWorth: 100_000,
    cumulativeBox3Tax: 0,
    box3TaxThisYear: 500,
    perAssetValues: [100_000],
    perDebtValues: [],
    savingsInflowThisYear: 0,
    eventCashflowNetThisYear: 0,
    aowIncomeThisYear: 0,
    withdrawalThisYear: 0,
    portfolioGrowthThisYear: 6_000,
    perAssetGrowth: [6_000],
    perAssetContribution: [0],
    perAssetWithdrawal: [0],
    perDebtInterest: [],
    perDebtRepayment: [],
  }
  return { ...base, ...overrides }
}

function baseRows(): HybridYearRow[] {
  const rows: HybridYearRow[] = []
  for (let age = 40; age <= 90; age++) {
    rows.push(
      makeRow({
        age,
        phase: age < 60 ? 'opbouw' : 'afbouw',
        savingsInflowThisYear: age < 60 ? 18_000 : 0,
        withdrawalThisYear: age >= 60 ? 30_000 : 0,
        aowIncomeThisYear: age >= 67 ? 15_000 : 0,
      }),
    )
  }
  return rows
}

describe('HybridTimelineTable', () => {
  it('rendert compacte view met elke 5 jaar + highlights', () => {
    render(<HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} />)
    // Compacte view toont age 40, 45, 50, 55, 59, 60 (fire), 65, 67 (aow), 70, ...
    expect(screen.getByTestId('hybrid-timeline-row-40')).toBeInTheDocument()
    expect(screen.getByTestId('hybrid-timeline-row-45')).toBeInTheDocument()
    expect(screen.getByTestId('hybrid-timeline-row-60')).toBeInTheDocument()
    expect(screen.getByTestId('hybrid-timeline-row-67')).toBeInTheDocument()
    // 42 is NIET een 5-jaar-stap en geen highlight → niet aanwezig.
    expect(screen.queryByTestId('hybrid-timeline-row-42')).not.toBeInTheDocument()
  })

  it('FIRE-badge zichtbaar op fireAge rij', () => {
    render(<HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} />)
    const fireRow = screen.getByTestId('hybrid-timeline-row-60')
    expect(fireRow).toHaveTextContent('FIRE')
  })

  it('AOW-badge zichtbaar op aowAge rij', () => {
    render(<HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} />)
    const aowRow = screen.getByTestId('hybrid-timeline-row-67')
    expect(aowRow).toHaveTextContent('AOW')
  })

  it('fase-badge verschilt tussen opbouw en afbouw rijen', () => {
    render(<HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} />)
    expect(screen.getByTestId('hybrid-timeline-row-50').getAttribute('data-phase')).toBe('opbouw')
    expect(screen.getByTestId('hybrid-timeline-row-70').getAttribute('data-phase')).toBe('afbouw')
  })

  it('toggle schakelt naar volledige tabel (elk jaar)', () => {
    render(<HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} />)
    // Compact: age 42 niet zichtbaar
    expect(screen.queryByTestId('hybrid-timeline-row-42')).not.toBeInTheDocument()
    const toggle = screen.getByTestId('hybrid-timeline-toggle')
    fireEvent.click(toggle)
    // Na expand: age 42 wel zichtbaar
    expect(screen.getByTestId('hybrid-timeline-row-42')).toBeInTheDocument()
  })

  it('klik op rij roept onRowClick aan met de leeftijd', () => {
    const onRowClick = vi.fn()
    render(
      <HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} onRowClick={onRowClick} />,
    )
    fireEvent.click(screen.getByTestId('hybrid-timeline-row-60'))
    expect(onRowClick).toHaveBeenCalledWith(60)
  })

  it('Enter-toets op rij triggert onRowClick', () => {
    const onRowClick = vi.fn()
    render(
      <HybridTimelineTable rows={baseRows()} fireAge={60} aowAge={67} onRowClick={onRowClick} />,
    )
    fireEvent.keyDown(screen.getByTestId('hybrid-timeline-row-50'), { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledWith(50)
  })

  it('rendert empty state bij lege rows', () => {
    render(<HybridTimelineTable rows={[]} fireAge={null} aowAge={67} />)
    expect(screen.getByTestId('hybrid-timeline-empty')).toBeInTheDocument()
  })

  it('fireAge=null → geen FIRE-badge maar rendering werkt wel', () => {
    render(<HybridTimelineTable rows={baseRows()} fireAge={null} aowAge={67} />)
    const row = screen.getByTestId('hybrid-timeline-row-50')
    expect(row).not.toHaveTextContent('FIRE')
  })
})
