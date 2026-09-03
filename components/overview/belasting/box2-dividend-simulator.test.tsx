import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { Box2DividendSimulator } from './box2-dividend-simulator'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { BOX2_PARAMS, calculateBox2 } from '@/lib/box2-data'
import { BOX2_SIMULATOR_SCHAAL_FACTOR } from '@/lib/constants'
import { formatCurrency } from '@/lib/format'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Bevinding H26 — "Box 2 toont €0 én €16.867 tegelijk".
 *
 * Drie dingen worden hier vastgelegd:
 *  1. NEUTRALE DEFAULT — de schuif start op het WERKELIJKE Box 2-inkomen, niet
 *     op de schijfgrens. Bij €0 inkomen staat er dus géén €16.867-heffing onder
 *     een kop van €0, en de default is geen impliciete aanbeveling meer.
 *  2. ÉÉN MOTOR — elk bedrag op het scherm komt uit `calculateBox2`, inclusief
 *     de afronding op centen en de `dgaExcessTax`-tak. De verwijderde
 *     `splitDividend()` rekende ongerond en kende die tak niet.
 *  3. GENOEMDE SCHAAL — de bovengrens van de schuif komt uit
 *     `BOX2_SIMULATOR_SCHAAL_FACTOR` (lib/constants.ts), niet uit een `1.3` in
 *     het component.
 *
 * RENDEREN IN "VOLLEDIG" IS LOAD-BEARING: `useDisplayMode()` valt búiten een
 * `DisplayModeProvider` terug op 'simple', en `FiguresStrip` kapt dan af op twee
 * cellen — waarmee de "Effectief tarief"-cel verdwijnt. Zelfde reden als in
 * box2-gecombineerde-druk.test.tsx.
 */

const YEAR = 2026 as const
const params = BOX2_PARAMS[YEAR]

function renderSim(props: Parameters<typeof Box2DividendSimulator>[0] = {}) {
  return render(
    <DisplayModeProvider initialMode="full">
      <Box2DividendSimulator year={YEAR} {...props} />
    </DisplayModeProvider>,
  )
}

function slider(): HTMLInputElement {
  return screen.getByLabelText('Dividend dit jaar') as HTMLInputElement
}

