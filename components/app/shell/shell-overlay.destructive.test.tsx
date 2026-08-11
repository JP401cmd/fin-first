/**
 * ShellOverlay — de `destructive`-prop is geen dood attribuut.
 *
 * Vóór deze suite forwardde `destructive` uitsluitend `data-destructive` op een
 * wrapper-div, en niets in de app las dat attribuut. Netto zag de bevestigknop
 * van een onomkeerbare actie ("Verwijder 43 transacties") er identiek uit als
 * "Opslaan" — de gevaarlijkste knop van de app in de vriendelijkste stijl.
 *
 * De koppeling loopt via `ModalFooterToneProvider`: ShellOverlay zet de tone,
 * elke `ModalFooter` in de overlay (footer én children) leest 'm. Deze suite
 * pint precies die koppeling — inclusief het feit dat de context dwars door de
 * BottomSheet-portal heen werkt, want dáár staat de footer.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ModalFooter } from '@/components/app/modal-footer'
import { ShellOverlay } from './shell-overlay'

function renderConfirm(destructive: boolean) {
  render(
    <ShellOverlay
      open
      onClose={vi.fn()}
      kind="confirm"
      destructive={destructive}
      title="Definitief verwijderen"
      footer={
        <ModalFooter
          primary={{ label: 'Verwijder 43 transacties', onClick: vi.fn() }}
          secondary={{ label: 'Annuleer', onClick: vi.fn() }}
        />
      }
    >
      <p>Er is geen prullenbak.</p>
    </ShellOverlay>,
  )
}

describe('ShellOverlay kind="confirm" — destructive kleurt de bevestigknop', () => {
  afterEach(cleanup)

  it('geeft de footer-primary de rode tone', () => {
    renderConfirm(true)
    const primary = screen.getByRole('button', { name: 'Verwijder 43 transacties' })
    expect(primary.className).toContain('bg-negative')
    expect(primary.className).not.toContain('bg-[var(--ink)]')
  })

  it('laat de annuleerknop ongemoeid', () => {
    renderConfirm(true)
    const secondary = screen.getByRole('button', { name: 'Annuleer' })
    expect(secondary.className).not.toContain('bg-negative')
  })

  it('zonder destructive blijft de primary de gewone inkt-knop', () => {
    renderConfirm(false)
    const primary = screen.getByRole('button', { name: 'Verwijder 43 transacties' })
    expect(primary.className).toContain('bg-[var(--ink)]')
    expect(primary.className).not.toContain('bg-negative')
  })

  it('kind="sheet" met destructive kleurt óók mee (zelfde regel, andere kind)', () => {
    render(
      <ShellOverlay
        open
        onClose={vi.fn()}
        kind="sheet"
        destructive
        title="Weggooien"
        footer={<ModalFooter primary={{ label: 'Weggooien', onClick: vi.fn() }} />}
      >
        <p>Inhoud</p>
      </ShellOverlay>,
    )
    expect(screen.getByRole('button', { name: 'Weggooien' }).className).toContain('bg-negative')
  })
})
