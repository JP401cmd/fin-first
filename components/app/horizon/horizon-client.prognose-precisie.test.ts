/**
 * Bron-grendel op de precisie van de prognose-kopgetallen (bevinding M5).
 *
 * WAAROM EEN BRON-TEST: de KPI-strip van `horizon-client.tsx` (>9000 regels)
 * bestaat in twee varianten (desktop 4-koloms + mobiele 2x2), en dezelfde twee
 * grootheden — het FIRE-doelbedrag en de vrijheidsleeftijd — worden óók door
 * de huishoud-sectie en de dashboard-widget getoond. Een render-test bewijst
 * één opgestelde situatie; hij bewijst niet dat álle plekken die dat getal
 * tonen dezelfde afspraak volgen. En juist dát was de bevinding: het doelbedrag
 * stond euro-exact op het scherm ("€676.698"), vijftien jaar vooruit, terwijl
 * de welkomstoverlay ernaast al netjes afrondde ("rond je 53e").
 *
 * DE LES UIT DE RELEASE-REVIEW (27-08-2026): een eerdere versie van deze test
 * greppte op de HELPER ("staat `approx` op een regel die ook `Kassabon` noemt")
 * — een regel die in JSX per constructie niet bestaat, dus de assertie was
 * altijd leeg. We grepen daarom op de GROOTHEID: elke render-site van een
 * FIRE-doelbedrag of een vrijheidsleeftijd, in álle bestanden die ze tonen. De
 * kassabon is de enige uitzondering, en die wordt structureel bepaald (binnen
 * `<KassabonShell>`) of expliciet gemarkeerd — niet geraden.
 *
 * DRIE REGELS:
 *  1. elk FIRE-doelbedrag dat BUITEN een kassabon gerenderd wordt, draagt
 *     `approx` — de afronding op significante cijfers mét "ca.";
 *  2. een vrijheidsleeftijd wordt buiten een kassabon nooit met decimalen
 *     getoond (hele jaren, conform `formatHeroFireAge`);
 *  3. de kassabons noemen de inflatie-aanname expliciet — die ontbrak, terwijl
 *     rendement er wél stond; samen bepalen ze wat het bedrag straks waard is.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Elk bestand dat een FIRE-doelbedrag of een vrijheidsleeftijd op het scherm
 * zet. Groeit deze lijst, dan groeit de grendel mee — dat is het punt: de
 * bevinding ontstond doordat twee van deze vier oppervlakken hun eigen vorm
 * kozen voor hetzelfde getal.
 */
const PROGNOSE_OPPERVLAKKEN = [
  ['components', 'app', 'horizon', 'horizon-client.tsx'],
  ['components', 'app', 'household-fire-section.tsx'],
  ['components', 'widgets', 'fire-prognose-widget.tsx'],
  ['components', 'overview', 'mini-networth-chart.tsx'],
] as const

/** Het FIRE-doelbedrag, in al zijn benamingen over de vier oppervlakken. */
const DOELBEDRAG = /value=\{[^}]*(fireTarget|FireTarget|VrijheidDoel|PortfolioAtAow|RequiredPortfolio)/

