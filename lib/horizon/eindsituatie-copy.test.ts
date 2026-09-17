import { describe, it, expect } from 'vitest'
import type { EindOorzaakId, EindsituatieDuiding } from './eindsituatie-duiding'
import { buildEindsituatieCopy, type EindsituatieCopy } from './eindsituatie-copy'

const n = (age: number, bedrag: number) => ({ age, bedrag, inflationFactor: 1 })
const bedragTekst = (b: { bedrag: number }) => `€ ${Math.round(b.bedrag).toLocaleString('nl-NL')}`

const ALLE: EindOorzaakId[] = ['nu-stoppen', 'geen-tekort-lening', 'opeet-plafond', 'later-inkomen', 'late-baten', 'dalend-profiel']

function duiding(ids: EindOorzaakId[], over: Partial<EindsituatieDuiding> = {}): EindsituatieDuiding {
  return {
    eindAge: 90,
    overschot: n(90, 900_000),
    dieptepunt: n(67, 5_000),
    oorzaken: ids.map((id) => ({ id, age: 67.6, bedrag: n(67, 5_000) })),
    context: { huis: n(90, 2_000_000), opeetschuld: n(90, 1_200_000) },
    eenduidig: ids.filter((i) => ['nu-stoppen', 'geen-tekort-lening', 'opeet-plafond'].includes(i)).length === 1,
    ...over,
  }
}

// Zonder de disclaimer: die zegt letterlijk "geen advies".
const tekst = (c: EindsituatieCopy) => [c.kop, c.samenvatting, ...c.oorzaken, c.context ?? '', c.onduidelijk ?? '', c.finVraag].join(' ')

describe('buildEindsituatieCopy', () => {
  it('a1 noemt de standaardinstelling, de leeftijd (heel) en het dieptepunt', () => {
    const c = buildEindsituatieCopy({ duiding: duiding(['geen-tekort-lening']), endForm: 'deplete', bedragTekst })
    expect(c.kop).toContain('vermogen opeten')
    expect(c.oorzaken[0]).toContain('geen tekort-lening gebruikt (standaard)')
    expect(c.oorzaken[0]).toContain('je 67e')
    expect(c.oorzaken[0]).toContain('€ 5.000')
    expect(c.onduidelijk).toBeNull()
  })

  it('a1 met een dieptepunt ≤ €0 (korte brug) noemt geen negatief bedrag', () => {
    const d = duiding(['geen-tekort-lening'])
    d.oorzaken[0].bedrag = n(68, -102_570)
    const c = buildEindsituatieCopy({ duiding: d, endForm: 'deplete', bedragTekst })
    expect(c.oorzaken[0]).toContain('daar is je liquide geld op.')
    expect(c.oorzaken[0]).not.toMatch(/-\s?\d|bijna op/)
  })

  it('huis en opeetschuld worden apart benoemd', () => {
    const c = buildEindsituatieCopy({ duiding: duiding(['geen-tekort-lening']), endForm: 'deplete', bedragTekst })
    expect(c.context).toContain('de overwaarde van je huis (€ 2.000.000) telt niet mee in "opeten"')
    expect(c.context).toContain('de opeetschuld (€ 1.200.000) staat tegenover je huis')
    expect(c.context).not.toMatch(/afgelost/)
  })

  it('niet eenduidig: meerdere bindende oorzaken en geen oorzaak krijgen elk een eigen zin', () => {
    expect(buildEindsituatieCopy({ duiding: duiding(['geen-tekort-lening', 'opeet-plafond']), endForm: 'deplete', bedragTekst }).onduidelijk).toContain('meerdere regels')
    expect(buildEindsituatieCopy({ duiding: duiding([]), endForm: 'deplete', bedragTekst }).onduidelijk).toContain('niet één regel')
  })

  it('de Fin-vraag bevat geen bedragen', () => {
    const c = buildEindsituatieCopy({ duiding: duiding(['late-baten']), endForm: 'legacy', bedragTekst })
    expect(c.finVraag).not.toMatch(/€|\d{3}/)
    expect(c.finVraag).toContain('90e')
  })

  it('toongrendel: geen opdracht, aanbeveling of belofte in welke combinatie ook', () => {
    for (const endForm of ['deplete', 'legacy', 'perpetual'] as const) {
      for (const id of ALLE) {
        const c = buildEindsituatieCopy({ duiding: duiding([id]), endForm, bedragTekst })
        const t = tekst(c)
        expect(t).not.toMatch(/je moet|moet je|wij raden|we raden|aanbevolen|advies(?!,)|kies voor|verhoog|verlaag je|gegarandeerd|zeker weten/i)
        expect(t).not.toMatch(/\d+[.,]\d+e\b/) // geen decimale leeftijd
      }
    }
  })
})
