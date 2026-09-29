import { describe, expect, it } from 'vitest'
import {
  amsterdamDag,
  dagLabel,
  dagLabelMetJaar,
  dagVanIso,
  dagenTotEnMet,
  dagenTussen,
  periodeLabel,
  verschuifDag,
  weekVanDag,
} from './tijd'

describe('amsterdamDag — de dag die de beheerder beleeft, niet de UTC-dag', () => {
  it('zomertijd: 22:30 UTC is in Amsterdam al de volgende dag', () => {
    expect(amsterdamDag(new Date('2026-09-28T22:30:00Z'))).toBe('2026-09-29')
  })

  it('zomertijd: 21:59 UTC valt nog op dezelfde dag', () => {
    expect(amsterdamDag(new Date('2026-09-28T21:59:00Z'))).toBe('2026-09-28')
  })

  it('wintertijd: de grens ligt een uur later (23:00 UTC)', () => {
    expect(amsterdamDag(new Date('2026-12-10T22:59:00Z'))).toBe('2026-12-10')
    expect(amsterdamDag(new Date('2026-12-10T23:00:00Z'))).toBe('2026-12-11')
  })
})

describe('dagVanIso', () => {
  it('geeft null bij een ontbrekende of onleesbare waarde, nooit een dag', () => {
    expect(dagVanIso(null)).toBeNull()
    expect(dagVanIso(undefined)).toBeNull()
    expect(dagVanIso('geen datum')).toBeNull()
  })

  it('leest een tijdstempel met offset', () => {
    expect(dagVanIso('2026-09-28 22:30:00+00')).toBe('2026-09-29')
  })
})

describe('verschuifDag en dagenTussen', () => {
  it('schuift over een maandgrens en een jaargrens', () => {
    expect(verschuifDag('2026-10-01', -1)).toBe('2026-09-30')
    expect(verschuifDag('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('verspringt niet op de dag dat de klok verzet wordt', () => {
    // 25 oktober 2026: einde zomertijd. Een dag blijft een dag.
    expect(verschuifDag('2026-10-24', 1)).toBe('2026-10-25')
    expect(verschuifDag('2026-10-25', 1)).toBe('2026-10-26')
    expect(dagenTussen('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('dagenTussen is negatief als de tweede dag eerder valt', () => {
    expect(dagenTussen('2026-09-29', '2026-09-22')).toBe(-7)
    expect(dagenTussen('2026-09-29', '2026-09-29')).toBe(0)
  })
})

describe('dagenTotEnMet', () => {
  it('geeft precies het gevraagde aantal dagen, oplopend, met de laatste dag inbegrepen', () => {
    expect(dagenTotEnMet('2026-09-29', 3)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29'])
    expect(dagenTotEnMet('2026-09-29', 1)).toEqual(['2026-09-29'])
  })
})

describe('labels in krant-notatie', () => {
  it('dag zonder en met jaar', () => {
    expect(dagLabel('2026-09-05')).toBe('5 sep')
    expect(dagLabelMetJaar('2026-03-05')).toBe('5 mrt 2026')
  })

  it('een periode binnen één maand noemt de maand één keer', () => {
    expect(periodeLabel('2026-09-22', '2026-09-28')).toBe('22–28 sep')
  })

  it('een periode over een maandgrens noemt beide maanden', () => {
    expect(periodeLabel('2026-08-29', '2026-09-04')).toBe('29 aug – 4 sep')
  })

  it('een periode van één dag is die dag', () => {
    expect(periodeLabel('2026-09-22', '2026-09-22')).toBe('22 sep')
  })
})

describe('weekVanDag', () => {
  it('maandag en zondag van dezelfde week geven dezelfde sleutel', () => {
    expect(weekVanDag('2026-09-28')).toBe(weekVanDag('2026-10-04'))
  })

  it('de maandag erna is een nieuwe week', () => {
    expect(weekVanDag('2026-10-05')).not.toBe(weekVanDag('2026-10-04'))
  })

  it('volgt de ISO-week rond de jaarwissel', () => {
    expect(weekVanDag('2025-12-29')).toBe('2026-W01')
  })
})
