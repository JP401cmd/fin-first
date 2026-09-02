import { describe, it, expect } from 'vitest'
import {
  closingSentenceFor,
  leadSentenceForWithdrawal,
  unreachableMessageFor,
} from './chapter-data'
import type { NuStoppenReach } from '@/lib/horizon/nu-stoppen-copy'

/**
 * ADR 0127 — de drie `switch`-en in chapter-data.ts hebben allemaal een
 * `default`, dus 'nu-stoppen' viel er stil op de DEPLETE-kopij: "je bouwt je
 * vermogen rustig af naar nul rond leeftijd 90". Dat is fout zodra het geld vóór
 * de eindleeftijd op is — en het is precies het soort fout dat geen compiler en
 * geen bestaande test vangt (een `default` compileert altijd).
 *
 * Deze suite bewijst per switch dat de strategie een EIGEN tak heeft en dat die
 * tak nooit de deplete-belofte herhaalt.
 */

const REIKT_TOT: NuStoppenReach = { kind: 'reikt-tot', age: 57.5, endAge: 90 }
const GEDEKT: NuStoppenReach = { kind: 'gedekt', endAge: 90 }

describe('closingSentenceFor — eigen tak, geen deplete-default', () => {
  it('tekort: noemt de bereikte leeftijd, niet "af naar nul rond 90"', () => {
    const zin = closingSentenceFor('nu-stoppen', 90, 0, REIKT_TOT)
    expect(zin).toContain('58')
    expect(zin).not.toMatch(/naar nul rond leeftijd/i)
    expect(zin).not.toBe(closingSentenceFor('deplete', 90, 0))
  })

  it('gedekt: noemt het einde van het plan, zonder eeuwigheidsclaim', () => {
    const zin = closingSentenceFor('nu-stoppen', 90, 0, GEDEKT)
    expect(zin).toContain('90')
    expect(zin).not.toMatch(/oneindig|eeuwig|voorgoed/i)
  })

  it('zonder bereik-invoer valt hij op de eerlijke "nog niet te bepalen"-tak, niet op deplete', () => {
    const zin = closingSentenceFor('nu-stoppen', 90, 0)
    expect(zin).not.toBe(closingSentenceFor('deplete', 90, 0))
    expect(zin).not.toMatch(/naar nul rond leeftijd/i)
  })

  it('de overige vier strategieën blijven byte-identiek', () => {
    expect(closingSentenceFor('deplete', 90, 0)).toContain('naar nul rond leeftijd 90')
    expect(closingSentenceFor('perpetual', 90, 0)).toContain('koopkracht')
    expect(closingSentenceFor('legacy', 90, 250_000)).toContain('nalatenschap')
    expect(closingSentenceFor('pensioen', 90, 0)).toContain('vast bedrag')
  })
})

describe('leadSentenceForWithdrawal — eigen tak', () => {
  it("zegt dat de onttrekking VANDAAG begint, niet 'daarna'", () => {
    const lead = leadSentenceForWithdrawal('nu-stoppen')
    expect(lead).toMatch(/vanaf vandaag/i)
    expect(lead).not.toBe(leadSentenceForWithdrawal('deplete'))
  })

  it('deplete/legacy/pensioen delen nog steeds één zin', () => {
    const basis = leadSentenceForWithdrawal('deplete')
    expect(leadSentenceForWithdrawal('legacy')).toBe(basis)
    expect(leadSentenceForWithdrawal('pensioen')).toBe(basis)
  })
})

describe('unreachableMessageFor — eigen tak', () => {
  it('zegt hoe ver het vermogen reikt in plaats van "vrijheid niet haalbaar"', () => {
    const msg = unreachableMessageFor('nu-stoppen', 90, REIKT_TOT)
    expect(msg).not.toMatch(/niet haalbaar/i)
    expect(msg).toContain('58')
  })

  it('spoort nergens toe aan (geen "verhoog je spaarquote")', () => {
    const msg = unreachableMessageFor('nu-stoppen', 90, REIKT_TOT)
    expect(msg).not.toMatch(/verhoog je|verlaag je/i)
  })

  it('de overige vier strategieën blijven ongewijzigd', () => {
    expect(unreachableMessageFor('legacy', 95)).toContain('nalatenschap')
    expect(unreachableMessageFor('perpetual', 95)).toContain('blijvend')
    expect(unreachableMessageFor('deplete', 95)).toContain('95')
    expect(unreachableMessageFor('pensioen', 95)).toContain('95')
  })
})
