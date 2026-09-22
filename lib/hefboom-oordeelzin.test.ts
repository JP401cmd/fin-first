/**
 * hefboom-oordeelzin.test.ts — de kop van een hefboompagina als zin (ADR 0174 D6).
 *
 * Wat hier vastligt:
 *  1. Volledige dekking: elke hefboom × elke status heeft een zin, ook `neutral`
 *     (een kop moet altijd iets zeggen).
 *  2. Het streamingcontract: elke `voor` begint met het vaste onderwerp van zijn
 *     hefboom. Op /overzicht/budget staat dat onderwerp al in de eerste byte en
 *     stroomt de rest erachteraan; begint een `voor` ergens anders mee, dan staat
 *     "Je budget" twee keer in de kop.
 *  3. Het onderwerp draagt het paginawoord, zodat de zin zegt over welke pagina
 *     hij gaat.
 *  4. Eenvoud (B-071), Wft en ADR 0165: geen "oordeel", geen imperatief, geen
 *     bedrag of percentage, geen koop-/verkoopmetafoor. De belastingzin houdt zijn
 *     hedge.
 */

import { describe, it, expect } from 'vitest'
import { HEFBOOM_OORDEELZIN, HEFBOOM_ONDERWERP, hefboomOordeelzin } from './hefboom-oordeelzin'
import { HEFBOOM_VERDICT } from './hefboom-status-copy'
import { HEFBOOM_CONFIG, type Hefboom } from './hefboom-config'
import type { LeverageStatus } from './leverage-status'

const HEFBOMEN = Object.keys(HEFBOOM_CONFIG) as Hefboom[]
const STATUSSEN: LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']

/** Het woord dat de pagina in de nav draagt, in kleine letters. */
const PAGINAWOORD: Record<Hefboom, string> = {
  bezittingen: 'bezittingen',
  schulden: 'schulden',
  cashflow: 'budget',
  belasting: 'belasting',
}

const alleZinnen = HEFBOMEN.flatMap((h) =>
  STATUSSEN.map((s) => ({ hefboom: h, status: s, zin: HEFBOOM_OORDEELZIN[h][s] })),
)

function volledig(zin: { voor: string; oordeel: string; na?: string }): string {
  return `${zin.voor} ${zin.oordeel}${zin.na ? ` ${zin.na}` : ''}.`
}

describe('HEFBOOM_OORDEELZIN — dekking', () => {
  it('dekt precies de vier hefbomen', () => {
    expect(Object.keys(HEFBOOM_OORDEELZIN).sort()).toEqual([...HEFBOMEN].sort())
    expect(Object.keys(HEFBOOM_ONDERWERP).sort()).toEqual([...HEFBOMEN].sort())
  })

  it.each(HEFBOMEN)('%s heeft een zin voor elke status, ook neutral', (h) => {
    expect(Object.keys(HEFBOOM_OORDEELZIN[h]).sort()).toEqual([...STATUSSEN].sort())
    for (const s of STATUSSEN) {
      const zin = HEFBOOM_OORDEELZIN[h][s]
      expect(zin.voor.trim(), `${h}.${s}: lege voor`).not.toBe('')
      expect(zin.oordeel.trim(), `${h}.${s}: leeg oordeel`).not.toBe('')
      if (zin.na !== undefined) expect(zin.na.trim(), `${h}.${s}: lege na`).not.toBe('')
    }
  })

  it.each(HEFBOMEN)('%s: vier onderscheiden oordelen', (h) => {
    const oordelen = STATUSSEN.map((s) => HEFBOOM_OORDEELZIN[h][s].oordeel)
    expect(new Set(oordelen).size).toBe(4)
  })

  it('hefboomOordeelzin leest de tabel, ook bij neutral', () => {
    for (const { hefboom, status, zin } of alleZinnen) {
      expect(hefboomOordeelzin(hefboom, status)).toBe(zin)
    }
  })
})

describe('HEFBOOM_OORDEELZIN — onderwerp en streamingcontract', () => {
  it.each(alleZinnen)('$hefboom.$status begint met het vaste onderwerp', ({ hefboom, zin }) => {
    // Precies het onderwerp plus een spatie of niets: "Je schulden" + " vragen
    // aandacht" is geldig, "Je schuldenlast" niet — dan zou `slice` midden in
    // een woord knippen.
    const onderwerp = HEFBOOM_ONDERWERP[hefboom]
    expect(zin.voor.startsWith(onderwerp)).toBe(true)
    const rest = zin.voor.slice(onderwerp.length)
    expect(rest === '' || rest.startsWith(' ')).toBe(true)
  })

  it.each(HEFBOMEN)('het onderwerp van %s draagt het paginawoord', (h) => {
    expect(HEFBOOM_ONDERWERP[h].toLowerCase()).toContain(PAGINAWOORD[h])
  })

  it('het budget-onderwerp is de fallback van de stromende kop', () => {
    expect(HEFBOOM_ONDERWERP.cashflow).toBe('Je budget')
  })
})

