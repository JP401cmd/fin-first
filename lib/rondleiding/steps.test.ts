/**
 * Bron-grendel op de COPY van de rondleiding (ADR 0130, fase 3b).
 *
 * De teksten zijn hier het product: Fin spreekt ze uit, ze passeren de
 * compliance-poort en ze moeten kort blijven. Deze suite bewaakt precies de
 * vier dingen die stilletjes kunnen verschuiven zonder dat iets rood wordt:
 *
 *  1. het AANTAL stappen per platform (9 desktop / 8 mobiel);
 *  2. het WOORDBUDGET — op volle én op lege data, want juist de lege staat
 *     groeit ongemerkt (uitleg vervangt cijfer);
 *  3. de DATA-AFHANKELIJKE takken: welkom noemt een eigen getal, privacymodus
 *     noemt geen euro's, 'Nu stoppen' spreekt over bereik, een gegevensprobleem
 *     belooft geen leeftijd;
 *  4. de WFT-GRENS en de STEM — geen imperatief over geld, geen
 *     besparingsbelofte, Fin in de ik-vorm waar hij zich voorstelt.
 */

import { describe, it, expect } from 'vitest'
import {
  RONDLEIDING_MAX_WOORDEN,
  RONDLEIDING_STAPPEN,
  resolveRondleidingStappen,
  telWoorden,
  type RondleidingData,
} from './steps'

// ── Fixtures ────────────────────────────────────────────────────────────────

const VOL: RondleidingData = {
  userName: 'Bas',
  totals: {
    bezittingen: 368270,
    schulden: 221400,
    cashflow: 38,
    belasting: 1240,
  },
  housingSplit: { eigenHuisValue: 425000, mortgageBalance: 210000 },
  leverStatus: {
    bezittingen: 'good',
    schulden: 'warn',
    cashflow: 'good',
    belasting: 'warn',
  },
  assetTypeCount: 4,
  largestAssetTypeShare: 0.42,
  health: { total: 72, label: 'Sterk' },
  currentNetWorth: 146870,
  dailyExpenseRate: 92.4,
  isPensioen: false,
  vrijheid: {
    fireAgeDisplay: 53,
    framing: 'building',
    dataIssue: false,
    nuStoppenReach: null,
  },
}

const LEEG: RondleidingData = {
  userName: null,
  totals: null,
  housingSplit: null,
  leverStatus: {
    bezittingen: 'neutral',
    schulden: 'neutral',
    cashflow: 'neutral',
    belasting: 'neutral',
  },
  assetTypeCount: null,
  largestAssetTypeShare: null,
  health: null,
  currentNetWorth: 0,
  dailyExpenseRate: 0,
  isPensioen: false,
  vrijheid: null,
}

/** Alle bodies van één platform, in één keer. */
function bodies(data: RondleidingData, platform: 'desktop' | 'mobiel', masked = false) {
  return resolveRondleidingStappen(platform).map((stap) => ({
    id: stap.id,
    ...stap.body(data, { platform, masked }),
  }))
}

// ── 1. Aantallen per platform ───────────────────────────────────────────────

describe('rondleiding — stappen per platform', () => {
  it('telt 9 stappen op desktop en 8 op mobiel', () => {
    expect(resolveRondleidingStappen('desktop')).toHaveLength(9)
    expect(resolveRondleidingStappen('mobiel')).toHaveLength(8)
  })

  it('desktop kent zijbalk én Fin apart; mobiel bundelt ze in de nav-pill', () => {
    const desktop = resolveRondleidingStappen('desktop').map((s) => s.id)
    const mobiel = resolveRondleidingStappen('mobiel').map((s) => s.id)

    expect(desktop).toContain('zijbalk')
    expect(desktop).toContain('fin')
    expect(desktop).not.toContain('pill')

    expect(mobiel).toContain('pill')
    expect(mobiel).not.toContain('zijbalk')
    expect(mobiel).not.toContain('fin')
  })

  it('opent met het welkom en eindigt bij Fin', () => {
    expect(resolveRondleidingStappen('desktop')[0].id).toBe('welkom')
    expect(resolveRondleidingStappen('desktop').at(-1)?.id).toBe('fin')
    expect(resolveRondleidingStappen('mobiel').at(-1)?.id).toBe('pill')
  })

  it('elke stap behalve het welkom hoort bij een hoofdstuk', () => {
    for (const stap of RONDLEIDING_STAPPEN) {
      if (stap.id === 'welkom') expect(stap.hoofdstuk).toBeUndefined()
      else expect(stap.hoofdstuk).toBeDefined()
    }
  })
})

