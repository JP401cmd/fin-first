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
  clearedAge: null,
  housing: null,
  aowAge: 67.25,
  displayEndAge: 95,
  isPensioenMode: false,
  homeExcludedFromFire: false,
  geenTekortLeningAan: false,
  peakText: '€ 42.000',
  freedomText: '1 jaar en 4 maanden',
}

/** Alle zichtbare zinnen van een copy-object als één string. */
function allText(copy: DeficitLoanCopy): string {
  return [
    copy.periode,
    copy.waarom,
    copy.woning ?? '',
    copy.instelling,
    copy.piek,
    copy.lijn,
    copy.knoppen,
    copy.disclaimer,
  ].join(' ')
}

describe('buildDeficitLoanCopy — leenperiode volgt de rijen, niet de AOW-leeftijd', () => {
  // Given een tekort-lening die na AOW nog decennia doorloopt (eigenaar-meting 16 sep 2026),
  // When de copy wordt gebouwd,
  // Then noemt hij het werkelijke aflosmoment en beweert hij niet "tot je AOW-leeftijd".
  it('noemt het werkelijke aflosmoment wanneer de detector er een zag', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 51, clearedAge: 89 })
    expect(copy.variant).toBe('tot-aflossing')
    expect(copy.periode).toBe('De leenperiode loopt van leeftijd 51 tot leeftijd 89.')
    expect(allText(copy)).not.toContain('tot je AOW-leeftijd')
  })

  it('loopt door tot het einde van de projectie wanneer de lening openstaat', () => {
    const copy = buildDeficitLoanCopy(BASE)
    expect(copy.variant).toBe('tot-einde')
    expect(copy.periode).toContain('begint op leeftijd 58')
    expect(copy.periode).toContain('einde van je projectie (leeftijd 95)')
  })

  it('laat de bovengrens weg wanneer de eindleeftijd onbekend is en de lening openstaat', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, displayEndAge: null })
    expect(copy.periode).toBe('De leenperiode begint op leeftijd 58.')
  })

  it('meldt een later, nieuw tekort in plaats van te suggereren dat het na de aflossing klaar is', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 55, clearedAge: 60, terugkeerAge: 75 })
    expect(copy.periode).toBe('De leenperiode loopt van leeftijd 55 tot leeftijd 60. Vanaf leeftijd 75 ontstaat opnieuw een tekort-lening.')
  })

  it('toont nooit een decimale leeftijd', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 58.75, clearedAge: 70.5, aowAge: 67.25 })
    expect(copy.periode).toBe('De leenperiode loopt van leeftijd 58 tot leeftijd 70.')
    expect(allText(copy)).not.toMatch(/58[.,]7|67[.,]2|70[.,]5/)
  })
})

describe('buildDeficitLoanCopy — waarom er geleend wordt', () => {
  it('noemt dat AOW en pensioen nog niet begonnen zijn wanneer AOW ná de start ligt, canoniek geschreven', () => {
    const copy = buildDeficitLoanCopy(BASE)
    expect(copy.waarom).toContain('AOW (vanaf 67 jaar en 3 maanden) en pensioen zijn nog niet begonnen')
    expect(copy.waarom).toContain('liquide vermogen is dan op')
  })

  it('noemt dat het inkomen de uitgaven niet dekt wanneer AOW al loopt of onbekend is', () => {
    for (const input of [{ ...BASE, aowAge: null }, { ...BASE, firstAge: 72 }]) {
      const copy = buildDeficitLoanCopy(input)
      expect(copy.waarom).toContain('inkomen dekt je uitgaven niet volledig')
      expect(copy.waarom).not.toContain('nog niet begonnen')
    }
  })
})

