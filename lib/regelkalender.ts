// ── Regelkalender: de machineleesbare tweeling van de fiscale-wijzigingslog ──
//
// Een gecureerde, getypeerde lijst van REGELwijzigingen (box 3, box 1,
// studieschuldrente, AOW-leeftijd, eigen risico) met bron en status. De
// mensleesbare kant staat in `docs/fiscale-wijzigingslog.md`; dit bestand
// draagt dezelfde wijzigingen als data, zodat rekenende Krant-berichten straks
// uit de kalender kunnen komen in plaats van uit een door het model gelezen
// artikel.
//
// Harde regels (`valideerKalender` + `bezwarenCanon`, bewaakt door
// `lib/regelkalender.test.ts`):
//
//   1. GEEN TWEEDE KOPIE VAN TARIEVEN. De canonieke jaartabellen blijven
//      `BOX3_PARAMS` (lib/box3-data.ts), `BOX1_PARAMS` (lib/box1-tax.ts),
//      `DUO_RENTE_PCT` en `ZORG_EIGEN_RISICO` (lib/constants.ts). Een entry
//      met status `verwerkt` staat al in die tabel en moet er exact mee
//      overeenkomen; een `voorstel` of `aangenomen` mag voor dat jaar juist
//      NIET in de tabel staan (anders staat hij dubbel).
//   2. GEEN OUDE WAARDE. Een entry draagt alleen de NIEUWE waarden. De oude
//      waarde is altijd de canonieke waarde van `jaar − 1` (zoals
//      lib/krant/impact.ts hem al leest). Een gevulde param die gelijk is aan
//      canon(jaar − 1) is dus geen wijziging en wordt afgekeurd
//      (`geen-wijziging`).
//      LET OP — bewust stil: kent de tabel `jaar − 1` NIET (een voorstel voor
//      2028 terwijl 2027 nog niet verwerkt is), dan valt er niets te
//      vergelijken en zwijgt deze toets tot het jaar ervóór verwerkt is. Geen
//      bezwaar, geen gok; de impact-som degradeert in dat geval al zelf naar
//      `geen-canonieke-waarde`.
//   3. GEEN LEZERSTEKST. Geen kop, geen samenvatting, geen toelichting: de
//      tekst die een lezer ziet komt uit gesloten sjablonen, nooit uit data
//      die iemand met de hand intikt. De schema's zijn `strictObject`, dus een
//      extra veld wordt geweigerd.
//   4. ÉÉN BRON PER PARAM. Twee entries met hetzelfde (mechanisme, jaar,
//      status[, stelsel]) mogen naast elkaar staan (een Belastingplan naast een
//      losse wet), maar niet dezelfde param vullen.
//
// LEVENSLOOP: voorstel → aangenomen → verwerkt. Komt een jaar in de canonieke
// tabel, dan gaat de entry in DEZELFDE PR naar `verwerkt` — anders wordt de
// test rood op `jaar-al-canoniek`.
//
// Eigenaarsbesluit 30 sep 2026 (herziet dat van 27 sep 2026): de kalender
// wordt gevuld met het Belastingplan 2027, status `voorstel`, en ALLEEN met
// waarden die letterlijk in een officieel stuk op rijksfinancien.nl staan
// (wetsvoorstel, memorie van toelichting, bijlagen/sleuteltabel, of de
// Miljoenennota/begrotingen). Geen afleiding, geen afronding, geen waarde uit
// een nieuwsartikel of uit eigen kennis; twijfel = weglaten. Wat niet
// letterlijk in een bron staat, blijft `null`. De tests draaien daarnaast op
// een fixture-kalender die bewijst dat elke toets bijt.
//
// PUUR: geen IO, geen Date.now(). Alleen de logvermelding-toets leest een
// bestand, en die staat in de test (dit bestand mag client-side meegebundeld
// worden).

