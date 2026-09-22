import { describe, expect, it } from 'vitest'
import {
  PLAN_ONDERWERP,
  resolvePlanStatus,
  resolvePlanVerdict,
  resolvePlanVerdictSentence,
  type PlanStatusInput,
} from './plan-status'
import { coverageStatus } from './coverage-strip'

describe('resolvePlanStatus — vast stopmoment volgt de dekking', () => {
  it.each([
    [150, 'good'],
    [100, 'good'],
    [99, 'warn'],
    [90, 'warn'],
    [89.6, 'warn'], // afgerond 90, zoals de kaart het toont
    [89.4, 'bad'],
    [5, 'bad'],
    [0, 'bad'],
  ] as const)('dekking %s%% → %s', (coveragePct, verwacht) => {
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct, solvedReachable: null })).toBe(verwacht)
  })

  it('zonder bruikbare dekking → neutral (geen oordeel verzinnen)', () => {
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct: null, solvedReachable: null })).toBe('neutral')
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct: Number.NaN, solvedReachable: null })).toBe('neutral')
  })

  it('negeert de haalbaarheid van de hoofdrun onder een vast anker', () => {
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct: 120, solvedReachable: false })).toBe('good')
  })
})

describe('resolvePlanStatus — zo vroeg mogelijk volgt de hoofdrun', () => {
  it('haalbaar → good', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: null, solvedReachable: true })).toBe('good')
  })

  it('niet haalbaar binnen de horizon → bad', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: null, solvedReachable: false })).toBe('bad')
  })

  it('onder solved is freedomPct een kapitaalratio en telt dus niet mee', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: 5, solvedReachable: true })).toBe('good')
  })

  it('geen run → neutral', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: null, solvedReachable: null })).toBe('neutral')
  })
})

/**
 * De paginatitel van /toekomst toont een BEREKEND kerngetal (de plan-dekking).
 * Deze suite pint die uitspraak op de canonieke bron: dezelfde drempels als de
 * dekkingsstrook (`coverageStatus`) en hetzelfde afgeronde percentage dat de
 * plankaart op /overzicht toont — geen tweede tekst met een eigen grens.
 */
describe('resolvePlanVerdict — de titel van /toekomst', () => {
  it('vast stopmoment: noemt de dekking en erft de stoplichtstand van coverageStatus', () => {
    for (const pct of [150, 100, 99, 90, 89.4, 5]) {
      const verdict = resolvePlanVerdict({
        anchorFixed: true,
        coveragePct: pct,
        solvedReachable: null,
      })
      expect(verdict.label).toBe(`Plan dekt ${Math.round(pct)}%`)
      // Status volgt letterlijk de drempels van de dekkingsstrook.
      expect(verdict.status).toBe(
        { green: 'good', amber: 'warn', red: 'bad' }[coverageStatus(Math.round(pct))],
      )
      expect(verdict.status).toBe(
        resolvePlanStatus({ anchorFixed: true, coveragePct: pct, solvedReachable: null }),
      )
    }
  })

  it('vast stopmoment zonder bruikbare dekking → geen oordeel verzinnen', () => {
    expect(resolvePlanVerdict({ anchorFixed: true, coveragePct: null, solvedReachable: null })).toEqual({
      label: null,
      status: 'neutral',
    })
  })

  it('zo vroeg mogelijk: volgt de haalbaarheid van de hoofdrun, niet de dekking', () => {
    expect(
      resolvePlanVerdict({ anchorFixed: false, coveragePct: 5, solvedReachable: true }),
    ).toEqual({ label: 'Plan is haalbaar', status: 'good' })
    expect(
      resolvePlanVerdict({ anchorFixed: false, coveragePct: 5, solvedReachable: false }),
    ).toEqual({ label: 'Plan nog niet haalbaar', status: 'bad' })
    expect(
      resolvePlanVerdict({ anchorFixed: false, coveragePct: null, solvedReachable: null }),
    ).toEqual({ label: null, status: 'neutral' })
  })

  it('geen koop-/verkoopmetafoor in de uitspraken (ADR 0165)', () => {
    const alle = [
      resolvePlanVerdict({ anchorFixed: true, coveragePct: 96, solvedReachable: null }).label,
      resolvePlanVerdict({ anchorFixed: false, coveragePct: null, solvedReachable: true }).label,
      resolvePlanVerdict({ anchorFixed: false, coveragePct: null, solvedReachable: false }).label,
    ].join(' ')
    expect(alle).not.toMatch(/vrijgekocht|terugkopen|vrijkopen|gekochte tijd|verkochte tijd/i)
  })
})

