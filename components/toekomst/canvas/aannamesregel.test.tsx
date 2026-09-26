import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { aannamesRegelTekst, type AannamesInput } from '@/lib/horizon/katern-copy'
import { Aannamesregel } from './aannamesregel'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const INPUT: AannamesInput = { stop: null, eindleeftijd: 90, inflatiePct: 2, rendementPct: 5, gebeurtenissen: 3 }

function renderRegel(mode: DisplayMode, input: AannamesInput = INPUT) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <Aannamesregel aannames={input} instellingenHref="/toekomst/instellingen" />
    </DisplayModeProvider>,
  )
}

/** De zichtbare regel zonder de link, met genormaliseerde witruimte. */
function regelTekst(): string {
  const p = screen.getByTestId('aannamesregel')
  return (p.firstElementChild?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

describe('Aannamesregel', () => {
  it('Volledig: de hele regel uit katern-copy', () => {
    renderRegel('full')
    expect(regelTekst()).toBe(aannamesRegelTekst(INPUT, 'volledig'))
  })

  it('Eenvoudig: zonder inflatie en rendement', () => {
    renderRegel('simple')
    expect(regelTekst()).toBe(aannamesRegelTekst(INPUT, 'eenvoudig'))
    expect(regelTekst()).not.toContain('inflatie')
    expect(regelTekst()).not.toContain('rendement')
  })

  it('vast anker: geen stopmoment-segment, de kop zegt het al (eigenaarsbesluit 26 sep)', () => {
    renderRegel('full', { ...INPUT, stop: { kind: 'age', stopAge: 60 } })
    expect(regelTekst()).not.toContain('stopmoment')
    expect(regelTekst()).toContain('plan tot je 90e')
  })

  it('één link, "Naar instellingen", naar de meegegeven href', () => {
    renderRegel('simple')
    const link = screen.getByRole('link', { name: /Naar instellingen/ })
    expect(link.getAttribute('href')).toBe('/toekomst/instellingen')
    expect(link.className).toContain('min-h-[44px]')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('het gebeurtenissen-segment is een telling zonder link: de gebeurtenissen staan op Plan zelf (70e7496c3)', () => {
    renderRegel('full')
    const segment = document.querySelector('[data-segment="gebeurtenissen"]') as HTMLElement
    expect(segment).toBeTruthy()
    expect(segment.closest('a')).toBeNull()
    expect(segment.querySelector('a')).toBeNull()
    // De enige link blijft "Naar instellingen" (de aannames staan daar), niet naar de gebeurtenissen.
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/toekomst/instellingen'])
  })
})
