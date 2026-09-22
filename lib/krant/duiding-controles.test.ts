import { describe, it, expect } from 'vitest'
import { controleerDuiding, POORT_CODE, type ControleBron } from './duiding-controles'
import { isNumericGrounded, numericValueSet } from '@/lib/nummer-grond'
import { GELDIGE_UITVOER } from './duiding.fixture'
import type { DuidingMetaZonderPoort, DuidingModelUitvoer, Mechanisme } from './duiding-schema'

const BRON =
  'Belastingdienst: het heffingsvrij vermogen in box 3 stijgt in 2027 naar € 60.000. ' +
  'Het tarief blijft 36 procent. De rente op studieschulden wordt in 2027 2,5 procent.'

const META: DuidingMetaZonderPoort = {
  grondslag: 'fragment',
  grondslagSha256: 'a'.repeat(64),
  tekens: BRON.length,
  model: 'test',
  kopBron: 'bron',
  modeltekst: false,
}

/** De grondslag + bronmetadata; standaard zonder bekende publicatiedatum. */
function bron(tekst: string = BRON, over: Partial<ControleBron> = {}): ControleBron {
  return { tekst, published_at: null, published_bron: 'eerste_gezien', ...over }
}

type Box3Mechanisme = Extract<Mechanisme, { soort: 'box3-parameter' }>
const BOX3 = GELDIGE_UITVOER.mechanisme as Box3Mechanisme

function box3Met(params: Partial<Box3Mechanisme['params']>, over: Partial<Box3Mechanisme> = {}): Mechanisme {
  return { ...BOX3, ...over, params: { ...BOX3.params, ...params } as Box3Mechanisme['params'] }
}

function metMechanisme(mechanisme: DuidingModelUitvoer['mechanisme'], grond = GELDIGE_UITVOER.grond): DuidingModelUitvoer {
  return { ...GELDIGE_UITVOER, mechanisme, grond }
}

/** De poortreden van een geslaagde controle (of undefined wanneer hij afwees). */
function poort(uitvoer: DuidingModelUitvoer, b: ControleBron = bron()) {
  const r = controleerDuiding(uitvoer, b, META)
  return r.ok ? r.duiding.meta.poort : undefined
}

