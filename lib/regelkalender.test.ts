// De "geen tweede kopie"-toets van de regelkalender.
//
// Elke regel draait tegen de ECHTE kalender (REGELKALENDER, sinds 30 sep 2026
// gevuld met het Belastingplan 2027) én tegen een fixture-kalender, zodat
// aantoonbaar is dat hij bijt: de fixture-runs bewijzen dat een drift, een
// dubbele entry, een niet-wijziging en een ontbrekende logvermelding rood
// worden.
//
// FIXTURE-WAARDEN: nergens met de hand overgenomen. Box 3/box 1 komen uit
// DREMPELS op sleutelnaam (direct, NIET via BOX3_/BOX1_PARAM_DREMPEL — zodat
// een fout in die map hier opvalt), DUO en eigen risico uit DUO_RENTE_PCT en
// ZORG_EIGEN_RISICO. Drift = canon + 1. Entries voor een jaar dat de tabel
// niet kent (2027 als "gelijk aan 2026", 2030 als fictief voorstel) dragen
// canonieke of overduidelijk fictieve getallen — geen voorspelling
// (eigenaarsbesluit 27 sep 2026). Urls zijn example.org.

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import {
  BOX1_PARAM_DREMPEL,
  BOX3_PARAM_DREMPEL,
  REGELKALENDER,
  REGELKALENDER_MECHANISMEN,
  RegelkalenderEntrySchema,
  bezwarenCanon,
  rekenendeDirecteMechanismen,
  valideerKalender,
  type RegelkalenderEntry,
} from './regelkalender'
import { DREMPELS, DREMPEL_EENHEID, type DrempelSleutel } from '@/lib/krant/drempels'
import { MECHANISMEN, type MechanismeParams } from '@/lib/krant/mechanismen'
import { DUO_RENTE_PCT, ZORG_EIGEN_RISICO } from '@/lib/constants'

const LOG_PAD = join(__dirname, '..', 'docs', 'fiscale-wijzigingslog.md')
const ECHTE_LOG = readSourceLF(LOG_PAD)

// ── Logvermelding (leest een bestand → hoort in de test) ─────────────────────

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Letterlijk vermeld, met een GRENS erachter: "nr. 3" slaagt niet op
 * "nr. 31", en een url slaagt niet op een langere url die ermee begint.
 */
function vermeld(naald: string, log: string): boolean {
  return new RegExp(esc(naald) + '(?![\\w/-])').test(log)
}

/** Elke entry staat met zijn url of kamerstuk in het logbestand. */
function bezwarenLogvermelding(entries: readonly RegelkalenderEntry[], logTekst: string): string[] {
  return entries
    .filter((e) => !vermeld(e.bron.url, logTekst) && !(e.bron.kamerstuk && vermeld(e.bron.kamerstuk, logTekst)))
    .map((e) => e.id)
}

// ── Canon voor de fixture, direct op sleutelnaam ─────────────────────────────

/** Canonieke waarde in de PARAM-eenheid (fractie × 100 = procent). */
function canonParam(sleutel: DrempelSleutel, jaar: number): number {
  const v = DREMPELS[sleutel](jaar)
  if (v === null) throw new Error(`fixture: ${sleutel}(${jaar}) is niet canoniek`)
  return DREMPEL_EENHEID[sleutel] === 'fractie' ? v * 100 : v
}

type Waarden<M extends 'box3-parameter' | 'box1-parameter'> = Record<Exclude<keyof MechanismeParams<M>, 'jaar'>, number>

const box3Canon = (jaar: number): Waarden<'box3-parameter'> => ({
  heffingsvrij_single: canonParam('heffingsvrij-vermogen-single', jaar),
  heffingsvrij_partner: canonParam('heffingsvrij-vermogen-partner', jaar),
  forfait_spaargeld_pct: canonParam('forfait-spaargeld', jaar),
  forfait_beleggingen_pct: canonParam('forfait-beleggingen', jaar),
  forfait_schulden_pct: canonParam('forfait-schulden', jaar),
  tarief_pct: canonParam('box3-tarief', jaar),
})