// ── 2. Woordbudget ──────────────────────────────────────────────────────────

describe('rondleiding — woordbudget', () => {
  for (const platform of ['desktop', 'mobiel'] as const) {
    for (const [naam, data] of [
      ['volle data', VOL],
      ['lege data', LEEG],
    ] as const) {
      it(`blijft binnen ${RONDLEIDING_MAX_WOORDEN} woorden op ${platform} met ${naam}`, () => {
        for (const b of bodies(data, platform)) {
          expect(
            telWoorden(b.tekst),
            `stap "${b.id}" is te lang: ${telWoorden(b.tekst)} woorden — "${b.tekst}"`,
          ).toBeLessThanOrEqual(RONDLEIDING_MAX_WOORDEN)
        }
      })
    }
  }

  it('houdt het budget ook in privacymodus en onder de eindstrategie Nu stoppen', () => {
    const nuStoppen: RondleidingData = {
      ...VOL,
      vrijheid: {
        fireAgeDisplay: 47,
        framing: 'free',
        dataIssue: false,
        nuStoppenReach: { kind: 'reikt-tot', age: 86.4, endAge: 90 },
      },
    }
    for (const b of [...bodies(VOL, 'desktop', true), ...bodies(nuStoppen, 'desktop')]) {
      expect(telWoorden(b.tekst), `stap "${b.id}": "${b.tekst}"`).toBeLessThanOrEqual(
        RONDLEIDING_MAX_WOORDEN,
      )
    }
  })

  it('geen enkele stap is leeg', () => {
    for (const platform of ['desktop', 'mobiel'] as const) {
      for (const data of [VOL, LEEG]) {
        for (const b of bodies(data, platform)) {
          expect(b.tekst.trim().length, `stap "${b.id}"`).toBeGreaterThan(10)
        }
      }
    }
  })
})

// ── 3. Data-afhankelijke takken ─────────────────────────────────────────────

describe('rondleiding — het welkom toont waarde vóór het om tijd vraagt', () => {
  it('noemt een eigen getal én de vrijheidstijd zodra er vermogen is', () => {
    const welkom = bodies(VOL, 'desktop')[0]
    expect(welkom.id).toBe('welkom')
    expect(welkom.tekst).toContain('146.870')
    expect(welkom.tekst).toMatch(/vrijheid/)
    // Fin stelt zich voor, in de ik-vorm.
    expect(welkom.tekst).toMatch(/\bik ben Fin\b/)
    expect(welkom.tekst).toContain('Bas')
  })

  it('valt terug op de lege staat zonder vermogen, zonder een getal te verzinnen', () => {
    const welkom = bodies(LEEG, 'desktop')[0]
    expect(welkom.tekst).not.toContain('€')
    expect(welkom.tekst).toMatch(/nog leeg/)
    expect(welkom.tekst).toMatch(/\bik ben Fin\b/)
  })
})

describe('rondleiding — privacymodus', () => {
  it('noemt geen enkel euroteken in welke stap dan ook', () => {
    for (const platform of ['desktop', 'mobiel'] as const) {
      for (const b of bodies(VOL, platform, true)) {
        expect(b.tekst, `stap "${b.id}"`).not.toContain('€')
      }
    }
  })
})

