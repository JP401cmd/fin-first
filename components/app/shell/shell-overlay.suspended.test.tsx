/**
 * ShellOverlay kind="sheet" — `suspended` treedt terug zónder te sluiten.
 *
 * Aanleiding (M35): de rekeningdetail opent als `<ShellOverlay kind="sheet">`,
 * en ín dat scherm opent "Rekening bewerken" een tweede sheet. Beide stonden
 * tegelijk op het scherm — twee scrims, twee focus-traps — tegen de
 * één-overlay-tegelijk-regel van ADR 0039 in.
 *
 * De voor de hand liggende remedie (`open={false}` op de ouder, zoals
 * `doel-bewerken-sheet` doet) kán hier niet: dáár zijn de twee sheets siblings,
 * hier leeft het bewerkscherm ÍN de children van de ouder. Een gesloten
 * BottomSheet rendert `null`, dus sluiten neemt het kind — en al zijn state —
 * mee. Deze suite pint beide helften: dat suspenderen de boom intact laat én
 * dat sluiten dat niet doet (de tweede test is het bewijs waaróm de prop
 * bestaat, niet een tweede manier om hetzelfde te doen).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ShellOverlay } from './shell-overlay'

/**
 * Staat model voor `CashAccountView`: een kind met eigen React-state dat zelf
 * een geneste overlay opent. De teller is de state die een unmount zou wissen.
 */
function Rekeningdetail() {
  const [teller, setTeller] = useState(0)
  const [bewerken, setBewerken] = useState(false)
  return (
    <div>
      <p>Saldo geteld: {teller}</p>
      <button type="button" onClick={() => setTeller((n) => n + 1)}>Tel op</button>
      <button type="button" onClick={() => setBewerken(true)}>Rekening bewerken</button>
      <BottomSheet
        open={bewerken}
        onClose={() => setBewerken(false)}
        title="Rekening bewerken"
        size="md"
      >
        <p>Bewerkscherm</p>
      </BottomSheet>
    </div>
  )
}

function renderOpstelling(onClose = vi.fn()) {
  const view = render(
    <ShellOverlay open onClose={onClose} kind="sheet" size="full" title="Rekeningdetail">
      <Rekeningdetail />
    </ShellOverlay>,
  )
  const zet = (suspended: boolean, open = true) =>
    view.rerender(
      <ShellOverlay
        open={open}
        onClose={onClose}
        kind="sheet"
        size="full"
        title="Rekeningdetail"
        suspended={suspended}
      >
        <Rekeningdetail />
      </ShellOverlay>,
    )
  return { ...view, zet, onClose }
}

