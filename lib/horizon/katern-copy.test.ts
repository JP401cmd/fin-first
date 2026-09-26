import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  AANNAMES_LINK_LABEL,
  CANVAS_MODUS_LABEL,
  CANVAS_MODUS_VOLGORDE,
  CANVAS_UITLEG_TITEL,
  DOELEN_VOLGT_PLAN_REGEL,
  GEBEURTENIS_NIET_VERPLAATST,
  HUIS_LAAG_LABEL,
  HUIS_LAAG_UITLEG,
  INSTELLINGEN_SAMENVATTING_TOONT_WIZARDSTAND,
  KATERN_LABEL,
  KATERN_VOLGORDE,
  KATERN_WIZARD_NAAM,
  LAAG_LABEL,
  LAAG_UITLEG,
  LAAG_VOLGORDE,
  LAGEN_EENVOUDIG,
  LAGEN_KOP,
  MARKTCHECK_MISLUKT_REGEL,
  MARKTCHECK_NIET_BINNEN_PLAN,
  MARKTCHECK_STAND_LABEL,
  PLAN_JAARTABEL_LINK,
  aannamesRegelTekst,
  aannamesSegmenten,
  doelenSamenvatting,
  doelenUitkomstregel,
  instellingenSamenvatting,
  katernAnkerregel,
  katernKpi1Label,
  katernMeldingGeminimaliseerdSr,
  katernMeldingNogLabel,
  katernStatuspuntLabel,
  laagLabel,
  laagUitleg,
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
    ...Object.values(HUIS_LAAG_LABEL),
    ...Object.values(HUIS_LAAG_UITLEG),
    ...Object.values(MARKTCHECK_STAND_LABEL),
    ...Object.values(CANVAS_MODUS_LABEL),
    LAGEN_KOP,
    AANNAMES_LINK_LABEL,
    CANVAS_UITLEG_TITEL,
    DOELEN_VOLGT_PLAN_REGEL,
    MARKTCHECK_MISLUKT_REGEL,
    PLAN_JAARTABEL_LINK,
    katernMeldingNogLabel(1),
    katernMeldingNogLabel(3),
    ...KATERN_VOLGORDE.map(katernMeldingGeminimaliseerdSr),
    ...Object.values(GEBEURTENIS_NIET_VERPLAATST),
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

  it('"Nog N" onder de bovenste melding: enkelvoud en meervoud', () => {
    expect(katernMeldingNogLabel(1)).toBe('Nog 1 melding')
    expect(katernMeldingNogLabel(2)).toBe('Nog 2 meldingen')
  })

  it('sr-tekst na minimaliseren: beschrijvend, per onderdeel, zonder "katern"', () => {
    expect(katernMeldingGeminimaliseerdSr('plan')).toBe(
      'Melding geminimaliseerd. Het punt bij Plan onder de grafiek haalt de melding terug.',
    )
    for (const k of KATERN_VOLGORDE) expect(katernMeldingGeminimaliseerdSr(k)).not.toMatch(/katern/i)
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
  it('elke LaagId heeft label én uitleg, onder beide hoofdlijnen', () => {
    for (const hoofdlijn of ['total', 'liquid'] as const) {
      for (const id of LAAG_VOLGORDE) {
        expect(laagLabel(id, hoofdlijn).length).toBeGreaterThan(0)
        expect(laagUitleg(id, hoofdlijn).length).toBeGreaterThan(0)
      }
    }
    // De vaste records plus de huislaag dekken precies de volgorde.
    expect(new Set(LAAG_VOLGORDE).size).toBe(Object.keys(LAAG_LABEL).length + 1)
  })

  it('huislaag volgt de hoofdlijn: zonder je huis ⇒ "Met je huis", anders "Zonder je huis"', () => {
    expect(laagLabel('metHuis', 'liquid')).toBe('Met je huis')
    expect(laagUitleg('metHuis', 'liquid')).toBe(
      'Een tweede lijn met je huis erbij. De hoofdlijn is het deel waar je direct bij kunt.',
    )
    expect(laagLabel('metHuis', 'total')).toBe('Zonder je huis')
    expect(laagUitleg('metHuis', 'total')).toBe(
      'De lijn zonder je huis toont het deel van je vermogen waar je direct bij kunt. Je huis zit daar niet in — daardoor kan de lijn met je huis doorgroeien terwijl die andere lijn daalt.',
    )
    // Andere lagen hangen niet af van de hoofdlijn.
    expect(laagLabel('marktcheck', 'total')).toBe(laagLabel('marktcheck', 'liquid'))
  })

  it('de huislabels zijn de lijnnamen uit sim-chart (geen nieuwe formulering)', () => {
    const src = readFileSync(join(process.cwd(), 'components/app/horizon/sim-chart.tsx'), 'utf8')
    for (const label of Object.values(HUIS_LAAG_LABEL)) expect(src).toContain(`'${label}'`)
  })

  it('Eenvoudig toont Gebeurtenissen, Mijlpalen, Doelen en Je doelscenario', () => {
    expect(LAGEN_EENVOUDIG.map((id: LaagId) => laagLabel(id, 'liquid'))).toEqual([
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
    const alles = [
      ...Object.values(LAAG_LABEL),
      ...Object.values(LAAG_UITLEG),
      ...Object.values(HUIS_LAAG_LABEL),
      ...Object.values(HUIS_LAAG_UITLEG),
    ].join(' ')
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

  it('de jaartabel-link in Plan noemt zijn bestemming', () => {
    expect(PLAN_JAARTABEL_LINK).toBe('Jaar-op-jaar-tabel →')
  })

  it('canvas-modi in vaste volgorde', () => {
    expect(CANVAS_MODUS_VOLGORDE.map((m) => CANVAS_MODUS_LABEL[m])).toEqual([
      'Vermogen',
      'Samenstelling',
      'Geldstroom',
    ])
  })
})
