import { describe, expect, it } from 'vitest'
import { laatsteDagen, reeksLengteVoor, somGemeten, telPerDag, vergelijkPerioden } from './reeksen'

const NU = new Date('2026-09-29T10:00:00Z')

describe('telPerDag', () => {
  it('telt per Amsterdamse dag en zet een dag zonder voorvallen op 0', () => {
    const reeks = telPerDag(
      ['2026-09-27T08:00:00Z', '2026-09-27T20:00:00Z', '2026-09-29T09:00:00Z'],
      { nu: NU, dagen: 3 },
    )
    expect(reeks).toEqual([
      { dag: '2026-09-27', aantal: 2, lopend: false },
      { dag: '2026-09-28', aantal: 0, lopend: false },
      { dag: '2026-09-29', aantal: 1, lopend: true },
    ])
  })

  it('een voorval vlak na middernacht Amsterdamse tijd hoort bij de nieuwe dag', () => {
    const reeks = telPerDag(['2026-09-28T22:30:00Z'], { nu: NU, dagen: 2 })
    expect(reeks.map((p) => p.aantal)).toEqual([0, 1])
  })

  it('voorvallen buiten de reeks en onleesbare tijdstempels tellen niet mee', () => {
    const reeks = telPerDag(['2026-09-01T08:00:00Z', null, undefined, 'kapot'], { nu: NU, dagen: 2 })
    expect(reeks.map((p) => p.aantal)).toEqual([0, 0])
  })

  it('markeert alleen vandaag als lopend', () => {
    const reeks = telPerDag([], { nu: NU, dagen: 4 })
    expect(reeks.filter((p) => p.lopend).map((p) => p.dag)).toEqual(['2026-09-29'])
  })

  describe('afgekapt leesvenster', () => {
    const opties = { nu: NU, dagen: 5, afgekaptVanaf: '2026-09-27T14:00:00Z' }

    it('dagen vóór de oudste regel zijn niet gemeten: null, geen 0', () => {
      const reeks = telPerDag(['2026-09-28T08:00:00Z'], opties)
      expect(reeks.find((p) => p.dag === '2026-09-25')?.aantal).toBeNull()
      expect(reeks.find((p) => p.dag === '2026-09-26')?.aantal).toBeNull()
    })

    it('de dag van de oudste regel is zelf onvolledig en telt ook als niet gemeten', () => {
      const reeks = telPerDag(['2026-09-27T15:00:00Z'], opties)
      expect(reeks.find((p) => p.dag === '2026-09-27')?.aantal).toBeNull()
    })

    it('de eerste dag ná de oudste regel is wel gemeten', () => {
      const reeks = telPerDag(['2026-09-28T08:00:00Z'], opties)
      expect(reeks.find((p) => p.dag === '2026-09-28')?.aantal).toBe(1)
      expect(reeks.find((p) => p.dag === '2026-09-29')?.aantal).toBe(0)
    })
  })

  it('zonder afgekapt venster is geen enkele dag null', () => {
    const reeks = telPerDag([], { nu: NU, dagen: 5, afgekaptVanaf: null })
    expect(reeks.every((p) => p.aantal === 0)).toBe(true)
  })
})

describe('vergelijkPerioden — volle dagen, vandaag telt niet mee', () => {
  const momenten = [
    // Vorige periode (25 t/m 26 sep): 1 voorval
    '2026-09-25T09:00:00Z',
    // Huidige periode (27 t/m 28 sep): 3 voorvallen
    '2026-09-27T09:00:00Z',
    '2026-09-28T09:00:00Z',
    '2026-09-28T10:00:00Z',
    // Vandaag: telt in geen van beide mee
    '2026-09-29T09:00:00Z',
    '2026-09-29T09:30:00Z',
  ]

  it('vergelijkt de laatste N volle dagen met de N daarvoor', () => {
    const reeks = telPerDag(momenten, { nu: NU, dagen: reeksLengteVoor(2) })
    const v = vergelijkPerioden(reeks, { nu: NU, dagen: 2 })
    expect(v.huidig).toEqual({ van: '2026-09-27', tot: '2026-09-28', aantal: 3 })
    expect(v.vorig).toEqual({ van: '2026-09-25', tot: '2026-09-26', aantal: 1 })
    expect(v.verschil).toBe(2)
  })

  it('de periodes sluiten op elkaar aan en overlappen niet', () => {
    const reeks = telPerDag([], { nu: NU, dagen: reeksLengteVoor(7) })
    const v = vergelijkPerioden(reeks, { nu: NU, dagen: 7 })
    expect(v.huidig.tot).toBe('2026-09-28')
    expect(v.huidig.van).toBe('2026-09-22')
    expect(v.vorig.tot).toBe('2026-09-21')
    expect(v.vorig.van).toBe('2026-09-15')
  })

  it('één niet-gemeten dag in de vorige periode maakt die periode onbekend, en het verschil ook', () => {
    const reeks = telPerDag(momenten, {
      nu: NU,
      dagen: reeksLengteVoor(2),
      afgekaptVanaf: '2026-09-25T12:00:00Z',
    })
    const v = vergelijkPerioden(reeks, { nu: NU, dagen: 2 })
    expect(v.vorig.aantal).toBeNull()
    expect(v.huidig.aantal).toBe(3)
    expect(v.verschil).toBeNull()
  })

  it('een reeks die te kort is voor de vorige periode geeft geen totaal, geen 0', () => {
    const reeks = telPerDag(momenten, { nu: NU, dagen: 3 })
    const v = vergelijkPerioden(reeks, { nu: NU, dagen: 2 })
    expect(v.huidig.aantal).toBe(3)
    expect(v.vorig.aantal).toBeNull()
    expect(v.verschil).toBeNull()
  })

  it('een daling is een negatief verschil', () => {
    const reeks = telPerDag(['2026-09-25T09:00:00Z', '2026-09-26T09:00:00Z'], { nu: NU, dagen: reeksLengteVoor(2) })
    expect(vergelijkPerioden(reeks, { nu: NU, dagen: 2 }).verschil).toBe(-2)
  })
})

describe('hulpfuncties', () => {
  it('reeksLengteVoor dekt twee periodes plus vandaag', () => {
    expect(reeksLengteVoor(7)).toBe(15)
    expect(reeksLengteVoor(30)).toBe(61)
  })

  it('laatsteDagen geeft het staartje, ook als de reeks korter is', () => {
    const reeks = telPerDag([], { nu: NU, dagen: 5 })
    expect(laatsteDagen(reeks, 2).map((p) => p.dag)).toEqual(['2026-09-28', '2026-09-29'])
    expect(laatsteDagen(reeks, 9)).toHaveLength(5)
  })

  it('somGemeten telt alleen gemeten dagen en geeft null als er geen is', () => {
    const afgekapt = telPerDag(['2026-09-29T09:00:00Z'], {
      nu: NU,
      dagen: 3,
      afgekaptVanaf: '2026-09-28T09:00:00Z',
    })
    expect(somGemeten(afgekapt)).toBe(1)
    const niets = telPerDag([], { nu: NU, dagen: 2, afgekaptVanaf: '2026-09-29T09:00:00Z' })
    expect(somGemeten(niets)).toBeNull()
  })
})
