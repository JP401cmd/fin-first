import { describe, it, expect } from 'vitest'
import {
  ankerVraag,
  ankerVrijZin,
  ANKER_KPI_LABEL,
  ankerGrafiekZin,
  ankerKort,
  ankerKpiCaption,
  ankerReachFromRunway,
  ankerReachFromSim,
  ankerReachYear,
  ankerReachesAge,
  ankerStopFromSim,
  ankerTitel,
  ankerZin,
  ankerZinKort,
  fireAgeGoalNotApplicableReason,
  formatStopAge,
  dekkingSheetToelichting,
  dekkingPreviewWaarde,
  planCoverageKaartSubregel,
  planCoverageGoalNotApplicableReason,
  vrijheidsgetalGoalNotApplicableReason,
  dekkingVerkenZin,
  dekkingBadge,
  dekkingDeltaBadge,
  dekkingAsNotitie,
  radarSubtitel,
  radarEindstrategieAnkerReden,
  antwoordDoorwerken,
  antwoordMeerSalaris,
  HEFBOOM_COPY,
  spaarquoteEuroRegel,
  antwoordMinderUitgeven,
  ANTWOORD_KNOP,
  ANTWOORD_KNOP_MAX,
  ANTWOORD_BOVEN_BEREIK,
  dekkingVastgelegdToast,
  DEKKINGSAS_COPY,
  doelenPlanGewijzigdMelding,
  DOELEN_MELDING_ACTIES,
  planCoverageGoalName,
  eindvermogenTegelCaption,
  eindvermogenOpTegel,
  eindvermogenOpgeslagenNoot,
  eindvermogenGoalNotApplicableReason,
  EINDVERMOGEN_DELTA_DREMPEL,
  eindvermogenPreviewWaarde,
  eindvermogenDeltaBadge,
  eindvermogenSheetToelichting,
  eindvermogenGoalName,
  eindvermogenVastgelegdToast,
  ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT,
  rapportAnkerVoortgang,
  type AnkerReach,
  type AnkerStop,
} from './anker-copy'
import {
  nuStoppenGrafiekZin,
  nuStoppenZin,
  nuStoppenZinKort,
} from './nu-stoppen-copy'
import type { RunwayResult } from './runway'
import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

/**
 * ADR 0129 F3a — de anker-generieke opvolger van `nu-stoppen-copy.test.ts`. De
 * toon-invarianten uit de bijlage van het besluit gelden nu over ÁLLE ankers:
 * geen aansporing, geen eeuwigheidsclaim, geen "AOW" in een tekortzin, en de
 * grondslag heet "liquide vermogen". Plus: het nu-anker is byte-identiek aan de
 * ADR 0127-kopij (de compat-laag bewijst dat).
 */

const STOPS: readonly [string, AnkerStop][] = [
  ['now', { kind: 'now' }],
  ['aow 67', { kind: 'aow', stopAge: 67 }],
  ['age 58,5', { kind: 'age', stopAge: 58.5 }],
  ['age 62', { kind: 'age', stopAge: 62 }],
]

const REACHES: readonly AnkerReach[] = [
  { kind: 'gedekt', endAge: 90 },
  { kind: 'gedekt', endAge: null },
  { kind: 'reikt-tot', age: 57.5, endAge: 90 },
  { kind: 'reikt-tot', age: 57.5, endAge: null },
  { kind: 'nu-op' },
  { kind: 'onbekend' },
]

describe('ankerStopFromSim — het stopmoment uit de kernel-echo (bevinding 11)', () => {
  it('leeftijd-anker: vastStopLeeftijd wint, fractioneel', () => {
    expect(ankerStopFromSim({ stopAnker: { soort: 'leeftijd', leeftijd: 58.5 }, vastStopLeeftijd: 58.5 })).toEqual({ kind: 'age', stopAge: 58.5 })
    // Zonder vastStopLeeftijd de ankerleeftijd zelf — nooit iets afgeronds.
    expect(ankerStopFromSim({ stopAnker: { soort: 'leeftijd', leeftijd: 58.5 }, vastStopLeeftijd: undefined })).toEqual({ kind: 'age', stopAge: 58.5 })
  })
  it('aow: de leeftijd van de run; zonder leeftijd geen stopmoment', () => {
    expect(ankerStopFromSim({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: 67.25 })).toEqual({ kind: 'aow', stopAge: 67.25 })
    expect(ankerStopFromSim({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: null })).toBeNull()
  })
  it('nu → now; solved → null', () => {
    expect(ankerStopFromSim({ stopAnker: { soort: 'nu' }, vastStopLeeftijd: 42 })).toEqual({ kind: 'now' })
    expect(ankerStopFromSim({ stopAnker: null, vastStopLeeftijd: 55 })).toBeNull()
    expect(ankerStopFromSim({ stopAnker: undefined, vastStopLeeftijd: undefined })).toBeNull()
  })
})