describe('controleerDuiding — schema en doelgroep (hard afgewezen)', () => {
  it('geeft de opgeslagen vorm terug met versie, grond-record, meta en een groene poort', () => {
    const r = controleerDuiding(GELDIGE_UITVOER, bron(), META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fout).toBeNull()
    expect(r.duiding.versie).toBe(2)
    expect(r.duiding.meta).toEqual({ ...META, poort: { status: 'groen', reden: null } })
    expect(r.duiding.samenvatting).toBe(GELDIGE_UITVOER.samenvatting)
    expect(r.duiding.grond).toEqual({ jaar: 'stijgt in 2027 naar € 60.000', heffingsvrij_single: 'stijgt in 2027 naar € 60.000' })
    expect(r.duiding.mechanisme?.soort).toBe('box3-parameter')
  })

  // Security-review 1F fase 2, bevinding 2. `mechanismeFout` toetst een citaat
  // (staat het in de bron, bevat het het getal) alleen voor params die het model
  // met een GETAL vulde. Bewaarden we ook het citaat van een param op null, dan
  // glipte ongetoetste modeltekst de jsonb in en werd die in beheer getoond als
  // letterlijk broncitaat — naast een lege waarde. Met de korte grondslag van
  // fase 2 zijn lege params juist de norm geworden.
  it('bewaart geen citaat bij een numerieke param die op null staat — dat citaat is nooit getoetst', () => {
    const verzonnen = 'de partnervrijstelling gaat naar € 120.000'
    const r = controleerDuiding(
      { ...GELDIGE_UITVOER, grond: [...GELDIGE_UITVOER.grond, { param: 'heffingsvrij_partner', citaat: verzonnen }] },
      bron(),
      META,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.duiding.grond).not.toHaveProperty('heffingsvrij_partner')
    expect(JSON.stringify(r.duiding)).not.toContain(verzonnen)
  })

  it('schema-fout → afgewezen met code schema', () => {
    expect(controleerDuiding({ ...GELDIGE_UITVOER, soort: 'gerucht' }, bron(), META)).toEqual({ ok: false, code: 'schema' })
    expect(controleerDuiding('rommel', bron(), META)).toEqual({ ok: false, code: 'schema' })
  })

  it('onbekende bandwaarde in de doelgroep → afgewezen', () => {
    const r = controleerDuiding(
      { ...GELDIGE_UITVOER, doelgroep: [{ veld: 'spaargeld', op: 'is', waarden: ['25000-50000'] }] },
      bron(),
      META,
    )
    // De foutcode noemt het veld, nooit de waarde: die is modeltekst.
    expect(r).toEqual({ ok: false, code: 'onbekende-waarde:spaargeld' })
  })

  it('jaartal-veld draagt een jaar, en "bevat" hoort alleen bij meerkeuze', () => {
    // Eigen grondslag: het lexicon (G6) eist dat de bron het domein noemt.
    const leeftijd = bron(`${BRON} De AOW-leeftijd geldt voor wie geboren is in 1960.`)
    const woning = bron(`${BRON} Wie een sociale huurwoning heeft of inwonend is, merkt dit.`)
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'geboortejaar', op: 'hoogstens', waarden: ['1960'] }] }, leeftijd, META).ok,
    ).toBe(true)
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'geboortejaar', op: 'hoogstens', waarden: ['jong'] }] }, leeftijd, META),
    ).toEqual({ ok: false, code: 'onbekende-waarde:geboortejaar' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'bevat', waarden: ['huur-sociaal'] }] }, woning, META),
    ).toEqual({ ok: false, code: 'onbekende-operator:wonen' })
    // Geen orde op een keuzeveld, en "is" met twee waarden is geen "is".
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'minstens', waarden: ['huur-sociaal'] }] }, woning, META),
    ).toEqual({ ok: false, code: 'onbekende-operator:wonen' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'is', waarden: ['huur-sociaal', 'inwonend'] }] }, woning, META),
    ).toEqual({ ok: false, code: 'onbekende-operator:wonen' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'in', waarden: ['huur-sociaal', 'inwonend'] }] }, woning, META).ok,
    ).toBe(true)
  })

  it('een mechanisme zonder jaar blijft staan: null dwingt niet tot verzinnen', () => {
    const r = controleerDuiding(metMechanisme(box3Met({ jaar: null })), bron(), META)
    expect(r.ok && r.fout).toBeNull()
  })

  it('ongeldige of onwaarschijnlijke datums → afgewezen', () => {
    expect(controleerDuiding({ ...GELDIGE_UITVOER, ingangsdatum: '2027-02-30' }, bron(), META)).toEqual({ ok: false, code: 'datum:ingangsdatum' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, deadline: { datum: '2099-05-01', soort: 'aanvraag' } }, bron(), META),
    ).toEqual({ ok: false, code: 'datum:deadline' })
  })

  it('datums moeten in de bron staan: een verzonnen deadline is geen druk op de lezer waard', () => {
    const deadline = { datum: '2026-10-01', soort: 'aanvraag' as const }
    expect(controleerDuiding({ ...GELDIGE_UITVOER, deadline }, bron(), META)).toEqual({ ok: false, code: 'datum:ongegrond:deadline' })
    const bronMetDeadline = bron(`${BRON} De aanvraag moet vóór 1 oktober 2026 binnen zijn.`)
    expect(controleerDuiding({ ...GELDIGE_UITVOER, deadline }, bronMetDeadline, META).ok).toBe(true)
    expect(controleerDuiding({ ...GELDIGE_UITVOER, ingangsdatum: '2029-01-01' }, bron(), META)).toEqual({ ok: false, code: 'datum:ongegrond:ingangsdatum' })
  })
})

