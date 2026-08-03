// ── Voorselectie: de stap die bepaalt of het model überhaupt aan bod komt ─────

import { describe, it, expect } from 'vitest'
import {
  selectAangifteWindows,
  detectTaxYear,
  peildatumFor,
  MAX_WINDOW_CHARS,
  MAX_WINDOWS,
} from './section-select'

const AANGIFTE_PAGINA = `Aangifte inkomstenbelasting 2024
Box 3 — Bank- en spaartegoeden                 Waarde 01-01-2024
ING Bank betaalrekening                        €     3.450
ASN Bank spaarrekening                         €    18.200
Schulden in Box 3
Studieschuld DUO                               €     8.300`

const JAAROPGAAF_PAGINA = `Jaaropgaaf 2024 — Werkgever ACME B.V.
Loon SV                              € 65.000
Loonheffing                          € 18.250
Arbeidskorting                       €  4.150`

describe('selectAangifteWindows', () => {
  it('snijdt op de aangifte-kopteksten en labelt de deelvraag', () => {
    const windows = selectAangifteWindows([AANGIFTE_PAGINA])
    expect(windows.map((w) => w.heading)).toEqual(['Bank- en spaartegoeden', 'Schulden in Box 3'])
    expect(windows.map((w) => w.kind)).toEqual(['assets', 'debts'])
  })

  it('laat het bezittingen-venster stoppen vóór de schuldenkop', () => {
    const [assetsWindow] = selectAangifteWindows([AANGIFTE_PAGINA])
    expect(assetsWindow!.text).toContain('ASN Bank spaarrekening')
    expect(assetsWindow!.text).not.toContain('Studieschuld DUO')
  })

  it('kiest de LANGSTE koptekst: "Schulden in Box 3" wint van "Schulden"', () => {
    const windows = selectAangifteWindows(['Schulden in Box 3\nPersoonlijke lening € 4.500'])
    expect(windows).toHaveLength(1)
    expect(windows[0]!.heading).toBe('Schulden in Box 3')
  })

  it('GEEN aangifte-koptekst → lege lijst (een jaaropgaaf is geen aangifte)', () => {
    expect(selectAangifteWindows([JAAROPGAAF_PAGINA])).toEqual([])
  })

  it('negeert een kale koptekst zonder rijen (inhoudsopgave)', () => {
    expect(selectAangifteWindows(['Beleggingen'])).toEqual([])
  })

  it('kapt een uitdijend venster af op de maximale venstergrootte', () => {
    const lang = `Beleggingen\n${'DEGIRO portefeuille € 1.000\n'.repeat(500)}`
    const [win] = selectAangifteWindows([lang])
    expect(win!.text.length).toBeLessThanOrEqual(MAX_WINDOW_CHARS)
  })

  it('houdt het aantal vensters onder de bovengrens', () => {
    const pagina = 'Beleggingen\nDEGIRO portefeuille € 1.000\n'
    const windows = selectAangifteWindows(Array.from({ length: 40 }, () => pagina))
    expect(windows.length).toBeLessThanOrEqual(MAX_WINDOWS)
  })

  it('registreert het paginanummer 1-gebaseerd', () => {
    const windows = selectAangifteWindows(['niets hier', AANGIFTE_PAGINA])
    expect(windows[0]!.page).toBe(2)
  })
})

describe('detectTaxYear', () => {
  it('leest het jaar uit de documenttitel', () => {
    expect(detectTaxYear('Aangifte inkomstenbelasting 2024', 2099)).toBe(2024)
  })

  it('leest het jaar uit "Belastingjaar"', () => {
    expect(detectTaxYear('Belastingjaar: 2023', 2099)).toBe(2023)
  })

  it('leest het jaar uit een peildatum-vermelding', () => {
    expect(detectTaxYear('Waarde 01-01-2022', 2099)).toBe(2022)
  })

  it('valt terug op de jaarkiezer als de tekst geen jaar noemt', () => {
    expect(detectTaxYear('Bank- en spaartegoeden', 2021)).toBe(2021)
  })

  it('pakt een bedrag NOOIT voor een jaartal aan', () => {
    // "€ 2.024" is 2024 na het strippen van de punt — maar het staat niet in een
    // jaar-patroon, dus de fallback moet winnen.
    expect(detectTaxYear('Spaarrekening € 2.024', 2020)).toBe(2020)
  })
})

describe('peildatumFor', () => {
  it('is altijd 1 januari van het aangiftejaar', () => {
    expect(peildatumFor(2024)).toBe('2024-01-01')
  })
})
