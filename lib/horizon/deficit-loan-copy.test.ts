/**
 * Unit-tests op de situatie-specifieke tekort-lening-copy.
 *
 * Twee lagen:
 *  1. PLAN-VARIANTEN — de copy moet per plan iets ANDERS zeggen: pensioen- vs.
 *     FIRE-tak, woning binnen vs. buiten de FIRE-pot, korte vs. lange
 *     leenperiode. Een copy die overal hetzelfde zegt is precies de melding die
 *     deze uitbreiding vervangt.
 *  2. TOON-GRENDEL — élke variant blijft binnen de Wft-grens: inzicht mag,
 *     aanbevelen niet. Bewust een assertie op de GEBOUWDE strings (sterker dan
 *     een bron-scan): een nieuwe zin die morgen wordt toegevoegd valt hier
 *     automatisch onder.
 */

import { describe, it, expect } from 'vitest'
import {
  buildDeficitLoanCopy,
  type DeficitLoanCopy,
  type DeficitLoanCopyInput,
} from '@/lib/horizon/deficit-loan-copy'

const BASE: DeficitLoanCopyInput = {
  firstAge: 58,
  aowAge: 67.25,
  displayEndAge: 95,
  isPensioenMode: false,
  homeExcludedFromFire: false,
  peakText: '€ 42.000',
  freedomText: '1 jaar en 4 maanden',
}

/** Alle zichtbare zinnen van een copy-object als één string. */
function allText(copy: DeficitLoanCopy): string {
  return [
    copy.periode,
    copy.waarom,
    copy.woning ?? '',
    copy.piek,
    copy.lijn,
    copy.knoppen,
    copy.disclaimer,
  ].join(' ')
}

describe('buildDeficitLoanCopy — leenperiode', () => {
  it('gebruikt de AOW-leeftijd als bovengrens wanneer die ná de eerste tekort-leeftijd ligt', () => {
    const copy = buildDeficitLoanCopy(BASE)
    expect(copy.variant).toBe('tot-aow')
    expect(copy.periode).toBe('De leenperiode loopt van leeftijd 58 tot je AOW-leeftijd (67).')
  })

  it('valt terug op de plan-eindleeftijd wanneer de AOW-leeftijd al gepasseerd is', () => {
    // Tekort ontstaat pás ná AOW: dan is "tot je AOW-leeftijd" feitelijk onjuist.
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 72, aowAge: 67.25 })
    expect(copy.variant).toBe('tot-einde')
    expect(copy.periode).toContain('begint op leeftijd 72')
    expect(copy.periode).toContain('einde van je projectie (leeftijd 95)')
  })

  it('valt terug op de plan-eindleeftijd zonder bekende AOW-leeftijd', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, aowAge: null })
    expect(copy.variant).toBe('tot-einde')
    expect(copy.periode).toContain('leeftijd 95')
  })

  it('laat de bovengrens weg wanneer noch AOW noch eindleeftijd bekend is', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, aowAge: null, displayEndAge: null })
    expect(copy.periode).toBe('De leenperiode begint op leeftijd 58.')
  })

  it('kapt fractionele leeftijden af op hele jaren (geen 67,25 op het scherm)', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 58.75, aowAge: 67.25 })
    expect(copy.periode).toContain('leeftijd 58')
    expect(copy.periode).toContain('(67)')
    expect(copy.periode).not.toMatch(/58[.,]7|67[.,]2/)
  })

  it('onderscheidt een korte van een lange leenperiode via de genoemde grenzen', () => {
    const kort = buildDeficitLoanCopy({ ...BASE, firstAge: 66, aowAge: 67.25 })
    const lang = buildDeficitLoanCopy({ ...BASE, firstAge: 52, aowAge: 67.25 })
    expect(kort.periode).toContain('van leeftijd 66 tot je AOW-leeftijd (67)')
    expect(lang.periode).toContain('van leeftijd 52 tot je AOW-leeftijd (67)')
    expect(kort.periode).not.toBe(lang.periode)
  })
})

describe('buildDeficitLoanCopy — waarom er geleend wordt', () => {
  it('noemt in de pensioen-tak dat AOW en pensioen nog niet begonnen zijn', () => {
    const copy = buildDeficitLoanCopy(BASE)
    expect(copy.waarom).toContain('AOW en pensioen zijn nog niet begonnen')
    expect(copy.waarom).toContain('liquide vermogen is dan op')
  })

  it('noemt in de tot-einde-tak dat het inkomen de uitgaven niet volledig dekt', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, aowAge: null })
    expect(copy.waarom).toContain('inkomen dekt je uitgaven niet volledig')
    expect(copy.waarom).not.toContain('AOW en pensioen zijn nog niet begonnen')
  })
})