/** Een vrijheids-/FIRE-leeftijd die met decimalen wordt getoond. */
const LEEFTIJD_MET_DECIMALEN = /\b\w*[fF]ire[aA]ge\w*[?!]?\.toFixed\(|\bheroFireAge\.age[?!]?\.toFixed\(/

/**
 * Bewuste uitzondering op één regel. De kassabon is de plek waar de euro en de
 * maand wél iets betekenen; dat mag, mits het erbij staat. Zonder markering is
 * een decimale leeftijd buiten een kassabon een overtreding.
 */
const EXACT_MARK = '// kassabon: exact'

interface Regel {
  bestand: string
  nr: number
  tekst: string
  inKassabon: boolean
}

/**
 * Markeert welke regels binnen een `<KassabonShell>…</KassabonShell>` vallen.
 * Structureel bepaald, niet geraden — een kassabon-regel en een KPI-regel zien
 * er los van elkaar identiek uit.
 */
function leesRegels(pad: readonly string[]): Regel[] {
  const bestand = pad.join('/')
  const ruw = readFileSync(join(process.cwd(), ...pad), 'utf8').split(/\r?\n/)
  let diepte = 0
  return ruw.map((tekst, i) => {
    diepte += (tekst.match(/<KassabonShell\b/g) ?? []).length
    const inKassabon = diepte > 0
    diepte -= (tekst.match(/<\/KassabonShell>/g) ?? []).length
    if (diepte < 0) diepte = 0
    return { bestand, nr: i + 1, tekst, inKassabon }
  })
}

function alleRegels(): Regel[] {
  return PROGNOSE_OPPERVLAKKEN.flatMap(leesRegels)
}

function toon(regels: Regel[]): string[] {
  return regels.map((r) => `${r.bestand}:${r.nr} → ${r.tekst.trim()}`)
}

describe('prognose-kopgetallen — één vorm voor het FIRE-doelbedrag', () => {
  it('rendert elk doelbedrag buiten een kassabon met approx', () => {
    const overtredingen = alleRegels().filter(
      (r) =>
        r.tekst.includes('<MaskedAmount') &&
        DOELBEDRAG.test(r.tekst) &&
        !r.inKassabon &&
        !r.tekst.includes(EXACT_MARK) &&
        !r.tekst.includes('approx'),
    )
    expect(
      toon(overtredingen),
      'een doelbedrag op het scherm zonder afronding leest als schijnzekerheid',
    ).toEqual([])
  })

  it('vindt de doelbedrag-sites daadwerkelijk (de grendel mag niet leeg draaien)', () => {
    // Zonder deze assertie zou een gewijzigde propnaam de regel hierboven
    // stilzwijgend uitschakelen — precies de fout die de review vond.
    const sites = alleRegels().filter(
      (r) => r.tekst.includes('<MaskedAmount') && DOELBEDRAG.test(r.tekst) && !r.inKassabon,
    )
    expect(sites.length).toBeGreaterThanOrEqual(8)
  })
})

describe('prognose-kopgetallen — één vorm voor de vrijheidsleeftijd', () => {
  it('toont de leeftijd buiten een kassabon nooit met decimalen', () => {
    const overtredingen = alleRegels().filter(
      (r) =>
        LEEFTIJD_MET_DECIMALEN.test(r.tekst) &&
        !r.inKassabon &&
        !r.tekst.includes(EXACT_MARK),
    )
    expect(
      toon(overtredingen),
      'een tiende van een jaar, vijftien jaar vooruit, is precisie die de projectie niet heeft',
    ).toEqual([])
  })

  it('consumeert op /toekomst de seam die op hele jaren afrondt', () => {
    const src = readFileSync(
      join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx'),
      'utf8',
    )
    expect(src).toContain('heroFireAgeText')
    expect(src).toContain('heroFireAgeTextMobile')
  })
})

describe('horizon-client — de kassabon draagt de aannames', () => {
  it('noemt zowel rendement als inflatie', () => {
    const src = readFileSync(
      join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx'),
      'utf8',
    )
    // Rendement stond er al; inflatie ontbrak — precies het gat uit de
    // bevinding. Beide komen uit `fireParams` (resolveFireParams), niet uit een
    // eigen aanname in de component.
    expect(src).toContain('Verwacht rendement')
    expect(src).toContain('Verwachte inflatie')
    expect(src).toContain('fireParams.inflationRate')
  })

  it('toont de inflatie-aanname in beide kassabons (leeftijd én doelbedrag)', () => {
    const regels = leesRegels(PROGNOSE_OPPERVLAKKEN[0]).filter(
      (r) => r.inKassabon && r.tekst.includes('Verwachte inflatie'),
    )
    expect(regels.length).toBeGreaterThanOrEqual(2)
  })
})
