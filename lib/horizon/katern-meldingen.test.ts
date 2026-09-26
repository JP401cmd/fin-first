import { describe, expect, it } from 'vitest'
import {
  KATERN_MELDING_KOPIJ,
  KATERN_ROUTE,
  PROFIEL_HREF,
  alsKaternMinimizedLevel,
  ernstRang,
  instellingenRij,
  katernKopStatus,
  katernMinimizeLevel,
  katernMinimizedLevelUitMap,
  katernMinimizedSeed,
  DOELEN_LAB_HREF,
  resolveKaternMeldingDisplay,
  wijsMeldingenToe,
  type DoelSignaal,
  type KaternMelding,
  type KaternMeldingenInput,
  type PlanSignaal,
} from './katern-meldingen'
import { DOELEN_MELDING_ACTIES, ankerZin, antwoordMinderUitgeven, doelenPlanGewijzigdMelding } from './anker-copy'
import { AOW_ONTBREEKT_COPY } from './aow-notice-minimize'
import { buildDeficitLoanCopy } from './deficit-loan-copy'
import { EINDSITUATIE_INSTELLING_HREF, type EindsituatieCopy } from './eindsituatie-copy'
import { KATERN_VOLGORDE, katernStatuspuntLabel } from './katern-copy'
import { HORIZON_MISSENDE_GEGEVENS_HINTS, HORIZON_MISSENDE_GEGEVENS_LABEL } from './outcome-guard'
import { resolvePlanVerdict } from './plan-status'
import { strategieHref } from './strategie-route'
import { VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LEEG: KaternMeldingenInput = {
  masked: false,
  plan: null,
  tekortLening: null,
  eindsituatie: null,
  labDoelenBuitenPlan: 0,
  doelen: [],
  aowOntbreekt: false,
  huisNooitVerkocht: null,
  ontbrekendeGegevens: [],
}

function metInput(over: Partial<KaternMeldingenInput>): KaternMeldingenInput {
  return { ...LEEG, ...over }
}

const SOLVED_HAALBAAR: PlanSignaal = {
  status: { anchorFixed: false, coveragePct: null, solvedReachable: true },
  kernelStatus: 'reached_at',
  fireAgeFractional: 52.3,
  currentAge: 40,
  ankerReach: null,
  ankerStop: null,
  kernelMaandHint: null,
}

function vast(coveragePct: number | null, over: Partial<PlanSignaal> = {}): PlanSignaal {
  return {
    status: { anchorFixed: true, coveragePct, solvedReachable: null },
    kernelStatus: 'anchor_shortfall',
    fireAgeFractional: 60,
    currentAge: 40,
    ankerReach: { kind: 'reikt-tot', age: 84.5, endAge: 90 },
    ankerStop: { kind: 'age', stopAge: 60 },
    kernelMaandHint: null,
    ...over,
  }
}

const DEFICIT_COPY = buildDeficitLoanCopy({
  firstAge: 61.2,
  clearedAge: 64.8,
  housing: null,
  aowAge: 67,
  displayEndAge: 90,
  isPensioenMode: false,
  homeExcludedFromFire: false,
  geenTekortLeningAan: false,
  peakText: '€ 42.000',
  freedomText: '1 jaar en 2 maanden',
})

const EIND_COPY: EindsituatieCopy = {
  kop: 'Aan het eind blijft er meer over dan "vermogen opeten" doet verwachten',
  samenvatting: 'Op je 90e staat er in deze berekening € 300.000 meer dan je plan daar nodig heeft.',
  oorzaken: [],
  context: null,
  onduidelijk: null,
  finVraag: '',
  finContext: '',
  disclaimer: '',
}

function doel(id: string, pct: number, onTrack: boolean, isCompleted = false): DoelSignaal {
  return { id, naam: `Doel ${id}`, progress: { pct, onTrack }, isCompleted }
}

function alleMeldingen(uit: ReturnType<typeof wijsMeldingenToe>): KaternMelding[] {
  return KATERN_VOLGORDE.flatMap((k) => [...uit[k].meldingen])
}

// ── Lege invoer ──────────────────────────────────────────────────────────────

describe('wijsMeldingenToe — lege invoer', () => {
  it('levert per katern een lege lijst, hoogste ernst null en aantal 0', () => {
    const uit = wijsMeldingenToe(LEEG)
    for (const k of KATERN_VOLGORDE) {
      expect(uit[k]).toEqual({ meldingen: [], hoogsteErnst: null, aantal: 0 })
      expect(katernKopStatus(uit, k)).toBeNull()
    }
  })

  it('een haalbaar plan onder solved geeft geen melding', () => {
    expect(wijsMeldingenToe(metInput({ plan: SOLVED_HAALBAAR })).plan.aantal).toBe(0)
  })
})

// ── Plan: niet haalbaar / tekort ─────────────────────────────────────────────

describe('Plan — niet haalbaar onder solved', () => {
  const niet: PlanSignaal = {
    ...SOLVED_HAALBAAR,
    status: { anchorFixed: false, coveragePct: null, solvedReachable: false },
    kernelStatus: 'unreachable_within_horizon',
  }

  it('rood, titel uit resolvePlanVerdict, actie naar Doelen', () => {
    const [m] = wijsMeldingenToe(metInput({ plan: niet })).plan.meldingen
    expect(m.ernst).toBe('bad')
    expect(m.titel).toBe(resolvePlanVerdict(niet.status).label)
    expect(m.titel).toBe('Plan nog niet haalbaar')
    expect(m.actie).toEqual({ label: 'Verken je opties', href: '/toekomst/doelen' })
  })

  it('tweede actie "Stopmoment" naar de stopmoment-instelling in Instellingen (spec §4.8, C1 punt 6)', () => {
    const [m] = wijsMeldingenToe(metInput({ plan: niet })).plan.meldingen
    expect(m.tweedeActie).toEqual({ label: 'Stopmoment', href: '/toekomst/instellingen?rij=stopmoment' })
    expect(m.tweedeActie).toEqual({ label: 'Stopmoment', href: instellingenRij('stopmoment') })
  })

  it('maandhint: 0 en null geven geen uitleg, > 0 de canonieke antwoordzin (ook masked)', () => {
    expect(wijsMeldingenToe(metInput({ plan: { ...niet, kernelMaandHint: 0 } })).plan.meldingen[0].uitleg).toBeUndefined()
    expect(wijsMeldingenToe(metInput({ plan: { ...niet, kernelMaandHint: null } })).plan.meldingen[0].uitleg).toBeUndefined()
    expect(wijsMeldingenToe(metInput({ plan: { ...niet, kernelMaandHint: 1 } })).plan.meldingen[0].uitleg).toBe(
      antwoordMinderUitgeven(1, false),
    )
    expect(
      wijsMeldingenToe(metInput({ masked: true, plan: { ...niet, kernelMaandHint: 250 } })).plan.meldingen[0].uitleg,
    ).toBe(antwoordMinderUitgeven(250, true))
  })

  it('solvedReachable null (geen run) geeft geen melding', () => {
    const geenRun = { ...niet, status: { ...niet.status, solvedReachable: null } }
    expect(wijsMeldingenToe(metInput({ plan: geenRun })).plan.aantal).toBe(0)
  })
})

describe('Plan — tekort onder een vast anker', () => {
  it('dekking 89 → rood, 90 → oranje (drempel aan beide kanten)', () => {
    expect(wijsMeldingenToe(metInput({ plan: vast(89.4) })).plan.meldingen[0].ernst).toBe('bad')
    expect(wijsMeldingenToe(metInput({ plan: vast(89.5) })).plan.meldingen[0].ernst).toBe('warn')
    expect(wijsMeldingenToe(metInput({ plan: vast(99) })).plan.meldingen[0].ernst).toBe('warn')
  })

  it('dekking die op 100 afrondt of ontbreekt valt terug op oranje (spec: rood of oranje)', () => {
    expect(wijsMeldingenToe(metInput({ plan: vast(99.6) })).plan.meldingen[0].ernst).toBe('warn')
    const zonder = wijsMeldingenToe(metInput({ plan: vast(null) })).plan.meldingen[0]
    expect(zonder.ernst).toBe('warn')
    // Zonder verdict-label draagt de ankerzin de titel en is er geen aparte uitleg.
    const zin = ankerZin({ kind: 'reikt-tot', age: 84.5, endAge: 90 }, { kind: 'age', stopAge: 60 })
    expect(zonder.titel).toBe(zin)
    expect(zonder.uitleg).toBeUndefined()
  })

  it('titel = verdict ("Plan dekt 87%"), uitleg = ankerZin, actie naar Doelen', () => {
    const [m] = wijsMeldingenToe(metInput({ plan: vast(87) })).plan.meldingen
    expect(m.titel).toBe('Plan dekt 87%')
    expect(m.uitleg).toBe(ankerZin({ kind: 'reikt-tot', age: 84.5, endAge: 90 }, { kind: 'age', stopAge: 60 }))
    expect(m.actie?.href).toBe(KATERN_ROUTE.doelen)
    expect(m.tweedeActie).toEqual({ label: 'Stopmoment', href: instellingenRij('stopmoment') })
  })

  it('alle drie shortfall-statussen tellen; reached_at en ontbrekend bereik niet', () => {
    for (const s of ['anchor_shortfall', 'pension_shortfall', 'stop_now_shortfall'] as const) {
      expect(wijsMeldingenToe(metInput({ plan: vast(80, { kernelStatus: s }) })).plan.aantal).toBe(1)
    }
    expect(wijsMeldingenToe(metInput({ plan: vast(80, { kernelStatus: 'reached_at' }) })).plan.aantal).toBe(0)
    expect(wijsMeldingenToe(metInput({ plan: vast(80, { kernelStatus: null }) })).plan.aantal).toBe(0)
    expect(wijsMeldingenToe(metInput({ plan: vast(80, { ankerReach: null }) })).plan.aantal).toBe(0)
  })

  it('zonder stopmoment rekent de zin met "nu"', () => {
    const [m] = wijsMeldingenToe(metInput({ plan: vast(80, { ankerStop: null }) })).plan.meldingen
    expect(m.uitleg).toBe(ankerZin({ kind: 'reikt-tot', age: 84.5, endAge: 90 }, { kind: 'now' }))
  })
})

// ── Plan: nu al genoeg ───────────────────────────────────────────────────────

describe('Plan — nu al genoeg (reached_now)', () => {
  const nu: PlanSignaal = { ...SOLVED_HAALBAAR, kernelStatus: 'reached_now', fireAgeFractional: 40, currentAge: 40 }

  it('groen, geen actie, canonieke tekst onder solved', () => {
    const [m] = wijsMeldingenToe(metInput({ plan: nu })).plan.meldingen
    expect(m).toMatchObject({ id: 'plan-nu-al-genoeg', ernst: 'good', actie: null })
    expect(m.titel).toBe(KATERN_MELDING_KOPIJ.nuAlGenoegSolved)
  })

  it('vrijheidsleeftijd binnen een maand van nu → tonen; net erna → niet (B93-quirk)', () => {
    expect(wijsMeldingenToe(metInput({ plan: { ...nu, fireAgeFractional: 40 + 1 / 12 } })).plan.aantal).toBe(1)
    expect(wijsMeldingenToe(metInput({ plan: { ...nu, fireAgeFractional: 40 + 1 / 12 + 0.01 } })).plan.aantal).toBe(0)
    expect(wijsMeldingenToe(metInput({ plan: { ...nu, currentAge: null } })).plan.aantal).toBe(0)
  })

  it('onder een vast anker: de ankerzin, of zonder bereik de vaste zin', () => {
    const vastNu: PlanSignaal = {
      ...nu,
      status: { anchorFixed: true, coveragePct: 100, solvedReachable: null },
      ankerReach: { kind: 'gedekt', endAge: 90 },
      ankerStop: { kind: 'now' },
    }
    expect(wijsMeldingenToe(metInput({ plan: vastNu })).plan.meldingen[0].titel).toBe(
      ankerZin({ kind: 'gedekt', endAge: 90 }, { kind: 'now' }),
    )
    expect(wijsMeldingenToe(metInput({ plan: { ...vastNu, ankerReach: null } })).plan.meldingen[0].titel).toBe(
      KATERN_MELDING_KOPIJ.nuAlGenoegVast,
    )
  })
})

// ── Plan: tekort-lening en eindsituatie ──────────────────────────────────────

describe('Plan — tekort-lening', () => {
  it('oranje, titel in leeftijden (kopij-toets §6), actie naar de eindstrategie-regel', () => {
    const [m] = wijsMeldingenToe(
      metInput({ tekortLening: { notice: { firstAge: 61.2, clearedAge: 64.8 }, copy: DEFICIT_COPY } }),
    ).plan.meldingen
    expect(m.ernst).toBe('warn')
    expect(m.titel).toBe('Je plan dekt tussen je 61e en 64e een tekort met een lening.')
    expect(m.actie).toEqual({ label: 'Naar de instelling', href: '/toekomst/instellingen?rij=geen-tekort-lening' })
    expect(m.uitleg).toContain(DEFICIT_COPY.waarom)
    expect(m.uitleg).toContain(DEFICIT_COPY.piek)
    expect(m.uitleg).toContain(DEFICIT_COPY.instelling)
  })

  it('zonder bewezen aflossing de vanaf-variant', () => {
    const [m] = wijsMeldingenToe(
      metInput({ tekortLening: { notice: { firstAge: 61.9, clearedAge: null }, copy: DEFICIT_COPY } }),
    ).plan.meldingen
    expect(m.titel).toBe('Je plan dekt vanaf je 61e een tekort met een lening.')
  })

  it('neemt de woonzin mee wanneer de kopij er een heeft', () => {
    const metWoning = { ...DEFICIT_COPY, woning: 'Je huis telt in dit plan niet mee.' }
    const [m] = wijsMeldingenToe(
      metInput({ tekortLening: { notice: { firstAge: 61, clearedAge: 64 }, copy: metWoning } }),
    ).plan.meldingen
    expect(m.uitleg).toContain('Je huis telt in dit plan niet mee.')
  })

  it('met AI beschikbaar: tweede actie Fin, met de uitleg zonder bedragen als context (eigenaarsbesluit 26 sep)', () => {
    const tekortLening = { notice: { firstAge: 61.2, clearedAge: 64.8 }, copy: DEFICIT_COPY }
    const [m] = wijsMeldingenToe(metInput({ tekortLening, finBeschikbaar: true })).plan.meldingen
    expect(m.tweedeActie).toEqual({
      kind: 'fin',
      onderwerp: 'Je plan dekt tussen je 61e en 64e een tekort met een lening.',
      detail: [DEFICIT_COPY.waarom, DEFICIT_COPY.instelling].join(' '),
    })
    // Geen bedrag in wat naar Fin gaat (zoals de eindsituatie-vraag): de piekzin blijft buiten.
    expect(m.tweedeActie && 'kind' in m.tweedeActie ? m.tweedeActie.detail : '').not.toContain(DEFICIT_COPY.piek)
    // Zonder AI geen Fin-actie.
    expect(wijsMeldingenToe(metInput({ tekortLening })).plan.meldingen[0].tweedeActie ?? null).toBeNull()
  })
})

describe('Plan — eindsituatie', () => {
  it('informatief (neutral), kop en samenvatting uit de copy, actie zonder pijlteken', () => {
    const [m] = wijsMeldingenToe(metInput({ eindsituatie: EIND_COPY })).plan.meldingen
    expect(m).toMatchObject({ ernst: 'neutral', titel: EIND_COPY.kop, uitleg: EIND_COPY.samenvatting })
    expect(m.actie).toEqual({ label: 'Bekijk of wijzig je plan', href: EINDSITUATIE_INSTELLING_HREF })
  })

  it('niet één oorzaak aan te wijzen + AI: Fin als tweede actie met de vaste vraag en context (EindsituatieNotice)', () => {
    const onduidelijk: EindsituatieCopy = {
      ...EIND_COPY,
      onduidelijk: 'Er is uit de berekening niet één regel aan te wijzen die dit verklaart.',
      finVraag: 'Hoe komt dat?',
      finContext: 'Ik heb "Geen tekort-lening" aan.',
    }
    const [m] = wijsMeldingenToe(metInput({ eindsituatie: onduidelijk, finBeschikbaar: true })).plan.meldingen
    expect(m.tweedeActie).toEqual({
      kind: 'fin',
      onderwerp: EIND_COPY.kop,
      detail: 'Ik heb "Geen tekort-lening" aan.',
      vraag: 'Hoe komt dat?',
    })
    // De zin die de knop inleidde staat weer in de uitleg.
    expect(m.uitleg).toBe(`${EIND_COPY.samenvatting} ${onduidelijk.onduidelijk}`)
    // Eén oorzaak aan te wijzen (onduidelijk null) of geen AI: geen Fin, uitleg ongewijzigd.
    const eenduidig = wijsMeldingenToe(metInput({ eindsituatie: EIND_COPY, finBeschikbaar: true })).plan.meldingen[0]
    expect(eenduidig.tweedeActie ?? null).toBeNull()
    expect(eenduidig.uitleg).toBe(EIND_COPY.samenvatting)
    expect(wijsMeldingenToe(metInput({ eindsituatie: onduidelijk })).plan.meldingen[0].tweedeActie ?? null).toBeNull()
  })
})

// ── Doelen ───────────────────────────────────────────────────────────────────

describe('Doelen — lab-doelen buiten het plan', () => {
  it('0 → geen melding; 1 en 2 → de canonieke zin, actie Bijwerken naar Doelen', () => {
    expect(wijsMeldingenToe(metInput({ labDoelenBuitenPlan: 0 })).doelen.aantal).toBe(0)
    for (const n of [1, 2]) {
      const [m] = wijsMeldingenToe(metInput({ labDoelenBuitenPlan: n })).doelen.meldingen
      expect(m.titel).toBe(doelenPlanGewijzigdMelding(n))
      expect(m.ernst).toBe('neutral')
      // Naar het lab zelf (het anker van `VERKEN_SECTION_ID`), zoals de vroegere LabPlanMelding.
      expect(m.actie).toEqual({ label: DOELEN_MELDING_ACTIES.bijwerken, href: `/toekomst/doelen#${VERKEN_SECTION_ID}` })
      expect(DOELEN_LAB_HREF).toBe(`${KATERN_ROUTE.doelen}#${VERKEN_SECTION_ID}`)
    }
  })

  it('niet-eindig of negatief aantal → geen melding', () => {
    expect(wijsMeldingenToe(metInput({ labDoelenBuitenPlan: Number.NaN })).doelen.aantal).toBe(0)
    expect(wijsMeldingenToe(metInput({ labDoelenBuitenPlan: -1 })).doelen.aantal).toBe(0)
  })
})

describe('Doelen — doel loopt achter', () => {
  it('filter: !onTrack én pct < 100 én niet afgetekend (beide uiteinden)', () => {
    const uit = wijsMeldingenToe(
      metInput({
        doelen: [
          doel('a', 40, false),
          doel('b', 40, true), // op koers
          doel('c', 99, false), // net onder behaald → wel
          doel('d', 100, false), // behaald → niet
          doel('e', 10, false, true), // afgetekend → niet
        ],
      }),
    ).doelen
    expect(uit.meldingen.map((m) => m.id)).toEqual(['doelen-achter:a', 'doelen-achter:c'])
    expect(uit.meldingen.every((m) => m.ernst === 'warn')).toBe(true)
  })

  it('slechtste eerst, titel met de doelnaam, actie naar Doelen', () => {
    const uit = wijsMeldingenToe(metInput({ doelen: [doel('x', 70, false), doel('y', 20, false)] })).doelen
    expect(uit.meldingen.map((m) => m.id)).toEqual(['doelen-achter:y', 'doelen-achter:x'])
    expect(uit.meldingen[0].titel).toBe('Doel y: achter op planning')
    expect(uit.meldingen[0].actie?.href).toBe(KATERN_ROUTE.doelen)
  })

  it('wint op ernst van de informatieve lab-melding', () => {
    const uit = wijsMeldingenToe(metInput({ labDoelenBuitenPlan: 1, doelen: [doel('a', 40, false)] })).doelen
    expect(uit.meldingen.map((m) => m.id)).toEqual(['doelen-achter:a', 'doelen-lab-plan'])
    expect(uit.hoogsteErnst).toBe('warn')
  })
})

// ── Instellingen ─────────────────────────────────────────────────────────────

describe('Instellingen', () => {
  it('AOW ontbreekt: kop en actie uit AOW_ONTBREEKT_COPY, kort "AOW ontbreekt"', () => {
    const [m] = wijsMeldingenToe(metInput({ aowOntbreekt: true })).instellingen.meldingen
    expect(m).toMatchObject({ ernst: 'warn', titel: AOW_ONTBREEKT_COPY.kop, kort: 'AOW ontbreekt' })
    expect(m.actie).toEqual({ label: AOW_ONTBREEKT_COPY.actieLabel, href: '/toekomst/instellingen?rij=aow' })
    expect(m.uitleg).toBe(`${AOW_ONTBREEKT_COPY.keuze} ${AOW_ONTBREEKT_COPY.effect}`)
    expect(wijsMeldingenToe(metInput({ aowOntbreekt: false })).instellingen.aantal).toBe(0)
  })

  it('huis nooit verkocht: informatief, actie naar de huis-strategie', () => {
    const [m] = wijsMeldingenToe(
      metInput({ huisNooitVerkocht: { bedragTekst: '€ 650.000 (12 jaar vrijheid)', sharePct: 41, endAge: 90 } }),
    ).instellingen.meldingen
    expect(m.ernst).toBe('neutral')
    expect(m.titel).toBe(KATERN_MELDING_KOPIJ.huisTitel)
    expect(m.uitleg).toContain('€ 650.000 (12 jaar vrijheid), oftewel 41% van je vermogen op leeftijd 90.')
    expect(m.actie?.href).toBe(strategieHref('huis'))
  })

  it('ontbrekende gegevens: leeg en alleen geen-doelvermogen → niets; anders één melding', () => {
    expect(wijsMeldingenToe(metInput({ ontbrekendeGegevens: [] })).instellingen.aantal).toBe(0)
    expect(wijsMeldingenToe(metInput({ ontbrekendeGegevens: ['geen-doelvermogen'] })).instellingen.aantal).toBe(0)
    const uit = wijsMeldingenToe(
      metInput({ ontbrekendeGegevens: ['geen-doelvermogen', 'buiten-horizon', 'onmogelijk-bedrag'] }),
    ).instellingen
    expect(uit.aantal).toBe(1)
    expect(uit.meldingen[0]).toMatchObject({
      ernst: 'warn',
      titel: HORIZON_MISSENDE_GEGEVENS_LABEL,
      uitleg: HORIZON_MISSENDE_GEGEVENS_HINTS['buiten-horizon'],
      actie: { label: 'Naar je profiel', href: PROFIEL_HREF },
    })
  })
})

// ── Sortering, uniciteit, plekken ────────────────────────────────────────────

const ALLES: KaternMeldingenInput = {
  masked: false,
  plan: {
    ...SOLVED_HAALBAAR,
    status: { anchorFixed: false, coveragePct: null, solvedReachable: false },
    kernelStatus: 'unreachable_within_horizon',
  },
  tekortLening: { notice: { firstAge: 61, clearedAge: 64 }, copy: DEFICIT_COPY },
  eindsituatie: EIND_COPY,
  labDoelenBuitenPlan: 2,
  doelen: [doel('a', 30, false)],
  aowOntbreekt: true,
  huisNooitVerkocht: { bedragTekst: '€ 1', sharePct: 1, endAge: 90 },
  ontbrekendeGegevens: ['geen-gegevens'],
}

describe('toewijzing — sortering en uniciteit', () => {
  it('sorteert per katern op ernst (bad > warn > good > neutral), gelijke ernst in invoervolgorde', () => {
    const uit = wijsMeldingenToe(ALLES)
    expect(uit.plan.meldingen.map((m) => m.ernst)).toEqual(['bad', 'warn', 'neutral'])
    expect(uit.instellingen.meldingen.map((m) => m.id)).toEqual([
      'instellingen-aow',
      'instellingen-gegevens',
      'instellingen-huis',
    ])
    for (const k of KATERN_VOLGORDE) {
      const rangen = uit[k].meldingen.map((m) => ernstRang(m.ernst))
      expect([...rangen].sort((a, b) => b - a)).toEqual(rangen)
      expect(uit[k].aantal).toBe(uit[k].meldingen.length)
      expect(uit[k].hoogsteErnst).toBe(uit[k].meldingen[0]?.ernst ?? null)
    }
  })

  it('ernstRang is een totale ordening', () => {
    expect(ernstRang('bad')).toBeGreaterThan(ernstRang('warn'))
    expect(ernstRang('warn')).toBeGreaterThan(ernstRang('good'))
    expect(ernstRang('good')).toBeGreaterThan(ernstRang('neutral'))
  })

  it('geen melding staat in twee katernen; elke melding staat in het katern dat ze draagt', () => {
    const uit = wijsMeldingenToe(ALLES)
    const alle = alleMeldingen(uit)
    const ids = alle.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const k of KATERN_VOLGORDE) for (const m of uit[k].meldingen) expect(m.katern).toBe(k)
    expect(alle).toHaveLength(8)
  })

  it('elke vervolgactie wijst naar precies één toegestane plek', () => {
    const toegestaan = new Set([
      // Fase 3 (ADR 0179): elke instelling-actie wijst naar precies één rij (`?rij=`).
      '/toekomst/instellingen?rij=aow',
      '/toekomst/instellingen?rij=huis',
      '/toekomst/instellingen?rij=stopmoment',
      '/toekomst/instellingen?rij=eindleeftijd',
      '/toekomst/instellingen?rij=geen-tekort-lening',
      '/toekomst/doelen',
      // Het lab bovenaan katern Doelen (de vroegere LabPlanMelding wees er ook heen).
      '/toekomst/doelen#verken-je-aannames',
      '/mijn/profiel',
    ])
    for (const m of alleMeldingen(wijsMeldingenToe(ALLES))) {
      for (const actie of [m.actie, m.tweedeActie]) {
        if (!actie || 'kind' in actie) continue
        expect(toegestaan.has(actie.href), `${m.id} → ${actie.href}`).toBe(true)
        expect(actie.label.endsWith('→')).toBe(false)
      }
      // Twee acties = twee verschillende plekken; een tweede zonder eerste bestaat niet.
      if (m.tweedeActie) {
        expect(m.actie).not.toBeNull()
        if (!('kind' in m.tweedeActie)) expect(m.tweedeActie.href).not.toBe(m.actie?.href)
      }
    }
  })

  it('alleen de plan-melding (niet haalbaar / tekort) draagt een tweede actie', () => {
    const metTweede = alleMeldingen(wijsMeldingenToe(ALLES)).filter((m) => m.tweedeActie)
    expect(metTweede).toHaveLength(1)
    expect(metTweede.map((m) => m.id).every((id) => id === 'plan-tekort' || id === 'plan-niet-haalbaar')).toBe(true)
  })

  it('de wizard-voortgang is geen melding: het inputcontract kent haar niet', () => {
    expect(Object.keys(LEEG).some((k) => /wizard|review|voorkeur/i.test(k))).toBe(false)
  })

  it('instellingenRij bouwt de ?rij=-deeplink op de Instellingen-route', () => {
    expect(instellingenRij('onttrekking')).toBe('/toekomst/instellingen?rij=onttrekking')
  })
})

