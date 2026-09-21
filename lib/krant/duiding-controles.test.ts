import { describe, it, expect } from 'vitest'
import { controleerDuiding } from './duiding-controles'
import { GELDIGE_UITVOER } from './duiding.fixture'
import type { DuidingMeta, DuidingModelUitvoer, Mechanisme } from './duiding-schema'

const BRON =
  'Belastingdienst: het heffingsvrij vermogen in box 3 stijgt in 2027 naar € 60.000. ' +
  'Het tarief blijft 36 procent. De rente op studieschulden wordt in 2027 2,5 procent.'
const META: DuidingMeta = { brontekst: 'teaser', tekens: BRON.length, model: 'test' }

type Box3Mechanisme = Extract<Mechanisme, { soort: 'box3-parameter' }>
const BOX3 = GELDIGE_UITVOER.mechanisme as Box3Mechanisme

function box3Met(params: Partial<Box3Mechanisme['params']>, over: Partial<Box3Mechanisme> = {}): Mechanisme {
  return { ...BOX3, ...over, params: { ...BOX3.params, ...params } as Box3Mechanisme['params'] }
}

function metMechanisme(mechanisme: DuidingModelUitvoer['mechanisme'], grond = GELDIGE_UITVOER.grond): DuidingModelUitvoer {
  return { ...GELDIGE_UITVOER, mechanisme, grond }
}

describe('controleerDuiding — schema en doelgroep (afgewezen)', () => {
  it('geeft de opgeslagen vorm terug met versie, grond-record en meta', () => {
    const r = controleerDuiding(GELDIGE_UITVOER, BRON, META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fout).toBeNull()
    expect(r.duiding.versie).toBe(1)
    expect(r.duiding.meta).toEqual(META)
    expect(r.duiding.grond).toEqual({ jaar: 'stijgt in 2027 naar € 60.000', heffingsvrij_single: 'stijgt in 2027 naar € 60.000' })
    expect(r.duiding.mechanisme?.soort).toBe('box3-parameter')
  })

  it('schema-fout → afgewezen met code schema', () => {
    expect(controleerDuiding({ ...GELDIGE_UITVOER, soort: 'gerucht' }, BRON, META)).toEqual({ ok: false, code: 'schema' })
    expect(controleerDuiding('rommel', BRON, META)).toEqual({ ok: false, code: 'schema' })
  })

  it('onbekende bandwaarde in de doelgroep → afgewezen', () => {
    const r = controleerDuiding(
      { ...GELDIGE_UITVOER, doelgroep: [{ veld: 'spaargeld', op: 'is', waarden: ['25000-50000'] }] },
      BRON,
      META,
    )
    // De foutcode noemt het veld, nooit de waarde: die is modeltekst.
    expect(r).toEqual({ ok: false, code: 'onbekende-waarde:spaargeld' })
  })

  it('jaartal-veld draagt een jaar, en "bevat" hoort alleen bij meerkeuze', () => {
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'geboortejaar', op: 'hoogstens', waarden: ['1960'] }] }, BRON, META).ok,
    ).toBe(true)
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'geboortejaar', op: 'hoogstens', waarden: ['jong'] }] }, BRON, META),
    ).toEqual({ ok: false, code: 'onbekende-waarde:geboortejaar' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'bevat', waarden: ['huur-sociaal'] }] }, BRON, META),
    ).toEqual({ ok: false, code: 'onbekende-operator:wonen' })
    // Geen orde op een keuzeveld, en "is" met twee waarden is geen "is".
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'minstens', waarden: ['huur-sociaal'] }] }, BRON, META),
    ).toEqual({ ok: false, code: 'onbekende-operator:wonen' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'is', waarden: ['huur-sociaal', 'inwonend'] }] }, BRON, META),
    ).toEqual({ ok: false, code: 'onbekende-operator:wonen' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'wonen', op: 'in', waarden: ['huur-sociaal', 'inwonend'] }] }, BRON, META).ok,
    ).toBe(true)
  })

  it('een mechanisme zonder jaar blijft staan: null dwingt niet tot verzinnen', () => {
    const r = controleerDuiding(metMechanisme(box3Met({ jaar: null })), BRON, META)
    expect(r.ok && r.fout).toBeNull()
  })

  it('ongeldige of onwaarschijnlijke datums → afgewezen', () => {
    expect(controleerDuiding({ ...GELDIGE_UITVOER, ingangsdatum: '2027-02-30' }, BRON, META)).toEqual({ ok: false, code: 'datum:ingangsdatum' })
    expect(
      controleerDuiding({ ...GELDIGE_UITVOER, deadline: { datum: '2099-05-01', soort: 'aanvraag' } }, BRON, META),
    ).toEqual({ ok: false, code: 'datum:deadline' })
  })

  it('datums moeten in de bron staan: een verzonnen deadline is geen druk op de lezer waard', () => {
    const deadline = { datum: '2026-10-01', soort: 'aanvraag' as const }
    expect(controleerDuiding({ ...GELDIGE_UITVOER, deadline }, BRON, META)).toEqual({ ok: false, code: 'datum:ongegrond:deadline' })
    const bronMetDeadline = `${BRON} De aanvraag moet vóór 1 oktober 2026 binnen zijn.`
    expect(controleerDuiding({ ...GELDIGE_UITVOER, deadline }, bronMetDeadline, META).ok).toBe(true)
    expect(controleerDuiding({ ...GELDIGE_UITVOER, ingangsdatum: '2029-01-01' }, BRON, META)).toEqual({ ok: false, code: 'datum:ongegrond:ingangsdatum' })
  })
})

