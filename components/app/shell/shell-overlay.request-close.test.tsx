/**
 * WF-BUDGET-10 — het bewerk-paneel mag niet onder zijn eigen waarschuwing
 * vandaan sluiten.
 *
 * Live-repro (UAT-BUDGET-10c, viewport <1024px): budget bewerken → een veld
 * wijzigen → X. Verwacht: de inline bevestiging "Onopgeslagen wijzigingen" met
 * de keuzes "Wijzigingen verwijderen"/"Verder bewerken". Waargenomen: het paneel
 * sloot direct. `budgets-client.tsx` toonde de waarschuwing wél, maar de
 * BottomSheet-tak van `ShellOverlay` startte zijn exit-animatie onvoorwaardelijk
 * náást `onClose` — waarschuwing en al verdwenen binnen ~300ms.
 *
 * Deze opstelling spiegelt het bewerk-paneel: `onClose` blijft de bestaande
 * `handleClose` (dirty → alleen de confirm tonen) en `onRequestClose` is de
 * nieuwe poort die de sluiting weigert zolang er onopgeslagen wijzigingen zijn.
 * jsdom's matchMedia meldt `matches: false`, dus `kind="pane"` rendert hier de
 * mobiele BottomSheet-fallback — precies de tak waar het defect zat.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ShellOverlay } from './shell-overlay'

function BewerkPaneel({ onClose }: { onClose: () => void }) {
  const [naam, setNaam] = useState('Huur / hypotheek')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const isDirty = naam !== 'Huur / hypotheek'

  function handleClose() {
    if (isDirty) setShowCloseConfirm(true)
    else onClose()
  }

  function requestClose(): boolean {
    if (!isDirty) return true
    setShowCloseConfirm(true)
    return false
  }

  return (
    <ShellOverlay
      open
      onClose={handleClose}
      onRequestClose={requestClose}
      kind="pane"
      title="Budget bewerken"
    >
      <input aria-label="Naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
      {showCloseConfirm && (
        <div data-testid="modal-unsaved-changes-warning">
          <p>Onopgeslagen wijzigingen</p>
          <button type="button" onClick={() => { setShowCloseConfirm(false); onClose() }}>
            Wijzigingen verwijderen
          </button>
          <button type="button" onClick={() => setShowCloseConfirm(false)}>
            Verder bewerken
          </button>
        </div>
      )}
    </ShellOverlay>
  )
}

describe('ShellOverlay kind="pane" — onopgeslagen wijzigingen (WF-BUDGET-10)', () => {
  afterEach(cleanup)

  it('toont de bevestiging en houdt het paneel open bij X met een dirty veld', async () => {
    const onClose = vi.fn()
    render(<BewerkPaneel onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Huur' } })
    fireEvent.click(screen.getByLabelText('Sluiten'))

    expect(screen.getByTestId('modal-unsaved-changes-warning')).toBeInTheDocument()
    // Ruim voorbij de 300ms-fallback van de exit-animatie: de waarschuwing moet
    // er dán nog steeds staan. Dit is de assertie die het defect vastpint.
    await new Promise((r) => setTimeout(r, 350))
    expect(screen.getByTestId('modal-unsaved-changes-warning')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sluit alsnog na "Wijzigingen verwijderen"', async () => {
    const onClose = vi.fn()
    render(<BewerkPaneel onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Huur' } })
    fireEvent.click(screen.getByLabelText('Sluiten'))
    fireEvent.click(screen.getByRole('button', { name: 'Wijzigingen verwijderen' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('houdt het paneel open na "Verder bewerken"', () => {
    const onClose = vi.fn()
    render(<BewerkPaneel onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Huur' } })
    fireEvent.click(screen.getByLabelText('Sluiten'))
    fireEvent.click(screen.getByRole('button', { name: 'Verder bewerken' }))

    expect(screen.queryByTestId('modal-unsaved-changes-warning')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sluit meteen bij X zonder wijzigingen (ongewijzigd gedrag)', () => {
    const onClose = vi.fn()
    render(<BewerkPaneel onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Sluiten'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('modal-unsaved-changes-warning')).not.toBeInTheDocument()
  })

  it('houdt het paneel open bij Escape met een dirty veld', () => {
    const onClose = vi.fn()
    render(<BewerkPaneel onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Huur' } })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByTestId('modal-unsaved-changes-warning')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
