import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BezittingenSegmented } from './bezittingen-segmented'
import { SchuldenSegmented } from './schulden-segmented'

/**
 * Tests voor de capsule-style segmented-controls op /overzicht/bezittingen
 * en /overzicht/schulden. Beide volgen hetzelfde pattern: pathname-aware
 * active-state via usePathname() + render-only.
 */

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/overzicht/bezittingen'),
}))

describe('BezittingenSegmented', () => {
  it('rendert alle 5 segmenten', () => {
    render(<BezittingenSegmented />)
    expect(screen.getByText('Alles')).toBeTruthy()
    expect(screen.getByText('Cash')).toBeTruthy()
    expect(screen.getByText('Beleggen')).toBeTruthy()
    expect(screen.getByText('Huis')).toBeTruthy()
    expect(screen.getByText('Pensioen')).toBeTruthy()
  })

  it('elk segment is een Link met juiste href', () => {
    const { container } = render(<BezittingenSegmented />)
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(5)
    expect(links[0]?.getAttribute('href')).toBe('/overzicht/bezittingen')
    expect(links[1]?.getAttribute('href')).toBe('/overzicht/bezittingen/cash')
    expect(links[2]?.getAttribute('href')).toBe('/overzicht/bezittingen/investment')
    expect(links[3]?.getAttribute('href')).toBe('/overzicht/bezittingen/eigen_huis')
    expect(links[4]?.getAttribute('href')).toBe('/overzicht/bezittingen/retirement')
  })

  it('nav heeft aria-label', () => {
    const { container } = render(<BezittingenSegmented />)
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Filter bezittingen op categorie')
  })

  it('elke knop heeft min-h-[44px] voor WCAG tap-target', () => {
    const { container } = render(<BezittingenSegmented />)
    const links = container.querySelectorAll('a')
    links.forEach((link) => {
      expect(link.className).toContain('min-h-[44px]')
    })
  })
})

describe('SchuldenSegmented', () => {
  it('rendert alle 4 segmenten', () => {
    render(<SchuldenSegmented />)
    expect(screen.getByText('Alles')).toBeTruthy()
    expect(screen.getByText('Hypotheek')).toBeTruthy()
    expect(screen.getByText('Persoonlijk')).toBeTruthy()
    expect(screen.getByText('Studie')).toBeTruthy()
  })

  it('elk segment is een Link met juiste href', () => {
    const { container } = render(<SchuldenSegmented />)
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(4)
    expect(links[0]?.getAttribute('href')).toBe('/overzicht/schulden')
    expect(links[1]?.getAttribute('href')).toBe('/overzicht/schulden/mortgage')
    expect(links[2]?.getAttribute('href')).toBe('/overzicht/schulden/personal_loan')
    expect(links[3]?.getAttribute('href')).toBe('/overzicht/schulden/student_loan')
  })

  it('nav heeft aria-label', () => {
    const { container } = render(<SchuldenSegmented />)
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Filter schulden op categorie')
  })

  it('elke knop heeft min-h-[44px] voor WCAG tap-target', () => {
    const { container } = render(<SchuldenSegmented />)
    const links = container.querySelectorAll('a')
    links.forEach((link) => {
      expect(link.className).toContain('min-h-[44px]')
    })
  })
})