describe('G6 op de doelgroep — hard afgewezen, want een lege doelgroep betekent iedereen', () => {
  it('een doelgroep die de bron niet noemt, wijst de hele duiding af', () => {
    const r = controleerDuiding(
      { ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'in', waarden: ['huur-sociaal'] }] },
      bron(),
      META,
    )
    expect(r).toEqual({ ok: false, code: 'doelgroep:ongegrond:wonen' })
  })

  it('het domein alleen is niet genoeg: de kwalificatie moet er ook staan', () => {
    const huur = bron('Woninghuur stijgt gemiddeld met 4,4 procent.')
    const zonderKwalificatie = { ...GELDIGE_UITVOER, samenvatting: null, mechanisme: null, grond: [], ingangsdatum: null }
    expect(
      controleerDuiding({ ...zonderKwalificatie, doelgroep: [{ veld: 'wonen', op: 'in', waarden: ['huur-sociaal'] }] }, huur, META),
    ).toEqual({ ok: false, code: 'doelgroep:ongegrond:wonen' })
    const metSector = bron('Woninghuur in de sociale sector stijgt gemiddeld met 4,4 procent.')
    expect(
      controleerDuiding({ ...zonderKwalificatie, doelgroep: [{ veld: 'wonen', op: 'in', waarden: ['huur-sociaal'] }] }, metSector, META).ok,
    ).toBe(true)
  })

  it('"in" is een OF (één gedekte waarde volstaat), "bevat" een EN (alle waarden gedekt)', () => {
    const basis = { ...GELDIGE_UITVOER, samenvatting: null, mechanisme: null, grond: [], ingangsdatum: null }
    const alleenStudieschuld = bron('De rente op de studieschuld bij DUO gaat omhoog.')
    expect(
      controleerDuiding(
        { ...basis, doelgroep: [{ veld: 'schulden', op: 'in', waarden: ['studieschuld-tot-15k', 'consumptief-krediet'] }] },
        alleenStudieschuld,
        META,
      ).ok,
    ).toBe(true)
    expect(
      controleerDuiding(
        { ...basis, doelgroep: [{ veld: 'schulden', op: 'bevat', waarden: ['studieschuld-tot-15k', 'consumptief-krediet'] }] },
        alleenStudieschuld,
        META,
      ),
    ).toEqual({ ok: false, code: 'doelgroep:ongegrond:schulden' })
  })
})