const box1Canon = (jaar: number): Waarden<'box1-parameter'> => ({
  schijf_1_grens: canonParam('box1-schijf-1-grens', jaar),
  schijf_2_grens: canonParam('box1-schijf-2-grens', jaar),
  schijf_1_tarief_pct: canonParam('box1-schijf-1-tarief', jaar),
  schijf_2_tarief_pct: canonParam('box1-schijf-2-tarief', jaar),
  schijf_3_tarief_pct: canonParam('box1-schijf-3-tarief', jaar),
  algemene_heffingskorting_max: canonParam('algemene-heffingskorting-max', jaar),
  arbeidskorting_max: canonParam('arbeidskorting-max', jaar),
})

const J = 2026
const B3_NU = box3Canon(J)
const B3_VORIG = box3Canon(J - 1)
const B1_NU = box1Canon(J)
const B1_VORIG = box1Canon(J - 1)

/** Splits in params die van J−1 naar J veranderden en params die gelijk bleven. */
function splits<T extends Record<string, number>>(nu: T, vorig: T) {
  const gewijzigd: Partial<T> = {}
  const gelijk: Array<keyof T> = []
  for (const k of Object.keys(nu) as Array<keyof T>) {
    if (nu[k] === vorig[k]) gelijk.push(k)
    else gewijzigd[k] = nu[k]
  }
  return { gewijzigd, gelijk }
}
const B3 = splits(B3_NU, B3_VORIG)
const B1 = splits(B1_NU, B1_VORIG)

const DUO_NU = DUO_RENTE_PCT[J]
const DUO_VORIG = DUO_RENTE_PCT[J - 1]
const ER_JAAR = 2025 // 2024 staat niet in ZORG_EIGEN_RISICO → geen geen-wijziging-toets mogelijk
const ER_CANON = ZORG_EIGEN_RISICO[ER_JAAR]

// ── Fixture-bouwers ──────────────────────────────────────────────────────────

const BOX3_LEEG: MechanismeParams<'box3-parameter'> = {
  jaar: null,
  heffingsvrij_single: null,
  heffingsvrij_partner: null,
  forfait_spaargeld_pct: null,
  forfait_beleggingen_pct: null,
  forfait_schulden_pct: null,
  tarief_pct: null,
}
const BOX1_LEEG: MechanismeParams<'box1-parameter'> = {
  jaar: null,
  schijf_1_grens: null,
  schijf_2_grens: null,
  schijf_1_tarief_pct: null,
  schijf_2_tarief_pct: null,
  schijf_3_tarief_pct: null,
  algemene_heffingskorting_max: null,
  arbeidskorting_max: null,
}

const url = (pad: string) => `https://example.org/fictief/${pad}`

type Over = Partial<Pick<RegelkalenderEntry, 'jaar' | 'ingangsdatum' | 'status' | 'besloten' | 'gezien' | 'bron'>>

function tijd(jaar: number, status: RegelkalenderEntry['status']) {
  return {
    jaar,
    ingangsdatum: `${jaar}-01-01`,
    status,
    gezien: `${jaar - 1}-09-16`,
    besloten: status === 'voorstel' ? undefined : `${jaar - 1}-12-18`,
  }
}