import { z } from 'zod'
import { JAAR_MAX, JAAR_MIN, MECHANISMEN, type MechanismeId, type MechanismeParams } from '@/lib/krant/mechanismen'
import { DREMPELS, DREMPEL_EENHEID, type DrempelSleutel } from '@/lib/krant/drempels'
import { DUO_RENTE_PCT, ZORG_EIGEN_RISICO } from '@/lib/constants'

// ── Vocabulaire ──────────────────────────────────────────────────────────────

/**
 * De mechanismen die een regelkalender-entry kan dragen: de RÉKENENDE,
 * DIRECTE mechanismen uit de catalogus (een regel die door wet of besluit op
 * jou van toepassing is en een bedrag oplevert). Statisch uitgeschreven zodat
 * het zod-schema per mechanisme een literal krijgt; de test bewijst dat deze
 * lijst exact gelijk is aan `rekenendeDirecteMechanismen()`.
 */
export const REGELKALENDER_MECHANISMEN = [
  'box3-parameter',
  'box1-parameter',
  'studieschuld-rente',
  'aow-leeftijd',
  'eigen-risico',
] as const satisfies readonly MechanismeId[]

export type RegelkalenderMechanisme = (typeof REGELKALENDER_MECHANISMEN)[number]

/** Afgeleid uit de catalogus — de bron waartegen de statische lijst getoetst wordt. */
export function rekenendeDirecteMechanismen(): MechanismeId[] {
  return Object.values(MECHANISMEN)
    .filter((def) => def.rekent && def.vorm === 'direct')
    .map((def) => def.id)
}

/**
 * Het statusvocabulaire van `docs/fiscale-wijzigingslog.md` (en de skill
 * fiscale-wijzigingslog): `voorstel` (vastgelegd, niet verwerkt) ·
 * `aangenomen` (besloten, mag de code in, nog niet in de canonieke tabel) ·
 * `verwerkt` (staat in de canonieke tabel, met ADR).
 */
export const REGELKALENDER_STATUSSEN = ['voorstel', 'aangenomen', 'verwerkt'] as const
export type RegelkalenderStatus = (typeof REGELKALENDER_STATUSSEN)[number]

export const BRON_UITGEVERS = [
  'Rijksoverheid',
  'Belastingdienst',
  'Tweede Kamer',
  'DUO',
  'SVB',
  'Zorginstituut',
] as const
export type BronUitgever = (typeof BRON_UITGEVERS)[number]

/**
 * DUO-stelsel, in dezelfde sleutels als `DUO_RENTE_PCT`: `sf35` (35 jaar
 * terugbetalen, huidig stelsel) en `sf15` (15 jaar, oud stelsel). Het
 * params-schema van `studieschuld-rente` kent het stelsel niet (één
 * `rente_pct`) en blijft ongewijzigd; het stelsel staat daarom op de entry.
 */
export const DUO_STELSELS = ['sf15', 'sf35'] as const
export type DuoStelsel = (typeof DUO_STELSELS)[number]

// ── Schema ───────────────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Kalenderdatum `YYYY-MM-DD` (zod valideert ook dat de dag bestaat). */
const datum = z.iso.date()

export const RegelkalenderBronSchema = z.strictObject({
  uitgever: z.enum(BRON_UITGEVERS),
  /**
   * Kamerstuk-/besluitnummer, bv. "36 602, nr. 3". Minimaal 5 tekens; de
   * logvermelding-toets zoekt dit letterlijk in het logbestand, met een
   * grens erachter (zodat "nr. 3" niet op "nr. 31" slaagt).
   */
  kamerstuk: z.string().trim().min(5).max(120).optional(),
  url: z.url({ protocol: /^https$/ }),
})

const basis = {
  id: z.string().min(3).max(80).regex(SLUG),
  // TODO(eigenaarsbesluit, open): JAAR_MAX (lib/krant/mechanismen.ts) staat
  // op 2030. Een AOW-leeftijdstap wordt vijf jaar vooruit vastgesteld (bv. de
  // stap voor 2032) en past daardoor niet in dit bereik. Verruimen raakt ook
  // de duidingspoort en de golden tests; bewust niet hier opgelost.
  jaar: z.number().int().min(JAAR_MIN).max(JAAR_MAX),
  ingangsdatum: datum,
  status: z.enum(REGELKALENDER_STATUSSEN),
  bron: RegelkalenderBronSchema,
  gezien: datum,
  besloten: datum.optional(),
}

