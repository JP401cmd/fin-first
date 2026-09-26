/**
 * De stand van het canvas per katern (ADR 0179 D3/D5, spec §4.5).
 *
 * Pint: de keuze van de gebruiker blijft staan bij een katernwissel; alleen vaste
 * lagen komen erbij en gaan weer weg; Instellingen is compact (alleen Vermogen, geen
 * Lagen, geen fasebalk, niet op mobiel); de aannamesregel en de fasebalk staan alleen
 * in Plan; Doelen buiten Vermogen zegt dat die modi het plan volgen.
 */
import { describe, it, expect } from 'vitest'
import { LAAG_VOLGORDE, LAGEN_EENVOUDIG, type LaagId } from '@/lib/horizon/katern-copy'
import { canvasStand, type CanvasBeschikbaarheid, type CanvasKeuze, type CanvasWeergave } from './canvas-stand'

const alleLagen = (aan: readonly LaagId[] = []): Record<LaagId, boolean> =>
  Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, aan.includes(id)])) as Record<LaagId, boolean>

/** De standaardkeuze van Plan: Gebeurtenissen en Mijlpalen aan. */
const standaard: CanvasKeuze = { modus: 'vermogen', lagen: alleLagen(['gebeurtenissen', 'mijlpalen']) }
const alles: CanvasBeschikbaarheid = { doelen: true, doelscenario: true, metHuis: true }
const VOLLEDIG: CanvasWeergave = { eenvoudig: false }
const EENVOUDIG: CanvasWeergave = { eenvoudig: true }

describe('canvasStand — Plan', () => {
  const stand = canvasStand('plan', standaard, alles, VOLLEDIG)

  it('biedt alle drie de modi en de Lagen-knop, zonder vaste lagen', () => {
    expect(stand.modi).toEqual(['vermogen', 'samenstelling', 'geldstroom'])
    expect(stand.toonModusSwitch).toBe(true)
    expect(stand.toonLagenKnop).toBe(true)
    expect(stand.vast).toEqual([])
    expect(stand.beschikbaar).toEqual(LAAG_VOLGORDE)
  })

  it('tekent precies de keuze: standaard Gebeurtenissen en Mijlpalen', () => {
    expect(Object.entries(stand.lagen).filter(([, aan]) => aan).map(([id]) => id)).toEqual([
      'gebeurtenissen',
      'mijlpalen',
    ])
  })

  it('draagt de fasebalk en de aannamesregel', () => {
    expect(stand.toonFasebalk).toBe(true)
    expect(stand.toonAannamesregel).toBe(true)
    expect(stand.toonPlanVolgtRegel).toBe(false)
    expect(stand.alleenDesktop).toBe(false)
  })

  it('laat lagen zonder data uit het menu', () => {
    const s = canvasStand('plan', standaard, { doelen: false, doelscenario: false, metHuis: false }, VOLLEDIG)
    expect(s.beschikbaar).not.toContain('doelen')
    expect(s.beschikbaar).not.toContain('doelscenario')
    expect(s.beschikbaar).not.toContain('metHuis')
  })

  it('heeft buiten Vermogen geen lagenmenu (lagen gelden alleen in Vermogen)', () => {
    const s = canvasStand('plan', { ...standaard, modus: 'geldstroom' }, alles, VOLLEDIG)
    expect(s.modus).toBe('geldstroom')
    expect(s.beschikbaar).toEqual([])
    expect(s.toonLagenKnop).toBe(false)
  })
})

describe('canvasStand — Doelen', () => {
  const stand = canvasStand('doelen', standaard, alles, VOLLEDIG)

  it('zet doelscenario en doelen vast aan, bovenop de keuze', () => {
    expect(stand.vast).toEqual(['doelscenario', 'doelen'])
    expect(stand.lagen.doelscenario).toBe(true)
    expect(stand.lagen.doelen).toBe(true)
    expect(stand.lagen.gebeurtenissen).toBe(true)
  })

  it('laat Marktcheck en Rendement hoger en lager standaard uit', () => {
    expect(stand.lagen.marktcheck).toBe(false)
    expect(stand.lagen.rendementScenarios).toBe(false)
  })

  it('heeft geen fasebalk en geen aannamesregel', () => {
    expect(stand.toonFasebalk).toBe(false)
    expect(stand.toonAannamesregel).toBe(false)
  })

  it('zegt in Samenstelling en Geldstroom dat die het plan volgen, in Vermogen niet', () => {
    expect(stand.toonPlanVolgtRegel).toBe(false)
    expect(canvasStand('doelen', { ...standaard, modus: 'samenstelling' }, alles, VOLLEDIG).toonPlanVolgtRegel).toBe(true)
    expect(canvasStand('doelen', { ...standaard, modus: 'geldstroom' }, alles, VOLLEDIG).toonPlanVolgtRegel).toBe(true)
  })

  it('zet een vaste laag zonder data niet vast', () => {
    const s = canvasStand('doelen', standaard, { doelen: false, doelscenario: true, metHuis: false }, VOLLEDIG)
    expect(s.vast).toEqual(['doelscenario'])
    expect(s.lagen.doelen).toBe(false)
  })
})

