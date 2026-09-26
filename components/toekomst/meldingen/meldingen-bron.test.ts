import { describe, expect, it } from 'vitest'
import type { GoalProgress } from '@/lib/goal-data'
import type { HeroFireAge } from '@/lib/horizon/hero-fire-age'
import { guardFireTarget } from '@/lib/horizon/outcome-guard'
import {
  bouwDoelenBron,
  ontbrekendeGegevensIssues,
  planOordeelBekend,
  voorkeurenOpen,
  vrijheidTekst,
  type OntbrekendeGegevensInput,
} from './meldingen-bron'
import { formatWithFreedom } from '@/lib/format'

function progress(pct: number, onTrack: boolean): GoalProgress {
  return { current: 0, target: 100, pct, onTrack, measured: true, requiredMonthly: null, eta: null, paceSkipped: false } as GoalProgress
}

describe('bouwDoelenBron — de doelen voor de Doelen-meldingen', () => {
  it('eigen doelen als DoelSignaal; lab-doelen alleen in de telling "past niet meer bij je plan"', () => {
    const goals = [
      { id: 'a', name: 'Buffer', metadata: null, is_completed: false },
      { id: 'b', name: 'Huis', metadata: {}, is_completed: true },
      { id: 'lab1', name: 'Vrij op 58', goal_type: 'fire_age', metadata: { bron: 'parameter' }, notApplicableReason: 'Je stopmoment ligt vast op 62.' },
      { id: 'lab2', name: 'Spaarquote 45%', goal_type: 'savings_rate', metadata: { bron: 'parameter' } },
    ]
    const uit = bouwDoelenBron(goals, [progress(40, false), progress(100, true), progress(0, true), progress(84, true)])
    expect(uit.doelen).toEqual([
      { id: 'a', naam: 'Buffer', progress: { onTrack: false, pct: 40 }, isCompleted: false },
      { id: 'b', naam: 'Huis', progress: { onTrack: true, pct: 100 }, isCompleted: true },
    ])
    expect(uit.labDoelenBuitenPlan).toBe(1)
  })

  it('een doel zonder voortgang telt niet mee (zoals in de doelenlijst)', () => {
    const uit = bouwDoelenBron([{ id: 'a', name: 'X', metadata: null }], [undefined])
    expect(uit).toEqual({ doelen: [], labDoelenBuitenPlan: 0 })
  })
})

describe('voorkeurenOpen — de wizardstand in de Instellingen-samenvatting', () => {
  const basis = { stappen: [], eersteOpen: null }
  it('totaal − bevestigd, 0 als voltooid of zonder review', () => {
    expect(voorkeurenOpen({ ...basis, bevestigd: 4, totaal: 6, voltooid: false })).toBe(2)
    expect(voorkeurenOpen({ ...basis, bevestigd: 6, totaal: 6, voltooid: true })).toBe(0)
    expect(voorkeurenOpen(null)).toBe(0)
  })
})

describe('planOordeelBekend — dezelfde poort als loadPlanStatusInput', () => {
  it('vast anker: alleen met bekende dekking; solved: alleen met bekende haalbaarheid', () => {
    expect(planOordeelBekend(null)).toBe(false)
    expect(planOordeelBekend({ anchorFixed: true, coveragePct: 87, solvedReachable: null })).toBe(true)
    // Zonder geboortedatum zet de server de dekking op null — geen oordeel, geen melding.
    expect(planOordeelBekend({ anchorFixed: true, coveragePct: null, solvedReachable: null })).toBe(false)
    expect(planOordeelBekend({ anchorFixed: false, coveragePct: null, solvedReachable: false })).toBe(true)
    expect(planOordeelBekend({ anchorFixed: false, coveragePct: null, solvedReachable: null })).toBe(false)
  })
})

describe('ontbrekendeGegevensIssues — de énige ingang naar je profiel dekt alle drie de tegels', () => {
  const geldig: HeroFireAge = { status: 'definitief', age: 55, bron: 'kernel' } as HeroFireAge
  const ongeldig: HeroFireAge = { status: 'ongeldig', age: 140, bron: 'kernel' } as HeroFireAge
  const basis: OntbrekendeGegevensInput = {
    perspectief: false,
    vastAnker: false,
    doelbedrag: guardFireTarget(640_000),
    vrijheidsleeftijd: geldig,
    jaaruitgaveNaPensioen: 30_000,
  }

  it('alles bekend: niets te melden', () => {
    expect(ontbrekendeGegevensIssues(basis)).toEqual([])
  })

  it('een vrijheidsleeftijd buiten de horizon meldt zich hier (vroeger alleen via de Plan-link)', () => {
    expect(ontbrekendeGegevensIssues({ ...basis, vrijheidsleeftijd: ongeldig })).toEqual(['buiten-horizon'])
  })

  it('doelbedrag en uitgave ná pensioen via hun eigen guards', () => {
    expect(ontbrekendeGegevensIssues({ ...basis, doelbedrag: guardFireTarget(null) })).toHaveLength(1)
    expect(ontbrekendeGegevensIssues({ ...basis, jaaruitgaveNaPensioen: null })).toHaveLength(1)
  })

  it('vast anker: geen doelbedrag- of leeftijdsmelding, de uitgave-guard blijft', () => {
    const vast = { ...basis, vastAnker: true, doelbedrag: guardFireTarget(null), vrijheidsleeftijd: ongeldig }
    expect(ontbrekendeGegevensIssues(vast)).toEqual([])
    expect(ontbrekendeGegevensIssues({ ...vast, jaaruitgaveNaPensioen: null })).toHaveLength(1)
  })

  it('partner-/huishoudperspectief: geen melding', () => {
    expect(
      ontbrekendeGegevensIssues({ ...basis, perspectief: true, vrijheidsleeftijd: ongeldig, jaaruitgaveNaPensioen: null }),
    ).toEqual([])
  })
})

describe('vrijheidTekst — dagen van de grens als meldingstekst (C1 punt 2)', () => {
  it('dezelfde vorm als de vroegere formatWithFreedom-regel (lang, zonder losse dagen)', () => {
    expect(vrijheidTekst(200, false)).toBe(
      formatWithFreedom(20_000, 100, { includeCurrency: false, format: 'long', includeDays: false }),
    )
    expect(vrijheidTekst(5_000, false)).toBe(
      formatWithFreedom(500_000, 100, { includeCurrency: false, format: 'long', includeDays: false }),
    )
  })

  it('masked, null of nul: geen tekst', () => {
    expect(vrijheidTekst(200, true)).toBeNull()
    expect(vrijheidTekst(null, false)).toBeNull()
    expect(vrijheidTekst(0, false)).toBeNull()
  })
})
