import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  AANNAMES_LINK_LABEL,
  CANVAS_MODUS_LABEL,
  CANVAS_UITLEG_TITEL,
  DOELEN_VOLGT_PLAN_REGEL,
  MARKTCHECK_MISLUKT_REGEL,
  CANVAS_MODUS_VOLGORDE,
  INSTELLINGEN_SAMENVATTING_TOONT_WIZARDSTAND,
  KATERN_LABEL,
  KATERN_VOLGORDE,
  KATERN_WIZARD_NAAM,
  LAAG_LABEL,
  LAAG_UITLEG,
  LAAG_VOLGORDE,
  LAGEN_EENVOUDIG,
  LAGEN_KOP,
  MARKTCHECK_NIET_BINNEN_PLAN,
  MARKTCHECK_STAND_LABEL,
  aannamesRegelTekst,
  aannamesSegmenten,
  doelenSamenvatting,
  doelenUitkomstregel,
  instellingenSamenvatting,
  katernAnkerregel,
  katernKpi1Label,
  katernStatuspuntLabel,
  marktcheckGetallenRegel,
  marktcheckStandWaarde,
  planSamenvatting,
  type LaagId,
  type MarktcheckLeeftijden,
} from './katern-copy'
import type { MarktcheckVrijheidsleeftijden } from '@/lib/horizon-kernel/marktcheck'
import { ANKER_KPI_LABEL, ankerTitel, ankerVrijZin, labZoneWoord } from './anker-copy'
import { PLAN_REVIEW_NAAM } from '@/lib/plan-review/types'

/** ADR 0165: nooit de koop-/verkoopmetafoor. */
const KOOP_METAFOOR = /vrijgekocht|terugkop|terug te kopen|vrijkop|gekocht|verkocht|koop je|kopen/i

function alleKopij(): string[] {
  return [
    ...Object.values(KATERN_LABEL),
    ...Object.values(LAAG_LABEL),
    ...Object.values(LAAG_UITLEG),
    ...Object.values(MARKTCHECK_STAND_LABEL),
    ...Object.values(CANVAS_MODUS_LABEL),
    LAGEN_KOP,
    AANNAMES_LINK_LABEL,
    CANVAS_UITLEG_TITEL,
    DOELEN_VOLGT_PLAN_REGEL,
    MARKTCHECK_MISLUKT_REGEL,
    katernAnkerregel({ kind: 'solved', solvedFireAge: 52.3, currentAge: 38 }),
    katernAnkerregel({ kind: 'solved', solvedFireAge: null, currentAge: 38 }),
    katernAnkerregel({ kind: 'vast', stop: { kind: 'age', stopAge: 60 } }),
    katernAnkerregel({ kind: 'vast', stop: { kind: 'now' } }),
    planSamenvatting({ kind: 'solved', doelbedragPct: 61.4 }) ?? '',
    planSamenvatting({ kind: 'vast', reach: { kind: 'reikt-tot', age: 88.2, endAge: 90 } }) ?? '',
    doelenSamenvatting({ stopAge: 58, zone: 'groen' }),
    doelenSamenvatting(null),
    instellingenSamenvatting({ voorkeurenOpen: 2, aowOntbreekt: true }) ?? '',
    aannamesRegelTekst(
      { stop: null, eindleeftijd: 90, inflatiePct: 2, rendementPct: 5, gebeurtenissen: 3 },
      'volledig',
    ),
    marktcheckGetallenRegel({ tegenzit: 55, midden: 52, meezit: 49 }) ?? '',
    marktcheckGetallenRegel({ tegenzit: null, midden: 58, meezit: 52 }) ?? '',
  ]
}

describe('katern-copy — katernen', () => {
  it('labels en volgorde: Plan · Doelen · Instellingen', () => {
    expect(KATERN_VOLGORDE.map((k) => KATERN_LABEL[k])).toEqual(['Plan', 'Doelen', 'Instellingen'])
  })

  it('de wizardnaam is de canonieke PLAN_REVIEW_NAAM', () => {
    expect(KATERN_WIZARD_NAAM).toBe(PLAN_REVIEW_NAAM)
  })

  it('statuspunt-label voor schermlezers', () => {
    expect(katernStatuspuntLabel('instellingen', 'AOW ontbreekt')).toBe('Instellingen, melding: AOW ontbreekt')
  })
})