describe('de tekstpoort (B26) — de rij blijft geduid, de samenvatting vervalt', () => {
  it('G1: een getal dat niet in de grondslag staat degradeert de tekst, hij wijst niet af', () => {
    const uitvoer = { ...GELDIGE_UITVOER, samenvatting: 'Het heffingsvrij vermogen stijgt naar € 65.000 per persoon.' }
    const r = controleerDuiding(uitvoer, bron(), META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.duiding.samenvatting).toBeNull()
    expect(r.duiding.meta.poort).toEqual({ status: 'gedegradeerd', reden: POORT_CODE.ongegrondGetal })
    // De rest van de duiding blijft intact: doelgroep en mechanisme doen gewoon mee.
    expect(r.duiding.doelgroep).toEqual(GELDIGE_UITVOER.doelgroep)
    expect(r.duiding.mechanisme?.soort).toBe('box3-parameter')
    expect(r.fout).toBeNull()
  })

  it('G1: eenheid telt — 36 als bedrag is ongegrond terwijl 36 procent in de bron staat', () => {
    expect(poort({ ...GELDIGE_UITVOER, samenvatting: 'Het tarief is € 36 en dat blijft zo in 2027.' })?.reden).toBe(
      POORT_CODE.ongegrondGetal,
    )
  })

  it('G1 is STRENG op kale claims: een kaal getal gront niet meer op een percentage uit de bron', () => {
    const kort = bron('De maximale huurverhoging is 4,4 procent.')
    const uitvoer = { ...GELDIGE_UITVOER, doelgroep: [], ingangsdatum: null, mechanisme: null, grond: [] }
    expect(poort({ ...uitvoer, samenvatting: 'De verhoging komt uit op 4,4 punten boven de norm van vorig jaar.' }, kort)?.reden).toBe(
      POORT_CODE.ongegrondGetal,
    )
    expect(poort({ ...uitvoer, samenvatting: 'De maximale huurverhoging komt uit op 4,4 procent dit jaar.' }, kort)?.status).toBe('groen')
  })

  it('G1: een verwijzing (URL, www., @) degradeert — ook zonder enig getal', () => {
    for (const zin of [
      'Controleer uw teruggave op www.mijn-belasting-portaal.nl voordat de regeling ingaat.',
      'Zie https://voorbeeld.nl voor de regeling en het gevolg.',
      'Mail naar hulp@voorbeeld.nl voor de nieuwe regeling.',
    ]) {
      expect(poort({ ...GELDIGE_UITVOER, samenvatting: zin })?.reden).toBe(POORT_CODE.verwijzing)
    }
  })

  it('G2: een datum moet als DAG in de grondslag staan, niet als losse cijfers', () => {
    const metDatum = bron(`${BRON} De wijziging gaat in op 1 januari 2027.`)
    const zin = (d: string) => ({ ...GELDIGE_UITVOER, samenvatting: `De wijziging gaat in op ${d} en raakt het vermogen in box 3.` })
    expect(poort(zin('1 januari 2027'), metDatum)?.status).toBe('groen')
    // 1, 3 en 2027 staan allemaal in de bron; de DAG 3 januari 2027 niet.
    expect(poort(zin('3 januari 2027'), metDatum)?.reden).toBe(POORT_CODE.datum)
    // Andere schrijfwijze van dezelfde dag is dezelfde dag.
    expect(poort(zin('01-01-2027'), metDatum)?.status).toBe('groen')
  })

  it('G2: bij published_bron = eerste_gezien mag er géén publicatiedatum in de samenvatting staan', () => {
    const uitvoer = {
      ...GELDIGE_UITVOER,
      samenvatting: 'Het kabinet heeft op 1 januari 2027 het pakket gepubliceerd, meldt de Belastingdienst.',
    }
    expect(poort(uitvoer, bron(BRON, { published_bron: 'eerste_gezien', published_at: '2027-01-01T00:00:00Z' }))?.reden).toBe(
      POORT_CODE.datum,
    )
    // Komt de datum wél uit de feed én klopt hij, dan mag de zin blijven staan.
    expect(poort(uitvoer, bron(BRON, { published_bron: 'feed', published_at: '2027-01-01T09:30:00Z' }))?.status).toBe('groen')
    // Een andere publicatiedatum dan die van de bron is verzonnen.
    expect(poort(uitvoer, bron(BRON, { published_bron: 'feed', published_at: '2027-02-02T09:30:00Z' }))?.reden).toBe(POORT_CODE.datum)
  })

  it('G3: meta-commentaar over de bron in plaats van over de regel', () => {
    for (const zin of [
      'De tekst bevat geen concrete tarieven of bedragen over het vermogen in box 3.',
      'Er zijn geen verwijzingen naar bedragen; raadpleeg de wettekst voor het tarief in box 3.',
      'De pagina toont navigatie en een aankondiging, meer niet, over het vermogen in box 3.',
    ]) {
      expect(poort({ ...GELDIGE_UITVOER, samenvatting: zin })?.reden, zin).toBe(POORT_CODE.meta)
    }
  })

  // De twee `aankondiging`-patronen zijn ONGEMETEN t.o.v. de 58 samenvattingen
  // van het 1F-onderzoek, dus ze krijgen hun eigen tests — mét de zinnen die
  // bewust dóór mogen. Elke zin hier is zo gekozen dat géén van de negen andere
  // patronen hem raakt; zonder die eis bewijst de test niets over dit patroon
  // (eindreview 1F fase 2, M4).
  it('G3: melden DÁT iets is aangekondigd is meta — de nominale vorm blijft toegestaan', () => {
    const gevangen = [
      // Koppelvorm.
      'Het pakket betreft een aankondiging van acht wetsvoorstellen in box 3.',
      'Dit is slechts een aankondiging; het tarief in box 3 verandert nog niet.',
      // Actieve vorm — precies wat de prompt verbiedt.
      'Het kabinet kondigt aan dat het heffingsvrij vermogen in box 3 omhoog gaat.',
      'De Belastingdienst kondigde vorige week een wijziging in box 3 aan.',
    ]
    for (const zin of gevangen) {
      expect(poort({ ...GELDIGE_UITVOER, samenvatting: zin })?.reden, zin).toBe(POORT_CODE.meta)
    }

    // Bewust dóór: hier IS de aankondiging het onderwerp van een mededeling
    // over de regel, en `voorstel` is per prompt "aangekondigd maar nog niet
    // vastgesteld" — dat woord mag dus in een terechte samenvatting staan.
    const doorgelaten = [
      'De aankondiging verhoogt het heffingsvrij vermogen in box 3 naar € 60.000.',
      'Het heffingsvrij vermogen in box 3 is aangekondigd op € 60.000 en nog niet vastgesteld.',
      'Het kabinet heeft de verhoging in box 3 aangekondigd; het tarief blijft 36 procent.',
    ]
    for (const zin of doorgelaten) {
      expect(poort({ ...GELDIGE_UITVOER, samenvatting: zin })?.reden, zin).toBeNull()
    }
  })

  it('G6: een domeinkwalificatie die de grondslag niet maakt', () => {
    const huur = bron('Woninghuur stijgt gemiddeld met 4,4 procent.')
    const uitvoer = { ...GELDIGE_UITVOER, doelgroep: [], ingangsdatum: null, mechanisme: null, grond: [] }
    expect(
      poort(
        { ...uitvoer, samenvatting: 'De huren stijgen met 4,4 procent, zowel in de sociale als in de vrije sector.' },
        huur,
      )?.reden,
    ).toBe(POORT_CODE.lexicon)
    expect(poort({ ...uitvoer, samenvatting: 'De woninghuur stijgt gemiddeld met 4,4 procent dit jaar.' }, huur)?.status).toBe('groen')
  })

  it('B27: een samenvatting die het model zelf leeg laat, is GROEN — geen degradatie', () => {
    const r = controleerDuiding({ ...GELDIGE_UITVOER, samenvatting: null }, bron(), META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.duiding.samenvatting).toBeNull()
    expect(r.duiding.meta.poort).toEqual({ status: 'groen', reden: null })
  })

  it('de tekstpoort en het mechanisme degraderen onafhankelijk van elkaar', () => {
    // Tekst valt, mechanisme blijft.
    const tekstWeg = controleerDuiding({ ...GELDIGE_UITVOER, samenvatting: 'Het bedrag wordt € 99.000 per jaar.' }, bron(), META)
    expect(tekstWeg.ok && tekstWeg.duiding.mechanisme?.soort).toBe('box3-parameter')
    expect(tekstWeg.ok && tekstWeg.fout).toBeNull()
    // Mechanisme valt, tekst blijft.
    const mechWeg = controleerDuiding(metMechanisme(box3Met({ heffingsvrij_single: 65000 })), bron(), META)
    expect(mechWeg.ok && mechWeg.duiding.samenvatting).toBe(GELDIGE_UITVOER.samenvatting)
    expect(mechWeg.ok && mechWeg.duiding.meta.poort.status).toBe('groen')
    expect(mechWeg.ok && mechWeg.fout).toBe('ongegrond:heffingsvrij_single')
  })
})