describe('controleerDuiding — samenvatting (B3, afgewezen bij een ongegrond getal)', () => {
  it('een getal dat niet in de bron staat keurt de hele duiding af', () => {
    const r = controleerDuiding({ ...GELDIGE_UITVOER, samenvatting: 'Het heffingsvrij vermogen stijgt naar € 65.000 per persoon.' }, BRON, META)
    expect(r).toEqual({ ok: false, code: 'ongegrond:samenvatting' })
  })

  it('eenheid telt: 36 als bedrag is ongegrond terwijl 36 procent in de bron staat', () => {
    const r = controleerDuiding({ ...GELDIGE_UITVOER, samenvatting: 'Het tarief is € 36 en dat blijft zo in 2027.' }, BRON, META)
    expect(r).toEqual({ ok: false, code: 'ongegrond:samenvatting' })
  })

  it('een verwijzing (URL, www., @) in de samenvatting keurt af — ook zonder enig getal', () => {
    for (const zin of ['Controleer uw teruggave op www.mijn-belasting-portaal.nl voordat de regeling ingaat.', 'Zie https://voorbeeld.nl voor de regeling en het gevolg.', 'Mail naar hulp@voorbeeld.nl voor de nieuwe regeling.']) {
      expect(controleerDuiding({ ...GELDIGE_UITVOER, samenvatting: zin }, BRON, META)).toEqual({ ok: false, code: 'samenvatting:verwijzing' })
    }
  })
})

