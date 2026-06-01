import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MijnOverview } from './mijn-overview'

describe('MijnOverview — render', () => {
  it('rendert header met "Profiel & instellingen"', () => {
    render(<MijnOverview />)
    expect(screen.getByText('Profiel & instellingen')).toBeTruthy()
  })

  it('rendert 8 sub-route cards', () => {
    render(<MijnOverview />)
    expect(screen.getByText('Profiel')).toBeTruthy()
    expect(screen.getByText('Privacy')).toBeTruthy()
    expect(screen.getByText('Koppelingen')).toBeTruthy()
    expect(screen.getByText('Uiterlijk')).toBeTruthy()
    expect(screen.getByText('Notificaties')).toBeTruthy()
    expect(screen.getByText('Check-ins')).toBeTruthy()
    expect(screen.getByText('Rapportages')).toBeTruthy()
    expect(screen.getByText('Geavanceerd')).toBeTruthy()
  })

  it('elke card linkt naar juiste sub-route', () => {
    const { container } = render(<MijnOverview />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/mijn/profiel')
    expect(hrefs).toContain('/mijn/privacy')
    expect(hrefs).toContain('/mijn/koppelingen')
    expect(hrefs).toContain('/mijn/uiterlijk')
    expect(hrefs).toContain('/mijn/notificaties')
    expect(hrefs).toContain('/mijn/checkins')
    expect(hrefs).toContain('/rapportages')
    expect(hrefs).toContain('/mijn/geavanceerd')
  })

  it('toont beschrijving per card', () => {
    render(<MijnOverview />)
    expect(screen.getByText(/Naam, geboortejaar/i)).toBeTruthy()
    expect(screen.getByText(/PSD2-banken, UPO/i)).toBeTruthy()
    expect(screen.getByText(/Kleurpalet, typografie/i)).toBeTruthy()
    expect(screen.getByText(/Tijdlijn van al je maandelijkse/i)).toBeTruthy()
  })

  it('bevat geen legacy /identity/instellingen-link meer in de footer', () => {
    const { container } = render(<MijnOverview />)
    const legacyLink = container.querySelector('a[href="/identity/instellingen"]')
    expect(legacyLink).toBeNull()
  })

  it('toont uitleg-tekst over 8 onderwerpen', () => {
    render(<MijnOverview />)
    expect(screen.getByText(/Acht onderwerpen/i)).toBeTruthy()
  })
})