describe('canvasStand — Instellingen', () => {
  const keuze: CanvasKeuze = {
    modus: 'samenstelling',
    lagen: alleLagen(['mijlpalen', 'marktcheck', 'rendementScenarios', 'metHuis', 'doelscenario']),
  }
  const stand = canvasStand('instellingen', keuze, alles, VOLLEDIG)

  it('tekent alleen Vermogen, zonder modus-switch en zonder Lagen-knop', () => {
    expect(stand.modi).toEqual(['vermogen'])
    expect(stand.modus).toBe('vermogen')
    expect(stand.toonModusSwitch).toBe(false)
    expect(stand.toonLagenKnop).toBe(false)
  })

  it('tekent alleen de hoofdlijn met de gebeurtenissen (vast)', () => {
    expect(stand.vast).toEqual(['gebeurtenissen'])
    expect(Object.entries(stand.lagen).filter(([, aan]) => aan).map(([id]) => id)).toEqual(['gebeurtenissen'])
  })

  it('is compact: geen fasebalk, geen legenda, geen aannamesregel, alleen op desktop', () => {
    expect(stand.toonFasebalk).toBe(false)
    expect(stand.toonLegenda).toBe(false)
    expect(stand.toonAannamesregel).toBe(false)
    expect(stand.alleenDesktop).toBe(true)
  })
})

describe('canvasStand — de keuze blijft staan bij een katernwissel', () => {
  it('Plan → Instellingen → Plan geeft dezelfde modus en lagen terug', () => {
    const keuze: CanvasKeuze = { modus: 'geldstroom', lagen: alleLagen(['marktcheck', 'mijlpalen']) }
    const voor = canvasStand('plan', keuze, alles, VOLLEDIG)
    canvasStand('instellingen', keuze, alles, VOLLEDIG)
    const na = canvasStand('plan', keuze, alles, VOLLEDIG)
    expect(na).toEqual(voor)
    expect(na.modus).toBe('geldstroom')
  })

  it('de vaste lagen van Doelen verdwijnen weer in Plan', () => {
    const doelen = canvasStand('doelen', standaard, alles, VOLLEDIG)
    const plan = canvasStand('plan', standaard, alles, VOLLEDIG)
    expect(doelen.lagen.doelscenario).toBe(true)
    expect(plan.lagen.doelscenario).toBe(false)
    expect(plan.vast).toEqual([])
  })
})

describe('canvasStand — Eenvoudig tekent alleen de lagen van zijn menu (spec §4.7)', () => {
  // Alles aan, zoals een gebruiker die in Volledig elke laag aanzette en daarna naar
  // Eenvoudig schakelde (Met je huis staat in localStorage en overleeft dat).
  const allesAan: CanvasKeuze = { modus: 'vermogen', lagen: alleLagen(LAAG_VOLGORDE) }
  const aan = (lagen: Readonly<Record<LaagId, boolean>>) =>
    Object.entries(lagen).filter(([, v]) => v).map(([id]) => id)

  it('Eenvoudig: Marktcheck, Rendement hoger en lager, Met je huis en Speel af zijn niet getekend', () => {
    for (const katern of ['plan', 'doelen'] as const) {
      const s = canvasStand(katern, allesAan, alles, EENVOUDIG)
      expect(aan(s.lagen)).toEqual([...LAGEN_EENVOUDIG].sort((a, b) => LAAG_VOLGORDE.indexOf(a) - LAAG_VOLGORDE.indexOf(b)))
      for (const id of ['marktcheck', 'rendementScenarios', 'metHuis', 'speelAf'] as const) {
        expect(s.lagen[id]).toBe(false)
        expect(s.beschikbaar).not.toContain(id)
      }
    }
  })

  it('Volledig: dezelfde keuze tekent alles', () => {
    expect(aan(canvasStand('plan', allesAan, alles, VOLLEDIG).lagen)).toEqual([...LAAG_VOLGORDE])
  })

  it('de keuze blijft staan: terug naar Volledig tekent de lagen weer', () => {
    canvasStand('plan', allesAan, alles, EENVOUDIG)
    expect(canvasStand('plan', allesAan, alles, VOLLEDIG).lagen.metHuis).toBe(true)
    expect(allesAan.lagen.marktcheck).toBe(true)
  })

  it('de vaste lagen van Doelen blijven in Eenvoudig vast', () => {
    const s = canvasStand('doelen', standaard, alles, EENVOUDIG)
    expect(s.vast).toEqual(['doelscenario', 'doelen'])
    expect(s.lagen.doelscenario).toBe(true)
  })
})
