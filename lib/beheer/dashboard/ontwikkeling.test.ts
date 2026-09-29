import { describe, expect, it } from 'vitest'
import type { FoutMomenten, VitalsReeks } from './loader'
import { bouwFoutenVerloop, bouwVitalsVerloop, bronStatus } from './ontwikkeling'

const NU = new Date('2026-09-29T10:00:00Z')

describe('bouwFoutenVerloop', () => {
  const momenten: FoutMomenten = {
    alle: ['2026-09-25T09:00:00Z', '2026-09-27T09:00:00Z', '2026-09-28T09:00:00Z', '2026-09-29T09:00:00Z'],
    ai: ['2026-09-28T09:00:00Z'],
    afgekaptVanaf: null,
    vensterGrootte: 1000,
  }

  it('toont de dagen van de periode en vergelijkt volle dagen', () => {
    const v = bouwFoutenVerloop(momenten, 'alle', { nu: NU, dagen: 2 })
    expect(v.reeks.map((p) => p.dag)).toEqual(['2026-09-28', '2026-09-29'])
    expect(v.volledig).toHaveLength(5)
    expect(v.vergelijking.huidig.aantal).toBe(2)
    expect(v.vergelijking.vorig.aantal).toBe(1)
  })

  it('kiest de AI-fouten als daarom gevraagd wordt', () => {
    const v = bouwFoutenVerloop(momenten, 'ai', { nu: NU, dagen: 2 })
    expect(v.vergelijking.huidig.aantal).toBe(1)
    expect(v.vergelijking.vorig.aantal).toBe(0)
  })

  it('geeft de grens van een afgekapt venster door aan de reeks', () => {
    const v = bouwFoutenVerloop({ ...momenten, afgekaptVanaf: '2026-09-26T09:00:00Z' }, 'alle', { nu: NU, dagen: 2 })
    expect(v.afgekaptVanaf).toBe('2026-09-26T09:00:00Z')
    expect(v.volledig.find((p) => p.dag === '2026-09-26')?.aantal).toBeNull()
    expect(v.vergelijking.verschil).toBeNull()
    // De getoonde periode zelf valt na de grens en is wel gemeten.
    expect(v.reeks.every((p) => p.aantal !== null)).toBe(true)
  })
})

describe('bouwVitalsVerloop', () => {
  const reeks: VitalsReeks = {
    dagen: 7,
    samenvatting: [
      { metric: 'LCP', p75: 2100, metingen: 640 },
      { metric: 'CLS', p75: 0.05, metingen: 640 },
    ],
    perDag: [
      { dag: '2026-09-27', metric: 'LCP', p75: 2000, metingen: 90 },
      { dag: '2026-09-29', metric: 'LCP', p75: 2300, metingen: 12 },
      { dag: '2026-09-27', metric: 'CLS', p75: 0.04, metingen: 90 },
    ],
  }

  it('geeft elke dag van de periode, ook de dagen zonder metingen', () => {
    const v = bouwVitalsVerloop(reeks, 'LCP', NU)
    expect(v.reeks).toHaveLength(7)
    expect(v.reeks[0].dag).toBe('2026-09-23')
    expect(v.reeks[6]).toMatchObject({ dag: '2026-09-29', p75: 2300, lopend: true })
  })

  it('een dag zonder metingen heeft geen p75: niet gemeten, geen nul', () => {
    const v = bouwVitalsVerloop(reeks, 'LCP', NU)
    expect(v.reeks.find((p) => p.dag === '2026-09-28')).toMatchObject({ p75: null, metingen: 0 })
  })

  it('houdt de maten uit elkaar', () => {
    const v = bouwVitalsVerloop(reeks, 'CLS', NU)
    expect(v.p75).toBe(0.05)
    expect(v.reeks.find((p) => p.dag === '2026-09-27')?.p75).toBe(0.04)
    expect(v.reeks.find((p) => p.dag === '2026-09-29')?.p75).toBeNull()
  })

  it('een maat zonder metingen heeft geen p75 over de periode', () => {
    const v = bouwVitalsVerloop(reeks, 'INP', NU)
    expect(v.p75).toBeNull()
    expect(v.metingen).toBe(0)
    expect(v.reeks.every((p) => p.p75 === null)).toBe(true)
  })

  it('een samenvatting met nul metingen geldt als geen meting', () => {
    const v = bouwVitalsVerloop(
      { ...reeks, samenvatting: [{ metric: 'LCP', p75: 0, metingen: 0 }] },
      'LCP',
      NU,
    )
    expect(v.p75).toBeNull()
  })
})

describe('bronStatus', () => {
  it('onderscheidt gelezen, niet uitgerold en mislukt', () => {
    expect(bronStatus({ soort: 'ok', data: 1 })).toBe('ok')
    expect(bronStatus({ soort: 'niet-uitgerold' })).toBe('nvt')
    expect(bronStatus({ soort: 'fout' })).toBe('meting-mislukt')
  })
})