describe('rondleiding — de grafiekstap volgt de canonieke vrijheidszin', () => {
  const grafiek = (data: RondleidingData) =>
    bodies(data, 'desktop').find((b) => b.id === 'grafiek')!

  it('noemt de vrijheidsleeftijd bij een gewoon opbouwpad', () => {
    expect(grafiek(VOL).tekst).toContain('53e')
    expect(grafiek(VOL).tekst).toMatch(/keuze/)
  })

  it('spreekt onder Nu stoppen over BEREIK en draagt de kicker "Reikt tot"', () => {
    const b = grafiek({
      ...VOL,
      vrijheid: {
        fireAgeDisplay: 47,
        framing: 'free',
        dataIssue: false,
        nuStoppenReach: { kind: 'reikt-tot', age: 86.4, endAge: 90 },
      },
    })
    expect(b.tekst).toMatch(/reikt/)
    expect(b.kicker).toBe('Reikt tot')
  })

  it('belooft geen leeftijd bij een gegevensprobleem of een nog niet geladen seed', () => {
    const metIssue = grafiek({
      ...VOL,
      vrijheid: { fireAgeDisplay: 53, framing: 'building', dataIssue: true, nuStoppenReach: null },
    })
    const zonderSeed = grafiek({ ...VOL, vrijheid: null })
    for (const b of [metIssue, zonderSeed]) {
      expect(b.tekst).not.toContain('53e')
      expect(b.tekst).not.toMatch(/keuze rond/)
    }
  })
})

describe('rondleiding — de belastingstap blijft binnen de Wft-grens', () => {
  const belasting = (data: RondleidingData) =>
    bodies(data, 'desktop').find((b) => b.id === 'hefboom-belasting')!

  it('zegt bij elk databeeld "een indicatie, geen advies"', () => {
    const nul: RondleidingData = { ...VOL, totals: { ...VOL.totals!, belasting: 0 } }
    const onbekend: RondleidingData = { ...VOL, totals: { ...VOL.totals!, belasting: null } }
    for (const data of [VOL, nul, onbekend, LEEG]) {
      expect(belasting(data).tekst).toContain('indicatie, geen advies')
    }
  })

  it('vertaalt de heffing óók naar vrijheidstijd', () => {
    expect(belasting(VOL).tekst).toContain('1.240')
    expect(belasting(VOL).tekst).toMatch(/vrijheid/)
  })
})

describe('rondleiding — spreiding leest dezelfde drempel als de gezondheidspijler', () => {
  const bezit = (share: number | null, basis: RondleidingData = VOL) =>
    bodies({ ...basis, largestAssetTypeShare: share }, 'desktop').find(
      (b) => b.id === 'hefboom-bezittingen',
    )!
  const beperkt: RondleidingData = {
    ...VOL,
    leverStatus: { ...VOL.leverStatus, bezittingen: 'warn' },
  }

  it('noemt "vooral in één soort" vanaf de concentratiedrempel', () => {
    expect(bezit(0.72, beperkt).tekst).toContain('vooral in één soort')
    expect(bezit(0.72, beperkt).tekst).toContain('beperkt gespreid')
    expect(bezit(0.42, beperkt).tekst).not.toContain('vooral in één soort')
    expect(bezit(0.42, beperkt).tekst).toContain('4 soorten')
  })

  it('spreekt de tegel nooit tegen: bij "Goed gespreid" wint de tegel van de aandeel-drempel', () => {
    // Lever-scores tellen SOORTEN, de pijler meet het AANDEEL. Vier soorten
    // waarvan één 72 % geeft "Goed gespreid" op de tegel — dan mag de zin
    // niet "vooral in één soort: goed gespreid" worden.
    const b = bezit(0.72)
    expect(b.tekst).not.toContain('vooral in één soort')
    expect(b.tekst).toContain('4 soorten')
    expect(b.tekst).toContain('goed gespreid')
  })
})

