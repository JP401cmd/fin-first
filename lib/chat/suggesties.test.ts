import { describe, it, expect } from 'vitest'
import {
  CHAT_SUGGESTIES,
  selectSuggesties,
  suggestiePoolGrootte,
  type ChatSuggestie,
} from './suggesties'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

const LEEG: CoachDataGaps = {
  hasBank: false,
  hasAssets: false,
  hasBudgets: false,
  hasGoals: false,
  hasDebts: false,
  hasTransactions: false,
  hasHoldings: false,
  hasHoldingsWithIsin: false,
  hasFireParams: false,
  hasLifeEvents: false,
}

const VOL: CoachDataGaps = {
  hasBank: true,
  hasAssets: true,
  hasBudgets: true,
  hasGoals: true,
  hasDebts: true,
  hasTransactions: true,
  hasHoldings: true,
  hasHoldingsWithIsin: true,
  hasFireParams: true,
  hasLifeEvents: true,
}

describe('CHAT_SUGGESTIES — de tabel zelf', () => {
  it('heeft uitsluitend unieke ids', () => {
    const ids = CHAT_SUGGESTIES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gebruikt kebab-case ids', () => {
    for (const s of CHAT_SUGGESTIES) {
      expect(s.id, s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('heeft overal een prompt en een label, en labels blijven kort genoeg voor het paneel', () => {
    for (const s of CHAT_SUGGESTIES) {
      expect(s.prompt.trim().length, s.id).toBeGreaterThan(0)
      expect(s.label.trim().length, s.id).toBeGreaterThan(0)
      expect(s.label.length, s.id).toBeLessThanOrEqual(62)
    }
  })

  it('gebruikt alleen routeprefixen die met een slash beginnen', () => {
    for (const s of CHAT_SUGGESTIES) {
      for (const r of s.routes) expect(r.startsWith('/'), `${s.id}: ${r}`).toBe(true)
    }
  })

  it('R6 — de vijf gemigreerde CONTEXT_CHIPS staan er letterlijk in', () => {
    const verwacht: Array<{ id: string; label: string; prompt: string; routes: string[] }> = [
      {
        id: 'tip-schulden',
        label: 'Tip voor mijn schulden',
        prompt: 'Geef me één concrete tip om mijn schulden sneller of slimmer af te lossen.',
        routes: ['/overzicht/schulden', '/core/debts'],
      },
      {
        id: 'tip-bezittingen',
        label: 'Tip voor mijn bezittingen',
        prompt:
          'Geef me één concrete tip om mijn bezittingen beter te laten renderen of risico te verlagen.',
        routes: ['/overzicht/bezittingen', '/core/assets'],
      },
      {
        id: 'tip-cashflow',
        label: 'Tip voor mijn cashflow',
        prompt: 'Geef me één concrete tip om mijn maandelijkse cashflow te verbeteren.',
        routes: ['/overzicht/budget', '/core/budgets', '/core/cash'],
      },
      {
        id: 'tip-belasting',
        label: 'Tip om belasting te besparen',
        prompt: 'Geef me één concrete tip om dit jaar belasting te besparen (Box 1, 2 of 3).',
        routes: ['/overzicht/belasting', '/core/belasting'],
      },
      {
        id: 'tip-fire',
        label: 'Versnel mijn vrijheidsdatum',
        prompt: 'Geef me één concrete tip om mijn FIRE-datum naar voren te halen.',
        routes: ['/toekomst', '/horizon'],
      },
    ]
    for (const v of verwacht) {
      const record = CHAT_SUGGESTIES.find((s) => s.id === v.id)
      expect(record, v.id).toBeDefined()
      expect(record!.label).toBe(v.label)
      expect(record!.prompt).toBe(v.prompt)
      expect(record!.routes).toEqual(v.routes)
      expect(record!.generiek).toBe(false)
    }
  })

  it('draagt de volledige goedgekeurde set: 100 vragen naast de vijf gemigreerde chips', () => {
    expect(CHAT_SUGGESTIES.length).toBe(105)
  })

  it('bevat GENERIC_PROMPT niet — die blijft de vaste, niet-roterende tip-chip', () => {
    const generiekeTip =
      'Geef me één concrete tip op basis van mijn huidige situatie. Begin met de grootste kans.'
    expect(CHAT_SUGGESTIES.some((s) => s.prompt === generiekeTip)).toBe(false)
  })
})

describe('selectSuggesties', () => {
  it('is deterministisch — dezelfde input geeft exact dezelfde ids', () => {
    const input = { pathname: '/overzicht/schulden', data: VOL, seed: 2 }
    const a = selectSuggesties(input).map((s) => s.id)
    const b = selectSuggesties(input).map((s) => s.id)
    expect(a).toEqual(b)
  })

  it('levert standaard drie suggesties', () => {
    expect(selectSuggesties({ pathname: '/overzicht', data: VOL, seed: 0 })).toHaveLength(3)
  })

  it('geeft routegebonden suggesties voorrang op generieke', () => {
    const gekozen = selectSuggesties({ pathname: '/overzicht/schulden', data: VOL, seed: 0 })
    for (const s of gekozen) {
      expect(s.routes.some((r) => '/overzicht/schulden'.startsWith(r)), s.id).toBe(true)
    }
  })

  it('filtert vragen weg waarvan de datavereiste niet is vervuld', () => {
    const gekozen = selectSuggesties({ pathname: '/overzicht/schulden', data: LEEG, seed: 0 })
    for (const s of gekozen) {
      expect(s.vereist ?? [], s.id).toEqual([])
    }
    // De schulden-specifieke vragen vragen allemaal hasDebts en vallen dus af.
    expect(gekozen.some((s) => s.id === 'schuldenvrij-datum')).toBe(false)
  })

  it('laat een vraag met een vervulde vereiste wél toe', () => {
    const alleenSchulden: CoachDataGaps = { ...LEEG, hasDebts: true }
    const pool = CHAT_SUGGESTIES.filter(
      (s) =>
        s.routes.some((r) => '/overzicht/schulden'.startsWith(r)) &&
        (s.vereist ?? []).every((k) => alleenSchulden[k]),
    )
    expect(pool.some((s) => s.id === 'schuldenvrij-datum')).toBe(true)
    // hasAssets ontbreekt → de vraag die schuld én vermogen nodig heeft valt af.
    expect(pool.some((s) => s.id === 'aflostempo-versus-vermogensgroei')).toBe(false)
  })

  it('A11 — op een pathname zonder route-match valt hij terug op generieke vragen', () => {
    const gekozen = selectSuggesties({ pathname: '/een/onbekend/pad', data: LEEG, seed: 0 })
    expect(gekozen.length).toBe(3)
    for (const s of gekozen) expect(s.generiek, s.id).toBe(true)
  })

  it('geeft nooit twee suggesties met dezelfde id terug', () => {
    for (let seed = 0; seed < 12; seed++) {
      for (const pathname of ['/overzicht', '/overzicht/budget', '/toekomst', '/mijn/profiel']) {
        const ids = selectSuggesties({ pathname, data: VOL, seed }).map((s) => s.id)
        expect(new Set(ids).size, `${pathname}@${seed}`).toBe(ids.length)
      }
    }
  })

  it('rotatie: een hogere seed levert een andere selectie zolang de pool groter is dan het aantal', () => {
    const input = { pathname: '/toekomst', data: VOL, aantal: 3 }
    const eerste = selectSuggesties({ ...input, seed: 0 }).map((s) => s.id)
    const tweede = selectSuggesties({ ...input, seed: 1 }).map((s) => s.id)
    expect(suggestiePoolGrootte(input)).toBeGreaterThan(3)
    expect(tweede).not.toEqual(eerste)
  })

  it('rotatie loopt rond zonder te crashen bij hoge seeds', () => {
    for (const seed of [7, 41, 999]) {
      const gekozen = selectSuggesties({ pathname: '/overzicht', data: VOL, seed })
      expect(gekozen).toHaveLength(3)
    }
  })

  it('respecteert een expliciet aantal en levert nooit meer', () => {
    expect(selectSuggesties({ pathname: '/overzicht', data: VOL, seed: 0, aantal: 2 })).toHaveLength(2)
    expect(selectSuggesties({ pathname: '/overzicht', data: VOL, seed: 0, aantal: 0 })).toHaveLength(0)
  })

  it('vult aan uit de generieke pool wanneer de routepool te klein is', () => {
    // /berichten heeft maar twee routegebonden vragen; het derde item komt uit
    // de generieke pool.
    const routegebonden = CHAT_SUGGESTIES.filter((s: ChatSuggestie) =>
      s.routes.some((r) => '/berichten'.startsWith(r)),
    )
    expect(routegebonden.length).toBeLessThan(3)
    const gekozen = selectSuggesties({ pathname: '/berichten', data: VOL, seed: 0 })
    expect(gekozen).toHaveLength(3)
  })
})

describe('suggestiePoolGrootte', () => {
  it('telt routegebonden én generieke vragen zonder dubbeltelling', () => {
    const input = { pathname: '/overzicht/budget', data: VOL }
    const grootte = suggestiePoolGrootte(input)
    const routegebonden = CHAT_SUGGESTIES.filter((s) =>
      s.routes.some((r) => '/overzicht/budget'.startsWith(r)),
    )
    const generiekBuitenRoute = CHAT_SUGGESTIES.filter(
      (s) => s.generiek && !s.routes.some((r) => '/overzicht/budget'.startsWith(r)),
    )
    expect(grootte).toBe(routegebonden.length + generiekBuitenRoute.length)
  })

  it('krimpt mee met het databeeld', () => {
    const vol = suggestiePoolGrootte({ pathname: '/overzicht/schulden', data: VOL })
    const leeg = suggestiePoolGrootte({ pathname: '/overzicht/schulden', data: LEEG })
    expect(leeg).toBeLessThan(vol)
  })
})


/**
 * M4 — het datafilter moet werken wáár het nodig is: op de GENERIEKE pool.
 *
 * De bevinding: `vereist` stond uitsluitend op records met `generiek: false`,
 * dus alleen op de routegebonden pool die per definitie al klopte. De generieke
 * pool — die de rij in de praktijk vult — werd nooit gesnoeid, en een leeg
 * account kreeg "Hoeveel houd ik netto over van mijn volgende verdiende euro?".
 */
describe('CHAT_SUGGESTIES — datavereisten op de generieke pool (M4)', () => {
  /**
   * De ENIGE generieke vragen zonder datavereiste: pure uitlegvragen. Die zijn
   * voor iedereen te beantwoorden, ook zonder één cijfer — en ze zijn precies
   * wat een leeg account overhoudt. Groeit deze lijst, dan is er een vraag over
   * iemands eigen cijfers generiek gemaakt zonder sleutel.
   */
  const UITLEGVRAGEN = [
    'sneeuwbal-en-lawine',
    'hoe-werkt-box3',
    'eerstvolgende-fiscale-deadline',
    'aanmerkelijk-belang',
  ]

  it('elke generieke vraag draagt een datavereiste, op de uitlegvragen na', () => {
    const zonder = CHAT_SUGGESTIES.filter((s) => s.generiek && (s.vereist ?? []).length === 0).map(
      (s) => s.id,
    )
    expect(zonder.sort()).toEqual([...UITLEGVRAGEN].sort())
  })

  it('de elf vragen zonder passende CoachDataGaps-sleutel zijn routegebonden', () => {
    // Inkomen, eigen woning, leeftijd en "afgeronde acties" hebben geen sleutel
    // in CoachDataGaps. Die vragen mogen daarom alleen op hun eigen route
    // verschijnen — daar klopt de context al.
    const zonderSleutel = [
      'vermogen-op-mijn-67e',
      'belasting-in-vrijheidsdagen',
      'marginaal-tarief',
      'onbenutte-jaarruimte',
      'jaarruimte-benutten',
      'eigen-woning-en-belasting',
      'netto-van-de-volgende-euro',
      'werkjaar-voor-de-belastingdienst',
      'samenwonen-en-vaste-lasten',
      'verbouwing-dertigduizend',
      'meest-opleverende-actie',
    ]
    for (const id of zonderSleutel) {
      const record = CHAT_SUGGESTIES.find((s) => s.id === id)
      expect(record, id).toBeDefined()
      expect(record!.generiek, id).toBe(false)
      expect(record!.routes.length, id).toBeGreaterThan(0)
    }
  })

  it('een leeg account krijgt geen inkomens- of woningvraag, op geen enkele route', () => {
    const verboden = [
      'netto-van-de-volgende-euro',
      'eigen-woning-en-belasting',
      'marginaal-tarief',
      'werkjaar-voor-de-belastingdienst',
    ]
    const routes = [
      '/overzicht',
      '/overzicht/budget',
      '/overzicht/bezittingen',
      '/overzicht/schulden',
      '/toekomst',
      '/mijn/profiel',
      '/berichten',
      '/een/onbekend/pad',
    ]
    for (const pathname of routes) {
      for (let seed = 0; seed < 6; seed++) {
        const ids = selectSuggesties({ pathname, data: LEEG, seed, aantal: 6 }).map((s) => s.id)
        for (const id of verboden) expect(ids, `${pathname}@${seed}`).not.toContain(id)
      }
    }
  })

  it('een leeg account houdt alleen vragen over die zonder gegevens te beantwoorden zijn', () => {
    const ids = selectSuggesties({ pathname: '/een/onbekend/pad', data: LEEG, seed: 0, aantal: 10 }).map(
      (s) => s.id,
    )
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(UITLEGVRAGEN, id).toContain(id)
  })

  it('met gegevens verschijnen de persoonlijke vragen wél', () => {
    const alleenVermogen: CoachDataGaps = { ...LEEG, hasAssets: true }
    const pool = CHAT_SUGGESTIES.filter(
      (s) => s.generiek && (s.vereist ?? []).every((k) => alleenVermogen[k]),
    ).map((s) => s.id)
    expect(pool).toContain('netto-vermogen-in-jaren-vrijheid')
    // Uitgavenvragen blijven weg zolang er geen transacties zijn.
    expect(pool).not.toContain('spaarquote-en-tempo')
  })

  it('de verversknop is uit zodra er niets te roteren valt (L1)', () => {
    // Precies de dode tak uit de bevinding: hij is nu bereikbaar.
    expect(suggestiePoolGrootte({ pathname: '/een/onbekend/pad', data: LEEG })).toBeLessThanOrEqual(4)
    expect(suggestiePoolGrootte({ pathname: '/overzicht', data: VOL })).toBeGreaterThan(4)
  })
})