function box3(id: string, params: Partial<MechanismeParams<'box3-parameter'>>, over: Over = {}): RegelkalenderEntry {
  return { id, mechanisme: 'box3-parameter', ...tijd(J, 'verwerkt'), bron: { uitgever: 'Belastingdienst', url: url(id) }, ...over, params: { ...BOX3_LEEG, ...params } } as RegelkalenderEntry
}
function box1(id: string, params: Partial<MechanismeParams<'box1-parameter'>>, over: Over = {}): RegelkalenderEntry {
  return { id, mechanisme: 'box1-parameter', ...tijd(J, 'verwerkt'), bron: { uitgever: 'Belastingdienst', url: url(id) }, ...over, params: { ...BOX1_LEEG, ...params } } as RegelkalenderEntry
}
function duo(id: string, stelsel: 'sf15' | 'sf35', rente_pct: number, over: Over = {}): RegelkalenderEntry {
  const jaar = over.jaar ?? J
  return { id, mechanisme: 'studieschuld-rente', stelsel, ...tijd(jaar, 'verwerkt'), bron: { uitgever: 'DUO', url: url(id) }, ...over, params: { jaar, rente_pct } } as RegelkalenderEntry
}
function eigenRisico(id: string, bedrag: number, over: Over = {}): RegelkalenderEntry {
  return { id, mechanisme: 'eigen-risico', ...tijd(ER_JAAR, 'verwerkt'), bron: { uitgever: 'Zorginstituut', url: url(id) }, ...over, params: { jaar: null, bedrag } } as RegelkalenderEntry
}
function aow(id: string, vanaf_jaar: number, verschuiving_maanden: number, over: Over = {}): RegelkalenderEntry {
  return { id, mechanisme: 'aow-leeftijd', ...tijd(vanaf_jaar, 'voorstel'), bron: { uitgever: 'SVB', url: url(id) }, ...over, params: { vanaf_jaar, verschuiving_maanden } } as RegelkalenderEntry
}

/** Canoniek juist: elke GEWIJZIGDE box 3-/box 1-param van J, beide DUO-stelsels, eigen risico. */
const FIXTURE_GOED: RegelkalenderEntry[] = [
  box3('box3-2026-verwerkt', B3.gewijzigd),
  box1('box1-2026-verwerkt', B1.gewijzigd),
  duo('duo-2026-sf35-verwerkt', 'sf35', DUO_NU.sf35),
  duo('duo-2026-sf15-verwerkt', 'sf15', DUO_NU.sf15),
  eigenRisico('eigen-risico-2025-verwerkt', ER_CANON, {
    bron: { uitgever: 'Zorginstituut', url: url('eigen-risico-2025-verwerkt'), kamerstuk: 'FICTIEF 00 001, nr. 3' },
  }),
  // FICTIEF — 2030, geen voorspelling; 2029 is niet canoniek → geen-wijziging zwijgt.
  box3('box3-2030-voorstel', { tarief_pct: 40 }, tijd(2030, 'voorstel')),
  aow('aow-2030-voorstel', 2030, 3),
]
const ER_INDEX = 4

const FIXTURE_LOG = [
  '| 2026-09-15 | fictief | … | 2030 | … | voorstel |',
  ...FIXTURE_GOED.filter((_, i) => i !== ER_INDEX).map((e) => `[bron](${e.bron.url})`),
  // eigen risico staat er alléén met zijn kamerstuk in, niet met de url.
  'Kamerstuk FICTIEF 00 001, nr. 3.',
].join('\n')

// ── De echte kalender ────────────────────────────────────────────────────────

describe('REGELKALENDER — de echte kalender', () => {
  it('is niet leeg (anders zijn de runs hieronder triviaal groen)', () => {
    expect(REGELKALENDER.length).toBeGreaterThan(0)
  })

  it('is schema-geldig en zonder bezwaren', () => {
    expect(valideerKalender(REGELKALENDER)).toEqual([])
  })

  it('bevat geen tweede kopie van een canonieke tabel', () => {
    expect(bezwarenCanon(REGELKALENDER)).toEqual([])
  })

  it('elke entry staat met url of kamerstuk in docs/fiscale-wijzigingslog.md', () => {
    expect(bezwarenLogvermelding(REGELKALENDER, ECHTE_LOG)).toEqual([])
  })

  it('het logbestand verwijst terug naar de kalender', () => {
    expect(ECHTE_LOG).toContain('## Regelkalender (machineleesbare tweeling)')
    expect(ECHTE_LOG).toContain('lib/regelkalender.ts')
  })
})

// ── Structuur ────────────────────────────────────────────────────────────────

