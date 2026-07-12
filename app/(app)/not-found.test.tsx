import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppNotFound from './not-found'

// next/link → simpele anchor (geen router-context nodig in jsdom).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe('AppNotFound', () => {
  it('toont precies één CTA naar het Overzicht', () => {
    render(<AppNotFound />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/overzicht')
    expect(links[0]).toHaveTextContent('Naar Overzicht')
  })

  it('toont de 404-kicker', () => {
    render(<AppNotFound />)
    expect(screen.getByText('404 — niet gevonden')).toBeInTheDocument()
  })
})