/**
 * Per mechanisme een variant met PRECIES het params-schema uit
 * lib/krant/mechanismen.ts — hergebruikt, geen tweede definitie. Die schema's
 * zijn `strictObject` met nullable velden: een onveranderde waarde staat als
 * `null`, een onbekende sleutel wordt geweigerd. Alleen de
 * studieschuld-variant draagt daarnaast `stelsel`.
 */
export const RegelkalenderEntrySchema = z.discriminatedUnion('mechanisme', [
  z.strictObject({ ...basis, mechanisme: z.literal('box3-parameter'), params: MECHANISMEN['box3-parameter'].params }),
  z.strictObject({ ...basis, mechanisme: z.literal('box1-parameter'), params: MECHANISMEN['box1-parameter'].params }),
  z.strictObject({
    ...basis,
    mechanisme: z.literal('studieschuld-rente'),
    stelsel: z.enum(DUO_STELSELS),
    params: MECHANISMEN['studieschuld-rente'].params,
  }),
  z.strictObject({ ...basis, mechanisme: z.literal('aow-leeftijd'), params: MECHANISMEN['aow-leeftijd'].params }),
  z.strictObject({ ...basis, mechanisme: z.literal('eigen-risico'), params: MECHANISMEN['eigen-risico'].params }),
])

export type RegelkalenderEntry = z.infer<typeof RegelkalenderEntrySchema>
export type RegelkalenderBron = z.infer<typeof RegelkalenderBronSchema>

// ── De kalender ──────────────────────────────────────────────────────────────

/** Belastingplan 2027 op rijksfinancien.nl (Prinsjesdag 15 sep 2026). */
const BP2027_WETSVOORSTEL_MVT =
  'https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/wetsvoorstel-belastingplan-2027/Wetsvoorstel-Belastingplan-2027.pdf'
const BP2027_SLEUTELTABEL =
  'https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/pakket-belastingplan-2027/Fiscale-sleuteltabel-2027-incl-correctie-tarieven-energiebelasting-zelfstandigenaftrek.pdf'

/**
 * De echte regelkalender (eigenaarsbesluit 30 sep 2026: Belastingplan 2027,
 * status `voorstel`, alleen letterlijk uit officiële stukken op
 * rijksfinancien.nl). Elke entry staat met dezelfde url in
 * docs/fiscale-wijzigingslog.md; `lib/regelkalender.test.ts` valideert deze
 * lijst met `valideerKalender`, `bezwarenCanon` en de logvermelding-toets.
 *
 * Een param die in de bron gelijk blijft aan 2026 (toptarief 49,50%,
 * schijfgrens 2 € 78.426, box 3-tarief 36%) staat hier bewust als `null`:
 * dat is geen wijziging. Wat niet letterlijk in een bron staat (heffingsvrij
 * vermogen partners, de box 3-forfaits 2027) ook.
 */
