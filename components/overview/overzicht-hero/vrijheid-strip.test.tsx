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

  it('toont "Bekijk →" CTA', () => {
    render(<VrijheidStrip freedomPct={50} />)
    expect(screen.getByText('Bekijk →')).toBeTruthy()
  })

  it('toont aftelling wanneer currentAge + fireAge gegeven', () => {
    render(
      <VrijheidStrip freedomPct={50} currentAge={35} fireAge={52} />,
    )
    // 52 - 35 = 17 jaar
    expect(screen.getByText(/17 jaar/i)).toBeTruthy()
    expect(screen.getByText('Nog')).toBeTruthy()
  })

  it('verbergt aftelling wanneer currentAge missing', () => {
    render(<VrijheidStrip freedomPct={50} fireAge={52} />)
    expect(screen.queryByText('Nog')).toBeNull()
  })

  it('verbergt aftelling wanneer fireAge ≤ currentAge', () => {
    render(<VrijheidStrip freedomPct={100} currentAge={55} fireAge={52} />)
    expect(screen.queryByText('Nog')).toBeNull()
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

  it('rendert mijlpaal-markers op 25/50/75%', () => {
    const { container } = render(<VrijheidStrip freedomPct={40} />)
    const bar = container.querySelector('[role="progressbar"]')
    const markers = bar?.querySelectorAll('span[aria-hidden="true"]')
    expect(markers?.length).toBe(3)
    const positions = Array.from(markers ?? []).map(
      (s) => (s as HTMLElement).style.left,
    )
    expect(positions).toEqual(['25%', '50%', '75%'])
  })

  it('default (geen framing) blijft de "% op weg"-staat', () => {
    render(<VrijheidStrip freedomPct={60} />)
    expect(screen.getByText('60%')).toBeTruthy()
    expect(screen.getByText(/op weg naar het moment/i)).toBeTruthy()
  })
})

describe('VrijheidStrip — vrij/pensioen-framing', () => {
  it("framing 'free' toont 'Je bent vrij.' + onttrekkings-framing, geen %-op-weg", () => {
    render(<VrijheidStrip freedomPct={100} framing="free" />)
    expect(screen.getByText('Je bent vrij.')).toBeTruthy()
    expect(screen.getByText('Financieel vrij')).toBeTruthy()
    expect(screen.queryByText(/op weg naar het moment/i)).toBeNull()
    // Geen voortgangsbalk meer in de vrij-staat.
    expect(document.querySelector('[role="progressbar"]')).toBeNull()
  })

  it("framing 'free' + freeAsPensioen toont 'Je bent met pensioen.'", () => {
    render(<VrijheidStrip freedomPct={100} framing="free" freeAsPensioen />)
    expect(screen.getByText('Je bent met pensioen.')).toBeTruthy()
    expect(screen.getByText('Met pensioen')).toBeTruthy()
  })

  it("vrij/pensioen-staat linkt naar /toekomst", () => {
    const { container } = render(<VrijheidStrip freedomPct={100} framing="free" />)
    expect(container.querySelector('a[href="/toekomst"]')).toBeTruthy()
  })

  it('toont geen aftelling "Nog" in de vrij-staat', () => {
    render(<VrijheidStrip freedomPct={100} currentAge={55} fireAge={50} framing="free" />)
    expect(screen.queryByText('Nog')).toBeNull()
  })
})

describe('VrijheidStrip — M6-vangrail (dataIssue)', () => {
  it('toont de gegevensmelding i.p.v. een percentage', () => {
    render(<VrijheidStrip freedomPct={12} currentAge={36} fireAge={null} dataIssue />)
    expect(screen.getByText(/We missen gegevens/i)).toBeInTheDocument()
    expect(screen.queryByText('12%')).not.toBeInTheDocument()
  })

  it('vertelt wat er ontbreekt en wijst naar het profiel', () => {
    render(<VrijheidStrip freedomPct={12} dataIssue />)
    expect(screen.getByText(/Vul je geboortedatum, inkomen en bestedingen aan/i)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mijn/profiel')
  })

  it('rendert geen voortgangsbalk bij een onmogelijke uitkomst', () => {
    const { container } = render(<VrijheidStrip freedomPct={12} dataIssue />)
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('zonder dataIssue verandert er niets aan het bestaande gedrag', () => {
    render(<VrijheidStrip freedomPct={42} />)
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.queryByText(/We missen gegevens/i)).not.toBeInTheDocument()
  })
})
