/**
 * W-015 — het successcherm toont de vier waardes.
 *
 * Aanleiding: het scherm vertelde tot 19 sep 2026 dat de app "uit twee modules
 * bestaat", een indeling die sinds 15 sep niet meer bestaat. De vier WAARDES
 * uit `lib/onboarding/waardes.ts` staan nu hier — en ze stáán nergens anders
 * meer, want de welkomstpopup vóór stap 1 is dezelfde dag tot twee regels
 * ingekort. Dat maakt dit scherm de enige plek waar ze landen; deze test is de
 * grendel die voorkomt dat ze opnieuw stilletjes nergens terechtkomen.
 *
 * Verder bewaakt hij de drie dingen die bij de herschrijving MOESTEN blijven:
 * de APP-2-regel over de weergavekeuze (ADR 0026 fase 1 — dit is de tweede van
 * twee plekken waar de app zelf vertelt dát die keuze bestaat), de CTA-tekst
 * (ADR 0130) en het feit dat dit scherm bùiten de app-shell staat en dus zijn
 * eigen h1 mag dragen.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingSuccess } from './onboarding-success'
import { WAARDES } from '@/lib/onboarding/waardes'

function renderScherm() {
  return render(<OnboardingSuccess onDashboard={vi.fn()} />)
}

describe('OnboardingSuccess — de vier waardes landen hier', () => {
  it('toont kicker, belofte en toelichting van elke waarde', () => {
    renderScherm()
    for (const waarde of WAARDES) {
      expect(screen.getByText(waarde.kicker)).toBeTruthy()
      expect(screen.getByText(waarde.belofte)).toBeTruthy()
      expect(screen.getByText(waarde.toelichting)).toBeTruthy()
    }
  })

  it('geeft elke waarde zijn eigen accent via een token, nooit een vaste kleur', () => {
    const { container } = renderScherm()
    for (const waarde of WAARDES) {
      expect(
        container.querySelector(`[style*="var(--color-${waarde.accent}-700)"]`),
        `kicker-kleur voor ${waarde.kicker}`,
      ).toBeTruthy()
      expect(
        container.querySelector(`[style*="var(--color-${waarde.accent}-500)"]`),
        `streep voor ${waarde.kicker}`,
      ).toBeTruthy()
    }
  })

  it('noemt de verdwenen twee-modules-indeling niet meer', () => {
    const { container } = renderScherm()
    expect(container.textContent).not.toMatch(/twee modules/i)
    expect(container.textContent).not.toMatch(/Het Overzicht · Vandaag/)
    expect(container.textContent).not.toMatch(/rekenhulpen/i)
  })
})

describe('OnboardingSuccess — wat ongemoeid moest blijven', () => {
  it('houdt de APP-2-regel over de weergavekeuze (ADR 0026 fase 1)', () => {
    renderScherm()
    expect(screen.getByText(/Weergave en uiterlijk/)).toBeTruthy()
  })

  it('houdt de CTA naar het eigen homescherm (ADR 0130)', () => {
    renderScherm()
    expect(screen.getByRole('button', { name: 'Naar je overzicht' })).toBeTruthy()
  })

  it('draagt precies één h1 — dit scherm staat buiten de app-shell', () => {
    const { container } = renderScherm()
    const koppen = container.querySelectorAll('h1')
    expect(koppen.length).toBe(1)
    expect(koppen[0].textContent).toBe('Welkom bij TriFinity!')
  })
})
