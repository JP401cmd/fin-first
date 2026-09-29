import { describe, expect, it } from 'vitest'
import { standaardImpactContext } from './impact'
import {
  ACHTERGROND_MAX,
  EDITIE_MAX,
  GEVOELIGE_REDENEN,
  REDEN_PER_REGEL,
  RUBRIEK_MAX,
  SCORE_DREMPEL,
  SCORE_DREMPEL_RAAKT,
  matchEditie,
  regelSleutel,
  toetsRegel,
  toetsThema,
  voldoetAanLeescontract,
  NIEUWS_MAX_OUDERDOM_DAGEN,
  type KandidaatArtikel,
  type MatchContext,
} from './matcher'
import { LEEG_PROFIEL, type NieuwsprofielV1 } from './profiel'
import { AOW_RIJEN, ARTIKELEN, NU, PROFIEL_DAAN, PROFIEL_TESSA, PROFIEL_WILLEM } from './editie.fixture'
import { vindWftOvertreding } from './wft-woordenlijst'
import type { DuidingV1 } from './duiding-schema'
import { THEMAS, type ThemaId } from './themas'
import { SJABLONEN, type SjabloonId } from './sjablonen-catalogus'

function context(opties: Partial<MatchContext> = {}): MatchContext {
  return {
    now: NU,
    gezienArtikelIds: new Set(),
    gedemptRubrieken: new Set(),
    impact: standaardImpactContext(AOW_RIJEN, NU.getUTCFullYear()),
    ...opties,
  }
}

function fixture(id: string): KandidaatArtikel {
  const a = ARTIKELEN.find((x) => x.id === id)
  if (!a) throw new Error(`fixture ${id} ontbreekt`)
  return a
}

/** Een box 3-forfaitartikel (score 5 voor wie ruim belegt) in een gekozen rubriek. */
function forfaitArtikel(id: string, category: string): KandidaatArtikel {
  return { ...fixture('a13-box3-forfait'), id, category }
}

const belegger: NieuwsprofielV1 = {
  ...LEEG_PROFIEL,
  huishouden: 'alleen',
  spaargeld: 'tot-5k',
  beleggingen: { band: 'boven-250k', vorm: ['fondsen'] },
  schulden: ['geen'],
}

