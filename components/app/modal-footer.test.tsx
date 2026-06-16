/**
 * Unit-test voor ModalFooter — de gedeelde primary/secondary footer-bar.
 *
 * Dekt de gedrag-beloften die de adoptie behoudend houden:
 *  1. Rendert primary + (optioneel) secondary, met labels.
 *  2. onClick van beide knoppen wordt aangeroepen.
 *  3. `disabled` en `loading` blokkeren de primary (en loading toont " …").
 *  4. `secondary.disabled` blokkeert de secondary.
 *  5. `layout="stacked"` voegt `flex-1` toe (mobiele full-width-stapeling);
 *     `layout="inline"` doet dat niet.
 *  6. De canonieke ink/paper-knop-classes zijn aanwezig (visuele identiteit).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModalFooter } from './modal-footer'

describe('ModalFooter', () => {
  it('rendert primary en secondary met labels', () => {
    render(
      <ModalFooter
        primary={{ label: 'Opslaan', onClick: vi.fn() }}
        secondary={{ label: 'Annuleren', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuleren' })).toBeInTheDocument()
  })

  it('rendert alleen primary wanneer secondary ontbreekt', () => {
    render(<ModalFooter primary={{ label: 'Opslaan', onClick: vi.fn() }} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('roept de onClicks aan bij klik', () => {
    const onPrimary = vi.fn()
    const onSecondary = vi.fn()
    render(
      <ModalFooter
        primary={{ label: 'Opslaan', onClick: onPrimary }}
        secondary={{ label: 'Annuleren', onClick: onSecondary }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).toHaveBeenCalledTimes(1)
  })

  it('blokkeert de primary bij disabled', () => {
    const onPrimary = vi.fn()
    render(
      <ModalFooter primary={{ label: 'Opslaan', onClick: onPrimary, disabled: true }} />,
    )
    const btn = screen.getByRole('button', { name: 'Opslaan' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onPrimary).not.toHaveBeenCalled()
  })

  it('blokkeert de primary bij loading en toont " …"', () => {
    const onPrimary = vi.fn()
    render(<ModalFooter primary={{ label: 'Opslaan', onClick: onPrimary, loading: true }} />)
    const btn = screen.getByRole('button', { name: /Opslaan …/ })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onPrimary).not.toHaveBeenCalled()
  })

  it('respecteert secondary.disabled', () => {
    const onSecondary = vi.fn()
    render(
      <ModalFooter
        primary={{ label: 'Opslaan', onClick: vi.fn() }}
        secondary={{ label: 'Annuleren', onClick: onSecondary, disabled: true }}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Annuleren' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onSecondary).not.toHaveBeenCalled()
  })

  it('voegt flex-1 toe bij layout="stacked" (mobiele full-width-stapeling)', () => {
    render(
      <ModalFooter
        layout="stacked"
        primary={{ label: 'Opslaan', onClick: vi.fn() }}
        secondary={{ label: 'Annuleren', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Opslaan' }).className).toContain('flex-1')
    expect(screen.getByRole('button', { name: 'Annuleren' }).className).toContain('flex-1')
  })

  it('gebruikt GEEN flex-1 bij layout="inline" (knoppen naast elkaar)', () => {
    render(
      <ModalFooter
        layout="inline"
        primary={{ label: 'Opslaan', onClick: vi.fn() }}
        secondary={{ label: 'Annuleren', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Opslaan' }).className).not.toContain('flex-1')
  })

  it('houdt de canonieke ink/paper-knop-classes aan', () => {
    render(
      <ModalFooter
        primary={{ label: 'Opslaan', onClick: vi.fn() }}
        secondary={{ label: 'Annuleren', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Opslaan' }).className).toContain('bg-[var(--ink)]')
    expect(screen.getByRole('button', { name: 'Opslaan' }).className).toContain('min-h-11')
    const secondary = screen.getByRole('button', { name: 'Annuleren' })
    expect(secondary.className).toContain('border-2')
    expect(secondary.className).toContain('border-[var(--ink)]')
  })

  it('zet type=submit op de primary wanneer gevraagd', () => {
    render(
      <ModalFooter primary={{ label: 'Opslaan', onClick: vi.fn(), type: 'submit' }} />,
    )
    expect(screen.getByRole('button', { name: 'Opslaan' })).toHaveAttribute('type', 'submit')
  })
})