/**
 * De kop van /toekomst als ZIN (ADR 0174 D6). Staat náást `resolvePlanVerdict` en
 * mag daar nooit van afwijken: dezelfde status, hetzelfde afgeronde percentage,
 * dezelfde null-gevallen. De tabel hieronder loopt élke tak aan béíde kanten van
 * zijn drempels af (≥100 / 99 / 90 / 89,6→90 / 89,4→89 / 0).
 */
describe('resolvePlanVerdictSentence — de kop-zin van /toekomst', () => {
  const vast = (coveragePct: number | null): PlanStatusInput => ({
    anchorFixed: true,
    coveragePct,
    solvedReachable: null,
  })

  it.each([
    [150, 'voor 150% gedekt', 'good'],
    [100, 'voor 100% gedekt', 'good'],
    [99, 'voor 99% gedekt', 'warn'],
    [90, 'voor 90% gedekt', 'warn'],
    [89.6, 'voor 90% gedekt', 'warn'],
    [89.4, 'voor 89% gedekt', 'bad'],
    [0, 'voor 0% gedekt', 'bad'],
  ] as const)('vast stopmoment, dekking %s → "%s" (%s)', (pct, oordeel, status) => {
    const { sentence, status: s } = resolvePlanVerdictSentence(vast(pct))
    expect(sentence).toEqual({ voor: `${PLAN_ONDERWERP} is`, oordeel })
    expect(s).toBe(status)
  })

  it('volgt status én percentage van resolvePlanVerdict — geen tweede drempel', () => {
    const invoer: PlanStatusInput[] = [
      ...[150, 100, 99.5, 99, 90, 89.6, 89.4, 5, 0].map(vast),
      vast(null),
      vast(Number.NaN),
      { anchorFixed: false, coveragePct: 5, solvedReachable: true },
      { anchorFixed: false, coveragePct: 5, solvedReachable: false },
      { anchorFixed: false, coveragePct: null, solvedReachable: null },
    ]
    for (const input of invoer) {
      const kort = resolvePlanVerdict(input)
      const zin = resolvePlanVerdictSentence(input)
      expect(zin.status).toBe(kort.status)
      // Beide leeg, of beide gevuld.
      expect(zin.sentence === null).toBe(kort.label === null)
      // Hetzelfde getal: "Plan dekt 96%" ↔ "voor 96% gedekt".
      const getal = kort.label?.match(/(\d+)%/)?.[1]
      if (getal) expect(zin.sentence?.oordeel).toBe(`voor ${getal}% gedekt`)
    }
  })

  it('vast stopmoment zonder bruikbare dekking → geen zin, kale paginanaam', () => {
    expect(resolvePlanVerdictSentence(vast(null))).toEqual({ sentence: null, status: 'neutral' })
    expect(resolvePlanVerdictSentence(vast(Number.NaN))).toEqual({ sentence: null, status: 'neutral' })
  })

  it('zo vroeg mogelijk: haalbaar of nog niet haalbaar, en negeert de kapitaalratio', () => {
    expect(
      resolvePlanVerdictSentence({ anchorFixed: false, coveragePct: 5, solvedReachable: true }),
    ).toEqual({ sentence: { voor: 'Je toekomstplan is', oordeel: 'haalbaar' }, status: 'good' })
    expect(
      resolvePlanVerdictSentence({ anchorFixed: false, coveragePct: 5, solvedReachable: false }),
    ).toEqual({ sentence: { voor: 'Je toekomstplan is', oordeel: 'nog niet haalbaar' }, status: 'bad' })
    expect(
      resolvePlanVerdictSentence({ anchorFixed: false, coveragePct: null, solvedReachable: null }),
    ).toEqual({ sentence: null, status: 'neutral' })
  })

  it('het onderwerp draagt het paginawoord', () => {
    expect(PLAN_ONDERWERP.toLowerCase()).toContain('toekomst')
  })

  it('geen "oordeel", geen imperatief, geen koop-/verkoopmetafoor', () => {
    const zinnen = [
      resolvePlanVerdictSentence(vast(96)).sentence,
      resolvePlanVerdictSentence({ anchorFixed: false, coveragePct: null, solvedReachable: true }).sentence,
      resolvePlanVerdictSentence({ anchorFixed: false, coveragePct: null, solvedReachable: false }).sentence,
    ]
    const alle = zinnen.map((z) => `${z?.voor} ${z?.oordeel}.`).join(' ')
    expect(alle.toLowerCase()).not.toMatch(/\boordeel/)
    expect(alle).not.toMatch(/\b(stort|verschuif|verkoop|koop|beleg|zorg dat|verhoog|verlaag)\b/i)
    expect(alle).not.toMatch(/vrijgekocht|terugkopen|vrijkopen|gekochte tijd|verkochte tijd/i)
  })
})