describe('regelkalender — structuur', () => {
  it('de mechanismelijst is exact de rekenende directe mechanismen uit de catalogus', () => {
    expect([...REGELKALENDER_MECHANISMEN].sort()).toEqual(rekenendeDirecteMechanismen().sort())
  })

  it('draagt nul vrije lezerstekst: per variant alleen de vaste velden', () => {
    const basis = ['besloten', 'bron', 'gezien', 'id', 'ingangsdatum', 'jaar', 'mechanisme', 'params', 'status']
    const verwacht: Record<(typeof REGELKALENDER_MECHANISMEN)[number], string[]> = {
      'box3-parameter': basis,
      'box1-parameter': basis,
      'studieschuld-rente': [...basis, 'stelsel'].sort(),
      'aow-leeftijd': basis,
      'eigen-risico': basis,
    }
    expect(RegelkalenderEntrySchema.options).toHaveLength(REGELKALENDER_MECHANISMEN.length)
    for (const optie of RegelkalenderEntrySchema.options) {
      const m = optie.shape.mechanisme.value
      expect(Object.keys(optie.shape).sort(), m).toEqual(verwacht[m])
    }
  })

  it('hergebruikt per mechanisme exact het params-schema uit mechanismen.ts', () => {
    for (const optie of RegelkalenderEntrySchema.options) {
      const m = optie.shape.mechanisme.value
      expect(optie.shape.params).toBe(MECHANISMEN[m].params)
    }
  })

  it('de param→drempel-mappen dekken elke numerieke param, met passende eenheid', () => {
    const paren: Array<[keyof typeof MECHANISMEN, Readonly<Record<string, DrempelSleutel>>]> = [
      ['box3-parameter', BOX3_PARAM_DREMPEL],
      ['box1-parameter', BOX1_PARAM_DREMPEL],
    ]
    for (const [m, bron] of paren) {
      const numeriek = MECHANISMEN[m].numeriek
      expect(Object.keys(bron).sort()).toEqual(Object.keys(numeriek).filter((k) => k !== 'jaar').sort())
      for (const [param, sleutel] of Object.entries(bron)) {
        const verwacht = numeriek[param].eenheid === 'pct' ? 'fractie' : 'eur'
        expect(DREMPEL_EENHEID[sleutel], `${m}.${param}`).toBe(verwacht)
      }
    }
  })

  it('de fixture splitst echt: er zijn gewijzigde én gelijk gebleven params (anders bijten de tests niet)', () => {
    expect(Object.keys(B3.gewijzigd).length).toBeGreaterThan(0)
    expect(Object.keys(B1.gewijzigd).length).toBeGreaterThan(0)
    expect(B3.gelijk.length + B1.gelijk.length).toBeGreaterThan(0)
  })
})

// ── valideerKalender bijt ────────────────────────────────────────────────────

