import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { heroFireAgeYear } from '@/lib/horizon/hero-fire-age'
import type { MarktcheckLeeftijden } from '@/lib/horizon/katern-copy'
import { MarktcheckGetallen } from './marktcheck-getallen'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const L: MarktcheckLeeftijden = { tegenzit: 55.4, midden: 52.3, meezit: 48.6 }

function renderGetallen(mode: DisplayMode, leeftijden: MarktcheckLeeftijden | null) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <MarktcheckGetallen leeftijden={leeftijden} />
    </DisplayModeProvider>,
  )
}

describe('MarktcheckGetallen', () => {
  it('drie leeftijden in hele jaren, in de volgorde tegenzit · midden · meezit', () => {
    renderGetallen('full', L)
    const p = screen.getByTestId('marktcheck-getallen')
    expect(p.querySelector('.sr-only')?.textContent).toBe('als het tegenzit 55 · in het midden 52 · als het meezit 49')
    const getallen = Array.from(p.querySelectorAll('.font-mono')).map((n) => Number(n.textContent))
    expect(getallen).toEqual([heroFireAgeYear(55.4), heroFireAgeYear(52.3), heroFireAgeYear(48.6)])
  })

  it('nooit "verwacht"', () => {
    renderGetallen('full', L)
    expect(screen.getByTestId('marktcheck-getallen').textContent).not.toMatch(/verwacht/i)
  })

  it('null of een ontbrekende leeftijd ⇒ geen regel', () => {
    const { container, rerender } = renderGetallen('full', null)
    expect(container.textContent).toBe('')
    rerender(
      <DisplayModeProvider initialMode="full">
        <MarktcheckGetallen leeftijden={{ ...L, meezit: null }} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByTestId('marktcheck-getallen')).toBeNull()
  })

  it('Eenvoudig: niet getoond (de laag bestaat daar niet)', () => {
    renderGetallen('simple', L)
    expect(screen.queryByTestId('marktcheck-getallen')).toBeNull()
  })
})