describe('matcher — leescontract (1A)', () => {
  it('alleen geduid, niet gezien, binnen het venster of met een toekomstige deadline', () => {
    const ctx = context({ gezienArtikelIds: new Set(['a01-box3-heffingsvrij']) })
    expect(voldoetAanLeescontract(fixture('a14-wacht'), ctx)).toBe(false)
    expect(voldoetAanLeescontract(fixture('a17-teruggetrokken'), ctx)).toBe(false)
    expect(voldoetAanLeescontract(fixture('a15-oud'), ctx)).toBe(false)
    expect(voldoetAanLeescontract(fixture('a08-kinderopvangtoeslag'), ctx)).toBe(true) // oud, maar deadline in de toekomst
    expect(voldoetAanLeescontract(fixture('a01-box3-heffingsvrij'), ctx)).toBe(false) // gezien
    expect(voldoetAanLeescontract(fixture('a02-box1-schijf1'), ctx)).toBe(true)
  })

  it('een verlopen deadline houdt een oud artikel niet meer in het venster', () => {
    const ctx = context({ now: new Date('2026-11-15T06:00:00Z') })
    expect(voldoetAanLeescontract(fixture('a08-kinderopvangtoeslag'), ctx)).toBe(false)
  })

  // Given een artikel dat we deze week pas ophaalden, maar dat de bron lang geleden
  // publiceerde (CBS-bericht van april, CPB-raming uit 2025), When de matcher het
  // venster toetst, Then telt het niet als nieuw — tenzij er nog een deadline
  // aankomt (eigenaarsbesluit 29 sep 2026: NIEUWS_MAX_OUDERDOM_DAGEN).
  it('oud nieuws dat we nu pas ophaalden telt niet als nieuw (publicatiedatum > 45 dagen)', () => {
    const ctx = context()
    const vers = fixture('a02-box1-schijf1')
    const dagenTerug = (d: number) => new Date(NU.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
    expect(NIEUWS_MAX_OUDERDOM_DAGEN).toBe(45)
    expect(voldoetAanLeescontract({ ...vers, published_at: dagenTerug(46) }, ctx)).toBe(false)
    expect(voldoetAanLeescontract({ ...vers, published_at: dagenTerug(44) }, ctx)).toBe(true)
    // Geen publicatiedatum (eerste_gezien wordt als datum opgeslagen): de ophaaldatum beslist.
    expect(voldoetAanLeescontract({ ...vers, published_at: null }, ctx)).toBe(true)
    // Een aankomende deadline houdt ook een oud bericht in het venster.
    expect(voldoetAanLeescontract({ ...fixture('a08-kinderopvangtoeslag'), published_at: dagenTerug(200) }, ctx)).toBe(true)
  })

  // De grenzen van dezelfde regel, aan beide uiteinden (eindreview R1-delta 🟡-3).
  // De case hierboven raakt het kerngeval van het besluit niet: a08 is buiten het
  // venster opgehaald, dus daar wint de deadline al vóór de ouderdom meetelt.
  it('de grenzen: precies 45 dagen, een onleesbare datum, en de deadline bij een vers opgehaald oud bericht', () => {
    const ctx = context()
    const vers = fixture('a02-box1-schijf1')
    const dagenTerug = (d: number) => new Date(NU.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
    const deadline = fixture('a08-kinderopvangtoeslag').duiding!.deadline!
    const metDeadline = (datum: string) => ({
      ...vers,
      published_at: dagenTerug(200),
      duiding: { ...vers.duiding!, deadline: { ...deadline, datum } },
    })

    // Precies op de grens is nog niet "ouder dan".
    expect(voldoetAanLeescontract({ ...vers, published_at: dagenTerug(45) }, ctx)).toBe(true)
    // Een publicatiedatum die geen datum is: de ophaaldatum beslist.
    expect(voldoetAanLeescontract({ ...vers, published_at: 'onbekend' }, ctx)).toBe(true)
    // Binnen het venster opgehaald, lang geleden gepubliceerd, deadline komt nog: blijft.
    expect(voldoetAanLeescontract(metDeadline('2026-10-31'), ctx)).toBe(true)
    // Dezelfde rij met een verlopen deadline: de ouderdom beslist weer.
    expect(voldoetAanLeescontract(metDeadline('2026-09-01'), ctx)).toBe(false)
  })
})

describe('matcher — doelgroepregels', () => {
  it('ja/nee/onbekend per operator en veldsoort', () => {
    expect(toetsRegel({ veld: 'spaargeld', op: 'minstens', waarden: ['25k-50k'] }, { ...LEEG_PROFIEL, spaargeld: '50k-100k' })).toBe('ja')
    expect(toetsRegel({ veld: 'spaargeld', op: 'minstens', waarden: ['25k-50k'] }, { ...LEEG_PROFIEL, spaargeld: 'tot-5k' })).toBe('nee')
    expect(toetsRegel({ veld: 'spaargeld', op: 'hoogstens', waarden: ['25k-50k'] }, { ...LEEG_PROFIEL, spaargeld: 'tot-5k' })).toBe('ja')
    expect(toetsRegel({ veld: 'spaargeld', op: 'minstens', waarden: ['25k-50k'] }, LEEG_PROFIEL)).toBe('onbekend')
    expect(toetsRegel({ veld: 'geboortejaar', op: 'minstens', waarden: ['1960'] }, PROFIEL_DAAN)).toBe('ja')
    expect(toetsRegel({ veld: 'geboortejaar', op: 'hoogstens', waarden: ['1990'] }, PROFIEL_DAAN)).toBe('nee')
    expect(toetsRegel({ veld: 'werk', op: 'in', waarden: ['dga', 'zelfstandig'] }, PROFIEL_TESSA)).toBe('ja')
    expect(toetsRegel({ veld: 'werk', op: 'bevat', waarden: ['dga', 'zelfstandig'] }, PROFIEL_TESSA)).toBe('nee')
    expect(toetsRegel({ veld: 'wonen', op: 'in', waarden: ['huur-sociaal', 'huur-vrije-sector'] }, PROFIEL_TESSA)).toBe('nee')
  })

  it('één "nee" haalt het artikel weg', () => {
    const huurder: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'huur-sociaal', rubrieken: ['woningmarkt'] }
    const u = matchEditie(huurder, [fixture('a07-hypotheekrente'), fixture('a09-huurverhoging')], context())
    expect(u.items.map((i) => i.artikelId)).toEqual(['a09-huurverhoging'])
  })

  it('"onbekend" is geen nee, maar een onbevestigde doelgroep krijgt geen som en geen bonus: zonder bevestiging blijft het onder de drempel', () => {
    // wonen onbekend + voorkeur woningmarkt: zónder de regel zou de bonus dit naar 3 tillen.
    const onbekend = matchEditie({ ...LEEG_PROFIEL, rubrieken: ['woningmarkt'] }, [fixture('a09-huurverhoging')], context())
    expect(onbekend.items).toEqual([])
    // kinderen onbekend + deadline: idem — een leeg veld mag geen deadline-artikel bij iedereen zetten.
    expect(matchEditie(LEEG_PROFIEL, [fixture('a08-kinderopvangtoeslag')], context()).items).toEqual([])
    // Alle velden voor de box 3-som aanwezig, maar de doelgroepregel zelf (spaargeld) onbekend:
    // geen stellige zin met een bedrag — een leeg profiel-veld maakt de som niet eens.
    const zonderSpaargeld: NieuwsprofielV1 = { ...belegger, spaargeld: null, rubrieken: ['fiscaal'] }
    const u = matchEditie(zonderSpaargeld, [fixture('a01-box3-heffingsvrij')], context())
    expect(u.items).toEqual([])
  })

  it('weert een samenvatting die de Wft-woordenlijst raakt (gebiedende wijs, aanbieder) — het item blijft, de tekst gaat op null', () => {
    const basis = fixture('a05-eigen-risico')
    const vervuild = { ...basis, duiding: { ...basis.duiding!, samenvatting: 'Stap over naar ING, dat scheelt 220 euro per jaar.' } }
    const u = matchEditie(PROFIEL_DAAN, [vervuild], context())
    expect(u.items).toHaveLength(1)
    expect(u.items[0].samenvatting).toBeNull()
    expect(u.items[0].waarom).toContain('samenvatting-geweerd:gebiedende-wijs')
    expect(u.items[0].tekst).toMatch(/hoogstens €\s220 per jaar/)
    // Ook in het algemene katern.
    const alg = matchEditie(LEEG_PROFIEL, [vervuild], context())
    expect(alg.algemeen.items[0].samenvatting).toBeNull()
  })

  it('het algemene katern sorteert op recency, dan soort en kop — niet op id — onafhankelijk van het AI-editiepad', () => {
    const u = matchEditie(LEEG_PROFIEL, ARTIKELEN, context())
    const ids = u.algemeen.items.map((i) => i.artikelId)
    expect(ids.length).toBeLessThanOrEqual(5)
    // Zelfde publicatiedatum in de fixture → eerst de besluiten (op kop), dan het cijfer (MATCHER_VERSIE 2).
    expect(ids).toEqual(['a03-aow-leeftijd', 'a01-box3-heffingsvrij', 'a09-huurverhoging', 'a04-studieschuld-rente', 'a11-inflatie'])
    expect(ids).not.toContain('a08-kinderopvangtoeslag') // ouder dan de rest
  })

  it('een bevestigde doelgroep waarvan de som een veld mist, rendert "wat mist" met dat veld', () => {
    // spaargeld 50k–100k bevestigt de doelgroep (minstens 25k–50k); huishouden ontbreekt voor de box 3-som.
    const profiel: NieuwsprofielV1 = { ...LEEG_PROFIEL, spaargeld: '50k-100k', rubrieken: ['fiscaal'] }
    const u = matchEditie(profiel, [fixture('a01-box3-heffingsvrij')], context())
    expect(u.items).toHaveLength(1)
    expect(u.items[0].sjabloonId).toBe('wat-mist-bedrag')
    expect(u.items[0].watMist).toEqual(['huishouden', 'beleggingen', 'schulden'])
    expect(u.items[0].tekst).toBe('Met je huishouden, je beleggingen en je schulden in je profiel kan de Krant hier een bedrag bij zetten.')
    expect(u.items[0].impact).toBeNull()
  })
})

describe('matcher — score en selectie', () => {
  it('leeg is geldig: een leeg profiel haalt niets boven de drempel', () => {
    const u = matchEditie(LEEG_PROFIEL, ARTIKELEN, context())
    expect(u.items).toEqual([])
    expect(u.leeg).toBe(true)
    expect(u.legeTekst).toMatch(/geen nieuws/)
    expect(u.algemeen.items.length).toBeGreaterThan(0)
  })

  it('elk item haalt de drempel; direct staat vóór gevoeligheid vóór relevant; ties op artikel-id', () => {
    const u = matchEditie(PROFIEL_TESSA, ARTIKELEN, context())
    expect(u.leeg).toBe(false)
    for (const i of u.items) expect(i.score).toBeGreaterThanOrEqual(SCORE_DREMPEL)
    const rang = { direct: 0, gevoeligheid: 1, relevant: 2, raakt: 3 }
    for (let i = 1; i < u.items.length; i++) {
      const a = u.items[i - 1]
      const b = u.items[i]
      expect(rang[a.vorm] < rang[b.vorm] || (rang[a.vorm] === rang[b.vorm] && (a.score > b.score || (a.score === b.score && a.artikelId < b.artikelId)))).toBe(true)
    }
  })

  it('hoogstens EDITIE_MAX items, en hoogstens RUBRIEK_MAX per rubriek als er genoeg anders is', () => {
    const fiscaal = Array.from({ length: 5 }, (_, i) => forfaitArtikel(`f${i}`, 'fiscaal'))
    const overig = ['macro', 'rente', 'pensioen', 'woningmarkt', 'beleggingen', 'overig'].map((c, i) => forfaitArtikel(`o${i}`, c))
    const u = matchEditie(belegger, [...fiscaal, ...overig], context())
    expect(u.items).toHaveLength(EDITIE_MAX)
    expect(u.items.filter((i) => i.rubriek === 'fiscaal')).toHaveLength(RUBRIEK_MAX)
  })

  it('… tenzij er te weinig is: dan vult de rubriek verder aan', () => {
    const fiscaal = Array.from({ length: 5 }, (_, i) => forfaitArtikel(`f${i}`, 'fiscaal'))
    expect(matchEditie(belegger, fiscaal, context()).items).toHaveLength(5)
  })

  it('een deadline in de toekomst telt +1: de toeslagregel haalt de editie alleen mét deadline', () => {
    // Bewust zonder rubriekvoorkeur: die zou óók +1 geven en de deadline maskeren.
    const ouder: NieuwsprofielV1 = { ...LEEG_PROFIEL, kinderen: 'jongste-4-11' }
    const met = matchEditie(ouder, [fixture('a08-kinderopvangtoeslag')], context())
    expect(met.items.map((i) => i.artikelId)).toEqual(['a08-kinderopvangtoeslag'])
    expect(met.items[0].deadline?.tekst).toBe('De aanvraag moet vóór 31 oktober 2026 binnen zijn.')
    expect(met.items[0].waarom).toContain('deadline')
    const zonder = { ...fixture('a08-kinderopvangtoeslag'), fetched_at: NU.toISOString(), duiding: { ...fixture('a08-kinderopvangtoeslag').duiding!, deadline: null } }
    expect(matchEditie(ouder, [zonder], context()).items).toEqual([])
  })

  it('een rubriek uit de voorkeur telt +1; een gedempte rubriek haalt de editie alleen met 4 of 5', () => {
    const voorkeur: NieuwsprofielV1 = { ...LEEG_PROFIEL, pensioenopbouw: { werkgever: 'ja', lijfrente: null }, rubrieken: ['pensioen'] }
    expect(matchEditie(voorkeur, [fixture('a10-wtp')], context()).items.map((i) => i.score)).toEqual([3])
    expect(matchEditie(voorkeur, [fixture('a10-wtp')], context({ gedemptRubrieken: new Set(['pensioen']) })).items).toEqual([])
    // Een cohort dat het AOW-besluit raakt (1960, vanaf 2027): score 4 overleeft de demping.
    const d = fixture('a03-aow-leeftijd')
    const in2027 = { ...d, duiding: { ...d.duiding!, mechanisme: { soort: 'aow-leeftijd' as const, params: { vanaf_jaar: 2027, verschuiving_maanden: 3 }, drempel: null } } }
    const w = matchEditie({ ...LEEG_PROFIEL, geboortejaar: 1960 }, [in2027], context({ gedemptRubrieken: new Set(['pensioen']) }))
    expect(w.items.map((i) => i.artikelId)).toEqual(['a03-aow-leeftijd'])
    expect(w.items[0].waarom).toContain('rubriek-gedempt')
    // Willem (1968) valt buiten het besluit van 2033: relevant zonder bedrag, onder de drempel.
    expect(matchEditie(PROFIEL_WILLEM, [fixture('a03-aow-leeftijd')], context()).items).toEqual([])
  })

  it('beursbeweging haalt de editie nooit, ook niet met een voorkeursbonus; het landt in het algemene katern', () => {
    const u = matchEditie(PROFIEL_TESSA, [fixture('a12-beurs')], context())
    expect(u.items).toEqual([])
    expect(u.algemeen.items.map((i) => i.artikelId)).toEqual(['a12-beurs'])
    expect(u.algemeen.kop).toBe('Ook in het nieuws')
    expect(u.algemeen.label).toBe('Niet op jouw situatie afgestemd.')
  })

  it('algemeen katern bij gelijke datum: soort en kop beslissen, niet het artikel-id (bugkaart P2)', () => {
    // Drie items uit één run met exact dezelfde published_at en fetched_at, de
    // id's bewust in de "verkeerde" volgorde: vóór MATCHER_VERSIE 2 won 'a'.
    const basis = fixture('a12-beurs')
    const zelfdeMoment = { published_at: '2026-09-22T05:25:09.000Z', fetched_at: '2026-09-22T05:25:09.000Z' }
    const metSoort = (id: string, title: string, soort: 'achtergrond' | 'cijfer' | 'besloten') => ({
      ...basis,
      ...zelfdeMoment,
      id,
      title,
      duiding: { ...basis.duiding!, soort },
    })
    const invoer = [
      metSoort('a-achtergrond', 'Achtergrond bij het pensioenstelsel', 'achtergrond'),
      metSoort('b-cijfer', 'Inflatie stijgt naar 3,3 procent', 'cijfer'),
      metSoort('c-besloten', 'Box 3-tarief vastgesteld', 'besloten'),
      metSoort('0-cijfer-z', 'Woninghuur stijgt 4,4 procent', 'cijfer'),
    ]
    const volgorde = (arts: typeof invoer) => matchEditie(PROFIEL_TESSA, arts, context()).algemeen.items.map((i) => i.artikelId)
    expect(volgorde(invoer)).toEqual(['c-besloten', 'b-cijfer', '0-cijfer-z', 'a-achtergrond'])
    // Andere id's, zelfde inhoud → zelfde volgorde: het id beslist niet.
    const hernoemd = invoer.map((a, i) => ({ ...a, id: `z${9 - i}-${a.id}` }))
    expect(volgorde(hernoemd).map((id) => id.replace(/^z\d-/, ''))).toEqual(['c-besloten', 'b-cijfer', '0-cijfer-z', 'a-achtergrond'])
  })

  it('een gezien artikel telt niet, ook niet voor het algemene katern', () => {
    const u = matchEditie(PROFIEL_TESSA, ARTIKELEN, context({ gezienArtikelIds: new Set(['a12-beurs', 'a16-box3-tarief']) }))
    const ids = [...u.items.map((i) => i.artikelId), ...u.algemeen.items.map((i) => i.artikelId)]
    expect(ids).not.toContain('a12-beurs')
    expect(ids).not.toContain('a16-box3-tarief')
  })
})

describe('matcher — uitkomst', () => {
  it('rendert per item een tekst zonder open slot, zonder Wft-overtreding, met het ruwe bereik erbij voor 1E (B22)', () => {
    const u = matchEditie(PROFIEL_TESSA, ARTIKELEN, context())
    for (const i of u.items) {
      expect(i.tekst).not.toMatch(/\{[a-zA-Z]+\}/)
      expect(vindWftOvertreding(i.tekst), i.tekst).toBeNull()
      if (i.vorm !== 'relevant') expect(i.impact).not.toBeNull()
      else expect(i.impact).toBeNull()
    }
  })

  it('een voorstel of verwachting krijgt een voorbehoud vóór de regel; een besluit niet', () => {
    const u = matchEditie(PROFIEL_DAAN, ARTIKELEN, context())
    const eigenRisico = u.items.find((i) => i.artikelId === 'a05-eigen-risico')! // soort: voorstel
    expect(eigenRisico.tekst).toMatch(/^Als dit voorstel doorgaat: het verplicht eigen risico/)
    // Een besluit krijgt geen voorbehoud: het AOW-artikel (besloten) bij een cohort dat het raakt.
    const zestig: NieuwsprofielV1 = { ...LEEG_PROFIEL, geboortejaar: 1960 }
    const d = fixture('a03-aow-leeftijd')
    const in2027 = { ...d, duiding: { ...d.duiding!, mechanisme: { soort: 'aow-leeftijd' as const, params: { vanaf_jaar: 2027, verschuiving_maanden: 3 }, drempel: null } } }
    const aow = matchEditie(zestig, [in2027], context()).items[0]
    expect(aow.tekst).not.toMatch(/^Als /)
    expect(aow.tekst).toMatch(/67 jaar naar 67 jaar en 3 maanden/)
  })

  it('draagt de matcher- en sjabloonversie en het profieltype, zonder id', () => {
    const u = matchEditie(PROFIEL_DAAN, ARTIKELEN, context())
    expect(u.matcherVersie).toBe(6)
    expect(u.sjabloonVersie).toBe(2)
    expect(u.profielType).toBe('onder-35·wonen-onbekend·alleen')
    expect(JSON.stringify(u)).not.toMatch(/user_id|userId/)
  })

  it('is deterministisch: twee keer dezelfde invoer en een omgekeerde invoervolgorde geven byte-dezelfde editie', () => {
    const a = matchEditie(PROFIEL_TESSA, ARTIKELEN, context())
    const b = matchEditie(PROFIEL_TESSA, ARTIKELEN, context())
    const c = matchEditie(PROFIEL_TESSA, [...ARTIKELEN].reverse(), context())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(c))
  })
})