describe('ShellOverlay kind="sheet" — suspended', () => {
  afterEach(cleanup)

  it('haalt de ouder van het scherm terwijl de geneste sheet zichtbaar blijft', () => {
    const { zet } = renderOpstelling()

    fireEvent.click(screen.getByRole('button', { name: 'Tel op' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rekening bewerken' }))
    expect(screen.getByRole('heading', { name: 'Rekeningdetail' })).toBeVisible()

    zet(true)

    // De ouder is er nog — met zijn state — maar niet meer te zien. De
    // tekstquery vindt 'm nog (hij staat in de DOM), de role-query niet meer:
    // `aria-hidden` haalt de teruggetreden laag uit de toegankelijkheidsboom,
    // zodat een schermlezer maar één modaal venster tegelijk aantreft.
    expect(screen.getByText('Saldo geteld: 1')).toBeInTheDocument()
    expect(screen.getByText('Rekeningdetail')).not.toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Rekeningdetail' })).not.toBeInTheDocument()
    // Het kind hangt via createPortal in document.body, buiten het verborgen
    // paneel, en blijft dus gewoon staan.
    expect(screen.getByRole('heading', { name: 'Rekening bewerken' })).toBeVisible()
  })

  it('geeft de ouder terug zodra de geneste sheet weg is, met state en al', () => {
    const { zet } = renderOpstelling()

    fireEvent.click(screen.getByRole('button', { name: 'Tel op' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tel op' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rekening bewerken' }))
    zet(true)
    zet(false)

    expect(screen.getByText('Saldo geteld: 2')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Rekeningdetail' })).toBeVisible()
  })

  it('laat Escape aan de geneste sheet — de teruggetreden ouder sluit niet mee', () => {
    const onClose = vi.fn()
    const { zet } = renderOpstelling(onClose)

    fireEvent.click(screen.getByRole('button', { name: 'Rekening bewerken' }))
    zet(true)
    fireEvent.keyDown(document, { key: 'Escape' })

    // Alleen het kind reageert; de ouder heeft zijn Escape-handler opgegeven.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('BEWIJS waarom suspenderen nodig is: sluiten wist de state van het kind', async () => {
    const { zet } = renderOpstelling()

    fireEvent.click(screen.getByRole('button', { name: 'Tel op' }))
    expect(screen.getByText('Saldo geteld: 1')).toBeInTheDocument()

    zet(false, false)

    await waitFor(() =>
      expect(screen.queryByText('Saldo geteld: 1')).not.toBeInTheDocument(),
    )
  })
})

/**
 * M35 — Escape met een geneste sheet (live-smoke-restdefect).
 *
 * De live-smoke vond dat één Escape in het bewerkscherm ALLES sloot: daarna nul
 * vensters open én de detailweergave kwam niet terug. Annuleren deed het wél
 * goed, dus het verschil zit in het Escape-pad, niet in de suspend-keten.
 *
 * Deze opstelling spiegelt `cash-overview.tsx` zo letterlijk mogelijk: dezelfde
 * capture-phase Escape-handler mét `stopImmediatePropagation()`, dezelfde
 * suspend-koppeling, en een kind dat zich net als `CashAccountView` via een ref
 * meldt. De toets wordt bewust op een element ÍN de geneste sheet afgevuurd —
 * niet op `document` — want alleen dan lopen capture- en bubble-fase op
 * document in de echte volgorde.
 */
function GastheerMetEscape() {
  const [detailOpen, setDetailOpen] = useState<boolean>(true)
  const [subOverlayOpen, setSubOverlayOpen] = useState(false)

  // Letterlijke spiegel van de capture-handler in cash-overview.
  useEffect(() => {
    if (!detailOpen || subOverlayOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setDetailOpen(false)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [detailOpen, subOverlayOpen])

  return (
    <ShellOverlay
      open={detailOpen}
      onClose={() => setDetailOpen(false)}
      kind="sheet"
      size="full"
      title="Rekeningdetail"
      suspended={subOverlayOpen}
    >
      <Rekeningdetail2 onExclusiveOverlayChange={setSubOverlayOpen} />
    </ShellOverlay>
  )
}

/** Spiegel van `CashAccountView`: eigen state + melding via een ref. */
function Rekeningdetail2({
  onExclusiveOverlayChange,
}: {
  onExclusiveOverlayChange?: (open: boolean) => void
}) {
  const [bewerken, setBewerken] = useState(false)
  const meldRef = useRef(onExclusiveOverlayChange)
  meldRef.current = onExclusiveOverlayChange
  useEffect(() => {
    meldRef.current?.(bewerken)
    return () => {
      if (bewerken) meldRef.current?.(false)
    }
  }, [bewerken])
  return (
    <div>
      <p>Detailinhoud</p>
      <button type="button" onClick={() => setBewerken(true)}>Rekening bewerken</button>
      <BottomSheet
        open={bewerken}
        onClose={() => setBewerken(false)}
        title="Rekening bewerken"
        size="md"
      >
        <button type="button">Naam</button>
      </BottomSheet>
    </div>
  )
}

describe('M35 — Escape sluit alleen het bovenste venster', () => {
  afterEach(cleanup)

  it('sluit het bewerkscherm en laat de detailweergave terugkomen', async () => {
    render(<GastheerMetEscape />)

    fireEvent.click(screen.getByRole('button', { name: 'Rekening bewerken' }))
    expect(screen.getByRole('heading', { name: 'Rekening bewerken' })).toBeVisible()

    // Escape vanuit de geneste sheet — zoals in de browser, waar het doelwit
    // een element ín het bovenste venster is.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Naam' }), { key: 'Escape' })

    // Het bewerkscherm gaat dicht ...
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Rekening bewerken' })).not.toBeInTheDocument(),
    )
    // ... en de detailweergave komt terug in plaats van mee te sluiten.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Rekeningdetail' })).toBeVisible(),
    )
    expect(screen.getByText('Detailinhoud')).toBeVisible()
  })
})

/**
 * De teruggetreden sheet moet ONBEREIKBAAR zijn, niet alleen onzichtbaar.
 *
 * `display: none` haalt hem van het scherm, maar zijn knoppen blijven in de DOM
 * staan en blijven programmatisch bereikbaar — en een listener die één render
 * achterloopt (of na een fast-refresh blijft hangen) vuurt gewoon. Sluit de
 * ouder dan alsnog, dan verdwijnt het bovenste venster mét hem: precies het
 * live-defect waarbij één Escape alles sloot en er niets terugkwam.
 *
 * Vandaar de guard in `handleProgrammaticClose` zelf, op EVENT-tijd: geen enkel
 * sluitpad — X, Escape, backdrop — komt er nog doorheen zolang de sheet
 * teruggetreden is.
 */
describe('BottomSheet — een teruggetreden sheet sluit zichzelf nooit', () => {
  afterEach(cleanup)

  it('negeert de sluitknop die onder `display: none` bereikbaar blijft', () => {
    const onClose = vi.fn()
    render(
      <ShellOverlay open onClose={onClose} kind="sheet" title="Rekeningdetail" suspended>
        <p>Detailinhoud</p>
      </ShellOverlay>,
    )

    // Bewust een DOM-query en geen role-query: `aria-hidden` haalt de knop uit
    // de toegankelijkheidsboom, maar hij staat er nog en is precies zo
    // bereikbaar als voor de blijven-hangen-listener die het defect veroorzaakt.
    const sluiten = document.querySelector<HTMLButtonElement>('button[aria-label="Sluiten"]')
    expect(sluiten).not.toBeNull()
    fireEvent.click(sluiten!)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Detailinhoud')).toBeInTheDocument()
  })
})