// ── Kop-status ───────────────────────────────────────────────────────────────

describe('katernKopStatus', () => {
  it('hoogste ernst, label via katernStatuspuntLabel met de bovenste melding, aantal', () => {
    const uit = wijsMeldingenToe(ALLES)
    expect(katernKopStatus(uit, 'instellingen')).toEqual({
      ernst: 'warn',
      label: katernStatuspuntLabel('AOW ontbreekt'),
      aantal: 3,
    })
    expect(katernKopStatus(uit, 'instellingen')?.label).toBe('melding: AOW ontbreekt')
  })

  it('één melding → aantal 1; geen melding → null', () => {
    const uit = wijsMeldingenToe(metInput({ aowOntbreekt: true }))
    expect(katernKopStatus(uit, 'instellingen')?.aantal).toBe(1)
    expect(katernKopStatus(uit, 'plan')).toBeNull()
  })
})

// ── Minimaliseren ────────────────────────────────────────────────────────────

describe('minimaliseren per katern-route', () => {
  it('de sleutel is de katern-route', () => {
    expect(KATERN_ROUTE).toEqual({
      plan: '/toekomst',
      doelen: '/toekomst/doelen',
      instellingen: '/toekomst/instellingen',
    })
  })

  it('niveau: warn/bad op zichzelf, good/neutral op info', () => {
    expect(katernMinimizeLevel('bad')).toBe('bad')
    expect(katernMinimizeLevel('warn')).toBe('warn')
    expect(katernMinimizeLevel('good')).toBe('info')
    expect(katernMinimizeLevel('neutral')).toBe('info')
  })

  it('weergave: none zonder melding, expanded zonder voorkeur', () => {
    expect(resolveKaternMeldingDisplay(null, 'warn')).toBe('none')
    expect(resolveKaternMeldingDisplay('warn', null)).toBe('expanded')
  })

  it('escalatie heropent: warn → bad klapt uit; gelijk of lager blijft dicht', () => {
    expect(resolveKaternMeldingDisplay('warn', 'warn')).toBe('minimized')
    expect(resolveKaternMeldingDisplay('bad', 'warn')).toBe('expanded')
    expect(resolveKaternMeldingDisplay('warn', 'bad')).toBe('minimized')
    expect(resolveKaternMeldingDisplay('neutral', 'info')).toBe('minimized')
    expect(resolveKaternMeldingDisplay('warn', 'info')).toBe('expanded')
  })

  it('keten: minimaliseren op de ernst die je ziet houdt dicht (B-017-grendel)', () => {
    for (const e of ['bad', 'warn', 'good', 'neutral'] as const) {
      expect(resolveKaternMeldingDisplay(e, katernMinimizeLevel(e))).toBe('minimized')
    }
  })

  it('map-lezing: alleen stoplichtniveaus, alleen eigen sleutels', () => {
    expect(katernMinimizedLevelUitMap({ '/toekomst': 'warn' }, 'plan')).toBe('warn')
    expect(katernMinimizedLevelUitMap({ '/toekomst': 1 }, 'plan')).toBeNull()
    expect(katernMinimizedLevelUitMap({ '/toekomst/doelen': 'info' }, 'plan')).toBeNull()
    expect(katernMinimizedLevelUitMap({}, 'doelen')).toBeNull()
    // De seed voor loadToekomstData: alle drie tegelijk, oude pref-sleutels tellen niet.
    expect(
      katernMinimizedSeed({
        '/toekomst': 'bad',
        '/toekomst/instellingen': 'info',
        '/toekomst/aow-ontbreekt': 1,
        '/toekomst/tekort-lening': 12345,
      }),
    ).toEqual({ plan: 'bad', doelen: null, instellingen: 'info' })
    const vervuild = Object.create({ '/toekomst/instellingen': 'bad' }) as Record<string, unknown>
    expect(katernMinimizedLevelUitMap(vervuild, 'instellingen')).toBeNull()
    expect(alsKaternMinimizedLevel('good')).toBeNull()
    expect(alsKaternMinimizedLevel(null)).toBeNull()
  })
})