export const REGELKALENDER: readonly RegelkalenderEntry[] = [
  {
    // MvT Belastingplan 2027, § Parametertabellen, "Tabel 1: Overzicht
    // IB-parameters voor belastingplichtigen jonger dan de AOW-leeftijd"
    // (pdf-blz. 34), kolom 2027. "Arbeidskorting: bedrag grens 3" is het
    // maximum (kolom 2026 = 5.685 = BOX1_PARAMS[2026]; de sleuteltabel 2027
    // noemt dezelfde 5.929 "Arbeidskorting: maximum").
    id: 'box1-2027-belastingplan-2027',
    mechanisme: 'box1-parameter',
    jaar: 2027,
    ingangsdatum: '2027-01-01',
    status: 'voorstel',
    bron: { uitgever: 'Rijksoverheid', url: BP2027_WETSVOORSTEL_MVT },
    gezien: '2026-09-30',
    params: {
      jaar: 2027,
      schijf_1_grens: 39_247,
      schijf_2_grens: null,
      schijf_1_tarief_pct: 36.23,
      schijf_2_tarief_pct: 38.16,
      schijf_3_tarief_pct: null,
      algemene_heffingskorting_max: 3_154,
      arbeidskorting_max: 5_929,
    },
  },
  {
    // Fiscale sleuteltabel 2027 (pakket Belastingplan 2027, versie september
    // 2026), Box 3, "Heffingsvrij vermogen", kolom "Niveau 2027".
    id: 'box3-2027-belastingplan-2027',
    mechanisme: 'box3-parameter',
    jaar: 2027,
    ingangsdatum: '2027-01-01',
    status: 'voorstel',
    bron: { uitgever: 'Rijksoverheid', url: BP2027_SLEUTELTABEL },
    gezien: '2026-09-30',
    params: {
      jaar: 2027,
      heffingsvrij_single: 60_098,
      heffingsvrij_partner: null,
      forfait_spaargeld_pct: null,
      forfait_beleggingen_pct: null,
      forfait_schulden_pct: null,
      tarief_pct: null,
    },
  },
]

// ── Bezwaren ─────────────────────────────────────────────────────────────────

export type RegelkalenderBezwaarCode =
  // valideerKalender
  | 'schema'
  | 'dubbel-id'
  | 'dubbele-param'
  | 'leeg-mechanisme'
  | 'onplausibel'
  | 'params-jaar-wijkt-af'
  | 'ingangsdatum-jaar-wijkt-af'
  | 'besloten-ontbreekt'
  | 'besloten-bij-voorstel'
  // bezwarenCanon
  | 'drift'
  | 'verwerkt-zonder-canon'
  | 'jaar-al-canoniek'
  | 'geen-wijziging'

export interface RegelkalenderBezwaar {
  /** Positie in de aangeboden lijst. */
  index: number
  /** Het id van de entry, als dat leesbaar was. */
  id: string | null
  code: RegelkalenderBezwaarCode
  detail: string
}

// ── valideerKalender ─────────────────────────────────────────────────────────

