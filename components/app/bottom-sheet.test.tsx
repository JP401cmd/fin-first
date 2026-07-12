import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from './bottom-sheet'

// Modal-standaard: een klik op de gedimde achtergrond (backdrop) sluit een
// modal NIET meer. Dit voorkomt onbedoeld dataverlies wanneer een gebruiker
// naast een invulformulier klikt (bug: onboarding bezitting/schuld sloot direct).
describe('BottomSheet — backdrop-klik (modal-standaard)', () => {
  function renderSheet(props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} title="Test" {...props}>
        <p>inhoud</p>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement as HTMLElement
    return { onClose, dialog, backdrop }
  }

  it('sluit standaard NIET bij een klik op de backdrop', () => {
    const { onClose, backdrop } = renderSheet()
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sluit wel via de Escape-toets', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sluit wel via de X-knop', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sluit wel via de backdrop wanneer closeOnBackdropClick expliciet aan staat', () => {
    const { onClose, backdrop } = renderSheet({ closeOnBackdropClick: true })
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