describe('rondleiding — de cashflowstap onderscheidt "geen boekingen" van een tekort', () => {
  const cashflow = (data: RondleidingData) =>
    bodies(data, 'desktop').find((b) => b.id === 'hefboom-cashflow')!

  it('zegt "zodra je boekingen binnenkomen" alleen zonder oordeel op de tegel', () => {
    expect(cashflow(LEEG).tekst).toMatch(/boekingen binnenkomen/)
    // `savingsRate6m` is 0 zonder inkomen — de tegel staat dan op 'neutral'.
    const nulZonderOordeel: RondleidingData = {
      ...VOL,
      totals: { ...VOL.totals!, cashflow: 0 },
      leverStatus: { ...VOL.leverStatus, cashflow: 'neutral' },
    }
    expect(cashflow(nulZonderOordeel).tekst).toMatch(/boekingen binnenkomen/)
  })

  it('noemt bij een tekort het oordeel van de tegel in plaats van een lege staat', () => {
    const tekort: RondleidingData = {
      ...VOL,
      totals: { ...VOL.totals!, cashflow: -6 },
      leverStatus: { ...VOL.leverStatus, cashflow: 'bad' },
    }
    const b = cashflow(tekort)
    expect(b.tekst).not.toMatch(/boekingen binnenkomen/)
    expect(b.tekst).toContain('tekort op rekening')
    expect(b.tekst).not.toContain('-6%')
    expect(telWoorden(b.tekst)).toBeLessThanOrEqual(RONDLEIDING_MAX_WOORDEN)
  })
})

// ── 4. Stem en Wft-lint ─────────────────────────────────────────────────────

describe('rondleiding — stem en compliance', () => {
  /** Woorden die op een instructie of belofte over geld wijzen. */
  const VERBODEN = [
    /\bmoet\b/i,
    /\bstort\b/i,
    /\bbespaar/i,
    /\bbesparing/i,
    /\bgegarandeerd\b/i,
    /\brendement van\b/i,
    /\bkoop\b/i,
    /\bverkoop je\b/i,
    /\badvies\b(?!,)/i, // "advies" mag alleen in "een indicatie, geen advies"
  ]

  it('gebruikt geen imperatief over geld en doet geen belofte', () => {
    for (const platform of ['desktop', 'mobiel'] as const) {
      for (const data of [VOL, LEEG]) {
        for (const b of bodies(data, platform)) {
          const zonderHedge = b.tekst.replace(/een indicatie, geen advies/g, '')
          for (const patroon of VERBODEN) {
            expect(zonderHedge, `stap "${b.id}" overtreedt ${patroon}: "${b.tekst}"`).not.toMatch(
              patroon,
            )
          }
        }
      }
    }
  })

  it('spreekt de gebruiker met jij/je aan, nooit met u', () => {
    for (const b of bodies(VOL, 'desktop')) {
      expect(b.tekst, `stap "${b.id}"`).not.toMatch(/\bu\b/)
      expect(b.tekst, `stap "${b.id}"`).not.toMatch(/\buw\b/)
    }
  })

  it('gebruikt geen emoji', () => {
    for (const platform of ['desktop', 'mobiel'] as const) {
      for (const b of bodies(VOL, platform)) {
        expect(b.tekst, `stap "${b.id}"`).not.toMatch(/\p{Extended_Pictographic}/u)
      }
    }
  })

  it('laat Fin in de ik-vorm spreken in het welkom én in de slotstap', () => {
    const desktop = bodies(VOL, 'desktop')
    const mobiel = bodies(VOL, 'mobiel')
    expect(desktop[0].tekst).toMatch(/\bik\b/i)
    expect(desktop.at(-1)!.tekst).toMatch(/\bmij\b/)
    expect(mobiel.at(-1)!.tekst).toMatch(/\bmij\b/)
  })
})