describe('controleerDuiding — mechanisme (keuze 7: geduid zonder mechanisme)', () => {
  it('ongegrond getal → geduid, mechanisme null, foutcode per param', () => {
    const r = controleerDuiding(metMechanisme(box3Met({ heffingsvrij_single: 65000 })), BRON, META)
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
      BRON,
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
      BRON,
      META,
    )
    expect(r.ok && r.fout).toBe('ongegrond:heffingsvrij_single')
  })

  it('nl-NL en en-US notatie gronden hetzelfde getal', () => {
    const bronEnUs = 'The tax-free allowance in box 3 rises in 2027 to € 60,000. The rate stays 36 procent.'
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
      BRON,
      META,
    )
    expect(verzonnen.ok && verzonnen.fout).toBe('citaat-niet-in-bron:heffingsvrij_single')
    const genormaliseerd = controleerDuiding(
      metMechanisme(GELDIGE_UITVOER.mechanisme, [
        { param: 'jaar', citaat: '„Stijgt  in 2027' },
        { param: 'heffingsvrij_single', citaat: 'STIJGT IN 2027 NAAR € 60.000”' },
      ]),
      BRON,
      META,
    )
    expect(genormaliseerd.ok && genormaliseerd.fout).toBeNull()
  })

  it('bewaart alleen citaten bij numerieke params van het mechanisme', () => {
    const r = controleerDuiding(
      { ...GELDIGE_UITVOER, grond: [...GELDIGE_UITVOER.grond, { param: 'onzin', citaat: 'geïnjecteerde tekst' }] },
      BRON,
      META,
    )
    expect(r.ok && Object.keys(r.duiding.grond)).toEqual(['jaar', 'heffingsvrij_single'])
  })

  it('een kaal getal in de samenvatting ("box 3") moet óók in de bron staan — fail-closed', () => {
    const bronZonder3 = 'The tax-free allowance rises in 2027 to € 60,000. The rate stays 36 procent.'
    expect(controleerDuiding(GELDIGE_UITVOER, bronZonder3, META)).toEqual({ ok: false, code: 'ongegrond:samenvatting' })
  })

  it('drempel bij naam slaat de gronding over — er is geen bedrag te gronden', () => {
    const r = controleerDuiding(metMechanisme(box3Met({}, { drempel: 'box1-schijf-1-grens' })), BRON, META)
    expect(r.ok && r.fout).toBeNull()
  })

  it('onplausibel getal → mechanisme vervalt vóór de gronding', () => {
    const bron = 'DUO: de rente op studieschulden wordt in 2027 40 procent.'
    const r = controleerDuiding(
      {
        ...GELDIGE_UITVOER,
        samenvatting: 'De rente op studieschulden wordt in 2027 40 procent, meldt DUO. Dat raakt wie een studieschuld heeft.',
        mechanisme: { soort: 'studieschuld-rente', params: { jaar: 2027, rente_pct: 40 }, drempel: null },
        grond: [{ param: 'jaar', citaat: 'in 2027' }, { param: 'rente_pct', citaat: '40 procent' }],
      },
      bron,
      { ...META, tekens: bron.length },
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
      BRON,
      META,
    )
    expect(r.ok && r.fout).toBeNull()
    expect(r.ok && r.duiding.mechanisme?.soort).toBe('studieschuld-rente')
  })

  it('ontbrekend citaat of citaat zonder het getal → mechanisme vervalt', () => {
    const zonder = controleerDuiding(metMechanisme(GELDIGE_UITVOER.mechanisme, [{ param: 'jaar', citaat: '2027' }]), BRON, META)
    expect(zonder.ok && zonder.fout).toBe('geen-citaat:heffingsvrij_single')
    const leeg = controleerDuiding(
      metMechanisme(GELDIGE_UITVOER.mechanisme, [
        { param: 'jaar', citaat: '2027' },
        { param: 'heffingsvrij_single', citaat: 'het heffingsvrij vermogen in box 3 stijgt' },
      ]),
      BRON,
      META,
    )
    expect(leeg.ok && leeg.fout).toBe('citaat-zonder-getal:heffingsvrij_single')
  })

  it('box3-parameter zonder één nieuwe waarde is een leeg mechanisme', () => {
    const r = controleerDuiding(metMechanisme(box3Met({ heffingsvrij_single: null })), BRON, META)
    expect(r.ok && r.fout).toBe('leeg-mechanisme')
  })

  it('B2: inflatie-cijfer zonder params gaat door zonder bedrag', () => {
    const bron = 'De inflatie in augustus was 3,2 procent, meldt het CBS.'
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
      bron,
      { ...META, tekens: bron.length },
    )
    expect(r.ok && r.fout).toBeNull()
    expect(r.ok && r.duiding.mechanisme).toEqual({ soort: 'inflatie-cijfer', params: {}, drempel: null })
  })
})