describe('ankerReachFromSim — kernel-uitvoer → bereik (anker-onafhankelijk)', () => {
  it('undefined uitputtingsmaand is ONBEKEND, null is GEDEKT, 0 is NU-OP', () => {
    expect(ankerReachFromSim({ startAge: 42, kernelDepletionMonth: undefined, endAge: 90 })).toEqual({ kind: 'onbekend' })
    expect(ankerReachFromSim({ startAge: 42, kernelDepletionMonth: null, endAge: 90 })).toEqual({ kind: 'gedekt', endAge: 90 })
    expect(ankerReachFromSim({ startAge: 42, kernelDepletionMonth: 0, endAge: 90 })).toEqual({ kind: 'nu-op' })
  })
  it('maand > 0 vóór de eindleeftijd → reikt-tot op de kernel-tijdas (startAge + m/12)', () => {
    const reach = ankerReachFromSim({ startAge: 42, kernelDepletionMonth: 480, endAge: 90 })
    expect(reach).toEqual({ kind: 'reikt-tot', age: 82, endAge: 90 })
    expect(ankerReachesAge(reach)).toBe(82)
  })
  it('gedekt zonder plan-einde reikt tot het horizonplafond (nooit "oneindig")', () => {
    expect(ankerReachesAge({ kind: 'gedekt', endAge: null })).toBe(HORIZON_PLAFOND_LEEFTIJD)
    expect(ankerReachesAge({ kind: 'nu-op' })).toBeNull()
  })
  it('uit een RunwayResult: alle vijf vormen', () => {
    const basis = { expenseBasis: { yearly: 30_000, method: 'essential_budgets' as const }, strategy: 'Vermogen opeten' as never, solverStatus: 'reached_now' as never, startAge: 42 }
    expect(ankerReachFromRunway({ ...basis, kind: 'months', months: 126, depletionAge: 52.5, endAge: 90 } as RunwayResult)).toEqual({ kind: 'reikt-tot', age: 52.5, endAge: 90 })
    expect(ankerReachFromRunway({ ...basis, kind: 'reaches-end-age', endAge: 90 } as RunwayResult)).toEqual({ kind: 'gedekt', endAge: 90 })
    expect(ankerReachFromRunway({ ...basis, kind: 'beyond-horizon' } as RunwayResult)).toEqual({ kind: 'gedekt', endAge: null })
    expect(ankerReachFromRunway({ ...basis, kind: 'deficit' } as RunwayResult)).toEqual({ kind: 'nu-op' })
    expect(ankerReachFromRunway({ kind: 'unavailable', reason: 'kern-fout' })).toEqual({ kind: 'onbekend' })
  })
})