function leesId(ruw: unknown): string | null {
  if (typeof ruw !== 'object' || ruw === null) return null
  const id = (ruw as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

/** Het jaar dat de params zelf noemen (`vanaf_jaar` bij de AOW-leeftijd). */
function paramsJaar(entry: RegelkalenderEntry): number | null {
  return entry.mechanisme === 'aow-leeftijd' ? entry.params.vanaf_jaar : entry.params.jaar
}

/** De gevulde WAARDE-params (het jaarveld telt niet als wijziging). */
function gevuldeParams(entry: RegelkalenderEntry): string[] {
  return Object.entries(entry.params as Record<string, number | null>)
    .filter(([naam, waarde]) => waarde !== null && naam !== 'jaar' && naam !== 'vanaf_jaar')
    .map(([naam]) => naam)
}

/** De groep waarbinnen elke param maar één bron mag hebben. */
function groepSleutel(entry: RegelkalenderEntry): string {
  const stelsel = entry.mechanisme === 'studieschuld-rente' ? `|${entry.stelsel}` : ''
  return `${entry.mechanisme}|${entry.jaar}|${entry.status}${stelsel}`
}

/** Inhoudelijke toetsen op één schema-geldige entry (bovenop zod). */
function bezwarenInhoud(entry: RegelkalenderEntry, index: number): RegelkalenderBezwaar[] {
  const uit: RegelkalenderBezwaar[] = []
  const b = (code: RegelkalenderBezwaarCode, detail: string) => uit.push({ index, id: entry.id, code, detail })
  const def = MECHANISMEN[entry.mechanisme]
  const params = entry.params as Record<string, number | null>

  // Alleen gewijzigde waarden — maar minstens één.
  if (def.minstensEen && !def.minstensEen.some((naam) => params[naam] !== null && params[naam] !== undefined)) {
    b('leeg-mechanisme', `geen van ${def.minstensEen.join(', ')} is gevuld`)
  }

  // Dezelfde harde plausibiliteitsgrenzen als de duidingspoort.
  for (const [naam, waarde] of Object.entries(params)) {
    if (waarde === null) continue
    const regel = def.numeriek[naam]
    if (!regel || !Number.isFinite(waarde) || waarde < regel.min || waarde > regel.max) {
      b('onplausibel', `${naam} = ${waarde} valt buiten [${regel?.min ?? '?'}, ${regel?.max ?? '?'}]`)
    }
  }

  const pj = paramsJaar(entry)
  if (pj !== null && pj !== entry.jaar) {
    b('params-jaar-wijkt-af', `params noemen ${pj}, entry noemt ${entry.jaar}`)
  }

  if (Number(entry.ingangsdatum.slice(0, 4)) !== entry.jaar) {
    b('ingangsdatum-jaar-wijkt-af', `ingangsdatum ${entry.ingangsdatum} ligt niet in ${entry.jaar}`)
  }

  if (entry.status === 'voorstel' && entry.besloten !== undefined) {
    b('besloten-bij-voorstel', 'een voorstel is (nog) niet besloten')
  }
  if (entry.status !== 'voorstel' && entry.besloten === undefined) {
    b('besloten-ontbreekt', `status ${entry.status} vraagt een besluitdatum`)
  }
  return uit
}

/**
 * Valideert een kalender: zod per entry, unieke ids, per
 * (mechanisme, jaar, status[, stelsel]) elke param hoogstens één keer gevuld,
 * plus de inhoudelijke toetsen (minstens één gewijzigde param,
 * plausibiliteit, jaar-consistentie, besluitdatum). Geeft een lijst bezwaren
 * terug — leeg is geldig. Gooit nooit.
 *
 * De toets tegen de canonieke tabellen staat in `bezwarenCanon` (ook puur);
 * de toets tegen het logbestand leest een bestand en staat daarom in
 * lib/regelkalender.test.ts.
 */
export function valideerKalender(entries: readonly unknown[]): RegelkalenderBezwaar[] {
  const bezwaren: RegelkalenderBezwaar[] = []
  const ids = new Map<string, number>()
  /** groep → param → positie van de eerste entry die hem vulde */
  const paramBron = new Map<string, Map<string, number>>()

  entries.forEach((ruw, index) => {
    const parsed = RegelkalenderEntrySchema.safeParse(ruw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        bezwaren.push({
          index,
          id: leesId(ruw),
          code: 'schema',
          detail: `${issue.path.join('.') || '(entry)'}: ${issue.message}`,
        })
      }
      return
    }
    const entry = parsed.data

    const eerderId = ids.get(entry.id)
    if (eerderId !== undefined) {
      bezwaren.push({ index, id: entry.id, code: 'dubbel-id', detail: `ook op positie ${eerderId}` })
    } else {
      ids.set(entry.id, index)
    }

    const groep = groepSleutel(entry)
    const bronnen = paramBron.get(groep) ?? new Map<string, number>()
    paramBron.set(groep, bronnen)
    for (const param of gevuldeParams(entry)) {
      const eerder = bronnen.get(param)
      if (eerder !== undefined) {
        bezwaren.push({
          index,
          id: entry.id,
          code: 'dubbele-param',
          detail: `${param} in ${groep} wordt ook gevuld op positie ${eerder}`,
        })
      } else {
        bronnen.set(param, index)
      }
    }

    bezwaren.push(...bezwarenInhoud(entry, index))
  })
  return bezwaren
}

// ── bezwarenCanon: geen tweede kopie ─────────────────────────────────────────
//
// Box 3 en box 1 lopen via DREMPELS (lib/krant/drempels.ts), die op zijn beurt
// BOX3_PARAMS / BOX1_PARAMS leest — de Krant-brug naar de canonieke tabellen,
// dezelfde die de matcher voor de "oude" kant gebruikt. Het type dwingt af dat
// ELKE numerieke param (behalve `jaar`) een bron heeft.

type Box3Param = Exclude<keyof MechanismeParams<'box3-parameter'>, 'jaar'>
type Box1Param = Exclude<keyof MechanismeParams<'box1-parameter'>, 'jaar'>

export const BOX3_PARAM_DREMPEL: Readonly<Record<Box3Param, DrempelSleutel>> = {
  heffingsvrij_single: 'heffingsvrij-vermogen-single',
  heffingsvrij_partner: 'heffingsvrij-vermogen-partner',
  forfait_spaargeld_pct: 'forfait-spaargeld',
  forfait_beleggingen_pct: 'forfait-beleggingen',
  forfait_schulden_pct: 'forfait-schulden',
  tarief_pct: 'box3-tarief',
}

export const BOX1_PARAM_DREMPEL: Readonly<Record<Box1Param, DrempelSleutel>> = {
  schijf_1_grens: 'box1-schijf-1-grens',
  schijf_2_grens: 'box1-schijf-2-grens',
  schijf_1_tarief_pct: 'box1-schijf-1-tarief',
  schijf_2_tarief_pct: 'box1-schijf-2-tarief',
  schijf_3_tarief_pct: 'box1-schijf-3-tarief',
  algemene_heffingskorting_max: 'algemene-heffingskorting-max',
  arbeidskorting_max: 'arbeidskorting-max',
}

/**
 * TOLERANTIE — bewuste keuze, per grootheid:
 * - euro's (grenzen, kortingen, eigen risico): EXACT (`===`). Alle bedragen in
 *   de tabellen zijn hele euro's; elke afwijking is echte drift.
 * - box 3/box 1-percentages: de param staat als PERCENTAGE (`tarief_pct: 36`),
 *   de tabel als FRACTIE (`tarief: 0.36`) — zie DREMPEL_EENHEID. Vergeleken
 *   op de fractieschaal met ABSOLUTE tolerantie 1e-9: `1.28 / 100` is in
 *   floating point niet bit-gelijk aan `0.0128` (representatiefout ~1e-18),
 *   terwijl de kleinste echte stap in de tabel 1e-5 is (0,001 procentpunt).
 *   Relatief zou hier niets toevoegen: de waarden liggen tussen 0,01 en 0,5.
 * - DUO-rente: DUO_RENTE_PCT staat al in PROCENTEN — geen conversie; zelfde
 *   absolute 1e-9 om dezelfde floating-point-reden.
 */
const TOLERANTIE = 1e-9

function gelijkAanDrempel(paramWaarde: number, sleutel: DrempelSleutel, canon: number): boolean {
  if (DREMPEL_EENHEID[sleutel] === 'fractie') return Math.abs(paramWaarde / 100 - canon) <= TOLERANTIE
  return paramWaarde === canon
}

/**
 * Eén canonieke vergelijking, mechanisme-onafhankelijk: per gevulde param de
 * canonieke waarde in jaar J (null = tabel kent J niet) en of de param daaraan
 * gelijk is.
 */
interface CanonLezer {
  /** Kent de tabel dit jaar (voor deze entry)? */
  kentJaar: (jaar: number) => boolean
  /** Per gevulde param: canon in `jaar`, of null als die ontbreekt. */
  params: Array<{ naam: string; waarde: number; canon: (jaar: number) => number | null; gelijk: (canon: number) => boolean }>
}

function drempelLezer(params: Record<string, number | null>, bron: Readonly<Record<string, DrempelSleutel>>): CanonLezer {
  const sleutels = Object.values(bron)
  return {
    kentJaar: (jaar) => sleutels.some((s) => DREMPELS[s](jaar) !== null),
    params: Object.entries(bron).flatMap(([naam, sleutel]) => {
      const waarde = params[naam]
      if (waarde === null || waarde === undefined) return []
      return [{ naam, waarde, canon: (jaar: number) => DREMPELS[sleutel](jaar), gelijk: (c: number) => gelijkAanDrempel(waarde, sleutel, c) }]
    }),
  }
}

/** null = geen canonieke tabel om tegen te toetsen (AOW-uitzondering). */
function canonLezer(entry: RegelkalenderEntry): CanonLezer | null {
  switch (entry.mechanisme) {
    case 'box3-parameter':
      return drempelLezer(entry.params, BOX3_PARAM_DREMPEL)
    case 'box1-parameter':
      return drempelLezer(entry.params, BOX1_PARAM_DREMPEL)
    case 'studieschuld-rente': {
      const { stelsel } = entry
      const canon = (jaar: number) => DUO_RENTE_PCT[jaar]?.[stelsel] ?? null
      const waarde = entry.params.rente_pct
      return {
        kentJaar: (jaar) => canon(jaar) !== null,
        params: [{ naam: `rente_pct (${stelsel})`, waarde, canon, gelijk: (c) => Math.abs(waarde - c) <= TOLERANTIE }],
      }
    }
    case 'eigen-risico': {
      const canon = (jaar: number) => ZORG_EIGEN_RISICO[jaar] ?? null
      const waarde = entry.params.bedrag
      return {
        kentJaar: (jaar) => canon(jaar) !== null,
        params: [{ naam: 'bedrag', waarde, canon, gelijk: (c) => waarde === c }],
      }
    }
    case 'aow-leeftijd':
      // UITZONDERING: `verschuiving_maanden` staat niet als stap in een
      // code-tabel. De canonieke AOW-leeftijden zijn DB-rijen (`aow_leeftijd`,
      // gelezen via getAowLeeftijden) waarin de CBS-prognose de stappen al
      // draagt; een verschuiving is een verschil tussen twee cohorten, geen
      // opgeslagen waarde. Er is dus geen tabelwaarde om tegen te toetsen en
      // geen tabeljaar om "dubbel" tegen af te zetten. Hier geldt alleen het
      // schema + de jaarcontrole van valideerKalender.
      return null
  }
}

/**
 * De "geen tweede kopie"-toets. PUUR (leest alleen de canonieke tabellen in
 * code), zodat de latere matcher-adapter hem kan hergebruiken.
 *
 * - `verwerkt` ⇒ de tabel kent het jaar (anders `verwerkt-zonder-canon`) en
 *   elke gevulde param is gelijk aan canon(jaar) (anders `drift`).
 * - `voorstel`/`aangenomen` ⇒ de tabel kent het jaar NIET (anders
 *   `jaar-al-canoniek`).
 * - elke status ⇒ een gevulde param is ONgelijk aan canon(jaar − 1) (anders
 *   `geen-wijziging`). Kent de tabel `jaar − 1` niet, dan zwijgt deze regel
 *   bewust tot het jaar ervóór verwerkt is — geen bezwaar, geen gok.
 */
export function bezwarenCanon(entries: readonly RegelkalenderEntry[]): RegelkalenderBezwaar[] {
  const uit: RegelkalenderBezwaar[] = []
  entries.forEach((entry, index) => {
    const lezer = canonLezer(entry)
    if (!lezer) return
    const b = (code: RegelkalenderBezwaarCode, detail: string) => uit.push({ index, id: entry.id, code, detail })
    const { jaar } = entry

    if (entry.status === 'verwerkt') {
      if (!lezer.kentJaar(jaar)) {
        b('verwerkt-zonder-canon', `${entry.mechanisme} ${jaar} ontbreekt in de canonieke tabel`)
      } else {
        for (const p of lezer.params) {
          const canon = p.canon(jaar)
          if (canon === null || !p.gelijk(canon)) b('drift', `${p.naam} = ${p.waarde}, canoniek ${jaar} = ${canon}`)
        }
      }
    } else if (lezer.kentJaar(jaar)) {
      b('jaar-al-canoniek', `${entry.mechanisme} ${jaar} staat al in de canonieke tabel`)
    }

    for (const p of lezer.params) {
      const vorig = p.canon(jaar - 1)
      if (vorig !== null && p.gelijk(vorig)) b('geen-wijziging', `${p.naam} = ${p.waarde} is gelijk aan canoniek ${jaar - 1}`)
    }
  })
  return uit
}
