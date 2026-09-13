import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StopPlanConfirm, huidigPlanZin } from './stop-plan-confirm'

/**
 * TPR-09 — de bevestiging die van een verkenning een plan maakt.
 *
 * Gepind: de drie verplichte onderdelen van de formulier-uitleg-norm (keuze ·
 * effect · waarom), de huidige-plan-zin per anker, en dat de knoppen doen wat ze
 * zeggen (bevestigen / annuleren / geblokkeerd tijdens de PUT).
 */

afterEach(cleanup)

const baseProps = {
  open: true,
  busy: false,
  error: '',
  stopAge: 58.5,
  planAnchor: { kind: 'solved' } as const,
  planEndAge: 90,
  aowAge: 67.25,
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

describe('huidigPlanZin', () => {
  it('benoemt het huidige anker in gewone taal', () => {
    expect(huidigPlanZin({ kind: 'age', age: 60 }, 67)).toBe('Nu rekent je plan met stoppen op 60.')
    expect(huidigPlanZin({ kind: 'aow' }, 67.25)).toContain('AOW-leeftijd (67 jaar en 3 maanden)')
    expect(huidigPlanZin({ kind: 'aow' }, null)).toBe('Nu rekent je plan met stoppen op je AOW-leeftijd.')
    expect(huidigPlanZin({ kind: 'now' }, null)).toBe('Nu rekent je plan alsof je vandaag stopt.')
    expect(huidigPlanZin({ kind: 'solved' }, null)).toMatch(/vroegste moment/)
  })
})

describe('StopPlanConfirm', () => {
  it('draagt keuze · effect · waarom, met de verkende leeftijd en de ongewijzigde eindleeftijd', () => {
    render(<StopPlanConfirm {...baseProps} />)
    // keuze
    expect(screen.getByText(/Je kiest/).textContent).toContain('58,5 jaar')
    // effect — de hele app + wat NIET verandert
    expect(screen.getByText(/De hele app/).textContent).toContain('(90)')
    // waarom
    expect(screen.getByText(/Relevant omdat je plan bepaalt/)).toBeInTheDocument()
  })

  it('bevestigen en annuleren roepen hun handlers aan', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<StopPlanConfirm {...baseProps} onConfirm={onConfirm} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Maak dit mijn plan' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tijdens de PUT is annuleren geblokkeerd en toont de primaire knop de laadstaat', () => {
    render(<StopPlanConfirm {...baseProps} busy />)
    expect(screen.getByRole('button', { name: 'Annuleren' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Maak dit mijn plan/ }).textContent).toMatch(/…/)
  })

  it('toont een validatie-/routefout inline', () => {
    render(<StopPlanConfirm {...baseProps} error="Een stopleeftijd moet vóór de eindleeftijd van je plan liggen." />)
    expect(screen.getByText(/vóór de eindleeftijd/)).toBeInTheDocument()
  })
})
