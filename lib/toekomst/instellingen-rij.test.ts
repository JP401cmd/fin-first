import { describe, it, expect } from 'vitest'
import { REGEL_ORDER } from '@/lib/future/regel-registry'
import {
  RIJ_META,
  RIJ_SLEUTELS,
  REGEL_NAAR_RIJ,
  STRATEGIE_NAAR_RIJ,
  instellingenRijHref,
  isRijSleutel,
  resolveRijDeeplink,
} from './instellingen-rij'

const p = (q: string) => new URLSearchParams(q)

describe('rij-register van katern Instellingen', () => {
  it('kent vijftien rijen, verdeeld over drie secties', () => {
    expect(RIJ_SLEUTELS).toHaveLength(15)
    const per = (s: string) => RIJ_SLEUTELS.filter((k) => RIJ_META[k].sectie === s).length
    expect([per('plan'), per('levensstrategieen'), per('markt')]).toEqual([8, 4, 3])
  })

  it('elke regel en elke levensstrategie heeft een rij (aliassen zijn compleet)', () => {
    for (const r of REGEL_ORDER) expect(isRijSleutel(REGEL_NAAR_RIJ[r])).toBe(true)
    for (const s of ['aow', 'pensioen', 'werk', 'huis'] as const) expect(STRATEGIE_NAAR_RIJ[s]).toBe(s)
  })

  it('elke alias-rij opent de body van zijn oude sleutel', () => {
    for (const r of REGEL_ORDER) {
      const e = RIJ_META[REGEL_NAAR_RIJ[r]].editor
      expect(e.soort === 'regel' && e.regel).toBe(r)
    }
  })

  it.each([
    ['rij=eindleeftijd', 'eindleeftijd', 'rij'],
    ['regel=eindstrategie', 'stopmoment', 'regel'],
    ['regel=onttrekkingsstrategie', 'onttrekking', 'regel'],
    ['regel=onttrekkingsvolgorde', 'onttrekkingsvolgorde', 'regel'],
    ['regel=verdeling-toename', 'verdeling-toename', 'regel'],
    ['regel=onttrekking-afname', 'onttrekking-afname', 'regel'],
    ['strategie=aow', 'aow', 'strategie'],
    ['strategie=pensioen', 'pensioen', 'strategie'],
    ['strategie=werk', 'werk', 'strategie'],
    ['strategie=huis', 'huis', 'strategie'],
    ['rij=box3&regel=eindstrategie&strategie=aow', 'box3', 'rij'],
    ['regel=onttrekkingsstrategie&strategie=aow', 'onttrekking', 'regel'],
  ])('%s → %s (via %s)', (q, rij, via) => {
    expect(resolveRijDeeplink(p(q))).toEqual({ rij, via })
  })

  it.each(['', 'strategie=open', 'rij=onbekend', 'regel=__proto__', 'rij=toString'])(
    '"%s" opent niets',
    (q) => {
      expect(resolveRijDeeplink(p(q))).toBeNull()
    },
  )

  it('de href gebruikt ?rij=', () => {
    expect(instellingenRijHref('geen-tekort-lening')).toBe('/toekomst/instellingen?rij=geen-tekort-lening')
  })
})
