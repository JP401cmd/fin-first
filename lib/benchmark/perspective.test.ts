import { describe, it, expect } from 'vitest'
import { buildMuskComparison, formatBigYears, MUSK_NET_WORTH_EUR } from './perspective'
import { calculateFreedomTime, FREEDOM_DAYS_PER_YEAR } from '@/lib/format'

/**
 * UR3-17 #7 — de tegel meldde "Zijn vermogen zou jou 9999 jaar vrijheid geven
 * — meer dan honderdduizend mensenlevens".
 *
 * Twee fouten in één zin: 9999 is de WEERGAVEKAP van `calculateFreedomTime`
 * (lib/format.ts), geen uitkomst, en hij spreekt de mensenlevens-claim erachter
 * tegen (9999 jaar zijn er ~125). Deze suite grendelt beide kanten: het getal
 * moet met de werkelijke schaal meebewegen, en de kap mag er niet meer in
 * doorlekken.
 */
describe('buildMuskComparison — vrijheidstijd op Musk-schaal', () => {
  it('toont niet de 9999-jaar-weergavekap van calculateFreedomTime', () => {
    // €100/dag is een alledaags uitgavenpatroon; de decompositie loopt daar met
    // gemak tegen de kap aan. Toets op de KAPWAARDE zelf, niet op de losse
    // tekens "9999": geformatteerd wordt dat "10 duizend jaar" en glipt een
    // naïeve substring-toets er zo langs.
    const musk = buildMuskComparison(250_000, 100)
    expect(musk?.freedomFraming).toBeTruthy()
    const gekapt = calculateFreedomTime(MUSK_NET_WORTH_EUR, 100).years
    expect(gekapt).toBe(9999) // bevestigt dat deze invoer de kap raakt
    expect(musk!.freedomFraming).not.toContain(formatBigYears(gekapt))
  })

  it('het getal schaalt mee met het uitgavenpatroon (de kap zou dat plat slaan)', () => {
    const zuinig = buildMuskComparison(250_000, 50)!.freedomFraming
    const ruim = buildMuskComparison(250_000, 200)!.freedomFraming
    // Vier keer zo veel uitgeven = vier keer zo weinig jaren. Onder de kap
    // zouden beide zinnen identiek zijn geweest.
    expect(zuinig).not.toBe(ruim)
    expect(zuinig).toContain('21,9 miljoen jaar')
    expect(ruim).toContain('5,5 miljoen jaar')
  })

  it('rekent op de ongekapte totalDays van de canonieke motor, niet op een eigen som', () => {
    const dagtarief = 137
    const bd = calculateFreedomTime(MUSK_NET_WORTH_EUR, dagtarief)
    const verwacht = formatBigYears(bd.totalDays / FREEDOM_DAYS_PER_YEAR)
    expect(buildMuskComparison(250_000, dagtarief)!.freedomFraming).toContain(verwacht)
  })

  it('laat de niet-onderbouwde mensenlevens-claim vallen', () => {
    const musk = buildMuskComparison(250_000, 100)
    expect(musk!.freedomFraming).not.toContain('mensenlevens')
  })

  it('geen dagtarief → geen vrijheidsframing (een verhouding zonder noemer)', () => {
    expect(buildMuskComparison(250_000, 0)?.freedomFraming).toBeNull()
  })

  it('null vermogen → geen vergelijking', () => {
    expect(buildMuskComparison(null, 100)).toBeNull()
  })
})

describe('formatBigYears', () => {
  it('schrijft nl-NL, met dezelfde drempels als formatBigMultiple', () => {
    expect(formatBigYears(842)).toBe('842 jaar')
    expect(formatBigYears(4_300)).toBe('4,3 duizend jaar')
    expect(formatBigYears(10_950_000)).toBe('11 miljoen jaar')
  })

  it('gebruikt de Nederlandse decimaalkomma, niet de Engelse punt', () => {
    expect(formatBigYears(1_450_000)).toBe('1,5 miljoen jaar')
    expect(formatBigYears(1_450_000)).not.toContain('.')
  })
})
