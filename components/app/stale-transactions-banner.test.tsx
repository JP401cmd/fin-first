import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StaleTransactionsBanner } from './stale-transactions-banner'

// next/link → simpele anchor (geen router-context nodig in jsdom).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// De datum van de bugmelding (UR2-13).
const NOW = new Date(2026, 7, 31)

describe('StaleTransactionsBanner', () => {
  it('meldt verouderde gegevens mét de laatste boeking en de leeftijd', () => {
    render(<StaleTransactionsBanner latestTransactionMonth="2026-03" now={NOW} />)
    expect(screen.getByTestId('stale-transactions-warning')).toBeInTheDocument()
    expect(screen.getByText('Gegevens verouderd')).toBeInTheDocument()
    expect(screen.getByText('maart 2026')).toBeInTheDocument()
    expect(screen.getByText(/5 maanden geleden/)).toBeInTheDocument()
  })

  it('wijst naar de uitweg — anders is het een melding zonder handeling', () => {
    render(<StaleTransactionsBanner latestTransactionMonth="2026-03" now={NOW} />)
    expect(screen.getByRole('link', { name: 'Transacties importeren' })).toHaveAttribute(
      'href',
      '/core/cash/import',
    )
  })

  it('zwijgt bij verse data', () => {
    const { container } = render(
      <StaleTransactionsBanner latestTransactionMonth="2026-07" now={NOW} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('zwijgt zonder historie: dáár hoort een lege staat, geen waarschuwing', () => {
    const { container } = render(<StaleTransactionsBanner latestTransactionMonth={null} now={NOW} />)
    expect(container).toBeEmptyDOMElement()
  })
})
