import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { join } from 'node:path'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { SwapInSimple } from '@/components/app/swap-in-simple'
import { FiguresStrip } from '@/components/editorial'
import { Box1KostZin } from './box1-kost-zin'
import { computeBox1Tax } from '@/lib/box1-tax'
import { formatCurrency } from '@/lib/format'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * BEL-9 (besluit 6 sep 2026) — in Eenvoudig staat op de Box 1-hero één
 * gevolg-zin in plaats van de figures-strip; Volledig blijft de strip.
 *
 * `useDisplayMode()` valt búiten een `DisplayModeProvider` terug op 'simple'
 * (ADR 0026), dus élke render zet de modus expliciet — anders test je
 * ongemerkt de andere tak en blijft de suite groen op het verkeerde pad.
 */

const GROSS = 160_658
const motor = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })

/** De pagina-wiring: dezelfde swap als in box1/page.tsx. */
function renderHeroBlok(mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <SwapInSimple simple={<Box1KostZin result={motor} />}>
        <FiguresStrip
          figures={[
            { kicker: 'Geschat bruto', amount: formatCurrency(GROSS) },
            { kicker: 'Effectief tarief', amount: `${(motor.effectiveRate * 100).toFixed(1)}%` },
            { kicker: 'Marginaal tarief', amount: `${(motor.marginalRate * 100).toFixed(1)}%` },
            { kicker: 'Netto besteedbaar', amount: formatCurrency(Math.round(motor.nettoBesteedbaar)) },
          ]}
        />
      </SwapInSimple>
    </DisplayModeProvider>,
  )
}

describe('Box1KostZin — de zin zelf', () => {
  it('noemt het effectieve tarief en het netto besteedbaar uit de motor', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <Box1KostZin result={motor} />
      </DisplayModeProvider>,
    )
    const pct = Math.round(motor.effectiveRate * 100)
    expect(screen.getByText(`${pct}%`)).toBeTruthy()
    // `formatCurrency` zet een harde spatie tussen € en het bedrag; die
    // overleeft de DOM maar niet de tekst-normalisatie van getByText.
    expect(container.textContent).toContain(
      formatCurrency(Math.round(motor.nettoBesteedbaar)),
    )
    expect(container.textContent).toContain('naar Box 1')
    expect(container.textContent).toContain('je houdt')
  })

  it('null-pad: zonder bruto-inkomen géén zin (en zeker geen "0%")', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <Box1KostZin result={{ ...motor, grossYearlyIncome: 0, effectiveRate: 0 }} />
      </DisplayModeProvider>,
    )
    expect(container.textContent).toBe('')
  })

  it('WFT: beschrijvend, geen aanbeveling richting de jaarruimte-kans', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <Box1KostZin result={motor} />
      </DisplayModeProvider>,
    )
    const tekst = document.body.textContent ?? ''
    expect(tekst).toMatch(/ongeveer/)
    expect(tekst).not.toMatch(/lijfrente|stort|je moet|advies|zou je moeten/i)
  })
})

describe('Box1KostZin — de swap op de hero', () => {
  it('Eenvoudig: de zin, geen figures-strip', () => {
    const { container } = renderHeroBlok('simple')
    expect(container.querySelector('[data-figures-strip]')).toBeNull()
    expect(container.textContent).toContain('naar Box 1')
  })

  it('Volledig: de volledige strip (alle vier de cellen), geen zin', () => {
    const { container } = renderHeroBlok('full')
    const strip = container.querySelector('[data-figures-strip]')
    expect(strip).not.toBeNull()
    expect(strip!.children.length).toBe(4)
    expect(container.textContent).not.toContain('naar Box 1')
  })
})

/**
 * Bron-asserties. De zin vertaalt twee canonieke motorvelden; zodra hij een
 * eigen fiscale bron binnenhaalt is hij geen weergave meer maar een tweede
 * rekenpad — precies het defect dat de consume-don't-recompute-regel afdekt.
 * Commentaar wordt eerst gestript: de docstring benóemt de verboden bronnen.
 */
describe('Box1KostZin — consume, don\'t recompute (bron-assertie)', () => {
  const bron = readSourceLF(
    join(process.cwd(), 'components', 'overview', 'belasting', 'box1-kost-zin.tsx'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('haalt geen tariefbron of vuistregel binnen', () => {
    expect(bron).not.toMatch(/BOX1_PARAMS/)
    expect(bron).not.toMatch(/deriveMarginaalTarief/)
    expect(bron).not.toMatch(/computeBox1Tax/)
    expect(bron).not.toMatch(/from '@\/lib\/box3-data'/)
  })

  it('leidt netto niet zelf af uit bruto − heffing', () => {
    // Toets op het PATROON, niet op één schrijfvorm: `result.tax`,
    // `result!.tax` en `result["tax"]` moeten alle drie geraakt worden.
    expect(bron).not.toMatch(/(grossYearlyIncome|belastbaarInkomen)\s*[-−]/)
    expect(bron).not.toMatch(/["']?\btax\b["']?\s*[)\]]?\s*[-−+*/]/)
  })

  it('bevat geen losse fiscale constante', () => {
    expect(bron).not.toMatch(/0\.(3575|3756|495|4950)\b/)
    expect(bron).not.toMatch(/\b(49[.,]5|35[.,]75|37[.,]56)\s*%/)
  })
})

/**
 * Pagina-wiring-grendel. De componenttests hierboven bewijzen dat de swap
 * wérkt, niet dat de pagina 'm gebruikt: `app/(app)/overzicht/belasting/box1/
 * page.tsx` is een async server-component en rendert niet in vitest. Deze
 * bron-scan bewaakt de call-site — inclusief het verbod op een terugkerende
 * `simpleFigures`-tak (dan zouden strip én zin allebei een Eenvoudig-antwoord
 * hebben) en op een call-site-`mode`-ternary (ADR 0026, aanvulling 28 aug).
 */
describe('Box 1-pagina — de hero swapt naar de zin', () => {
  const bron = readSourceLF(
    join(process.cwd(), 'app', '(app)', 'overzicht', 'belasting', 'box1', 'page.tsx'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('wikkelt de FiguresStrip in SwapInSimple met de kostzin', () => {
    expect(bron).toMatch(/<SwapInSimple simple=\{<Box1KostZin/)
    expect(bron).toMatch(/<FiguresStrip figures=\{figures\}\s*\/>/)
  })

  it('draagt geen tweede Eenvoudig-tak meer (simpleFigures) en geen mode-ternary', () => {
    expect(bron).not.toMatch(/simpleFigures/)
    expect(bron).not.toMatch(/useDisplayMode|mode === ['"]simple['"]/)
  })
})