describe('buildDeficitLoanCopy — woonstrategie', () => {
  it('legt bij exclude_from_fire uit dat het huis in dit plan niet meetelt', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, homeExcludedFromFire: true })
    expect(copy.woning).not.toBeNull()
    expect(copy.woning).toContain('Je huis telt in dit plan niet mee')
    expect(copy.woning).toContain('overwaarde')
  })

  it('laat de woning-zin weg wanneer het huis wél meetelt', () => {
    expect(buildDeficitLoanCopy({ ...BASE, homeExcludedFromFire: false }).woning).toBeNull()
  })
})

describe('buildDeficitLoanCopy — piek en vermogenslijn', () => {
  it('koppelt de piek aan zijn vrijheidstijd-vertaling', () => {
    const copy = buildDeficitLoanCopy(BASE)
    expect(copy.piek).toContain('€ 42.000')
    expect(copy.piek).toContain('1 jaar en 4 maanden vrijheid die je later terugkoopt')
  })

  it('laat de vrijheidstijd weg als die er niet is (masked / geen dagtarief)', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, peakText: '•••', freedomText: null })
    expect(copy.piek).toBe('Op het diepste punt staat er ••• open.')
    expect(copy.piek).not.toContain('vrijheid')
  })

  it('legt uit waarom de vermogenslijn het tekort niet toont', () => {
    expect(buildDeficitLoanCopy(BASE).lijn).toContain('nettovermogen, waarin het tekort al is verrekend')
  })
})

describe('buildDeficitLoanCopy — welke keuzes het getal beïnvloeden', () => {
  it('noemt in de FIRE-tak de stopleeftijd', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, isPensioenMode: false })
    expect(copy.knoppen).toContain('woonstrategie')
    expect(copy.knoppen).toContain('liquide opbouw vóór leeftijd 58')
    expect(copy.knoppen).toContain('leeftijd waarop je stopt met werken')
  })

  it('noemt in pensioen-modus de AOW- en pensioendatum in plaats van de stopleeftijd', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, isPensioenMode: true })
    expect(copy.knoppen).toContain('AOW- en pensioendatum')
    expect(copy.knoppen).not.toContain('stopt met werken')
  })

  it('formuleert de keuzes als FEIT ("beweegt mee met"), niet als opdracht', () => {
    expect(buildDeficitLoanCopy(BASE).knoppen).toContain('beweegt mee met')
  })
})

describe('buildDeficitLoanCopy — Wft-toon-grendel over alle plan-varianten', () => {
  /** Kruisproduct van de varianten die de copy laat afwijken. */
  const VARIANTEN: DeficitLoanCopyInput[] = [false, true].flatMap((isPensioenMode) =>
    [false, true].flatMap((homeExcludedFromFire) =>
      [
        { aowAge: 67.25, firstAge: 58, displayEndAge: 95 }, // tot-aow, lang
        { aowAge: 67.25, firstAge: 66, displayEndAge: 95 }, // tot-aow, kort
        { aowAge: 67.25, firstAge: 72, displayEndAge: 95 }, // tot-einde (ná AOW)
        { aowAge: null, firstAge: 48, displayEndAge: 90 }, // tot-einde (FIRE)
        { aowAge: null, firstAge: 48, displayEndAge: null }, // geen bovengrens
      ].flatMap((periode) =>
        [
          { peakText: '€ 42.000', freedomText: '1 jaar en 4 maanden' },
          { peakText: '•••', freedomText: null },
        ].map((bedrag) => ({
          ...BASE,
          ...periode,
          ...bedrag,
          isPensioenMode,
          homeExcludedFromFire,
        })),
      ),
    ),
  )

  const VERBODEN = [
    'je moet',
    'wij raden',
    'we raden',
    'ons advies',
    'verhoog je',
    'verlaag je',
    'zorg dat je',
    'het beste',
    'gegarandeerd',
    'gegarandeerde',
    'zou je',
  ]

  it('dekt alle plan-varianten af (kruisproduct is niet stilletjes leeg)', () => {
    expect(VARIANTEN.length).toBe(40)
  })

  it('bevat in geen enkele variant een aanbevelende of belovende formulering', () => {
    for (const input of VARIANTEN) {
      const tekst = allText(buildDeficitLoanCopy(input)).toLowerCase()
      for (const verboden of VERBODEN) {
        expect(
          tekst,
          `advies-formulering "${verboden}" in variant ${JSON.stringify(input)}`,
        ).not.toContain(verboden)
      }
    }
  })

  it('draagt in elke variant de app-brede disclaimer-conventie', () => {
    for (const input of VARIANTEN) {
      expect(buildDeficitLoanCopy(input).disclaimer).toContain('Indicatie, geen advies —')
    }
  })

  it('spreekt de gebruiker in elke variant informeel aan (je/jij, nooit u)', () => {
    for (const input of VARIANTEN) {
      const tekst = allText(buildDeficitLoanCopy(input))
      expect(tekst).toMatch(/\bje\b/)
      expect(tekst).not.toMatch(/\b[Uu]w\b/)
    }
  })

  it('bevat geen emoji (product-copy-regel)', () => {
    for (const input of VARIANTEN) {
      expect(allText(buildDeficitLoanCopy(input))).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})
