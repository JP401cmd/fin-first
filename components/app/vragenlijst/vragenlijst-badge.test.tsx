/**
 * De teller op Fins bubbel (ADR 0147) — een bewuste uitzondering op "geen
 * badges op Fin". Wat hier vastligt: hij verschijnt alleen als er écht iets in
 * te vullen is, hij kapt af op 9+, en zijn naam zegt in gewone taal wat het
 * getal betekent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const signaal = vi.hoisted(() => ({ waarde: null as { openCount: number } | null }))
vi.mock('./vragenlijst-signaal-provider', () => ({
  useVragenlijstSignaalOptional: () => signaal.waarde,
}))

import { VragenlijstBadge } from './vragenlijst-badge'

beforeEach(() => {
  signaal.waarde = { openCount: 0 }
})

describe('VragenlijstBadge', () => {
  it('rendert niets bij nul', () => {
    const { container } = render(<VragenlijstBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rendert niets buiten de provider', () => {
    signaal.waarde = null
    const { container } = render(<VragenlijstBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('toont het aantal', () => {
    signaal.waarde = { openCount: 3 }
    render(<VragenlijstBadge />)
    expect(screen.getByTestId('vragenlijst-badge')).toHaveTextContent('3')
  })

  it('kapt af op 9+', () => {
    signaal.waarde = { openCount: 12 }
    render(<VragenlijstBadge />)
    expect(screen.getByTestId('vragenlijst-badge')).toHaveTextContent('9+')
  })

  it('draagt een naam in gewone taal — enkelvoud bij één', () => {
    signaal.waarde = { openCount: 1 }
    render(<VragenlijstBadge />)
    expect(screen.getByLabelText('1 vragenlijst om in te vullen')).toBeInTheDocument()
  })

  it('draagt een naam in gewone taal — meervoud daarboven', () => {
    signaal.waarde = { openCount: 4 }
    render(<VragenlijstBadge />)
    expect(screen.getByLabelText('4 vragenlijsten om in te vullen')).toBeInTheDocument()
  })
})