/** De broncode van het component zónder commentaar — invoer voor de grendels. */
function simulatorCode(): string {
  // CRLF-veilig (zie lib/test-utils/read-source.ts): de /gm-strip hieronder
  // slaat stil terug op een verse Windows-checkout zonder normalisatie.
  const src = readSourceLF(
    join(process.cwd(), 'components/overview/belasting/box2-dividend-simulator.tsx'),
  )
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Wat de canonieke motor bij dit scenario zegt — de enige toegestane bron. */
function motor(dividend: number, opts: { hasPartner?: boolean; dailyExpenses?: number; dgaLeningenTotal?: number } = {}) {
  return calculateBox2({
    deelnemingen: [{ name: 'simulatie', annual_dividend: dividend, disposal_gain: 0 }],
    year: YEAR,
    hasPartner: opts.hasPartner ?? false,
    dailyExpenses: opts.dailyExpenses ?? 0,
    dgaLeningenTotal: opts.dgaLeningenTotal,
  })
}

describe('Box2DividendSimulator — neutrale default (H26)', () => {
  it('start op het werkelijke Box 2-inkomen, NIET op de schijfgrens', () => {
    renderSim({ defaultDividend: 0 })
    expect(slider().value).toBe('0')
    expect(slider().value).not.toBe(String(params.grens))
  })

  it('toont bij €0 inkomen geen hypothetische heffing vóór interactie', () => {
    const { container } = renderSim({ defaultDividend: 0 })
    const text = container.textContent ?? ''
    // Exact de vier getallen uit de bevinding — geen ervan mag zonder klik verschijnen.
    expect(text).not.toContain('16.867')
    expect(text).not.toContain('51.976')
    // Ook geen oordeel over een uitkering die er niet is: bij €0 nodigt de
    // verdict-regel uit tot schuiven i.p.v. "je blijft in de lage schijf".
    expect(text).not.toContain('Je blijft volledig in de lage schijf')
    expect(text).toContain('Nog geen uitkering ingevuld')
    // Wat er wél staat: nul, gelijk aan de kop erboven.
    expect(text).toContain(formatCurrency(0))
  })

  it('reproduceert bij eerste render exact de kop (heffing == motor op het werkelijke inkomen)', () => {
    const werkelijk = 90_000
    const verwacht = motor(werkelijk)
    const { container } = renderSim({ defaultDividend: werkelijk })
    expect(slider().value).toBe(String(werkelijk))
    expect(container.textContent).toContain(formatCurrency(verwacht.totalTaxInclDga))
  })

  it('benoemt de wat-als-status vóór de bedragen, en wisselt zodra je schuift', () => {
    const { container } = renderSim({ defaultDividend: 12_000 })
    expect(container.textContent).toContain('Wat-als')
    expect(container.textContent).toContain('De schuif staat op je werkelijke Box 2-inkomen')

    fireEvent.change(slider(), { target: { value: '80000' } })
    expect(container.textContent).toContain('niet bij je huidige situatie')
    expect(container.textContent).toContain(formatCurrency(12_000))
  })

  it('zegt bij een niet-ingevuld dividend dat het niet ingevuld is (NULL ≠ 0)', () => {
    const { container } = renderSim({ defaultDividend: 0, dividendOnbekend: true })
    expect(container.textContent).toContain('nog niet ingevuld')
  })
})

describe('Box2DividendSimulator — één motor (H26)', () => {
  it('elk bedrag komt byte-gelijk uit calculateBox2, inclusief de centen-afronding', () => {
    // Exact op de grens: hier verschilden motor (16.866,54) en de verwijderde
    // simulator-kopie (16.866,535). Tolerantie is ABSOLUUT (€0,01) — een
    // afrondings-, geen schaalvraag.
    const { container } = renderSim({ defaultDividend: params.grens })
    const r = motor(params.grens)
    const text = container.textContent ?? ''

    expect(r.totalTax).toBe(16_866.54)
    expect(text).toContain(formatCurrency(r.taxLow))
    expect(text).toContain(formatCurrency(r.taxHigh))
    expect(text).toContain(formatCurrency(r.incomeLow))
    expect(text).toContain(formatCurrency(r.totalTaxInclDga))
    // Netto = dividend − heffing over het dividend.
    expect(text).toContain(formatCurrency(params.grens - r.totalTax))
  })

  it('kent de dgaExcessTax-tak die de oude kopie miste', () => {
    const dgaLeningenTotal = 800_000
    const dividend = 40_000
    const r = motor(dividend, { dgaLeningenTotal })
    expect(r.dgaExcessTax).toBeGreaterThan(0)

    const { container } = renderSim({ defaultDividend: dividend, dgaLeningenTotal })
    const text = container.textContent ?? ''
    expect(text).toContain('Extra heffing excessief lenen')
    expect(text).toContain(formatCurrency(r.dgaExcessTax))
    // De hoofduitkomst is inclusief DGA — dezelfde grootheid als de kop.
    expect(text).toContain(formatCurrency(r.totalTaxInclDga))
    expect(r.totalTaxInclDga).not.toBe(r.totalTax)
  })

  it('gebruikt het canonieke dagtarief voor de vrijheidsdagen', () => {
    const dividend = 100_000
    const r = motor(dividend, { dailyExpenses: 120 })
    const { container } = renderSim({ defaultDividend: dividend, dailyExpenses: 120 })
    expect(container.textContent).toContain(`${r.freedomDays} vrijheidsdagen`)
  })

  it('volgt de partner-grens van de motor', () => {
    const dividend = 100_000
    const single = motor(dividend)
    const metPartner = motor(dividend, { hasPartner: true })
    expect(single.incomeHigh).toBeGreaterThan(0)
    expect(metPartner.incomeHigh).toBe(0)

    const { container } = renderSim({ defaultDividend: dividend, hasPartner: true })
    expect(container.textContent).toContain(formatCurrency(metPartner.totalTaxInclDga))
  })

  it('BRON-GRENDEL: het component past zelf geen tarief meer toe', () => {
    // Commentaar eruit: de docstring benoemt de verwijderde kopie expliciet, en
    // die uitleg moet blijven staan. De grendel gaat over CODE, niet over proza.
    expect(simulatorCode()).not.toContain('splitDividend')
    // Geen eigen vermenigvuldiging met een tarief — dat is de motor zijn werk.
    expect(simulatorCode()).not.toMatch(/tarief(Laag|Hoog)\s*\*/)
    expect(simulatorCode()).not.toMatch(/\*\s*params\.tarief(Laag|Hoog)/)
    // Geen losse fiscale literals in de tekst (tarieven komen uit BOX2_PARAMS).
    expect(simulatorCode()).not.toContain('24,5%')
    expect(simulatorCode()).not.toContain('(31%)')
    // De motor wordt daadwerkelijk aangeroepen.
    expect(simulatorCode()).toContain('calculateBox2(')
  })
})

/**
 * Zelfde mechanisme als WF-BELAST-10-bug1 (jaarruimte-slider): een native
 * numerieke `step` saneert de berekende startstand naar een veelvoud, buiten
 * React om. Het werkelijke dividend is zelden een 1000-voud, dus de thumb week
 * in de browser af van de kop die hij per constructie hoort te spiegelen
 * (€45.678 → DOM 46.000). jsdom saneert niet; vastgelegd wordt de invariant.
 */
describe('Box2DividendSimulator — startstand exact, stapraster alleen bij interactie', () => {
  it('draagt géén numerieke step en start exact op een niet-1000-voud dividend', () => {
    const werkelijk = 45_678
    const { container } = renderSim({ defaultDividend: werkelijk })
    expect(werkelijk % 1000).not.toBe(0)
    expect(slider().step).toBe('any')
    expect(slider().value).toBe(String(werkelijk))
    expect(container.textContent).toContain(formatCurrency(motor(werkelijk).totalTaxInclDga))
  })

  it('slepen en pijltjes snappen op het 1000-raster, vanaf de startstand naar het eerstvolgende', () => {
    renderSim({ defaultDividend: 45_678 })
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(slider().value).toBe('46000')
    fireEvent.change(slider(), { target: { value: '52400' } })
    expect(slider().value).toBe('52000')
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(slider().value).toBe('51000')
  })
})

describe('Box2DividendSimulator — genoemde schaal i.p.v. magic number (H26, optie B)', () => {
  it('leidt de bovengrens af uit BOX2_SIMULATOR_SCHAAL_FACTOR', () => {
    const verwacht = Math.round((params.grensPartner * BOX2_SIMULATOR_SCHAAL_FACTOR) / 1000) * 1000
    renderSim({ defaultDividend: 0 })
    expect(slider().max).toBe(String(verwacht))
  })

  it('BRON-GRENDEL: geen kale 1.3 meer in het component', () => {
    expect(simulatorCode()).not.toMatch(/grensPartner\s*\*\s*1\.3/)
    expect(simulatorCode()).toContain('BOX2_SIMULATOR_SCHAAL_FACTOR')
  })

  it('legt expliciet uit dat de schaal geen uitkeercapaciteit is', () => {
    const { container } = renderSim({ defaultDividend: 0 })
    expect(container.textContent).toContain('geen uitkeercapaciteit')
  })

  it('rekt de schaal op wanneer het werkelijke inkomen erboven ligt', () => {
    // Anders zou de schuif zijn eigen startstand niet kunnen weergeven en zou de
    // kop opnieuw van de simulator afwijken.
    const groot = 400_000
    renderSim({ defaultDividend: groot })
    expect(Number(slider().max)).toBeGreaterThanOrEqual(groot)
    expect(slider().value).toBe(String(groot))
  })
})