describe('valideerKalender — fixture', () => {
  it('een correcte fixture-kalender geeft geen bezwaren', () => {
    expect(valideerKalender(FIXTURE_GOED)).toEqual([])
  })

  const codes = (entries: unknown[]) => valideerKalender(entries).map((b) => b.code)

  it('dubbel id → bezwaar', () => {
    const [a] = FIXTURE_GOED
    expect(codes([a, { ...a, status: 'aangenomen' }])).toContain('dubbel-id')
  })

  it('twee entries in dezelfde groep mogen naast elkaar staan zolang ze verschillende params vullen', () => {
    const plan = box3('box3-2026-belastingplan', { heffingsvrij_single: 1 })
    const losseWet = box3('box3-2026-losse-wet', { tarief_pct: 1 })
    expect(codes([plan, losseWet])).toEqual([])
  })

  it('twee entries in dezelfde groep die dezelfde param vullen → dubbele-param', () => {
    const a = box3('box3-2026-a', { heffingsvrij_single: 1, tarief_pct: 1 })
    const b = box3('box3-2026-b', { tarief_pct: 2 })
    expect(codes([a, b])).toEqual(['dubbele-param'])
    // Andere status = andere groep.
    expect(codes([a, box3('box3-2026-c', { tarief_pct: 2 }, { status: 'aangenomen' })])).toEqual([])
  })

  it('DUO: sf15 en sf35 in hetzelfde jaar mogen, twee keer hetzelfde stelsel niet', () => {
    expect(codes([duo('duo-a', 'sf15', 2), duo('duo-b', 'sf35', 2)])).toEqual([])
    expect(codes([duo('duo-a', 'sf35', 2), duo('duo-b', 'sf35', 3)])).toEqual(['dubbele-param'])
  })

  it('AOW en eigen risico: één waarde-param, dus twee entries in één groep botsen altijd', () => {
    expect(codes([aow('aow-a', 2030, 3), aow('aow-b', 2030, 4)])).toEqual(['dubbele-param'])
    expect(codes([eigenRisico('er-a', 1), eigenRisico('er-b', 2)])).toEqual(['dubbele-param'])
  })

  it('studieschuld zonder of met onbekend stelsel → schema; stelsel op een ander mechanisme → schema', () => {
    const d = FIXTURE_GOED[2] as Record<string, unknown>
    const zonder = { ...d }
    delete zonder.stelsel
    expect(codes([zonder])).toContain('schema')
    expect(codes([{ ...d, stelsel: 'sf10' }])).toContain('schema')
    expect(codes([{ ...FIXTURE_GOED[0], stelsel: 'sf35' }])).toContain('schema')
  })

  it('vrije lezerstekst wordt door het schema geweigerd', () => {
    const a = FIXTURE_GOED[0]
    expect(codes([{ ...a, kop: 'Box 3 omhoog' }])).toContain('schema')
    expect(codes([{ ...a, params: { ...a.params, samenvatting: 'x' } }])).toContain('schema')
    expect(codes([{ ...a, bron: { ...a.bron, toelichting: 'x' } }])).toContain('schema')
  })

  it('schema: jaar buiten JAAR_MIN..JAAR_MAX, http-url, ongeldige datum, onbekende uitgever, niet-rekenend mechanisme', () => {
    const a = FIXTURE_GOED[0]
    expect(codes([{ ...a, jaar: 2031 }])).toContain('schema')
    expect(codes([{ ...a, jaar: 2024 }])).toContain('schema')
    expect(codes([{ ...a, bron: { uitgever: 'Belastingdienst', url: 'http://example.org/x' } }])).toContain('schema')
    expect(codes([{ ...a, gezien: '2026-02-30' }])).toContain('schema')
    expect(codes([{ ...a, ingangsdatum: '1-1-2026' }])).toContain('schema')
    expect(codes([{ ...a, bron: { uitgever: 'NOS', url: 'https://nos.nl/x' } }])).toContain('schema')
    expect(codes([{ ...a, id: 'Box3 2026' }])).toContain('schema')
    expect(codes([{ ...a, status: 'verwacht' }])).toContain('schema')
    expect(codes([{ ...a, mechanisme: 'toeslag-regel' }])).toContain('schema')
  })

  it('schema: de oude waarde hoort er niet in', () => {
    const er = FIXTURE_GOED[ER_INDEX]
    expect(codes([{ ...er, params: { jaar: null, bedrag: 400, oud: 385 } }])).toContain('schema')
  })

  it('leeg mechanisme (geen enkele gewijzigde waarde) → bezwaar', () => {
    expect(codes([box3('box3-leeg', {})])).toEqual(['leeg-mechanisme'])
  })

  it('onplausibele waarde → bezwaar (zelfde grenzen als de duidingspoort)', () => {
    expect(codes([box3('box3-onplausibel', { tarief_pct: 61 })])).toEqual(['onplausibel'])
    expect(codes([aow('aow-onplausibel', 2030, 13)])).toEqual(['onplausibel'])
  })

  it('params-jaar of ingangsdatum in een ander jaar → bezwaar', () => {
    expect(codes([box3('box3-pj', { jaar: 2025, tarief_pct: 1 })])).toEqual(['params-jaar-wijkt-af'])
    expect(codes([{ ...aow('aow-pj', 2030, 3), params: { vanaf_jaar: 2029, verschuiving_maanden: 3 } }])).toEqual(['params-jaar-wijkt-af'])
    expect(codes([box3('box3-id', { tarief_pct: 1 }, { ingangsdatum: '2025-07-01' })])).toEqual(['ingangsdatum-jaar-wijkt-af'])
  })

  it('besluitdatum: verplicht bij aangenomen/verwerkt, verboden bij voorstel', () => {
    expect(codes([box3('box3-geen-besluit', { tarief_pct: 1 }, { besloten: undefined })])).toEqual(['besloten-ontbreekt'])
    expect(codes([aow('aow-besloten', 2030, 3, { besloten: '2026-09-20' })])).toEqual(['besloten-bij-voorstel'])
  })

  it('gooit niet op rommel-invoer', () => {
    const b = valideerKalender([null, 42, 'x', {}])
    expect(b.every((x) => x.code === 'schema')).toBe(true)
    expect(new Set(b.map((x) => x.index))).toEqual(new Set([0, 1, 2, 3]))
  })
})