describe('katern-copy — ankerregel', () => {
  it('solved consumeert ankerVrijZin: "Vrij mogelijk vanaf je 52e."', () => {
    const regel = katernAnkerregel({ kind: 'solved', solvedFireAge: 52.3, currentAge: 38 })
    expect(regel).toBe('Vrij mogelijk vanaf je 52e.')
    expect(regel).toBe(ankerVrijZin({ solvedFireAge: 52.3, currentAge: 38, stop: { kind: 'now' } }))
    expect(regel).not.toContain('52,3')
  })

  it('solved onbereikbaar ⇒ de canonieke nul-tak', () => {
    expect(katernAnkerregel({ kind: 'solved', solvedFireAge: null, currentAge: 38 })).toBe(
      'De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf draagt.',
    )
  })

  it('vast anker = ankerTitel plus punt, zonder "Vrij op" en zonder "%"', () => {
    const stops = [
      { kind: 'age', stopAge: 60 },
      { kind: 'aow', stopAge: 67.25 },
      { kind: 'age', stopAge: 58.5 },
      { kind: 'now' },
    ] as const
    for (const stop of stops) {
      const regel = katernAnkerregel({ kind: 'vast', stop })
      expect(regel).toBe(`${ankerTitel(stop)}.`)
      expect(regel).not.toMatch(/Vrij op/i)
      expect(regel).not.toContain('%')
    }
    expect(katernAnkerregel({ kind: 'vast', stop: { kind: 'age', stopAge: 60 } })).toBe(
      'Je rekent met stoppen op 60.',
    )
    expect(katernAnkerregel({ kind: 'vast', stop: { kind: 'now' } })).toBe('Je rekent alsof je nu stopt.')
  })

  it('KPI 1: Vrijheidsleeftijd onder solved, ANKER_KPI_LABEL onder een vast anker', () => {
    expect(katernKpi1Label({ kind: 'solved', solvedFireAge: 52, currentAge: 38 })).toBe('Vrijheidsleeftijd')
    expect(katernKpi1Label({ kind: 'vast', stop: { kind: 'now' } })).toBe(ANKER_KPI_LABEL)
  })
})

describe('katern-copy — samenvattingen', () => {
  it('Plan solved: "61% van je doelbedrag"; geen getal ⇒ null', () => {
    expect(planSamenvatting({ kind: 'solved', doelbedragPct: 61.4 })).toBe('61% van je doelbedrag')
    expect(planSamenvatting({ kind: 'solved', doelbedragPct: null })).toBeNull()
  })

  it('Plan vast: "reikt tot je 88e" in hele jaren; onbekend ⇒ null', () => {
    expect(planSamenvatting({ kind: 'vast', reach: { kind: 'reikt-tot', age: 88.2, endAge: 90 } })).toBe(
      'reikt tot je 88e',
    )
    expect(planSamenvatting({ kind: 'vast', reach: { kind: 'onbekend' } })).toBeNull()
  })

  it('Doelen: "stopmoment 58 · " + labZoneWoord, of "nog geen doelscenario"', () => {
    expect(doelenSamenvatting({ stopAge: 58, zone: 'groen' })).toBe(`stopmoment 58 · ${labZoneWoord('groen')}`)
    expect(doelenSamenvatting({ stopAge: 58.5, zone: 'rood' })).toBe('stopmoment 58,5 · reikt niet')
    expect(doelenSamenvatting(null)).toBe('nog geen doelscenario')
    expect(doelenUitkomstregel({ stopAge: 58, zone: 'oranje' })).toBe('Stopmoment 58 · gedekt · krappe marge')
  })

  it('Instellingen: wizardstand plus AOW alleen als die melding er is', () => {
    expect(instellingenSamenvatting({ voorkeurenOpen: 2, aowOntbreekt: true })).toBe(
      'nog 2 voorkeuren open · AOW ontbreekt',
    )
    expect(instellingenSamenvatting({ voorkeurenOpen: 1, aowOntbreekt: false })).toBe('nog 1 voorkeur open')
    expect(instellingenSamenvatting({ voorkeurenOpen: 0, aowOntbreekt: true })).toBe('AOW ontbreekt')
    expect(instellingenSamenvatting({ voorkeurenOpen: 0, aowOntbreekt: false })).toBeNull()
  })

  it('open eigenaarsbeslispunt: zonder wizardstand blijft alleen de melding over', () => {
    expect(INSTELLINGEN_SAMENVATTING_TOONT_WIZARDSTAND).toBe(true)
    expect(instellingenSamenvatting({ voorkeurenOpen: 2, aowOntbreekt: true }, false)).toBe('AOW ontbreekt')
    expect(instellingenSamenvatting({ voorkeurenOpen: 2, aowOntbreekt: false }, false)).toBeNull()
  })
})

