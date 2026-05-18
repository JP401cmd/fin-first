import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VrijheidStrip } from './vrijheid-strip'

/**
 * Tests voor VrijheidStrip — twee varianten (lege staat → CTA naar
 * /mijn/profiel; data-staat → progress-bar naar /toekomst).
 */

describe('VrijheidStrip — lege staat (freedomPct === null)', () => {
  it('toont dashed CTA naar /mijn/profiel', () => {
    const { container } = render(<VrijheidStrip freedomPct={null} />)
    const link = container.querySelector('a[href="/mijn/profiel"]')
    expect(link).toBeTruthy()
    expect(link?.className).toContain('border-dashed')
  })

  it('toont "Vul profiel aan →" CTA-label', () => {
    render(<VrijheidStrip freedomPct={null} />)
    expect(screen.getByText('Vul profiel aan →')).toBeTruthy()
  })

  it('toont uitleg-tekst over data-completering', () => {
    render(<VrijheidStrip freedomPct={null} />)
    expect(screen.getByText(/Vul je geboortedatum/)).toBeTruthy()
  })

  it('toont kicker "Op weg naar vrijheid"', () => {
    render(<VrijheidStrip freedomPct={null} />)
    expect(screen.getByText('Op weg naar vrijheid')).toBeTruthy()
  })
})

describe('VrijheidStrip — data-staat', () => {
  it('toont percentage in tekst', () => {
    render(<VrijheidStrip freedomPct={42} />)
    expect(screen.getByText('42%')).toBeTruthy()
  })

  it('rondt percentage af', () => {
    render(<VrijheidStrip freedomPct={42.7} />)
    expect(screen.getByText('43%')).toBeTruthy()
  })

  it('Link wijst naar /toekomst', () => {
    const { container } = render(<VrijheidStrip freedomPct={50} />)
    const link = container.querySelector('a[href="/toekomst"]')
    expect(link).toBeTruthy()
  })

  it('toont "Bekijk projectie →" CTA', () => {
    render(<VrijheidStrip freedomPct={50} />)
    expect(screen.getByText('Bekijk projectie →')).toBeTruthy()
  })

  it('progressbar heeft aria-valuenow uit freedomPct', () => {
    const { container } = render(<VrijheidStrip freedomPct={75} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('75')
  })

  it('progressbar clamp op 100 bij >100', () => {
    const { container } = render(<VrijheidStrip freedomPct={150} />)
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('150') // valuenow keeps raw
    // De inner div is wel geclamped:
    const inner = bar?.querySelector('div')
    expect(inner?.getAttribute('style')).toContain('width: 100%')
  })

  it('progressbar clamp op 0 bij negatief', () => {
    const { container } = render(<VrijheidStrip freedomPct={-20} />)
    const bar = container.querySelector('[role="progressbar"]')
    const inner = bar?.querySelector('div')
    expect(inner?.getAttribute('style')).toContain('width: 0%')
  })
})