// ── Geen tweede kopie bijt ───────────────────────────────────────────────────

describe('bezwarenCanon — fixture', () => {
  const canonCodes = (entries: RegelkalenderEntry[]) => bezwarenCanon(entries).map((b) => b.code)

  it('een correcte fixture geeft geen canon-bezwaren (incl. %↔fractie en beide DUO-stelsels)', () => {
    expect(bezwarenCanon(FIXTURE_GOED)).toEqual([])
  })

  it('verwerkt met canon + 1 → drift, voor ELKE box 3- en box 1-param', () => {
    for (const [k, v] of Object.entries(B3_NU)) {
      expect(canonCodes([box3(`b3-drift-${k}`, { [k]: v + 1 })]), k).toEqual(['drift'])
    }
    for (const [k, v] of Object.entries(B1_NU)) {
      expect(canonCodes([box1(`b1-drift-${k}`, { [k]: v + 1 })]), k).toEqual(['drift'])
    }
  })

  it('verwerkt met een fractie waar een percentage hoort → drift (de eenheidsval bijt)', () => {
    const fractie = DREMPELS['forfait-spaargeld'](J)!
    expect(canonCodes([box3('box3-eenheid', { forfait_spaargeld_pct: fractie })])).toEqual(['drift'])
  })

  it('DUO: exact per stelsel — het andere stelsel is drift', () => {
    expect(canonCodes([duo('duo-drift', 'sf35', DUO_NU.sf35 + 1)])).toEqual(['drift'])
    expect(DUO_NU.sf15).not.toBe(DUO_NU.sf35) // anders bijt de volgende regel niet
    expect(canonCodes([duo('duo-verkeerd-stelsel', 'sf15', DUO_NU.sf35)])).toEqual(['drift'])
  })

  it('eigen risico: canon + 1 → drift', () => {
    expect(canonCodes([eigenRisico('er-drift', ER_CANON + 1)])).toEqual(['drift'])
  })

  it('verwerkt voor een jaar dat de tabel niet kent → bezwaar', () => {
    const fout = [
      box3('box3-2030-verwerkt', { tarief_pct: 40 }, tijd(2030, 'verwerkt')),
      duo('duo-2030-verwerkt', 'sf35', 2, tijd(2030, 'verwerkt')),
      eigenRisico('er-2030-verwerkt', ER_CANON, tijd(2030, 'verwerkt')),
    ]
    expect(canonCodes(fout)).toEqual(['verwerkt-zonder-canon', 'verwerkt-zonder-canon', 'verwerkt-zonder-canon'])
  })

  it('voorstel/aangenomen voor een jaar dat de tabel al kent → jaar-al-canoniek', () => {
    const fout = [
      box3('box3-2026-voorstel', { tarief_pct: 40 }, tijd(J, 'voorstel')),
      box1('box1-2026-aangenomen', B1.gewijzigd, tijd(J, 'aangenomen')),
      duo('duo-2026-voorstel', 'sf35', DUO_NU.sf35, tijd(J, 'voorstel')),
      eigenRisico('er-2025-aangenomen', ER_CANON, tijd(ER_JAAR, 'aangenomen')),
    ]
    expect(canonCodes(fout)).toEqual(['jaar-al-canoniek', 'jaar-al-canoniek', 'jaar-al-canoniek', 'jaar-al-canoniek'])
  })

  it('geen-wijziging: een verwerkte param die gelijk bleef aan jaar − 1', () => {
    for (const k of B3.gelijk) expect(canonCodes([box3(`b3-gelijk-${k}`, { [k]: B3_NU[k] })]), k).toEqual(['geen-wijziging'])
    for (const k of B1.gelijk) expect(canonCodes([box1(`b1-gelijk-${k}`, { [k]: B1_NU[k] })]), k).toEqual(['geen-wijziging'])
  })

  it('geen-wijziging: een voorstel dat de waarde van het jaar ervóór herhaalt (2027 = canon 2026, geen voorspelling)', () => {
    const volgend = tijd(J + 1, 'voorstel')
    const [k, v] = Object.entries(B3_NU)[0]
    expect(canonCodes([box3('b3-2027-gelijk', { [k]: v }, volgend)])).toEqual(['geen-wijziging'])
    expect(canonCodes([duo('duo-2027-gelijk', 'sf35', DUO_NU.sf35, volgend)])).toEqual(['geen-wijziging'])
    expect(canonCodes([eigenRisico('er-2027-gelijk', ZORG_EIGEN_RISICO[J], tijd(J + 1, 'voorstel'))])).toEqual(['geen-wijziging'])
  })

  it('een verwerkte param gelijk aan jaar − 1 terwijl hij wel veranderde → drift én geen-wijziging', () => {
    expect(canonCodes([duo('duo-oud', 'sf35', DUO_VORIG.sf35)])).toEqual(['drift', 'geen-wijziging'])
  })

  it('bewust stil: voorstel zonder canon(jaar − 1) zwijgt tot het jaar ervóór verwerkt is', () => {
    // 2029 staat in geen enkele tabel → er valt niets te vergelijken.
    expect(canonCodes([box3('b3-2030', { tarief_pct: B3_NU.tarief_pct }, tijd(2030, 'voorstel'))])).toEqual([])
    expect(canonCodes([duo('duo-2030', 'sf35', DUO_NU.sf35, tijd(2030, 'voorstel'))])).toEqual([])
  })

  it('aow-leeftijd is de gedocumenteerde uitzondering: geen tabeltoets, wel schema/jaar', () => {
    expect(canonCodes([aow('aow-verwerkt', 2030, 3, { status: 'verwerkt', besloten: '2026-09-20' })])).toEqual([])
    expect(valideerKalender([aow('aow-2031', 2031, 3)]).map((b) => b.code)).toContain('schema')
  })
})

