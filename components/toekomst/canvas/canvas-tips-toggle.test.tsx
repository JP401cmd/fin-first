/**
 * Render-test CanvasTipsToggle: aan = sluiten via de éne exit-handler (M38),
 * uit = persistent aanzetten. aria-pressed volgt de staat.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CanvasTipsToggle } from './canvas-tips-toggle'

function renderToggle(overlayVisible: boolean) {
  const handleOverlayExit = vi.fn()
  const persistOverlayVisible = vi.fn()
  render(
    <CanvasTipsToggle
      overlayVisible={overlayVisible}
      handleOverlayExit={handleOverlayExit}
      persistOverlayVisible={persistOverlayVisible}
    />,
  )
  return { handleOverlayExit, persistOverlayVisible }
}

describe('CanvasTipsToggle', () => {
  it('sluit de tips via handleOverlayExit wanneer ze aan staan', () => {
    const { handleOverlayExit, persistOverlayVisible } = renderToggle(true)
    const knop = screen.getByRole('button', { name: 'Aanscherp-tips verbergen' })
    expect(knop.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(knop)
    expect(handleOverlayExit).toHaveBeenCalledTimes(1)
    expect(persistOverlayVisible).not.toHaveBeenCalled()
  })

  it('zet de tips persistent aan wanneer ze uit staan', () => {
    const { handleOverlayExit, persistOverlayVisible } = renderToggle(false)
    const knop = screen.getByRole('button', { name: 'Aanscherp-tips tonen' })
    expect(knop.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(knop)
    expect(persistOverlayVisible).toHaveBeenCalledWith(true)
    expect(handleOverlayExit).not.toHaveBeenCalled()
  })
})