describe("matcher — thema's (v3, B35): persoonlijk maken, nooit uitsluiten", () => {
  const RECENT = '2026-09-19T05:10:00Z'
  function themaArtikel(themas: DuidingV1['themas'], category: string | null = 'wonen'): KandidaatArtikel {
    const basis = fixture('a15-oud')
    return { ...basis, id: 't1-huur', category, fetched_at: RECENT, published_at: RECENT, duiding: { ...basis.duiding!, themas } }
  }
  const HUUR: DuidingV1['themas'] = [{ thema: 'huur', citaat: 'De maximale huurverhoging wordt 4 procent' }]
  const huurder: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'huur-sociaal', rubrieken: ['wonen'] }
  const koper: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek', rubrieken: ['wonen'] }

  it('toetsThema: OF over de regels, onbekend zonder ja, en iedereen telt niet als gericht', () => {
    expect(toetsThema('huur', huurder)).toBe('ja')
    expect(toetsThema('huur', koper)).toBe('nee')
    expect(toetsThema('huur', LEEG_PROFIEL)).toBe('onbekend')
    // aow: geboortejaar hoogstens 1970 OF werk bevat pensioen — één ja is genoeg.
    expect(toetsThema('aow', { ...LEEG_PROFIEL, geboortejaar: 1990, werk: ['pensioen'] })).toBe('ja')
    expect(toetsThema('aow', { ...LEEG_PROFIEL, geboortejaar: 1990 })).toBe('onbekend')
    expect(toetsThema('aow', { ...LEEG_PROFIEL, geboortejaar: 1990, werk: ['loondienst'] })).toBe('nee')
    expect(toetsThema('zorgkosten', huurder)).toBe('nee')
  })

  it('een thema dat het profiel raakt maakt een relevant artikel gericht: met rubriekbonus haalt het de drempel', () => {
    const e = matchEditie(huurder, [themaArtikel(HUUR)], context())
    expect(e.items).toHaveLength(1)
    expect(e.items[0].score).toBe(SCORE_DREMPEL)
    expect(e.items[0].waarom).toContain('thema:huur')
  })

  it('zonder thema scoort hetzelfde artikel algemeen en blijft onder de drempel (gedrag van vóór v3)', () => {
    const e = matchEditie(huurder, [themaArtikel([])], context())
    expect(e.items).toHaveLength(0)
    expect(e.algemeen.items.map((i) => i.artikelId)).toEqual(['t1-huur'])
  })

  it('een thema sluit nooit uit: wie het thema niet raakt, ziet het artikel gewoon in het algemene katern', () => {
    for (const p of [koper, LEEG_PROFIEL]) {
      const e = matchEditie(p, [themaArtikel(HUUR)], context())
      expect(e.items).toHaveLength(0)
      expect(e.algemeen.items.map((i) => i.artikelId)).toEqual(['t1-huur'])
    }
  })

  it("'iedereen' maakt niemand gericht", () => {
    const e = matchEditie(huurder, [themaArtikel([{ thema: 'zorgkosten', citaat: 'Het eigen risico blijft gelijk' }])], context())
    expect(e.items).toHaveLength(0)
  })

  it('is deterministisch: dezelfde invoer geeft byte-dezelfde editie', () => {
    const een = JSON.stringify(matchEditie(huurder, [themaArtikel(HUUR)], context()))
    const twee = JSON.stringify(matchEditie(huurder, [themaArtikel(HUUR)], context()))
    expect(een).toBe(twee)
  })
})