describe('woorden — stopmoment en titel', () => {
  it('formatStopAge: hele jaren kaal, halve jaren met komma', () => {
    expect(formatStopAge(62)).toBe('62')
    expect(formatStopAge(58.5)).toBe('58,5')
  })
  it('de titel volgt het anker', () => {
    expect(ankerTitel({ kind: 'now' })).toBe('Je rekent alsof je nu stopt')
    expect(ankerTitel({ kind: 'age', stopAge: 58.5 })).toBe('Je rekent met stoppen op 58,5')
    expect(ankerTitel({ kind: 'aow', stopAge: 67 })).not.toMatch(/\bAOW\b/)
  })
  it('afronding volgt het hero-kopgetal; korte regel en caption', () => {
    expect(ankerReachYear({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe(58)
    expect(ankerReachYear({ kind: 'gedekt', endAge: null })).toBeNull()
    expect(ankerKort({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe(`${ANKER_KPI_LABEL}: 58 jr`)
    expect(ankerKpiCaption({ kind: 'gedekt', endAge: 90 })).toContain('einde van je plan')
  })
  /**
   * Melding 18-09-2026 — de tegel "Vermogen op je stopmoment" toonde een bedrag
   * zonder te zeggen WELKE grootheid het is (netto LIQUIDE: zonder eigen woning en
   * ná aftrek van de niet-woningschulden). De gebruiker las het als een doelbedrag
   * en vond het te laag. In de `solved`-tak noemt het onderschrift zijn grondslag
   * al ("benodigd — met/zonder je huis", FIRE_DOEL_ONDERSCHRIFT); onder een vast
   * anker viel die kwalificatie weg.
   */
  it('het onderschrift van de vermogenstegel noemt de grondslag in gewone woorden', () => {
    // Eigenaarsbesluit 18-09-2026: de grondslag moet erin, maar zónder vakterm en
    // zónder de kicker ("Vermogen op je stopmoment") te herhalen. De twee dingen die
    // de lezer miste: het huis zit er NIET in en de schulden zijn er al áf.
    // Spiegelt bewust het woordpaar "met je huis / zonder je huis" van de solved-tak
    // (`FIRE_DOEL_KWALIFICATIE`), zodat beide takken één taal spreken. Niet tegen dié
    // constante geassert: dat zou deze suite rood maken voor een wijziging in een
    // ander bestand.
    expect(ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT).toBe('zonder je huis, na schulden')
    // Geen vakterm in de enige duidingsregel (ui-ux: die hoort in de kicker/title).
    expect(ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT).not.toMatch(/liquide/i)
    // Geen herhaling van de kicker erboven.
    expect(ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT).not.toMatch(/stopmoment/i)
    // Geen doel-woord: onder een vast anker bestaat er geen doelbedrag (ADR 0129 D4).
    expect(ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT).not.toMatch(/benodigd|doel/i)
  })
})

/**
 * Wat een RAPPORTAGE zegt in de plaats van "FIRE-voortgang X %" (eindreview 18-09-2026).
 * De rapportpagina toonde die kapitaalratio én een balk met "Doel: € X" naast een
 * vergelijkingstabel die al "—" gaf. Onder een vast anker bestaat dat doelbedrag niet;
 * het rapport draait geen kernel-run, dus de dekking is daar niet beschikbaar.
 */
describe('rapportAnkerVoortgang — het rapport onder een vast stopmoment', () => {
  it('geeft per anker een korte cel-kop en een uitleg', () => {
    expect(rapportAnkerVoortgang('now', null).kop).toBe('Je stopt nu')
    expect(rapportAnkerVoortgang('aow', null).kop).toBe('Je AOW-leeftijd')
    expect(rapportAnkerVoortgang('age', 58.5).kop).toBe('58,5')
    // Zonder leeftijd (defensief; de DB-CHECK verbiedt `age` zonder getal) nog steeds
    // een leesbare cel — nooit "null" of een leeg vak.
    expect(rapportAnkerVoortgang('age', null).kop).toBe('Vast stopmoment')
  })

  it('zegt in de uitleg dat er geen doelvermogen is, en wat er wél telt', () => {
    for (const [anchor, age] of [['now', null], ['aow', null], ['age', 58.5]] as const) {
      const { uitleg } = rapportAnkerVoortgang(anchor, age)
      expect(uitleg).toContain('geen doelvermogen')
      expect(uitleg).toContain('hoe ver je plan reikt')
      // Toon-invariant van deze module: beschrijvend, nooit aansporend.
      expect(uitleg).not.toMatch(/je kunt (nu )?(al )?stoppen|je moet|oneindig/i)
    }
  })

  it('noemt "AOW" alleen als instellingslabel — nooit in een tekortzin', () => {
    // Zelfde uitzondering als `planCoverageKaartSubregel`: dit is het LABEL van een
    // gekozen stopmoment, niet een uitspraak over een tekort.
    expect(rapportAnkerVoortgang('aow', null).uitleg).toContain('je AOW-leeftijd')
    expect(rapportAnkerVoortgang('age', 58.5).uitleg).not.toMatch(/\bAOW\b/i)
    expect(rapportAnkerVoortgang('now', null).uitleg).not.toMatch(/\bAOW\b/i)
  })
})

describe('de zinnen uit de ADR-bijlage', () => {
  it('gedekt onder een vast stopmoment: "tot voorbij je {eind}e — het einde van je plan"', () => {
    expect(ankerZin({ kind: 'gedekt', endAge: 90 }, { kind: 'age', stopAge: 62 })).toBe(
      'Als je op 62 stopt, reikt je liquide vermogen tot voorbij je 90e — het einde van je plan.',
    )
  })
  it('tekort onder een vast stopmoment: "reikt tot je {reikt}e. Je plan loopt tot je {eind}e."', () => {
    expect(ankerZin({ kind: 'reikt-tot', age: 83.4, endAge: 90 }, { kind: 'aow', stopAge: 67 })).toBe(
      'Als je op 67 stopt, reikt je liquide vermogen tot je 83e. Je plan loopt tot je 90e.',
    )
  })
  it('het nu-anker is byte-identiek aan de ADR 0127-kopij (de compat-laag)', () => {
    for (const r of REACHES) {
      expect(nuStoppenZin(r)).toBe(ankerZin(r, { kind: 'now' }))
      expect(nuStoppenZinKort(r)).toBe(ankerZinKort(r, { kind: 'now' }))
      expect(nuStoppenGrafiekZin(r)).toBe(ankerGrafiekZin(r, { kind: 'now' }))
    }
    expect(ankerZin({ kind: 'gedekt', endAge: 90 }, { kind: 'now' })).toBe(
      'Als je nu stopt, reikt je liquide vermogen tot je 90e — het einde van je plan.',
    )
  })
  it('de fire_age-doelnotitie noemt het stopmoment en het plan-einde', () => {
    expect(fireAgeGoalNotApplicableReason('age', 62, 90)).toBe(
      'Je stopmoment ligt vast op 62, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is of je plan tot je 90e reikt.',
    )
    expect(fireAgeGoalNotApplicableReason('now', null, 90)).toMatch(/^Je rekent alsof je nu stopt/)
    expect(fireAgeGoalNotApplicableReason('aow', 67, null)).toContain('tot je eindleeftijd reikt')
  })
})

describe('toon — de harde randvoorwaarden, over ALLE ankers gedraaid', () => {
  const zinnen = (r: AnkerReach, s: AnkerStop) => [ankerZin(r, s), ankerZinKort(r, s), ankerGrafiekZin(r, s)]

  it.each(STOPS)('%s — beschrijvend, nooit aansporend, nooit oneindig, nooit AOW, altijd liquide', (_l, stop) => {
    for (const reach of REACHES) {
      for (const zin of zinnen(reach, stop)) {
        expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
        expect(zin).not.toMatch(/stop met werken/i)
        expect(zin).not.toMatch(/oneindig|eeuwig|voorgoed|voor altijd/i)
        expect(zin).not.toMatch(/\bAOW\b/i)
        if (/vermogen/i.test(zin)) {
          expect(zin, `grondslag ontbreekt: "${zin}"`).toMatch(/liquide vermogen/i)
        }
      }
    }
  })

  it('een tekort wordt onder geen enkel anker als volledige dekking geformuleerd', () => {
    for (const [, stop] of STOPS) {
      const zin = ankerZin({ kind: 'reikt-tot', age: 57.5, endAge: 90 }, stop)
      expect(zin).toContain('58')
      expect(zin).not.toMatch(/einde van je plan\.$/)
      expect(ankerGrafiekZin({ kind: 'reikt-tot', age: 57.5, endAge: 90 }, stop)).not.toMatch(/naar nul rond leeftijd/i)
    }
  })

  it('de notitie op de doelkaart draagt dezelfde toon', () => {
    for (const a of ['aow', 'now', 'age'] as const) {
      const n = fireAgeGoalNotApplicableReason(a, 62, 90)
      expect(n).not.toMatch(/je kunt (nu )?(al )?stoppen|oneindig|\bAOW\b/i)
    }
  })
})

// ── ADR 0145 — dekking als uitkomst van het lab (zinnen B6, compliance 14 sep 2026) ──

describe('dekking-zinnen — de vastgestelde kopij', () => {
  const AGE: AnkerStop = { kind: 'age', stopAge: 58.5 }
  const AOW: AnkerStop = { kind: 'aow', stopAge: 67 }

  it('1 · sheet-toelichting', () => {
    expect(dekkingSheetToelichting(AGE, 90)).toBe(
      'Je stopmoment ligt vast op 58,5. Het lab legt daarom geen vrijheidsleeftijd vast, maar of je plan tot je 90e reikt.',
    )
    expect(dekkingSheetToelichting(AOW, null)).toBe(
      'Je stopmoment ligt vast op 67. Het lab legt daarom geen vrijheidsleeftijd vast, maar of je plan tot je eindleeftijd reikt.',
    )
  })

  it('2 · preview-rij "Plan gedekt"', () => {
    expect(dekkingPreviewWaarde(78.4, 100, 90)).toBe('nu 78% → 100% · doel 100% tot je 90e')
  })

  it('3 · kaart-subregel: age met getal, aow met "je AOW-leeftijd" (instellingslabel, geen tekortzin)', () => {
    expect(planCoverageKaartSubregel(90, 'age', 58.5)).toBe('tot je 90e · stopmoment 58,5')
    expect(planCoverageKaartSubregel(90, 'aow', null)).toBe('tot je 90e · stopmoment je AOW-leeftijd')
    expect(planCoverageKaartSubregel(90, null, null)).toBe('tot je 90e')
  })

  it('planCoverageGoalName is de ene bron voor de kaartnaam (rij én live)', () => {
    expect(planCoverageGoalName(90)).toBe('Plan gedekt tot 90 jaar')
    expect(planCoverageGoalName(92.5)).toBe('Plan gedekt tot 92,5 jaar')
    expect(planCoverageGoalName(null)).toBe('Plan gedekt')
  })

  it('doelen-melding: enkelvoud/meervoud, acties Bijwerken · Loslaten (spec §4/§5)', () => {
    expect(doelenPlanGewijzigdMelding(1)).toBe('Je plan is veranderd. 1 doel uit het lab past er niet meer bij.')
    expect(doelenPlanGewijzigdMelding(2)).toBe('Je plan is veranderd. 2 doelen uit het lab passen er niet meer bij.')
    expect(DOELEN_MELDING_ACTIES).toEqual({ bijwerken: 'Bijwerken', loslaten: 'Loslaten' })
  })

  it('4 · plan_coverage n.v.t. onder solved', () => {
    expect(planCoverageGoalNotApplicableReason()).toBe(
      'De app zoekt je stopmoment zelf, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is vanaf welke leeftijd werken een keuze wordt.',
    )
  })

  it('5 · vrijheidsgetal n.v.t. onder een vast anker', () => {
    expect(vrijheidsgetalGoalNotApplicableReason('age', 62, 90)).toBe(
      'Je stopmoment ligt vast op 62, dus er is geen doelvermogen om naartoe te sparen. Wat telt, is of je plan tot je 90e reikt.',
    )
    expect(vrijheidsgetalGoalNotApplicableReason('now', null, 90)).toMatch(/^Je rekent alsof je nu stopt, dus er is geen doelvermogen/)
    expect(vrijheidsgetalGoalNotApplicableReason('aow', 67, null)).toContain('tot je eindleeftijd reikt')
  })

  it('6 · verken-samenvatting', () => {
    expect(dekkingVerkenZin({ basisPct: 65.2, scenarioPct: 100, reikt: 90 })).toBe('Wat-als actief — plan gedekt 65% → 100%, reikt tot je 90e')
    expect(dekkingVerkenZin({ basisPct: 65.2, scenarioPct: 80, reikt: null })).toBe('Wat-als actief — plan gedekt 65% → 80%')
  })

  it('7 · badge en delta-badge', () => {
    expect(dekkingBadge(65.2)).toBe('65% gedekt')
    expect(dekkingDeltaBadge(12.4)).toBe('+12% gedekt')
    expect(dekkingDeltaBadge(-3.6)).toBe('−4% gedekt')
    expect(dekkingDeltaBadge(0.3)).toBe('gelijk')
  })

  it('8 · Vrijheidsas-notitie: tekort met dekking, gedekt wijst naar het eindvermogen (D12), onbekend → null', () => {
    expect(dekkingAsNotitie({ kind: 'reikt-tot', age: 82, endAge: 90 }, 65.2, 90)).toBe(
      'Je plan reikt nu tot je 82e — 65% gedekt. Draai aan de knoppen om te zien wat dat verandert.',
    )
    // ADR 0145 D12 — "er is niets vast te leggen" is niet meer waar: het lab legt dan het eindvermogen vast.
    expect(dekkingAsNotitie({ kind: 'gedekt', endAge: 90 }, 100, 90)).toBe(
      'Je plan is gedekt tot je 90e. Draai aan de knoppen om te zien wat er op je 90e over is.',
    )
    expect(dekkingAsNotitie({ kind: 'gedekt', endAge: 90 }, 100, 90)).not.toMatch(/niets vast te leggen/)
    expect(dekkingAsNotitie({ kind: 'nu-op' }, 0, 90)).toContain('0% gedekt')
    expect(dekkingAsNotitie({ kind: 'onbekend' }, null, 90)).toBeNull()
  })

  it('9 · radar-subtitel: plan · verkend · nu · solved (null = UI houdt haar tekst)', () => {
    expect(radarSubtitel({ stop: AGE, verkendStopAge: null })).toBe("Vier dekkingsratio's — gerekend op je plan: stoppen op 58,5.")
    expect(radarSubtitel({ stop: AOW, verkendStopAge: 62 })).toBe(
      "Vier dekkingsratio's — gerekend op een verkend stopmoment: stoppen op 62 jr; je plan rekent met 67.",
    )
    expect(radarSubtitel({ stop: { kind: 'now' }, verkendStopAge: null })).toBe("Vier dekkingsratio's — je rekent alsof je nu stopt.")
    expect(radarSubtitel({ stop: null, verkendStopAge: 60 })).toBeNull()
  })

  it('10 · radar-as 4 reden', () => {
    expect(radarEindstrategieAnkerReden()).toBe(
      'Onder een vast stopmoment is er geen doelvermogen om het eindvermogen tegen af te zetten — de dekking hiernaast zegt of je plan reikt.',
    )
  })

  it('draaiknoppen: vaste namen en de euro-regel onder de spaarquote (eigenaarskeuze 15 sep)', () => {
    expect(HEFBOOM_COPY).toEqual({
      meerSalaris: 'Meer salaris',
      spaarquote: 'Spaarquote',
      minderWerken: 'Minder werken',
      laterEerder: 'Later of eerder stoppen',
    })
    expect(spaarquoteEuroRegel(0)).toBeNull()
    expect(spaarquoteEuroRegel(0.4)).toBeNull()
    expect(spaarquoteEuroRegel(1290.2)).toBe('+€ 1.290/mnd minder uitgeven')
    expect(spaarquoteEuroRegel(-160)).toBe('−€ 160/mnd meer uitgeven')
    expect(spaarquoteEuroRegel(1290, true)).toBe(`+${MASKED_AMOUNT_PLACEHOLDER}/mnd minder uitgeven`)
  })

  // Apostrof: hetzelfde rechte teken (') als de rest van dit bestand ("zo'n", "ratio's").
  it('11 · antwoorden naast de knoppen — korte beschrijvende zinnen, twee knoplabels, boven-bereik-regel', () => {
    expect(ANTWOORD_KNOP).toBe('Reken hiermee')
    expect(ANTWOORD_KNOP_MAX).toBe('Reken met maximum')
    expect(antwoordDoorwerken(61)).toBe('Doorwerken tot 61 dekt je plan.')
    expect(antwoordDoorwerken(61.5)).toBe('Doorwerken tot 61,5 dekt je plan.')
    expect(antwoordMeerSalaris(2100.4)).toBe("Zo'n €2.100/mnd meer salaris hoort bij een gedekt plan.")
    expect(antwoordMinderUitgeven(2100.4)).toBe("Zo'n €2.100/mnd minder uitgeven hoort bij een gedekt plan.")
    expect(ANTWOORD_BOVEN_BEREIK).toBe('Meer dan deze knop toelaat.')
  })

  it('11 · privacy: de bedragen worden gemaskeerd, de zin blijft beschrijvend', () => {
    expect(antwoordMeerSalaris(2100, true)).toBe(`Zo'n ${MASKED_AMOUNT_PLACEHOLDER}/mnd meer salaris hoort bij een gedekt plan.`)
    expect(antwoordMinderUitgeven(2100, true)).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(antwoordMinderUitgeven(2100, true)).not.toMatch(/2\.100|€/)
  })

  it('11 · toon: geen instructie, geen AOW — STRIKT over zinnen én knoplabels (eindreview I5)', () => {
    const VERBODEN = /je moet|\bzet\b|verhoog|\bAOW\b/i
    // Geen uitzondering voor knoplabels meer: een gebiedend "Zet …" ging er in de compliance-
    // ronde van 14 sep bewust uit, dus elk label valt onder dezelfde regel als elke zin.
    for (const z of [
      antwoordDoorwerken(61),
      antwoordDoorwerken(61.5),
      antwoordMeerSalaris(500),
      antwoordMeerSalaris(500, true),
      antwoordMinderUitgeven(500),
      antwoordMinderUitgeven(500, true),
      ANTWOORD_BOVEN_BEREIK,
      ANTWOORD_KNOP,
      ANTWOORD_KNOP_MAX,
    ]) {
      expect(z).not.toMatch(VERBODEN)
    }
  })

  it('12 · toast', () => {
    expect(dekkingVastgelegdToast(90)).toBe('Je verkenning is nu je doel — de app volgt of je plan tot je 90e reikt.')
  })
})

describe('dekking-zinnen — toon-invarianten over alle ankers', () => {
  const STOPS_VAST: readonly AnkerStop[] = [
    { kind: 'aow', stopAge: 67 },
    { kind: 'age', stopAge: 58.5 },
    { kind: 'now' },
  ]
  const TEKORT_REACHES: readonly AnkerReach[] = [
    { kind: 'reikt-tot', age: 82, endAge: 90 },
    { kind: 'reikt-tot', age: 82, endAge: null },
    { kind: 'nu-op' },
  ]

  it('tekortzinnen: beschrijvend, nooit aansporend, nooit oneindig, nooit AOW', () => {
    for (const stop of STOPS_VAST) {
      const zinnen = [
        dekkingSheetToelichting(stop, 90),
        antwoordDoorwerken(61.5),
        antwoordMeerSalaris(300),
        antwoordMeerSalaris(300, true),
        antwoordMinderUitgeven(300),
        antwoordMinderUitgeven(300, true),
        ANTWOORD_BOVEN_BEREIK,
        ANTWOORD_KNOP,
        ANTWOORD_KNOP_MAX,
        radarSubtitel({ stop, verkendStopAge: null }) ?? '',
        radarSubtitel({ stop, verkendStopAge: 62 }) ?? '',
        ...TEKORT_REACHES.map((r) => dekkingAsNotitie(r, 40, 90) ?? ''),
        dekkingVerkenZin({ basisPct: 40, scenarioPct: 60, reikt: 84 }),
        dekkingBadge(40),
        dekkingDeltaBadge(20),
        radarEindstrategieAnkerReden(),
        dekkingVastgelegdToast(90),
        planCoverageGoalNotApplicableReason(),
      ]
      for (const zin of zinnen) {
        expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
        expect(zin).not.toMatch(/stop met werken/i)
        expect(zin).not.toMatch(/oneindig|eeuwig|voorgoed|voor altijd/i)
        expect(zin).not.toMatch(/\bAOW\b/i)
        expect(zin).not.toMatch(/\bmoet\b/i)
      }
    }
    for (const a of ['aow', 'now', 'age'] as const) {
      expect(vrijheidsgetalGoalNotApplicableReason(a, 62, 90)).not.toMatch(/je kunt (nu )?(al )?stoppen|oneindig|\bAOW\b/i)
    }
  })

  it('de antwoorden beschrijven, geen instructie: nooit "leg"/"spaar"', () => {
    for (const zin of [antwoordDoorwerken(60), antwoordMeerSalaris(300), antwoordMinderUitgeven(300)]) {
      expect(zin).not.toMatch(/\bleg\b|\bspaar\b/i)
    }
    // Alleen "doorwerken" claimt de uitkomst (kernel-bewezen, lab-antwoorden.kernel.test.ts);
    // de €-hefbomen stoppen op het stopmoment en dekken het plan niet → "hoort bij" (eindreview I2).
    expect(antwoordDoorwerken(60)).toMatch(/dekt je plan\.$/)
    for (const zin of [antwoordMeerSalaris(300), antwoordMinderUitgeven(300), antwoordMeerSalaris(300, true), antwoordMinderUitgeven(300, true)]) {
      expect(zin).toMatch(/\/mnd (meer salaris|minder uitgeven) hoort bij een gedekt plan\.$/)
      expect(zin).not.toMatch(/dekt je plan/)
    }
  })
})

describe('ankerVraag — de vraag draagt de modus (B10)', () => {
  it('solved · vast anker · nu', () => {
    expect(ankerVraag(null)).toBe('Wanneer kun je stoppen?')
    expect(ankerVraag({ kind: 'age', stopAge: 58.5 })).toBe('Kun je op 58,5 stoppen?')
    expect(ankerVraag({ kind: 'aow', stopAge: 67 })).toBe('Kun je op 67 stoppen?')
    expect(ankerVraag({ kind: 'now' })).toBe('Hoe ver reikt je vermogen?')
  })
})

describe('ankerVrijZin — "vrij mogelijk vanaf" als inzicht (D7/B9)', () => {
  it('gedekt onder age, vrij vóór het stopmoment: de bijlage-zin met de jaren bovenop het plan', () => {
    expect(ankerVrijZin({ solvedFireAge: 55.2, currentAge: 45, stop: { kind: 'age', stopAge: 58.5 }, gedekt: true })).toBe(
      'Vrij was al mogelijk vanaf je 55e; de jaren die je langer werkt komen bovenop je plan.',
    )
  })

  it('onbereikbaar: de vaste zin uit de bijlage', () => {
    expect(ankerVrijZin({ solvedFireAge: null, currentAge: 45, stop: { kind: 'aow', stopAge: 67 } })).toBe(
      'De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf draagt.',
    )
  })

  it('nu-anker: verleden tijd als vrij vóór de huidige leeftijd lag, anders tegenwoordige tijd', () => {
    expect(ankerVrijZin({ solvedFireAge: 42.6, currentAge: 47, stop: { kind: 'now' } })).toBe('Vrij was mogelijk vanaf je 43e.')
    expect(ankerVrijZin({ solvedFireAge: 61, currentAge: 47, stop: { kind: 'now' } })).toBe('Vrij mogelijk vanaf je 61e.')
  })

  it('tekort onder age: geen "jaren bovenop je plan"-belofte', () => {
    const zin = ankerVrijZin({ solvedFireAge: 63, currentAge: 45, stop: { kind: 'age', stopAge: 58.5 }, gedekt: false })
    expect(zin).toBe('Vrij mogelijk vanaf je 63e.')
    expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
  })
})

describe('dekkingsas-kopij (spec lab-haalbaarheid §5)', () => {
  it('draagt de vastgestelde woorden letterlijk', () => {
    expect(DEKKINGSAS_COPY).toEqual({
      kop: 'Reikt je plan?',
      tag: 'de dekking',
      sliderLabel: 'Doorwerken tot',
      tegelReikt: 'Reikt tot',
      // ADR 0145 D12 (15 sep 2026) — tegel 2 is het eindvermogen; "Plan tot" is vervallen.
      tegelEindvermogen: 'Eindvermogen',
      tegelGedekt: 'Gedekt',
    })
  })
})

describe('eindvermogen-kopij (ADR 0145 D12, eigenaarsbesluit 15 sep 2026)', () => {
  const euro = (s: string) => s.replace(/ /g, ' ')

  it('tegel-onderschrift benoemt de eindleeftijd én de ACTIEVE euro-weergave (eindreview I3)', () => {
    expect(eindvermogenTegelCaption(90, 'real')).toBe("op je 90e, in huidige euro's")
    expect(eindvermogenTegelCaption(90, 'nominal')).toBe("op je 90e, in toekomstige euro's")
    expect(eindvermogenTegelCaption(null, 'real')).toBe("op je eindleeftijd, in huidige euro's")
    expect(eindvermogenTegelCaption(null, 'nominal')).not.toMatch(/van nu/)
  })

  it('I1 · tegel zonder eindvermogen: "op vóór je 90e" — geen bedrag, geen nul', () => {
    expect(eindvermogenOpTegel(90)).toBe('op vóór je 90e')
    expect(eindvermogenOpTegel(null)).toBe('op vóór je eindleeftijd')
  })

  it('I1 · n.v.t.-notitie op een lab-eindvermogen-doel bij een plan dat niet meer reikt', () => {
    expect(eindvermogenGoalNotApplicableReason(90)).toBe(
      'Je plan reikt nu niet tot je 90e, dus er is op dat moment niets over om te meten. Wat telt, is of je plan weer gedekt raakt.',
    )
    expect(eindvermogenGoalNotApplicableReason(null)).toContain('tot je eindleeftijd')
    expect(eindvermogenGoalNotApplicableReason(90)).not.toMatch(/\bAOW\b|\bmoet\b|je kunt (nu )?(al )?stoppen/i)
  })

  it("I4 · de opgeslagen-noot noemt het nominale bedrag in toekomstige euro's", () => {
    expect(euro(eindvermogenOpgeslagenNoot(480_000))).toBe("(opgeslagen als € 480.000 in toekomstige euro's)")
  })

  it('M5 · de delta-drempel is € 500', () => {
    expect(EINDVERMOGEN_DELTA_DREMPEL).toBe(500)
  })

  it('preview-waarde: nu € X → € Y op je 90e; gemaskeerd verdwijnen beide bedragen', () => {
    expect(euro(eindvermogenPreviewWaarde(120_000, 210_000, 90))).toBe('nu € 120.000 → € 210.000 op je 90e')
    expect(eindvermogenPreviewWaarde(120_000, 210_000, 90, true)).toBe(
      `nu ${MASKED_AMOUNT_PLACEHOLDER} → ${MASKED_AMOUNT_PLACEHOLDER} op je 90e`,
    )
  })

  it('delta-badge draagt teken + bedrag + het woord eindvermogen', () => {
    expect(euro(eindvermogenDeltaBadge(12_000))).toBe('+€ 12.000 eindvermogen')
    expect(euro(eindvermogenDeltaBadge(-3_000))).toBe('−€ 3.000 eindvermogen')
  })

  it('sheet-toelichting: stopmoment vast + gedekt → het lab legt het eindvermogen vast (geen woord AOW)', () => {
    const zin = eindvermogenSheetToelichting({ kind: 'aow', stopAge: 67 }, 90)
    expect(zin).toBe('Je stopmoment ligt vast op 67 en je plan is gedekt. Het lab legt daarom vast wat er op je 90e over is.')
    expect(zin).not.toMatch(/AOW/)
    expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
    expect(eindvermogenSheetToelichting({ kind: 'now' }, null)).toBe(
      'Je rekent alsof je nu stopt en je plan is gedekt. Het lab legt daarom vast wat er op je eindleeftijd over is.',
    )
  })

  it('doelnaam en toast noemen de eindleeftijd', () => {
    expect(eindvermogenGoalName(90)).toBe('Eindvermogen op je 90e')
    expect(eindvermogenGoalName(92.5)).toBe('Eindvermogen op je 92,5e')
    expect(eindvermogenGoalName(null)).toBe('Eindvermogen')
    expect(eindvermogenVastgelegdToast(90)).toBe(
      'Je verkenning is nu je doel — de app volgt wat er op je 90e over is.',
    )
  })
})
