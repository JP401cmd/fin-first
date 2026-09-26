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

  it('prop null (vast stop-anker) ⇒ geen regel', () => {
    const { container } = renderGetallen('full', null)
    expect(container.textContent).toBe('')
    expect(screen.queryByTestId('marktcheck-getallen')).toBeNull()
  })

  it('alle drie onbereikbaar ⇒ geen regel', () => {
    renderGetallen('full', { tegenzit: null, midden: null, meezit: null })
    expect(screen.queryByTestId('marktcheck-getallen')).toBeNull()
  })

  it('onbereikbaar tegenzit: de regel blijft, met "niet binnen je plan" op die plek', () => {
    renderGetallen('full', { tegenzit: null, midden: 58.2, meezit: 51.9 })
    const p = screen.getByTestId('marktcheck-getallen')
    expect(p.querySelector('.sr-only')?.textContent).toBe(
      'als het tegenzit niet binnen je plan · in het midden 58 · als het meezit 52',
    )
    const woorden = p.querySelector('[data-stand-onbereikbaar="tegenzit"]')
    expect(woorden?.textContent).toBe('niet binnen je plan')
    // Woorden krijgen niet de mono-cijferstijl; de twee getallen wel.
    expect(woorden?.className).not.toContain('font-mono')
    const getallen = Array.from(p.querySelectorAll('.font-mono')).map((n) => Number(n.textContent))
    expect(getallen).toEqual([heroFireAgeYear(58.2), heroFireAgeYear(51.9)])
  })

  it('onbereikbaar meezit (het andere uiteinde): "niet binnen je plan" als laatste stand', () => {
    renderGetallen('full', { ...L, meezit: null })
    const p = screen.getByTestId('marktcheck-getallen')
    expect(p.querySelector('.sr-only')?.textContent).toBe(
      'als het tegenzit 55 · in het midden 52 · als het meezit niet binnen je plan',
    )
    expect(p.querySelectorAll('[data-stand-onbereikbaar]')).toHaveLength(1)
    expect(p.querySelector('[data-stand-onbereikbaar="meezit"]')).not.toBeNull()
  })

  it('een niet-eindige leeftijd (datafout) ⇒ geen regel', () => {
    renderGetallen('full', { ...L, midden: Number.NaN })
    expect(screen.queryByTestId('marktcheck-getallen')).toBeNull()
  })

  it('Eenvoudig: niet getoond (de laag bestaat daar niet)', () => {
    renderGetallen('simple', L)
    expect(screen.queryByTestId('marktcheck-getallen')).toBeNull()
  })
})
