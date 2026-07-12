import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Activity, Target } from 'lucide-react'
import {
  EmptyStateCard,
  HealthScoreEmptyState,
  DoelenEmptyState,
} from './empty-states'

/**
 * Tests voor de gedeelde EmptyStateCard en de twee gespecialiseerde
 * wrappers (HealthScoreEmptyState + DoelenEmptyState). Validatie
 * van props, content, en CTA-target.
 */

describe('EmptyStateCard (generic)', () => {
  it('rendert kicker, title, body en CTA-label', () => {
    render(
      <EmptyStateCard
        icon={Activity}
        iconColor="text-amber-700"
        iconBg="bg-amber-50"
        kicker="Test-kicker"
        title="Test-title"
        body="Een korte beschrijving van de lege staat."
        ctaHref="/test-route"
        ctaLabel="Doe iets →"
      />,
    )
    expect(screen.getByText('Test-kicker')).toBeTruthy()
    expect(screen.getByText('Test-title')).toBeTruthy()
    expect(screen.getByText(/Een korte beschrijving/)).toBeTruthy()
    expect(screen.getByText('Doe iets →')).toBeTruthy()
  })

  it('CTA-Link wijst naar ctaHref', () => {
    const { container } = render(
      <EmptyStateCard
        icon={Activity}
        iconColor="text-amber-700"
        iconBg="bg-amber-50"
        kicker="K"
        title="T"
        body="B"
        ctaHref="/overzicht/cashflow"
        ctaLabel="Klik"
      />,
    )
    const link = container.querySelector('a[href="/overzicht/cashflow"]')
    expect(link).toBeTruthy()
  })

  it('CTA heeft min-h-11 (WCAG tap-target = 44px)', () => {
    const { container } = render(
      <EmptyStateCard
        icon={Activity}
        iconColor="text-kern-700"
        iconBg="bg-kern-50"
        kicker="K"
        title="T"
        body="B"
        ctaHref="/x"
        ctaLabel="L"
      />,
    )
    const link = container.querySelector('a[href="/x"]')
    expect(link?.className).toContain('min-h-11')
  })

  it('article heeft dashed border (visuele empty-state marker)', () => {
    const { container } = render(
      <EmptyStateCard
        icon={Target}
        iconColor="text-horizon-700"
        iconBg="bg-horizon-50"
        kicker="K"
        title="T"
        body="B"
        ctaHref="/x"
        ctaLabel="L"
      />,
    )
    const article = container.querySelector('article')
    expect(article?.className).toContain('border-dashed')
  })

  it('bevat geen rounded-classes (scherpe hoeken, krant-esthetiek) (P-03)', () => {
    const { container } = render(
      <EmptyStateCard
        icon={Activity}
        iconColor="text-kern-700"
        iconBg="bg-kern-50"
        kicker="K"
        title="T"
        body="B"
        ctaHref="/x"
        ctaLabel="L"
      />,
    )
    // Geen enkel element mag een rounded-* class dragen (behalve rounded-full,
    // dat hier niet voorkomt). Bewaakt de scherpe-hoeken-conventie.
    const rounded = container.querySelectorAll('[class*="rounded-"]')
    expect(rounded.length).toBe(0)
  })

  it('CTA gebruikt de ink/paper-tokens, geen stone-hardcode (P-03)', () => {
    const { container } = render(
      <EmptyStateCard
        icon={Activity}
        iconColor="text-kern-700"
        iconBg="bg-kern-50"
        kicker="K"
        title="T"
        body="B"
        ctaHref="/x"
        ctaLabel="L"
      />,
    )
    const link = container.querySelector('a[href="/x"]')
    expect(link?.className).toContain('bg-[var(--ink)]')
    expect(link?.className).not.toContain('stone')
  })
})

describe('HealthScoreEmptyState', () => {
  it('toont "Gezondheid" + "Nog geen score"', () => {
    render(<HealthScoreEmptyState />)
    expect(screen.getByText('Gezondheid')).toBeTruthy()
    expect(screen.getByText('Nog geen score')).toBeTruthy()
  })

  it('CTA "Voeg bezitting toe →" → /overzicht/bezittingen', () => {
    const { container } = render(<HealthScoreEmptyState />)
    expect(screen.getByText('Voeg bezitting toe →')).toBeTruthy()
    const link = container.querySelector('a[href="/overzicht/bezittingen"]')
    expect(link).toBeTruthy()
  })
})

describe('DoelenEmptyState', () => {
  it('toont "Doelen" + "Stel je eerste doel"', () => {
    render(<DoelenEmptyState />)
    expect(screen.getByText('Doelen')).toBeTruthy()
    expect(screen.getByText('Stel je eerste doel')).toBeTruthy()
  })

  it('CTA "Maak een doel →" → /toekomst', () => {
    const { container } = render(<DoelenEmptyState />)
    expect(screen.getByText('Maak een doel →')).toBeTruthy()
    const link = container.querySelector('a[href="/toekomst"]')
    expect(link).toBeTruthy()
  })
})
