import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { join } from 'node:path'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { SwapInSimple } from '@/components/app/swap-in-simple'
import { Box2SchijfZin } from './box2-schijf-zin'
import { calculateBox2, type Box2Result } from '@/lib/box2-data'
import { formatCurrency } from '@/lib/format'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * BEL-9 (besluit 6 sep 2026) — in Eenvoudig bleef van Box 2 alleen het
 * hero-bedrag over: de schijfregels zitten in de uitklap "Berekeningsstappen"
 * en die staat al in `HideInSimple`. Er staat nu één zin onder het bedrag die
 * de staffel in gewone taal zegt; Volledig blijft byte-identiek (lege
 * full-tak).
 */

const YEAR = 2026 as const
const fc = (v: number) => formatCurrency(v)

function resultaat(opts: { dividend: number | null; hasPartner?: boolean }): Box2Result {
  return calculateBox2({
    deelnemingen: [{ name: 'Holding BV', annual_dividend: opts.dividend, disposal_gain: 0 }],
    year: YEAR,
    hasPartner: opts.hasPartner ?? false,
    dailyExpenses: 100,
  })
}

const metDividend = resultaat({ dividend: 120_000 })
const metPartner = resultaat({ dividend: 120_000, hasPartner: true })
const zonderDividend = resultaat({ dividend: null })

function renderZin(result: Box2Result, toonGeenBedrag: boolean, mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <SwapInSimple
        simple={<Box2SchijfZin result={result} toonGeenBedrag={toonGeenBedrag} fc={fc} />}
      >
        {null}
      </SwapInSimple>
    </DisplayModeProvider>,
  )
}

describe('Box2SchijfZin — Eenvoudig', () => {
  it('noemt de schijfgrens en beide tarieven uit de motor-params', () => {
    const { container } = renderZin(metDividend, false, 'simple')
    const tekst = container.textContent ?? ''
    expect(tekst).toContain(fc(metDividend.params.grens))
    expect(tekst).toContain((metDividend.params.tariefLaag * 100).toFixed(1).replace('.', ',') + '%')
    expect(tekst).toContain((metDividend.params.tariefHoog * 100).toFixed(1).replace('.', ',') + '%')
  })

  it('met fiscaal partner: de verdubbelde grens, en dat staat er ook bij', () => {
    const { container } = renderZin(metPartner, false, 'simple')
    const tekst = container.textContent ?? ''
    expect(metPartner.params.grensPartner).toBeGreaterThan(metPartner.params.grens)
    expect(tekst).toContain(fc(metPartner.params.grensPartner))
    expect(tekst).toContain('samen met je fiscaal partner')
  })

  it('null-pad (H26): geen zin zodra de kaart geen bedrag toont', () => {
    expect(zonderDividend.dividendOnbekend).toBe(true)
    const { container } = renderZin(zonderDividend, true, 'simple')
    expect(container.textContent).toBe('')
  })

  it('WFT: beschrijvend, geen uitkeer-aanbeveling, mét voetregel', () => {
    const { container } = renderZin(metDividend, false, 'simple')
    const tekst = container.textContent ?? ''
    expect(tekst).not.toMatch(/keer .* uit|je moet|zou je moeten/i)
    expect(tekst).toContain('Indicatie, geen advies')
  })
})

describe('Box2SchijfZin — Volledig blijft ongewijzigd', () => {
  it('rendert niets in Volledig (de schijfregels staan daar al)', () => {
    const { container } = renderZin(metDividend, false, 'full')
    expect(container.textContent).toBe('')
  })
})

describe('Box2SchijfZin — consume, don\'t recompute (bron-assertie)', () => {
  const bron = readSourceLF(
    join(process.cwd(), 'components', 'overview', 'belasting', 'box2-schijf-zin.tsx'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('leest de staffel uit params en haalt geen eigen bron binnen', () => {
    expect(bron).toMatch(/params\??\.?\[?["']?tariefLaag/)
    expect(bron).not.toMatch(/BOX2_PARAMS/)
    expect(bron).not.toMatch(/calculateBox2/)
  })

  it('bevat geen losse fiscale constante', () => {
    expect(bron).not.toMatch(/0\.(245|31|33)\b/)
    expect(bron).not.toMatch(/\b(24[.,]5|31[.,]0|33[.,]0)\s*%/)
  })
})

/**
 * Call-site-grendel: `box2-detail.tsx` is een client-component die zijn data
 * zelf via `fetch` haalt, dus de zin-in-de-kaart is niet zonder netwerk-mock
 * te renderen. Deze bron-scan bewaakt de wiring — SwapInSimple (geen
 * call-site-ternary, ADR 0026) en het doorgeven van de null-pad-vlag.
 */
describe('Box 2-kaart — de zin hangt aan SwapInSimple', () => {
  const bron = readSourceLF(
    join(process.cwd(), 'components', 'overview', 'box2-detail.tsx'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('gebruikt SwapInSimple met de null-pad-vlag', () => {
    expect(bron).toMatch(/<SwapInSimple simple=\{<Box2SchijfZin/)
    expect(bron).toMatch(/toonGeenBedrag=\{toonGeenBedrag\}/)
  })

  it('gebruikt geen mode-ternary op de call-site', () => {
    expect(bron).not.toMatch(/useDisplayMode|mode === ['"]simple['"]/)
  })
})