describe('katern-copy — aannamesregel', () => {
  const basis = { stop: null, eindleeftijd: 90, inflatiePct: 2, rendementPct: 5, gebeurtenissen: 3 } as const

  it('Volledig letterlijk volgens de kopij-toets', () => {
    expect(aannamesRegelTekst(basis, 'volledig')).toBe(
      'Op basis van: stopmoment zo vroeg mogelijk · plan tot je 90e · 2,0% inflatie · 5,0% rendement per jaar · 3 gebeurtenissen',
    )
  })

  it('Eenvoudig laat inflatie en rendement weg', () => {
    expect(aannamesRegelTekst(basis, 'eenvoudig')).toBe(
      'Op basis van: stopmoment zo vroeg mogelijk · plan tot je 90e · 3 gebeurtenissen',
    )
    expect(aannamesSegmenten(basis).filter((s) => s.alleenVolledig).map((s) => s.key)).toEqual([
      'inflatie',
      'rendement',
    ])
  })

  it('vast anker: "stopmoment 60"; nooit "zo vroeg mogelijk stoppen"', () => {
    const t = aannamesRegelTekst({ ...basis, stop: { kind: 'age', stopAge: 60 } }, 'volledig')
    expect(t).toContain('stopmoment 60')
    expect(t).not.toMatch(/zo vroeg mogelijk stoppen/)
  })

  it('enkelvoud en nul gebeurtenissen', () => {
    expect(aannamesRegelTekst({ ...basis, gebeurtenissen: 1 }, 'eenvoudig')).toMatch(/1 gebeurtenis$/)
    expect(aannamesRegelTekst({ ...basis, gebeurtenissen: 0 }, 'eenvoudig')).toMatch(/geen gebeurtenissen$/)
  })

  it('de link noemt zijn bestemming', () => {
    expect(AANNAMES_LINK_LABEL).toBe('Naar instellingen')
  })
})

describe('katern-copy — lagen', () => {
  it('elke LaagId heeft label én uitleg', () => {
    for (const id of LAAG_VOLGORDE) {
      expect(LAAG_LABEL[id].length).toBeGreaterThan(0)
      expect(LAAG_UITLEG[id].length).toBeGreaterThan(0)
    }
    expect(new Set(LAAG_VOLGORDE).size).toBe(Object.keys(LAAG_LABEL).length)
  })

  it('Eenvoudig toont Gebeurtenissen, Mijlpalen, Doelen en Je doelscenario', () => {
    expect(LAGEN_EENVOUDIG.map((id: LaagId) => LAAG_LABEL[id])).toEqual([
      'Gebeurtenissen',
      'Mijlpalen',
      'Doelen',
      'Je doelscenario',
    ])
  })

  it('marktcheck-uitleg: "middelste helft" en "Geen voorspelling", nooit "driekwart"', () => {
    expect(LAAG_UITLEG.marktcheck).toContain('middelste helft')
    expect(LAAG_UITLEG.marktcheck).toContain('Geen voorspelling')
    expect(LAAG_UITLEG.marktcheck).not.toMatch(/driekwart/i)
  })

  it('geen onverklaarde vakterm "±2pp" of "Natuurlijke mijlpalen"', () => {
    const alles = [...Object.values(LAAG_LABEL), ...Object.values(LAAG_UITLEG)].join(' ')
    expect(alles).not.toMatch(/±|pp\b|Natuurlijke/)
  })
})

