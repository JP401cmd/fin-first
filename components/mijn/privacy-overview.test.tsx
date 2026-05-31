import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrivacyOverview } from './privacy-overview'

describe('PrivacyOverview', () => {
  it('rendert titel + intro', () => {
    render(<PrivacyOverview />)
    expect(screen.getByText(/Wat we opslaan/i)).toBeTruthy()
    expect(screen.getByText(/cloud-first/i)).toBeTruthy()
  })

  it('toont 7 data-categorie-cards', () => {
    const { container } = render(<PrivacyOverview />)
    const items = container.querySelectorAll('ol > li')
    expect(items.length).toBe(7)
  })

  it('elke categorie heeft Opslag- en Waarom-veld', () => {
    const { container } = render(<PrivacyOverview />)
    const dts = container.querySelectorAll('dt')
    // 7 categorieën × 2 dt's (Opslag + Waarom) = 14
    expect(dts.length).toBe(14)
    const labels = Array.from(dts).map((dt) => dt.textContent?.trim())
    expect(labels.filter((l) => l === 'Opslag').length).toBe(7)
    expect(labels.filter((l) => l === 'Waarom').length).toBe(7)
  })

  it('toont expliciete categorieën Profiel/Bezittingen/Schulden/Cashflow/Doelen/Will/Briefing', () => {
    render(<PrivacyOverview />)
    expect(screen.getByText('Profiel')).toBeTruthy()
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Cashflow & transacties')).toBeTruthy()
    expect(screen.getByText('Doelen')).toBeTruthy()
    expect(screen.getByText('Will-chat & AI-context')).toBeTruthy()
    expect(screen.getByText('Wekelijkse briefing')).toBeTruthy()
  })

  it('export- en delete-CTAs zijn aanwezig met deep-links', () => {
    const { container } = render(<PrivacyOverview />)
    const links = Array.from(container.querySelectorAll('a')).map((a) => ({
      text: a.textContent?.trim() ?? '',
      href: a.getAttribute('href') ?? '',
    }))
    expect(links.some((l) => l.text.includes('Data exporteren'))).toBe(true)
    expect(links.some((l) => l.text.includes('Account verwijderen'))).toBe(true)
    // Beide CTA's wijzen nu naar /mijn/geavanceerd (export-anchor + reset).
    expect(links.some((l) => l.href === '/mijn/geavanceerd#export')).toBe(true)
    expect(links.some((l) => l.href === '/mijn/geavanceerd')).toBe(true)
  })

  it('noemt expliciet "Supabase" en "EU-regio"', () => {
    const { container } = render(<PrivacyOverview />)
    expect(container.textContent).toMatch(/Supabase/)
    expect(container.textContent).toMatch(/EU-regio/)
  })

  it('vermeldt "Géén model-training" bij Will-chat', () => {
    render(<PrivacyOverview />)
    expect(screen.getByText(/Géén model-training/i)).toBeTruthy()
  })

  it('vermeldt server-side opslag bij de wekelijkse briefing', () => {
    render(<PrivacyOverview />)
    expect(screen.getByText(/briefing_snapshot/i)).toBeTruthy()
  })
})
