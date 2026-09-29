import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KrantWacht } from './krant-wacht'

describe('KrantWacht', () => {
  it('is een neutrale lege staat: h2 Krant, geen upsell, geen AI, geen links', () => {
    const { container } = render(<KrantWacht />)
    expect(container.querySelector('h1')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Krant' })).toBeTruthy()
    expect(screen.getByText(/Je Krant wordt klaargezet/)).toBeTruthy()
    const tekst = container.textContent ?? ''
    expect(tekst).not.toMatch(/abonnement/i)
    expect(tekst).not.toMatch(/\bAI\b/)
    expect(container.querySelector('a')).toBeNull()
  })
})
