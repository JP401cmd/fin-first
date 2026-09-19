import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { WelcomePopup } from './welcome-popup'
import { WAARDES } from '@/lib/onboarding/waardes'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * B-052 (19 sep 2026): de popup vóór stap 1 is twee regels + CTA; de vier
 * waardes zijn verhuisd naar `lib/onboarding/waardes.ts` (consument: het
 * successcherm, W-015). Deze suite bewaakt dat de verhuizing niet stil
 * terugdraait en dat de bron van de vier waardes één blijft.
 */
describe('WelcomePopup — kort welkomstbericht (B-052)', () => {
  it('toont kop, tagline, de twee regels en de CTA "Start de onboarding →"', () => {
    render(<WelcomePopup onDismiss={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Welkom bij')
    expect(dialog.textContent).toContain('Geld is opgeslagen tijd.')
    expect(dialog.textContent).toContain('rekent dat om naar tijd: de datum waarop werken een keuze wordt')
    expect(dialog.textContent).toContain('We beginnen met een korte onboarding')
    expect(screen.getByRole('button', { name: /Start de onboarding/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Begin/ })).toBeNull()
  })

  it('bevat de vier waardes niet meer — die horen op het successcherm (W-015)', () => {
    render(<WelcomePopup onDismiss={vi.fn()} />)
    const text = screen.getByRole('dialog').textContent ?? ''
    for (const waarde of WAARDES) {
      expect(text).not.toContain(waarde.kicker)
      expect(text).not.toContain(waarde.belofte)
    }
    expect(text).not.toContain('dagblad')
  })

  it('de verhuisde WAARDES-bron blijft compleet: vier waardes, vier verschillende accenten', () => {
    expect(WAARDES).toHaveLength(4)
    expect(new Set(WAARDES.map((w) => w.accent))).toEqual(new Set(['kern', 'wil', 'horizon', 'fin']))
    expect(WAARDES.map((w) => w.kicker)).toEqual([
      'Wat je hebt',
      'Wat er omgaat',
      'Waar het op uitloopt',
      'Waar je op kunt sturen',
    ])
  })

  it('sluit via de CTA en via ESC', () => {
    const onDismiss = vi.fn()
    render(<WelcomePopup onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /Start de onboarding/ }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
