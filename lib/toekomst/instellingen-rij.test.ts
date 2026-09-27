import { describe, it, expect } from 'vitest'
import { REGEL_ORDER } from '@/lib/future/regel-registry'
import { PLAN_REVIEW_STAPPEN } from '@/lib/plan-review/types'
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
  it('kent vijftien rijen: drie secties in Instellingen en het blok Levensstrategieën op Plan', () => {
    expect(RIJ_SLEUTELS).toHaveLength(15)
    const per = (s: string) => RIJ_SLEUTELS.filter((k) => RIJ_META[k].sectie === s).length
    expect([per('plan'), per('potten'), per('markt'), per('levensstrategieen')]).toEqual([4, 4, 3, 4])
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

  it('de href gebruikt ?rij=; een levensstrategie wijst naar Plan', () => {
    expect(instellingenRijHref('geen-tekort-lening')).toBe('/toekomst/instellingen?rij=geen-tekort-lening')
    expect(instellingenRijHref('aow')).toBe('/toekomst?rij=aow#levensstrategieen')
    expect(instellingenRijHref('huis')).toBe('/toekomst?rij=huis#levensstrategieen')
  })

  it('elke rij die de wizard bevestigt noemt een bestaande stap; de marktaannames geen', () => {
    for (const k of RIJ_SLEUTELS) {
      const stap = RIJ_META[k].wizardStap
      if (RIJ_META[k].sectie === 'markt') expect(stap).toBeUndefined()
      else expect(PLAN_REVIEW_STAPPEN).toContain(stap)
    }
  })
})