describe('katern-copy — marktcheck-getallen', () => {
  it('"in het midden", hele jaren, nooit "verwacht"', () => {
    const regel = marktcheckGetallenRegel({ tegenzit: 55.4, midden: 52.3, meezit: 48.6 })
    expect(regel).toBe('als het tegenzit 55 · in het midden 52 · als het meezit 49')
    expect(regel).not.toMatch(/verwacht/i)
  })

  it('onbereikbaar tegenzit: de regel blijft, met "niet binnen je plan" (kopij-toets §7)', () => {
    expect(marktcheckGetallenRegel({ tegenzit: null, midden: 58, meezit: 52 })).toBe(
      'als het tegenzit niet binnen je plan · in het midden 58 · als het meezit 52',
    )
  })

  it('onbereikbaar midden of meezit: op die plek "niet binnen je plan"', () => {
    expect(marktcheckGetallenRegel({ tegenzit: 55, midden: null, meezit: 49 })).toBe(
      'als het tegenzit 55 · in het midden niet binnen je plan · als het meezit 49',
    )
    expect(marktcheckGetallenRegel({ tegenzit: 55, midden: 52, meezit: null })).toBe(
      'als het tegenzit 55 · in het midden 52 · als het meezit niet binnen je plan',
    )
  })

  it('twee van de drie onbereikbaar: nog steeds een regel', () => {
    expect(marktcheckGetallenRegel({ tegenzit: null, midden: null, meezit: 49.6 })).toBe(
      'als het tegenzit niet binnen je plan · in het midden niet binnen je plan · als het meezit 50',
    )
  })

  it('alle drie onbereikbaar ⇒ geen regel', () => {
    expect(marktcheckGetallenRegel({ tegenzit: null, midden: null, meezit: null })).toBeNull()
  })

  it('een niet-eindig getal is een datafout, geen "onbereikbaar" ⇒ geen regel', () => {
    expect(marktcheckGetallenRegel({ tegenzit: Number.NaN, midden: 52, meezit: 49 })).toBeNull()
    expect(marktcheckGetallenRegel({ tegenzit: 55, midden: 52, meezit: Infinity })).toBeNull()
    expect(marktcheckGetallenRegel({ tegenzit: null, midden: Number.NaN, meezit: null })).toBeNull()
  })

  it('marktcheckStandWaarde: hele jaren of de woorden', () => {
    expect(marktcheckStandWaarde(52.3)).toBe('52')
    expect(marktcheckStandWaarde(null)).toBe(MARKTCHECK_NIET_BINNEN_PLAN)
    expect(MARKTCHECK_NIET_BINNEN_PLAN).toBe('niet binnen je plan')
  })

  it('MarktcheckLeeftijden is structureel gelijk aan de kernel-uitkomst (beide richtingen)', () => {
    expectTypeOf<MarktcheckVrijheidsleeftijden>().toExtend<MarktcheckLeeftijden>()
    expectTypeOf<MarktcheckLeeftijden>().toExtend<MarktcheckVrijheidsleeftijden>()
    expectTypeOf<keyof MarktcheckLeeftijden>().toEqualTypeOf<keyof MarktcheckVrijheidsleeftijden>()
  })
})

describe('katern-copy — compliance-invarianten over alle kopij', () => {
  it('geen koop-/verkoopmetafoor (ADR 0165)', () => {
    for (const t of alleKopij()) expect(t).not.toMatch(KOOP_METAFOOR)
  })

  it('nergens "verwacht" of "driekwart"', () => {
    for (const t of alleKopij()) {
      expect(t).not.toMatch(/verwacht/i)
      expect(t).not.toMatch(/driekwart/i)
    }
  })

  it('de canvas-kopij woont hier; het voorlopige canvasbestand is weg', () => {
    expect(CANVAS_UITLEG_TITEL).toBe('Zo werkt je grafiek')
    expect(DOELEN_VOLGT_PLAN_REGEL).toBe(
      'Samenstelling en Geldstroom volgen je plan; je doelscenario zie je in Vermogen',
    )
    expect(MARKTCHECK_MISLUKT_REGEL).toBe(
      'De marktcheck kon niet worden doorgerekend. Je planlijn klopt gewoon; zet de laag uit en weer aan om het opnieuw te proberen.',
    )
    expect(
      existsSync(join(process.cwd(), 'components/toekomst/canvas/canvas-kopij-voorlopig.ts')),
    ).toBe(false)
  })

  it('canvas-modi in vaste volgorde', () => {
    expect(CANVAS_MODUS_VOLGORDE.map((m) => CANVAS_MODUS_LABEL[m])).toEqual([
      'Vermogen',
      'Samenstelling',
      'Geldstroom',
    ])
  })
})