describe('buildDeficitLoanCopy — woonstrategie', () => {
  const opeet = (reverseMortgageStartAge: number | null) => ({
    mode: 'reverse_mortgage' as const,
    saleAge: null,
    reverseMortgageStartAge,
  })
  const verkoop = (saleAge: number | null) => ({
    mode: 'downsize' as const,
    saleAge,
    reverseMortgageStartAge: null,
  })
  const vol = { mode: 'include_full' as const, saleAge: null, reverseMortgageStartAge: null }

  it('legt bij exclude_from_fire uit dat het huis in dit plan niet meetelt', () => {
    const copy = buildDeficitLoanCopy({
      ...BASE,
      homeExcludedFromFire: true,
      housing: { mode: 'exclude_from_fire', saleAge: null, reverseMortgageStartAge: null },
    })
    expect(copy.woning).toContain('Je huis telt in dit plan niet mee')
    expect(copy.woning).toContain('overwaarde')
  })

  it('laat de woning-zin weg zonder eigen woning of bij volledig meetellen', () => {
    expect(buildDeficitLoanCopy(BASE).woning).toBeNull()
    expect(buildDeficitLoanCopy({ ...BASE, housing: vol }).woning).toBeNull()
  })

  it('opeethypotheek die ná de eerste tekort-leeftijd start: benoemt de keuze, het startmoment en het resterende gat', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 51, clearedAge: 89, housing: opeet(67) })
    expect(copy.woning).toContain('Je hebt een opeethypotheek gekozen')
    expect(copy.woning).toContain('voor het eerst op op leeftijd 67')
    expect(copy.woning).toContain('opname uit je huis vult het gat niet volledig')
  })

  it('opeethypotheek waarna de lening snel op nul staat → geen oorzaakclaim (dat kan ook AOW zijn)', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 51, clearedAge: 53, housing: opeet(52) })
    expect(copy.woning).toContain('voor het eerst op op leeftijd 52')
    expect(copy.woning).not.toContain('blijft er een tekort-lening openstaan')
    expect(copy.woning).not.toMatch(/weer op nul|afgelost/)
  })

  it('opeethypotheek die al loopt vóór het tekort → de opname vult het gat niet volledig', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 60, housing: opeet(52) })
    expect(copy.woning).toContain('neemt op vanaf leeftijd 52')
    expect(copy.woning).toContain('vult het gat niet volledig')
  })

  it('opeethypotheek die in de projectie niet start', () => {
    expect(buildDeficitLoanCopy({ ...BASE, housing: opeet(null) }).woning).toContain('wordt er niets uit opgenomen')
  })

  it('verkoop ná de eerste tekort-leeftijd die de lening aflost → noemt verkoop en aflossing', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 55, clearedAge: 67, housing: verkoop(67) })
    expect(copy.woning).toBe(
      'Je huis wordt in deze projectie verkocht op leeftijd 67. Tot die verkoop dekt de tekort-lening het gat; met de opbrengst is hij daarna afgelost.',
    )
  })

  it('verkoop die de lening niet volledig aflost', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, firstAge: 55, clearedAge: null, housing: verkoop(67) })
    expect(copy.woning).toContain('De opbrengst is niet genoeg om hem helemaal af te lossen')
  })

  it('verkoop die al vóór het tekort plaatsvond, en verkoop die niet gebeurt', () => {
    expect(buildDeficitLoanCopy({ ...BASE, firstAge: 70, housing: verkoop(60) }).woning).toContain('al verkocht op leeftijd 60')
    expect(buildDeficitLoanCopy({ ...BASE, housing: verkoop(null) }).woning).toContain('dat gebeurt in deze projectie niet')
  })

  it('biedt een ingang naar de woonstrategie zodra er een eigen woning is', () => {
    expect(buildDeficitLoanCopy(BASE).toonWoonstrategieLink).toBe(false)
    expect(buildDeficitLoanCopy({ ...BASE, housing: opeet(67) }).toonWoonstrategieLink).toBe(true)
    expect(buildDeficitLoanCopy({ ...BASE, housing: vol }).toonWoonstrategieLink).toBe(true)
  })
})

describe('buildDeficitLoanCopy — instelling "Geen tekort-lening in mijn plan" (ADR 0149)', () => {
  // Given een aangesproken tekort-lening,
  // When de melding wordt gebouwd,
  // Then benoemt hij altijd de instelling en biedt hij de ingang ernaartoe.
  it('noemt bij uit dat het plan een tekort-lening toestaat', () => {
    const copy = buildDeficitLoanCopy(BASE)
    expect(copy.instelling).toContain('staat een tekort-lening nu toe')
    expect(copy.toonInstellingLink).toBe(true)
  })

  it('noemt bij aan + vast stopmoment dat de lening door dat stopmoment toch nodig is', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, geenTekortLeningAan: true, vastStopmoment: true })
    expect(copy.instelling).toContain('niet in je plan hoort')
    expect(copy.instelling).toContain('met je gekozen stopmoment')
    expect(copy.instelling).not.toContain('staat een tekort-lening nu toe')
    expect(copy.toonInstellingLink).toBe(true)
  })

  it('claimt bij aan zónder vast stopmoment geen gekozen stopmoment (randgeval venster / onhaalbaar plan)', () => {
    const copy = buildDeficitLoanCopy({ ...BASE, geenTekortLeningAan: true, vastStopmoment: false })
    expect(copy.instelling).toContain('niet in je plan hoort')
    expect(copy.instelling).not.toContain('gekozen stopmoment')
  })

  it('noemt de instelling bij de keuzes die het bedrag beïnvloeden', () => {
    expect(buildDeficitLoanCopy(BASE).knoppen).toContain('of een tekort-lening in je plan mag')
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
        // opeet start ná het tekort, lening loopt lang door
        { aowAge: 67.25, firstAge: 51, displayEndAge: 95, clearedAge: 89, housing: { mode: 'reverse_mortgage' as const, saleAge: null, reverseMortgageStartAge: 67 } },
        // opeet dicht het gat kort na de start
        { aowAge: 67.25, firstAge: 51, displayEndAge: 95, clearedAge: 53, housing: { mode: 'reverse_mortgage' as const, saleAge: null, reverseMortgageStartAge: 52 } },
        // verkoop gebeurt niet, tekort ná AOW, openstaand
        { aowAge: 67.25, firstAge: 72, displayEndAge: 95, clearedAge: null, housing: { mode: 'downsize' as const, saleAge: null, reverseMortgageStartAge: null } },
        // verkoop lost af (FIRE-tak)
        { aowAge: null, firstAge: 48, displayEndAge: 90, clearedAge: 67, housing: { mode: 'downsize' as const, saleAge: 67, reverseMortgageStartAge: null } },
        // geen woning, geen bovengrens
        { aowAge: null, firstAge: 48, displayEndAge: null, clearedAge: null, housing: null },
      ].flatMap((periode): DeficitLoanCopyInput[] =>
        [
          { peakText: '€ 42.000', freedomText: '1 jaar en 4 maanden' },
          { peakText: '•••', freedomText: null },
        ].map((bedrag) => ({
          ...BASE,
          ...periode,
          ...bedrag,
          isPensioenMode,
          homeExcludedFromFire,
          geenTekortLeningAan: homeExcludedFromFire,
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