describe('controleerDuiding — mechanisme (keuze 7: geduid zonder mechanisme)', () => {
  it('ongegrond getal → geduid, mechanisme null, foutcode per param', () => {
    const r = controleerDuiding(metMechanisme(box3Met({ heffingsvrij_single: 65000 })), bron(), META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fout).toBe('ongegrond:heffingsvrij_single')
    expect(r.duiding.mechanisme).toBeNull()
    expect(r.duiding.grond).toEqual({})
    expect(r.duiding.doelgroep).toEqual(GELDIGE_UITVOER.doelgroep)
  })

  it('eenheidsmismatch: een percentage gront geen bedrag en andersom', () => {
    // 36 staat als percentage in de bron; als heffingsvrij bedrag is het ongegrond.
    const r = controleerDuiding(
      metMechanisme(box3Met({ heffingsvrij_single: 36 }), [
        { param: 'jaar', citaat: '2027' },
        { param: 'heffingsvrij_single', citaat: '36 procent' },
      ]),
      bron(),
      META,
    )
    expect(r.ok && r.fout).toBe('ongegrond:heffingsvrij_single')
  })

  it('een jaartal gront geen bedrag: € 2.027 is ongegrond hoewel 2027 in de bron staat', () => {
    const r = controleerDuiding(
      metMechanisme(box3Met({ heffingsvrij_single: 2027 }), [
        { param: 'jaar', citaat: '2027' },
        { param: 'heffingsvrij_single', citaat: 'in 2027' },
      ]),
      bron(),
      META,
    )
    expect(r.ok && r.fout).toBe('ongegrond:heffingsvrij_single')
  })

  it('nl-NL en en-US notatie gronden hetzelfde getal', () => {
    const bronEnUs = bron('The tax-free allowance in box 3 rises in 2027 to € 60,000. The rate stays 36 procent.')
    const grond = [
      { param: 'jaar', citaat: 'rises in 2027 to € 60,000' },
      { param: 'heffingsvrij_single', citaat: 'rises in 2027 to € 60,000' },
    ]
    const r = controleerDuiding({ ...GELDIGE_UITVOER, grond }, bronEnUs, META)
    expect(r.ok && r.fout).toBeNull()
    expect(r.ok && r.duiding.mechanisme?.soort).toBe('box3-parameter')
  })

  it('het citaat moet letterlijk in de bron staan (whitespace en aanhalingstekens genormaliseerd)', () => {
    const verzonnen = controleerDuiding(
      metMechanisme(GELDIGE_UITVOER.mechanisme, [
        { param: 'jaar', citaat: '2027' },
        { param: 'heffingsvrij_single', citaat: 'het vrijgestelde bedrag wordt € 60.000' },
      ]),
      bron(),
      META,
    )
    expect(verzonnen.ok && verzonnen.fout).toBe('citaat-niet-in-bron:heffingsvrij_single')
    const genormaliseerd = controleerDuiding(
      metMechanisme(GELDIGE_UITVOER.mechanisme, [
        { param: 'jaar', citaat: '„Stijgt  in 2027' },
        { param: 'heffingsvrij_single', citaat: 'STIJGT IN 2027 NAAR € 60.000”' },
      ]),
      bron(),
      META,
    )
    expect(genormaliseerd.ok && genormaliseerd.fout).toBeNull()
  })

  it('bewaart alleen citaten bij numerieke params van het mechanisme', () => {
    const r = controleerDuiding(
      { ...GELDIGE_UITVOER, grond: [...GELDIGE_UITVOER.grond, { param: 'onzin', citaat: 'geïnjecteerde tekst' }] },
      bron(),
      META,
    )
    expect(r.ok && Object.keys(r.duiding.grond)).toEqual(['jaar', 'heffingsvrij_single'])
  })

  it('een kaal getal in de samenvatting ("box 3") moet óók in de grondslag staan — fail-closed', () => {
    const bronZonder3 = bron('The tax-free allowance rises in 2027 to € 60,000. The rate stays 36 procent.')
    // Zelfde samenvatting, maar de "3" van "box 3" staat nergens in deze grondslag.
    expect(poort({ ...GELDIGE_UITVOER, doelgroep: [] }, bronZonder3)?.reden).toBe(POORT_CODE.ongegrondGetal)
  })

  it('drempel bij naam slaat de gronding over — er is geen bedrag te gronden', () => {
    const r = controleerDuiding(metMechanisme(box3Met({}, { drempel: 'box1-schijf-1-grens' })), bron(), META)
    expect(r.ok && r.fout).toBeNull()
  })

  it('onplausibel getal → mechanisme vervalt vóór de gronding', () => {
    const tekst = 'DUO: de rente op studieschulden wordt in 2027 40 procent.'
    const r = controleerDuiding(
      {
        ...GELDIGE_UITVOER,
        doelgroep: [{ veld: 'schulden', op: 'in', waarden: ['studieschuld-tot-15k'] }],
        ingangsdatum: null,
        samenvatting: 'De rente op studieschulden wordt in 2027 40 procent, meldt DUO. Dat raakt wie een studieschuld heeft.',
        mechanisme: { soort: 'studieschuld-rente', params: { jaar: 2027, rente_pct: 40 }, drempel: null },
        grond: [{ param: 'jaar', citaat: 'in 2027' }, { param: 'rente_pct', citaat: '40 procent' }],
      },
      bron(tekst),
      { ...META, tekens: tekst.length },
    )
    expect(r.ok && r.fout).toBe('onplausibel:rente_pct')
  })

  it('geldig rekenend mechanisme met citaten gaat door', () => {
    const r = controleerDuiding(
      {
        ...GELDIGE_UITVOER,
        samenvatting: 'De rente op studieschulden wordt in 2027 2,5 procent. Dat geldt voor wie een studieschuld heeft.',
        doelgroep: [{ veld: 'schulden', op: 'bevat', waarden: ['studieschuld-tot-15k', 'studieschuld-15k-40k'] }],
        mechanisme: { soort: 'studieschuld-rente', params: { jaar: 2027, rente_pct: 2.5 }, drempel: null },
        grond: [
          { param: 'jaar', citaat: 'wordt in 2027 2,5 procent' },
          { param: 'rente_pct', citaat: 'wordt in 2027 2,5 procent' },
        ],
      },
      bron(),
      META,
    )
    expect(r.ok && r.fout).toBeNull()
    expect(r.ok && r.duiding.mechanisme?.soort).toBe('studieschuld-rente')
  })

  it('ontbrekend citaat of citaat zonder het getal → mechanisme vervalt', () => {
    const zonder = controleerDuiding(metMechanisme(GELDIGE_UITVOER.mechanisme, [{ param: 'jaar', citaat: '2027' }]), bron(), META)
    expect(zonder.ok && zonder.fout).toBe('geen-citaat:heffingsvrij_single')
    const leeg = controleerDuiding(
      metMechanisme(GELDIGE_UITVOER.mechanisme, [
        { param: 'jaar', citaat: '2027' },
        { param: 'heffingsvrij_single', citaat: 'het heffingsvrij vermogen in box 3 stijgt' },
      ]),
      bron(),
      META,
    )
    expect(leeg.ok && leeg.fout).toBe('citaat-zonder-getal:heffingsvrij_single')
  })

  // Eindreview 1F fase 2, M2. De mechanisme-route is de SYSTEMISCHE: een param
  // komt via impact.ts als bedrag bij iedere lezer in de doelgroep op het
  // scherm, terwijl de tekstpoort alleen de samenvatting degradeert. Zonder
  // `kaalStreng` grondde een kale param op een € of % elders in het fragment —
  // mét een citaat dat letterlijk in de bron staat en het getal bevat, dus de
  // citaateis sluit dat gat niet.
  it('een kale param gront niet op een percentage elders in het fragment (kaalStreng)', () => {
    const tekst = 'AOW-leeftijd gaat in 2029 omhoog; de levensverwachting steeg met 3 procent.'
    const uitvoer: DuidingModelUitvoer = {
      ...GELDIGE_UITVOER,
      soort: 'besloten',
      ingangsdatum: null,
      doelgroep: [],
      samenvatting: null,
      mechanisme: { soort: 'aow-leeftijd', params: { vanaf_jaar: 2029, verschuiving_maanden: 3 }, drempel: null },
      grond: [
        { param: 'vanaf_jaar', citaat: 'AOW-leeftijd gaat in 2029 omhoog' },
        { param: 'verschuiving_maanden', citaat: 'de levensverwachting steeg met 3 procent' },
      ],
    }
    // Eerst het bewijs dat de vlag hier lastdragend is: ZONDER `kaalStreng`
    // grondt de kale 3 wél op de "3 procent" uit het fragment. Dat is precies
    // wat de controle deed tot deze fix — de assertie hieronder kan dus niet om
    // een andere reden groen staan. (De vlag zelf is los getest in
    // lib/nummer-grond.test.ts.)
    const gs = numericValueSet(tekst)
    expect(isNumericGrounded(gs, '3', 'bare')).toBe(true)
    expect(isNumericGrounded(gs, '3', 'bare', { kaalStreng: true })).toBe(false)

    const r = controleerDuiding(uitvoer, bron(tekst), META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fout).toBe('ongegrond:verschuiving_maanden')
    expect(r.duiding.mechanisme).toBeNull()
    // Tegenproef: staan beide getallen KAAL in de bron, dan gront het mechanisme
    // gewoon. `kaalStreng` snijdt dus alleen de kruis-eenheid-gronding weg, niet
    // een terechte kale param.
    const kaalInBron = controleerDuiding(
      {
        ...uitvoer,
        mechanisme: { soort: 'aow-leeftijd', params: { vanaf_jaar: 2029, verschuiving_maanden: 3 }, drempel: null },
        grond: [
          { param: 'vanaf_jaar', citaat: 'AOW-leeftijd gaat in 2029 omhoog' },
          { param: 'verschuiving_maanden', citaat: 'omhoog met 3 maanden' },
        ],
      },
      bron('AOW-leeftijd gaat in 2029 omhoog met 3 maanden.'),
      META,
    )
    expect(kaalInBron.ok && kaalInBron.fout).toBeNull()
    expect(kaalInBron.ok && kaalInBron.duiding.mechanisme?.soort).toBe('aow-leeftijd')
  })

  it('box3-parameter zonder één nieuwe waarde is een leeg mechanisme', () => {
    const r = controleerDuiding(metMechanisme(box3Met({ heffingsvrij_single: null })), bron(), META)
    expect(r.ok && r.fout).toBe('leeg-mechanisme')
  })

  it('B2: inflatie-cijfer zonder params gaat door zonder bedrag', () => {
    const tekst = 'De inflatie in augustus was 3,2 procent, meldt het CBS.'
    const r = controleerDuiding(
      {
        ...GELDIGE_UITVOER,
        soort: 'cijfer',
        ingangsdatum: null,
        doelgroep: [],
        mechanisme: { soort: 'inflatie-cijfer', params: {}, drempel: null },
        samenvatting: 'De inflatie in augustus was 3,2 procent volgens het CBS. Dat raakt de koopkracht van iedereen.',
        grond: [],
      },
      bron(tekst),
      { ...META, tekens: tekst.length },
    )
    expect(r.ok && r.fout).toBeNull()
    expect(r.ok && r.duiding.mechanisme).toEqual({ soort: 'inflatie-cijfer', params: {}, drempel: null })
  })
})