describe('matcher — tijdlijn (1C, B37): "Over jouw situatie", drempel 2, Achtergrond', () => {
  const RECENT = '2026-09-19T05:10:00Z'
  const tijdlijn = (o: Partial<MatchContext> = {}) => context({ modus: 'tijdlijn', ...o })
  function artikelMet(d: Partial<DuidingV1>, id = 't2-raakt'): KandidaatArtikel {
    const basis = fixture('a15-oud')
    return { ...basis, id, category: 'wonen', fetched_at: RECENT, published_at: RECENT, duiding: { ...basis.duiding!, ...d } }
  }
  const HUUR: DuidingV1['themas'] = [{ thema: 'huur', citaat: 'De maximale huurverhoging wordt 4 procent' }]
  // Bewust ZONDER rubriekvoorkeur: in de editie blijft dit onder de drempel (score 2).
  const huurder: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'huur-sociaal' }

  it('een thema dat raakt haalt de tijdlijn op score 2 met de vorm raakt; in de editie niet', () => {
    const t = matchEditie(huurder, [artikelMet({ themas: HUUR })], tijdlijn())
    expect(t.items).toHaveLength(1)
    expect(t.items[0].vorm).toBe('raakt')
    expect(t.items[0].score).toBe(SCORE_DREMPEL_RAAKT)
    expect(t.items[0].impact).toBeNull()
    expect(t.items[0].tekst).toBe('Volgens je profiel huur je je woning. Dit bericht gaat over huren. Of en hoeveel het jou raakt, rekent de Krant hier niet uit.')
    expect(t.items[0].waarom).toContain('reden:reden-huur')
    expect(matchEditie(huurder, [artikelMet({ themas: HUUR })], context()).items).toHaveLength(0)
  })

  it('een bevestigde doelgroepregel geeft het slot "geldt ook voor jou", met de reden uit die regel', () => {
    const doelgroep = [{ veld: 'wonen', op: 'in' as const, waarden: ['huur-sociaal', 'huur-vrije-sector'] }]
    const t = matchEditie(huurder, [artikelMet({ doelgroep })], tijdlijn())
    expect(t.items).toHaveLength(1)
    expect(t.items[0].sjabloonId).toBe('raakt-doelgroep')
    expect(t.items[0].tekst).toBe('Volgens je profiel huur je je woning. Dat geldt ook voor jou. Wat het in euro’s doet, rekent de Krant hier niet uit.')
  })

  it('het koopwoning-tegenvoorbeeld: een box 3-thema raakt een koopwoning niet, dus geen bericht — wel Achtergrond', () => {
    const koper: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek', spaargeld: 'tot-5k', beleggingen: { band: 'geen', vorm: null } }
    const box3 = artikelMet({ soort: 'achtergrond', themas: [{ thema: 'box3-vermogen', citaat: 'Box 3 gaat vanaf 2028 anders werken' }] })
    const t = matchEditie(koper, [box3], tijdlijn())
    expect(t.items).toHaveLength(0)
    expect(t.algemeen.achtergrond?.items.map((i) => i.artikelId)).toEqual(['t2-raakt'])
    expect(t.algemeen.items).toHaveLength(0)
  })

  it('een ONBEVESTIGDE doelgroep haalt drempel 2 nooit, ook niet met een thema dat raakt', () => {
    const doelgroep = [{ veld: 'spaargeld', op: 'minstens' as const, waarden: ['50k-100k'] }]
    const t = matchEditie(huurder, [artikelMet({ doelgroep, themas: HUUR })], tijdlijn())
    expect(t.items).toHaveLength(0)
  })

  it('een gevoelige reden (inkomen) staat alleen in waarom, nooit in de zichtbare regel', () => {
    const p: NieuwsprofielV1 = { ...LEEG_PROFIEL, inkomen: 'tot-1750' }
    const t = matchEditie(p, [artikelMet({ themas: [{ thema: 'minimumloon-uitkering', citaat: 'Het minimumloon stijgt per januari' }] })], tijdlijn())
    expect(t.items).toHaveLength(1)
    expect(t.items[0].tekst).toBe('Dit bericht gaat over het minimumloon en uitkeringen. Of en hoeveel het jou raakt, rekent de Krant hier niet uit.')
    expect(t.items[0].tekst).not.toMatch(/inkomen/)
    expect(t.items[0].waarom).toContain('reden:reden-inkomen-1750')
  })

  it('het jaar staat er alleen bij als de ingangsdatum gegrond is', () => {
    const t = matchEditie(huurder, [artikelMet({ themas: HUUR, ingangsdatum: '2028-07-01' })], tijdlijn())
    expect(t.items[0].tekst).toContain('Dit bericht gaat over huren, vanaf 2028.')
  })

  it('Achtergrond: alleen in de tijdlijn, hoogstens ACHTERGROND_MAX, besluit/voorstel/uitleg, nooit markt, los van het katern', () => {
    const t = matchEditie(LEEG_PROFIEL, ARTIKELEN, tijdlijn())
    const achtergrond = t.algemeen.achtergrond!
    expect(achtergrond.kop).toBe('Achtergrond')
    expect(achtergrond.items.length).toBeGreaterThan(0)
    expect(achtergrond.items.length).toBeLessThanOrEqual(ACHTERGROND_MAX)
    const duidingVan = (id: string) => ARTIKELEN.find((a) => a.id === id)!.duiding!
    for (const i of achtergrond.items) {
      expect(['besloten', 'voorstel', 'achtergrond']).toContain(duidingVan(i.artikelId).soort)
      expect(duidingVan(i.artikelId).mechanisme?.soort).not.toBe('beursbeweging')
    }
    const katern = new Set(t.algemeen.items.map((i) => i.artikelId))
    for (const i of achtergrond.items) expect(katern.has(i.artikelId)).toBe(false)
    expect('achtergrond' in matchEditie(LEEG_PROFIEL, ARTIKELEN, context()).algemeen).toBe(false)
  })

  it('elke raakt-regel van elk thema heeft een reden in de catalogus, en elk thema een onderwerp', () => {
    for (const [id, thema] of Object.entries(THEMAS) as [ThemaId, (typeof THEMAS)[ThemaId]][]) {
      expect(SJABLONEN[`onderwerp-${id}` as SjabloonId], `onderwerp-${id}`).toBeDefined()
      if (thema.raakt === 'iedereen') continue
      for (const r of thema.raakt) {
        const reden = REDEN_PER_REGEL[regelSleutel(r)]
        expect(reden, `${id}: ${regelSleutel(r)}`).toBeDefined()
        expect(SJABLONEN[reden], reden).toBeDefined()
      }
    }
    for (const id of GEVOELIGE_REDENEN) expect(Object.values(REDEN_PER_REGEL)).toContain(id)
  })

  it('een som van € 0 (eigen risico gelijk aan nu) rendert nooit als bedrag, ook niet met bonussen boven de drempel', () => {
    const a = fixture('a05-eigen-risico')
    const nul: KandidaatArtikel = {
      ...a,
      duiding: {
        ...a.duiding!,
        deadline: { datum: '2026-12-31', soort: 'aanvraag' },
        mechanisme: { soort: 'eigen-risico', params: { jaar: 2027, bedrag: 385 }, drempel: null },
      },
    }
    const p: NieuwsprofielV1 = { ...LEEG_PROFIEL, geboortejaar: 1990, rubrieken: ['macro'] }
    const e = matchEditie(p, [nul], context())
    expect(e.items).toHaveLength(1)
    expect(e.items[0].tekst).not.toMatch(/€\s0\b/)
    expect(e.items[0].impact).toBeNull()
    expect(e.items[0].waarom).toContain('impact:nul')
  })

  it('H1: beursnieuws en cijfers krijgen nooit de vorm raakt — ook niet met een bevestigde doelgroep', () => {
    const t = matchEditie(belegger, [fixture('a12-beurs')], tijdlijn())
    expect(t.items).toHaveLength(0)
    for (const soort of ['marktbeweging', 'cijfer', 'verwachting'] as const) {
      const a = artikelMet({ soort, themas: HUUR, mechanisme: null })
      expect(matchEditie(huurder, [a], tijdlijn()).items, soort).toHaveLength(0)
    }
    // Over de hele fixture: geen enkel 'raakt'-bericht op een markt- of cijferartikel.
    for (const p of [belegger, PROFIEL_TESSA, PROFIEL_DAAN, PROFIEL_WILLEM]) {
      for (const i of matchEditie(p, ARTIKELEN, tijdlijn()).items.filter((x) => x.vorm === 'raakt')) {
        const d = ARTIKELEN.find((a) => a.id === i.artikelId)!.duiding!
        expect(['besloten', 'voorstel', 'achtergrond']).toContain(d.soort)
        expect(d.mechanisme?.soort).not.toBe('beursbeweging')
      }
    }
  })

  it('M6: bij een voorstel nooit "geldt ook voor jou", ook niet met een bevestigde doelgroep', () => {
    const doelgroep = [{ veld: 'wonen', op: 'in' as const, waarden: ['huur-sociaal', 'huur-vrije-sector'] }]
    const t = matchEditie(huurder, [artikelMet({ soort: 'voorstel', doelgroep })], tijdlijn())
    expect(t.items).toHaveLength(1)
    expect(t.items[0].sjabloonId).toBe('raakt-thema')
    expect(t.items[0].tekst).not.toMatch(/geldt ook voor jou/)
    expect(t.items[0].tekst).toBe('Volgens je profiel huur je je woning. Of en hoeveel het jou raakt, rekent de Krant hier niet uit.')
  })

  it('elke gerenderde tijdlijnregel haalt de Wft-woordenlijst', () => {
    for (const p of [huurder, PROFIEL_TESSA, PROFIEL_DAAN, PROFIEL_WILLEM, LEEG_PROFIEL]) {
      for (const i of matchEditie(p, ARTIKELEN, tijdlijn()).items) expect(vindWftOvertreding(i.tekst), i.tekst).toBeNull()
    }
  })
})

