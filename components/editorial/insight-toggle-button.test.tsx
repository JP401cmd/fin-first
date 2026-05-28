import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InsightToggleButton } from './insight-toggle-button'

beforeEach(() => {
  window.localStorage.clear()
})

describe('InsightToggleButton', () => {
  it('rendert niets wanneer geen van de ids verborgen is', () => {
    const { container } = render(<InsightToggleButton ids={['compound-insight']} />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('rendert een knop wanneer minstens één id verborgen is', () => {
    window.localStorage.setItem('tf-insight-hidden', JSON.stringify(['compound-insight']))
    render(<InsightToggleButton ids={['compound-insight']} />)
    expect(screen.getByRole('button', { name: /Toon geminimaliseerd/i })).toBeTruthy()
  })

  it('aria-label noemt het aantal verborgen inzichten bij meerdere', () => {
    window.localStorage.setItem('tf-insight-hidden', JSON.stringify(['compound-insight', 'fee-impact']))
    render(<InsightToggleButton ids={['compound-insight', 'fee-impact']} />)
    expect(screen.getByRole('button', { name: /Toon 2 geminimaliseerde/i })).toBeTruthy()
  })

  it('klik verwijdert de meegegeven ids uit de hidden-set en verbergt zichzelf', () => {
    window.localStorage.setItem('tf-insight-hidden', JSON.stringify(['compound-insight', 'fee-impact']))
    const { container } = render(<InsightToggleButton ids={['compound-insight', 'fee-impact']} />)
    fireEvent.click(screen.getByRole('button', { name: /Toon 2 geminimaliseerde/i }))
    expect(container.querySelector('button')).toBeNull()
    const stored = JSON.parse(window.localStorage.getItem('tf-insight-hidden') ?? '[]')
    expect(stored).toEqual([])
  })

  it('verwijdert alleen de ids op deze pagina (laat andere ids ongemoeid)', () => {
    window.localStorage.setItem(
      'tf-insight-hidden',
      JSON.stringify(['compound-insight', 'inflation-impact']),
    )
    render(<InsightToggleButton ids={['compound-insight']} />)
    fireEvent.click(screen.getByRole('button', { name: /Toon geminimaliseerd/i }))
    const stored = JSON.parse(window.localStorage.getItem('tf-insight-hidden') ?? '[]')
    expect(stored).toEqual(['inflation-impact'])
  })
})