// ── Logvermelding bijt ───────────────────────────────────────────────────────

describe('logvermelding — fixture', () => {
  it('elke fixture-entry staat in de fixture-log (via url, of via kamerstuk)', () => {
    expect(bezwarenLogvermelding(FIXTURE_GOED, FIXTURE_LOG)).toEqual([])
  })

  it('een entry zonder logvermelding → bezwaar', () => {
    const wees = box3('box3-wees', { tarief_pct: 1 }, { bron: { uitgever: 'Tweede Kamer', url: url('niet-in-log') } })
    expect(bezwarenLogvermelding([...FIXTURE_GOED, wees], FIXTURE_LOG)).toEqual(['box3-wees'])
  })

  it('kamerstuk "nr. 3" slaagt niet op een log die alleen "nr. 31" noemt', () => {
    const er = FIXTURE_GOED[ER_INDEX]
    expect(bezwarenLogvermelding([er], 'Kamerstuk FICTIEF 00 001, nr. 31')).toEqual([er.id])
    expect(bezwarenLogvermelding([er], 'Kamerstuk FICTIEF 00 001, nr. 3, blz. 4')).toEqual([])
  })

  it('een url slaagt niet op een langere url die ermee begint', () => {
    const e = box3('box3-2026', { tarief_pct: 1 })
    expect(bezwarenLogvermelding([e], `[bron](${e.bron.url}-2027)`)).toEqual([e.id])
    expect(bezwarenLogvermelding([e], `${e.bron.url}/bijlage`)).toEqual([e.id])
    expect(bezwarenLogvermelding([e], `[bron](${e.bron.url})`)).toEqual([])
  })

  it('de fixture-entries staan NIET in de echte log (de toets leest écht het bestand)', () => {
    expect(bezwarenLogvermelding(FIXTURE_GOED, ECHTE_LOG)).toEqual(FIXTURE_GOED.map((e) => e.id))
  })
})