// ── Redactieregels (v6, ADR 0191) ────────────────────────────────────────────

describe('matcher v6 — redactieregels (ADR 0191)', () => {
  const RECENT = '2026-09-19T05:10:00Z'
  const tijdlijn = (o: Partial<MatchContext> = {}) => context({ modus: 'tijdlijn', ...o })
  function art(d: Partial<DuidingV1>, o: Partial<KandidaatArtikel> = {}): KandidaatArtikel {
    const basis = fixture('a15-oud')
    return {
      ...basis,
      id: 'r1',
      category: 'wonen',
      fetched_at: RECENT,
      published_at: RECENT,
      published_bron: 'feed',
      bron_soort: 'rss',
      bron_wijziging: null,
      bron_fragment: null,
      ...o,
      duiding: { ...basis.duiding!, ...d },
    }
  }
  const HUUR: DuidingV1['themas'] = [{ thema: 'huur', citaat: 'De maximale huurverhoging wordt 4 procent' }]
  const huurder: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'huur-sociaal', rubrieken: ['wonen'] }

  describe('regel 1 — verandering is nieuws, de standaard niet', () => {
    const sectie = (wijziging: 'basis' | 'gewijzigd' | null, id: string) =>
      art({ themas: HUUR }, { id, bron_soort: 'web_pagina', bron_wijziging: wijziging })

    it('een basissectie is nooit een bericht in de tijdlijn en nooit een item in de editie', () => {
      expect(matchEditie(huurder, [sectie('basis', 'r-basis')], tijdlijn()).items).toHaveLength(0)
      expect(matchEditie(huurder, [sectie('basis', 'r-basis')], context()).items).toHaveLength(0)
      // Zonder status (de oude ingest na de migratie) geldt de voorzichtige lezing: basis.
      expect(matchEditie(huurder, [sectie(null, 'r-null')], tijdlijn()).items).toHaveLength(0)
    })

    it('een gewijzigde sectie is nieuws: dezelfde sectie haalt de tijdlijn als "Over jouw situatie"', () => {
      const t = matchEditie(huurder, [sectie('gewijzigd', 'r-gewijzigd')], tijdlijn())
      expect(t.items.map((i) => i.artikelId)).toEqual(['r-gewijzigd'])
      expect(t.items[0].vorm).toBe('raakt')
    })

    it('in Achtergrond en het katern staat de basis ACHTER al het nieuws, ook als hij nieuwer is', () => {
      const oudNieuws = art({}, { id: 'r-nieuws', fetched_at: '2026-09-15T05:10:00Z', published_at: '2026-09-15T05:10:00Z' })
      const verseBasis = art({}, { id: 'r-basis', fetched_at: '2026-09-20T05:10:00Z', published_at: '2026-09-20T05:10:00Z', bron_soort: 'web_pagina', bron_wijziging: 'basis' })
      const t = matchEditie(LEEG_PROFIEL, [verseBasis, oudNieuws], tijdlijn())
      expect(t.algemeen.achtergrond?.items.map((i) => i.artikelId)).toEqual(['r-nieuws', 'r-basis'])
      const e = matchEditie(LEEG_PROFIEL, [verseBasis, oudNieuws], context())
      expect(e.algemeen.items.map((i) => i.artikelId)).toEqual(['r-nieuws', 'r-basis'])
    })
  })

  describe('regel 2a — Caribisch Nederland', () => {
    const koper: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek' }
    const HYPOTHEEK: DuidingV1['themas'] = [{ thema: 'eigen-woning', citaat: 'hypotheekadviseurs bij het geven van passend advies' }]

    it('kop: nergens — geen item, geen Achtergrond, geen katern (de AFM-leidraad uit de steekproef)', () => {
      const titel = 'Caribisch Nederland: leidraad voor hypotheekadvisering in Caribisch Nederland beschikbaar'
      const leidraad = art({ themas: HYPOTHEEK }, { id: 'r-cn', title: titel })
      expect(voldoetAanLeescontract(leidraad, context())).toBe(false)
      // Zonder de Caribische kop was dit wél "Over jouw situatie" voor een koper geweest.
      expect(matchEditie(koper, [{ ...leidraad, title: 'Leidraad voor hypotheekadvisering beschikbaar' }], tijdlijn()).items).toHaveLength(1)
      const t = matchEditie(koper, [leidraad], tijdlijn())
      expect(t.items).toHaveLength(0)
      expect(t.algemeen.achtergrond?.items).toEqual([])
      expect(t.algemeen.items).toEqual([])
      expect(matchEditie(koper, [leidraad], context()).algemeen.items).toEqual([])
    })

    it('fragment: twee treffers in de aanhef sluiten uit; één terloopse vermelding niet', () => {
      const tweeKeer = art({ themas: HUUR }, { id: 'r-frag', title: 'Huurtoeslag verandert', bron_fragment: 'De huurtoeslag verandert voor Bonaire, Sint Eustatius en Saba.' })
      const terloops = art({ themas: HUUR }, { id: 'r-terloops', title: 'Huurtoeslag verandert', bron_fragment: 'De huurtoeslag verandert per 1 januari. Ook op Bonaire gelden nieuwe bedragen.' })
      expect(voldoetAanLeescontract(tweeKeer, context())).toBe(false)
      expect(voldoetAanLeescontract(terloops, context())).toBe(true)
      expect(matchEditie(huurder, [terloops], tijdlijn()).items.map((i) => i.artikelId)).toEqual(['r-terloops'])
    })
  })

  describe('regel 2b — een bufferbericht raakt wie weinig spaargeld heeft', () => {
    const SPAREN: DuidingV1['themas'] = [{ thema: 'sparen-rente', citaat: 'een spaarbuffer voor onverwachte uitgaven' }]
    const weinig: NieuwsprofielV1 = { ...LEEG_PROFIEL, spaargeld: 'tot-5k' }
    const veel: NieuwsprofielV1 = { ...LEEG_PROFIEL, spaargeld: '50k-100k' }
    const blog = art({ themas: SPAREN }, { id: 'r-buffer', title: 'Blog: betaal jezelf eerst: spaarbuffer' })
    const rente = art({ themas: SPAREN }, { id: 'r-rente', title: 'Spaarrente daalt verder' })

    it('bufferbericht: lezer met weinig spaargeld → "Over jouw situatie", zonder zichtbare (gevoelige) reden', () => {
      const t = matchEditie(weinig, [blog], tijdlijn())
      expect(t.items.map((i) => i.artikelId)).toEqual(['r-buffer'])
      expect(t.items[0].vorm).toBe('raakt')
      expect(t.items[0].waarom).toEqual(expect.arrayContaining(['thema:sparen-rente', 'redactie:spaarbuffer']))
      expect(t.items[0].tekst).not.toMatch(/spaargeld/i)
      expect(toetsThema('sparen-rente', weinig)).toBe('nee') // de standaardkoppeling zou hem missen
    })

    it('bufferbericht: lezer met veel spaargeld → geen bericht, wel Achtergrond', () => {
      const t = matchEditie(veel, [blog], tijdlijn())
      expect(t.items).toHaveLength(0)
      expect(t.algemeen.achtergrond?.items.map((i) => i.artikelId)).toEqual(['r-buffer'])
    })

    it('rentebericht: het omgekeerde — de spaarder vanaf € 5.000 wel, de lezer met weinig spaargeld niet', () => {
      expect(matchEditie(veel, [rente], tijdlijn()).items.map((i) => i.artikelId)).toEqual(['r-rente'])
      expect(matchEditie(weinig, [rente], tijdlijn()).items).toHaveLength(0)
    })

    it('onbekend spaargeld: geen bericht (onbevestigd is nooit een grond)', () => {
      expect(matchEditie(LEEG_PROFIEL, [blog], tijdlijn()).items).toHaveLength(0)
    })
  })

  describe('regel 2c — cijfers, verwachtingen en marktbewegingen zonder rekenregel zijn nooit persoonlijk', () => {
    // Klachten bij verzekeraars, belastingdruk sinds 2011, uitkeringsontvangers per 100 werkenden:
    // een thema dat raakt, een rubriekvoorkeur én een deadline — en tóch geen bericht.
    const deadline = { datum: '2026-12-31', soort: 'aanvraag' as const }
    for (const soort of ['cijfer', 'verwachting', 'marktbeweging'] as const) {
      it(`${soort}: nooit in de tijdlijn (ook niet als "Over jouw situatie"), en niet in Achtergrond`, () => {
        const a = art({ soort, themas: HUUR, mechanisme: null, deadline }, { id: `r-${soort}` })
        const t = matchEditie(huurder, [a], tijdlijn())
        expect(t.items).toHaveLength(0)
        expect(t.algemeen.achtergrond?.items).toEqual([])
        expect(t.algemeen.items.map((i) => i.artikelId)).toEqual([`r-${soort}`])
      })
    }
  })

  describe('regel 3 — de echte datum', () => {
    it('zonder echte datum: gepubliceerd null en gezienOp het ophaalmoment — in items, Achtergrond en katern', () => {
      const gezien = art({ themas: HUUR }, { id: 'r-gezien', published_bron: 'eerste_gezien' })
      const t = matchEditie(huurder, [gezien], tijdlijn())
      expect(t.items[0]).toMatchObject({ gepubliceerd: null, gezienOp: RECENT })
      const bg = matchEditie(LEEG_PROFIEL, [gezien], tijdlijn())
      expect(bg.algemeen.achtergrond?.items[0]).toMatchObject({ gepubliceerd: null, gezienOp: RECENT })
      const k = matchEditie(LEEG_PROFIEL, [art({ soort: 'cijfer' }, { id: 'r-k', published_bron: 'eerste_gezien' })], tijdlijn())
      expect(k.algemeen.items[0]).toMatchObject({ gepubliceerd: null, gezienOp: RECENT })
    })

    it('met een echte datum (feed, meta, pagina): gepubliceerd, geen gezienOp', () => {
      for (const published_bron of ['feed', 'meta', 'pagina']) {
        const t = matchEditie(huurder, [art({ themas: HUUR }, { published_bron, published_at: '2026-09-18T00:00:00.000Z' })], tijdlijn())
        expect(t.items[0]).toMatchObject({ gepubliceerd: '2026-09-18T00:00:00.000Z', gezienOp: null })
      }
    })

    it('"oud nieuws" (> 45 dagen) werkt alleen op een echte datum; zonder echte datum beslist het venster', () => {
      const oud = '2026-07-01T00:00:00.000Z'
      expect(voldoetAanLeescontract(art({}, { published_at: oud, published_bron: 'pagina' }), context())).toBe(false)
      expect(voldoetAanLeescontract(art({}, { published_at: oud, published_bron: 'eerste_gezien' }), context())).toBe(true)
      expect(voldoetAanLeescontract(art({}, { published_at: oud, published_bron: undefined }), context())).toBe(true)
    })
  })
})
