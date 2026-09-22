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

/**
 * Het woord dat de pagina in de nav draagt, in kleine letters.
 *
 * Belasting staat er bewust NIET in: sinds ADR 0177 meet die hefboom de
 * onbenutte fiscale ruimte over Box 1 + Box 3, en het onderwerp draagt die
 * grondslag ("Je fiscale ruimte") in plaats van het paginawoord. Het paginawoord
 * staat links ervan in de TopBar. Zie de aparte test hieronder.
 */
const PAGINAWOORD: Partial<Record<Hefboom, string>> = {
  bezittingen: 'bezittingen',
  schulden: 'schulden',
  cashflow: 'budget',
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

  it.each(Object.keys(PAGINAWOORD) as Hefboom[])(
    'het onderwerp van %s draagt het paginawoord',
    (h) => {
      expect(HEFBOOM_ONDERWERP[h].toLowerCase()).toContain(PAGINAWOORD[h]!)
    },
  )

  it('belasting draagt de grondslag als onderwerp, niet het paginawoord (ADR 0177)', () => {
    // De hefboom meet onbenutte fiscale ruimte over Box 1 én Box 3. "Je Box
    // 3-belasting" zou te smal zijn (Box 1 telt mee) en "Je belasting" zou
    // suggereren dat de zin over de hoogte van de heffing gaat — precies de
    // grondslag die ADR 0177 heeft afgeschaft.
    expect(HEFBOOM_ONDERWERP.belasting).toBe('Je fiscale ruimte')
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
  // Tot ADR 0177 stond hier de spiegelbeeldige eis: elke belastingzin moest met
  // "Je Box 3-belasting" beginnen, omdat de status uitsluitend `box3TaxStatus`
  // was. De grondslag is nu onbenutte fiscale ruimte over Box 1 + Box 3, dus die
  // eis zou de zin juist onwaar maken.
  it('belasting spreekt over fiscale ruimte, niet over de hoogte van de heffing', () => {
    for (const s of STATUSSEN) {
      expect(HEFBOOM_OORDEELZIN.belasting[s].voor).toMatch(/^Je fiscale ruimte\b/)
    }
    // Geen enkele zin beweert nog iets over de hóógte van de belasting.
    for (const s of STATUSSEN) {
      expect(volledig(HEFBOOM_OORDEELZIN.belasting[s])).not.toMatch(/belastingdruk|heffing|hoog\b/i)
    }
  })

  it('schulden.good zegt niets over aflossen: schuldenvrij mét vermogen staat ook op groen', () => {
    expect(volledig(HEFBOOM_OORDEELZIN.schulden.good)).not.toMatch(/aflos|afgelost|schema/i)
  })

  // De cashflow-status mengt spaarquote en budgetoverschrijding 50/50. Alleen
  // budgetten met drie overschrijdingen is rood zonder gemeten tekort; 0% sparen
  // met alle budgetten binnen de limiet is groen. Noem dus geen van beide apart.
  it.each(['good', 'warn', 'bad'] as const)('budget.%s noemt geen van beide oorzaken apart', (s) => {
    expect(volledig(HEFBOOM_OORDEELZIN.cashflow[s])).not.toMatch(/spa(ar|ren)|doel|tekort/i)
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
      // "benut" staat hier niet los in: sinds ADR 0177 zegt de belastingzin
      // "goed benut" — een voltooid deelwoord over de eigen situatie, geen
      // gebiedende wijs. De imperatiefvorm ("benut je …", "benut de …") wordt
      // hieronder apart uitgesloten.
      expect(tekst, `${hefboom}.${status}`).not.toMatch(
        /\b(stort|verschuif|verkoop|koop|beleg|los af|verlaag|verhoog|zorg dat|optimaliseer)\b/i,
      )
      expect(tekst, `${hefboom}.${status}`).not.toMatch(/\bbenut (je|de|het|meer)\b/i)
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

  // De hedge "Mogelijk" op belasting.warn is met ADR 0177 vervallen: hij stond er
  // omdat "je betaalt meer dan nodig" een vermoeden was dat de bron niet kon
  // dragen. De nieuwe bron telt openstaande posten (partnerverdeling,
  // jaarruimte, samenstelling), dus "deels onbenut" is een constatering — en een
  // hedge boven een geteld bedrag zou de melding eronder juist tegenspreken.
  it('belasting hedget niet meer: de posten worden geteld, niet vermoed', () => {
    for (const s of STATUSSEN) {
      expect(HEFBOOM_OORDEELZIN.belasting[s].oordeel).not.toMatch(/mogelijk|waarschijnlijk/i)
    }
  })

  it('belasting onderscheidt de twee niet-groene banden in graad', () => {
    expect(HEFBOOM_OORDEELZIN.belasting.warn.oordeel).toBe('deels onbenut')
    expect(HEFBOOM_OORDEELZIN.belasting.bad.oordeel).toBe('grotendeels onbenut')
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
    ['schulden', 'warn', 'aandacht'],
    ['cashflow', 'good', 'op koers'],
    ['cashflow', 'warn', 'aandacht'],
    ['cashflow', 'bad', 'onder druk'],
    ['belasting', 'good', 'benut'],
    ['belasting', 'warn', 'onbenut'],
    ['belasting', 'bad', 'onbenut'],
  ] as const)('%s.%s deelt de kern "%s" met HEFBOOM_VERDICT', (h, s, kern) => {
    expect(HEFBOOM_OORDEELZIN[h][s].oordeel.toLowerCase()).toContain(kern)
    expect(HEFBOOM_VERDICT[h][s].toLowerCase()).toContain(kern)
  })
})