/**
 * De zin mag niet méér beweren dan de score meet (eindreview F3). Beide gevallen
 * stonden in het concept en waren daar onwaar voor een deel van de gebruikers.
 */
describe('HEFBOOM_OORDEELZIN — beweert niet meer dan de score meet', () => {
  it('belasting noemt Box 3: de status is alleen box3TaxStatus, de hub toont ook Box 1', () => {
    for (const s of STATUSSEN) {
      expect(HEFBOOM_OORDEELZIN.belasting[s].voor).toMatch(/^Je Box 3-belasting\b/)
    }
  })

  it('schulden.good zegt niets over aflossen: schuldenvrij mét vermogen staat ook op groen', () => {
    expect(volledig(HEFBOOM_OORDEELZIN.schulden.good)).not.toMatch(/aflos|afgelost|schema/i)
  })
})

describe('HEFBOOM_OORDEELZIN — eenvoud, Wft en ADR 0165', () => {
  it('gebruikt het woord "oordeel" niet (B-071)', () => {
    for (const { hefboom, status, zin } of alleZinnen) {
      expect(volledig(zin).toLowerCase(), `${hefboom}.${status}`).not.toMatch(/\boordeel/)
    }
  })

  it('bevat geen imperatief en geen bedrag- of percentagebelofte', () => {
    for (const { hefboom, status, zin } of alleZinnen) {
      const tekst = volledig(zin)
      expect(tekst, `${hefboom}.${status}`).not.toMatch(
        /\b(stort|verschuif|verkoop|koop|beleg|los af|verlaag|verhoog|zorg dat|optimaliseer|benut)\b/i,
      )
      // Een boxnaam ("Box 3") is geen getal over je geld; alles daarbuiten wel.
      expect(tekst.replace(/\bBox \d\b/g, 'Box'), `${hefboom}.${status}`).not.toMatch(/€|\d/)
    }
  })

  it('gebruikt geen koop-/verkoopmetafoor voor vrijheid of tijd', () => {
    for (const { zin } of alleZinnen) {
      expect(volledig(zin)).not.toMatch(
        /vrijgekocht|terugkopen|terugkoopt|vrijkopen|gekochte|verkochte|teruggekochte/i,
      )
    }
  })

  it('belasting houdt de hedge "mogelijk" op warn, en alléén daar', () => {
    expect(HEFBOOM_OORDEELZIN.belasting.warn.oordeel).toMatch(/^mogelijk /)
    for (const s of ['good', 'bad', 'neutral'] as const) {
      expect(HEFBOOM_OORDEELZIN.belasting[s].oordeel).not.toMatch(/mogelijk/i)
    }
  })

  it('budget zegt bij neutral "te beoordelen", niet "in beeld": de pagina toont al cijfers', () => {
    expect(HEFBOOM_OORDEELZIN.cashflow.neutral.oordeel).toBe('nog niet te beoordelen')
  })
})

/**
 * De zin mag de tegel niet tegenspreken: HEFBOOM_VERDICT blijft de bron voor de
 * hefboomtegels en de rondleiding (ongewijzigd in F3), en voor good/warn/bad zegt
 * de kop-zin inhoudelijk hetzelfde. Dit pint de twee niet woord voor woord aan
 * elkaar — de zin is bewust vloeiender — maar vangt wél een verschoven rij.
 */
describe('HEFBOOM_OORDEELZIN — zegt hetzelfde als de tegel', () => {
  it.each([
    ['bezittingen', 'good', 'goed gespreid'],
    ['bezittingen', 'warn', 'beperkt gespreid'],
    ['bezittingen', 'bad', 'sterk geconcentreerd'],
    ['cashflow', 'good', 'op koers met sparen'],
    ['belasting', 'warn', 'mogelijk'],
  ] as const)('%s.%s deelt de kern "%s" met HEFBOOM_VERDICT', (h, s, kern) => {
    expect(HEFBOOM_OORDEELZIN[h][s].oordeel.toLowerCase()).toContain(kern)
    expect(HEFBOOM_VERDICT[h][s].toLowerCase()).toContain(kern)
  })
})
