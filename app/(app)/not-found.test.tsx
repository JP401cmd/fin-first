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
  it('toont twee onderscheidende CTAs met verschillende labels en bestemmingen', () => {
    render(<AppNotFound />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)

    const overzicht = screen.getByRole('link', { name: 'Naar Overzicht' })
    const start = screen.getByRole('link', { name: 'Naar startpagina' })
    expect(overzicht).toHaveAttribute('href', '/overzicht')
    expect(start).toHaveAttribute('href', '/')

    // Geen duplicaat: de twee knoppen wijzen naar verschillende bestemmingen.
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(new Set(hrefs).size).toBe(2)
  })

  it('toont de 404-kicker', () => {
    render(<AppNotFound />)
    expect(screen.getByText('404 — niet gevonden')).toBeInTheDocument()
  })
})
