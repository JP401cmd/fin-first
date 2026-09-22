import { describe, expect, it } from 'vitest'
import { standaardImpactContext } from './impact'
import {
  EDITIE_MAX,
  RUBRIEK_MAX,
  SCORE_DREMPEL,
  matchEditie,
  toetsRegel,
  voldoetAanLeescontract,
  type KandidaatArtikel,
  type MatchContext,
} from './matcher'
import { LEEG_PROFIEL, type NieuwsprofielV1 } from './profiel'
import { AOW_RIJEN, ARTIKELEN, NU, PROFIEL_DAAN, PROFIEL_TESSA, PROFIEL_WILLEM } from './editie.fixture'
import { vindWftOvertreding } from './wft-woordenlijst'

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
    expect(u.items[0].sjabloonId).toBe('wat-mist')
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
    const rang = { direct: 0, gevoeligheid: 1, relevant: 2 }
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
    expect(u.matcherVersie).toBe(2)
    expect(u.sjabloonVersie).toBe(1)
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
