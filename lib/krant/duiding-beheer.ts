// ── Duiding in beheer: weergave, terugtrekken en de K1-meting (1A fase 2) ────
//
// PUUR: geen IO. De routes onder /api/admin/news-duiding/* en de artikelroute
// van /beheer/nieuws lezen `news_articles` (platform-tabel, geen user_id) en
// geven de rijen hier doorheen. Drie dingen:
//
//   1. `duidingWeergave`  — de opgeslagen duiding (jsonb) wordt tegen het
//      leescontract `duidingV1Schema` geparsed en omgezet in een platte vorm
//      voor de tabel: per param de waarde met ernaast het grond-citaat. Wat niet
//      parst, wordt niet getoond (fail-closed) maar als `ongeldig` gemeld.
//   2. De body-schema's van de twee mutaties (terugtrekken, opnieuw duiden).
//   3. `bouwDuidingMeting`  — de K1-meting per ISO-week, bij elke lezing
//      afgeleid uit de rijen (importtoets 3: herleiden, niet ophogen; er is
//      geen teller). Elk getal is een telling over DB-kolommen:
//      `duiding_status`, `duiding_fout`, `teruggetrokken_reden`, `category`,
//      `fetched_at` en uit de jsonb de mechanisme-soort, de grondslagsoort
//      (G5), de poortuitslag met haar reden (G1/G2/G3/G6) en `kopBron` (G4).
//      De duiding zelf (modeluitvoer) levert nooit een getal aan de meting —
//      alleen of er een mechanisme IS en welke soort; of die soort rekent,
//      komt uit de catalogus in code (`MECHANISMEN[id].rekent`).
//   4. Het G7-register: de wekelijkse handmatige steekproef. Invoer, geen
//      berekening — zie het blok onderaan.
//
// Week = cohort op `fetched_at` (Amsterdamse ISO-week, dezelfde sleutel als de
// weekeditie van 1B). Een duiding die in week 40 wordt teruggetrokken, telt
// dus in de week waarin het artikel binnenkwam: de vraag van de poort is "waren
// de duidingen van die week goed", niet "wanneer zag beheer het". Gevolg: de
// cijfers van een week kunnen achteraf nog veranderen zolang beheer naloopt.
//
// B2: alleen euro's — hier komt geen bedrag en geen tijd voor; de meting telt
// artikelen. B4: geen vrijgavestap; 'geduid' is de live-status en terugtrekken
// is de enige menselijke beslissing.

import { z } from 'zod'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import {
  duidingV1Schema,
  DUIDING_STATUSSEN,
  GRONDSLAG_SOORTEN,
  TERUGTREK_REDENEN,
  type DuidingStatus,
  type TerugtrekReden,
  type DuidingSoort,
  type Deadline,
  type GrondslagSoort,
  type Poort,
} from './duiding-schema'
import { MECHANISMEN, MECHANISME_IDS, isMechanismeId, type MechanismeId } from './mechanismen'
import type { NumericUnit } from '@/lib/nummer-grond'

// ── Mutaties ─────────────────────────────────────────────────────────────────

/** Bovengrens op de vrije toelichting (alleen in admin_actions_log). */
export const TOELICHTING_MAX_TEKENS = 280

/**
 * POST /api/admin/news-duiding/terugtrekken. De reden is de CHECK-waarde op
 * `teruggetrokken_reden`; bij 'anders' is een toelichting verplicht, anders is
 * "waarom" (B4) leeg. De toelichting landt alleen in het auditlog.
 */
export const terugtrekBodySchema = z
  .strictObject({
    id: z.uuid(),
    reden: z.enum(TERUGTREK_REDENEN),
    toelichting: z.string().trim().max(TOELICHTING_MAX_TEKENS).optional(),
  })
  .refine((b) => b.reden !== 'anders' || (b.toelichting ?? '').length > 0, {
    message: 'Geef bij "anders" een korte toelichting',
    path: ['toelichting'],
  })
export type TerugtrekBody = z.infer<typeof terugtrekBodySchema>

/** POST /api/admin/news-duiding/opnieuw — alleen afgewezen/mislukt terug op 'wacht'. */
export const opnieuwBodySchema = z.strictObject({ id: z.uuid() })

/** DELETE /api/admin/news-articles — alleen een id. */
export const artikelVerwijderBodySchema = z.strictObject({ id: z.uuid() })

/**
 * Een artikel met deze status verwijdert beheer niet: het zou de terugtrek-audit
 * (B4) en de K1-meting omzeilen, en de ingest haalt het terug op 'wacht'.
 */
export const NIET_TE_VERWIJDEREN: readonly DuidingStatus[] = ['geduid', 'teruggetrokken']

/** Statussen waarvan beheer opnieuw kan laten duiden (analyse fase 2, §2e). */
export const OPNIEUW_TE_DUIDEN: readonly DuidingStatus[] = ['afgewezen', 'mislukt']

export const TERUGTREK_REDEN_LABEL: Record<TerugtrekReden, string> = {
  'fout-getal': 'Fout getal',
  'verkeerde-doelgroep': 'Verkeerde doelgroep',
  'verkeerd-mechanisme': 'Verkeerd mechanisme',
  anders: 'Anders',
}

/** Mechanismen die een bedrag opleveren — de poort telt foute getallen alléén hier. */
export const REKENENDE_MECHANISMEN: readonly MechanismeId[] = MECHANISME_IDS.filter((id) => MECHANISMEN[id].rekent)

export function isDuidingStatus(waarde: string): waarde is DuidingStatus {
  return (DUIDING_STATUSSEN as readonly string[]).includes(waarde)
}

// ── Zoeken ───────────────────────────────────────────────────────────────────

/**
 * Maak een zoekterm veilig voor PostgREST `.or()` + `ilike`: komma's, haakjes,
 * aanhalingstekens en backslashes breken de filtersyntax (en openen een
 * filter-injectie), `%`/`_`/`*` zijn wildcards. Wat overblijft is platte tekst.
 */
export function veiligeZoekterm(ruw: string | null | undefined, max = 100): string {
  return (ruw ?? '')
    .replace(/[,()"'\\%_*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// ── Weergave ─────────────────────────────────────────────────────────────────

export interface ParamWeergave {
  naam: string
  waarde: string | number | boolean | null
  /** Alleen voor numerieke params: de eenheid uit de catalogus. */
  eenheid: NumericUnit | null
  /** Het letterlijke citaat uit de bron waarin dit getal staat (grond), of null. */
  citaat: string | null
}

export interface DuidingWeergave {
  soort: DuidingSoort
  ingangsdatum: string | null
  deadline: Deadline | null
  doelgroep: Array<{ veld: string; op: string; waarden: string[] }>
  /** Null wanneer het model niets schreef of de tekstpoort degradeerde (B26). */
  samenvatting: string | null
  mechanisme: {
    id: MechanismeId
    label: string
    rekent: boolean
    drempel: string | null
    params: ParamWeergave[]
  } | null
  grondslag: GrondslagSoort
  /** De vingerafdruk van de grondslag die in de prompt ging (de tekst zelf staat in `bron_fragment`). */
  grondslagSha256: string
  tekens: number
  model: string
  poort: Poort
}

export type DuidingWeergaveUitkomst = { ok: true; duiding: DuidingWeergave } | { ok: false }

/**
 * Parse de opgeslagen duiding tegen het leescontract. `null` in → `null` uit
 * (er is niets te tonen); een jsonb die niet parst → `{ ok: false }`, zodat
 * beheer ziet dát er iets mis is zonder dat de ruwe inhoud wordt getoond.
 */
export function duidingWeergave(ruw: unknown): DuidingWeergaveUitkomst | null {
  if (ruw === null || ruw === undefined) return null
  const parsed = duidingV1Schema.safeParse(ruw)
  if (!parsed.success) return { ok: false }
  const d = parsed.data

  let mechanisme: DuidingWeergave['mechanisme'] = null
  if (d.mechanisme) {
    const def = MECHANISMEN[d.mechanisme.soort]
    const params = Object.entries(d.mechanisme.params as Record<string, unknown>).map(([naam, waarde]) => ({
      naam,
      waarde: typeof waarde === 'string' || typeof waarde === 'number' || typeof waarde === 'boolean' ? waarde : null,
      eenheid: def.numeriek[naam]?.eenheid ?? null,
      citaat: d.grond[naam] ?? null,
    }))
    mechanisme = {
      id: d.mechanisme.soort,
      label: def.label,
      rekent: def.rekent,
      drempel: d.mechanisme.drempel,
      params,
    }
  }

  return {
    ok: true,
    duiding: {
      soort: d.soort,
      ingangsdatum: d.ingangsdatum,
      deadline: d.deadline,
      doelgroep: d.doelgroep.map((r) => ({ veld: r.veld, op: r.op, waarden: [...r.waarden] })),
      samenvatting: d.samenvatting,
      mechanisme,
      grondslag: d.meta.grondslag,
      grondslagSha256: d.meta.grondslagSha256,
      tekens: d.meta.tekens,
      model: d.meta.model,
      poort: d.meta.poort,
    },
  }
}

// ── Meting ───────────────────────────────────────────────────────────────────

/** De kolommen die de meting leest — geen modeltekst, geen params. */
export const METING_KOLOMMEN =
  'id, title, category, fetched_at, duiding_status, duiding_fout, teruggetrokken_reden, ' +
  'mechanisme:duiding->mechanisme->>soort, grondslag:duiding->meta->>grondslag, ' +
  'poort_status:duiding->meta->poort->>status, poort_reden:duiding->meta->poort->>reden, ' +
  'kop_bron:duiding->meta->>kopBron, modeltekst:duiding->meta->>modeltekst'

export interface MetingRij {
  id: string
  title: string
  category: string | null
  fetched_at: string
  duiding_status: string
  duiding_fout: string | null
  teruggetrokken_reden: string | null
  /** `duiding->mechanisme->>soort` */
  mechanisme: string | null
  /** `duiding->meta->>grondslag` (G5) */
  grondslag: string | null
  /** `duiding->meta->poort->>status` (B26) */
  poort_status: string | null
  /** `duiding->meta->poort->>reden` — de grep-bare controlecode, nooit modeltekst. */
  poort_reden: string | null
  /** `duiding->meta->>kopBron` (G4) — hoort altijd 'bron' te zijn. */
  kop_bron: string | null
  /** `duiding->meta->>modeltekst` (G5) — hoort altijd 'false' te zijn; jsonb geeft 'm als string. */
  modeltekst: string | null
}

/**
 * De poortcodes in beheertaal. Onbekende codes worden NIET vertaald maar
 * getoond zoals ze zijn: een nieuwe controle mag hier nooit stil verdwijnen.
 */
export const POORT_REDEN_LABEL: Record<string, string> = {
  'g1:ongegrond-getal': 'G1 · een getal dat niet in de bron staat',
  'g1:verwijzing': 'G1 · een verwijzing (URL, www, e-mail)',
  'g2:datum': 'G2 · een datum die niet uit de bron komt',
  'g3:meta': 'G3 · commentaar over de bron in plaats van over de regel',
  'g6:lexicon': 'G6 · een doelgroepwoord dat de bron niet maakt',
}

export function poortRedenLabel(code: string): string {
  return POORT_REDEN_LABEL[code] ?? code
}

/** De prefix van de G6-helft die HARD afwijst (en dus in `afgewezenPerCode` landt, niet in de poort). */
export const DOELGROEP_AFWIJZING_PREFIX = 'doelgroep:ongegrond:'

/** De G6-afwijzingen uit `afgewezenPerCode`, grootste eerst. */
export function doelgroepAfwijzingen(afgewezenPerCode: Record<string, number>): Array<[string, number]> {
  return Object.entries(afgewezenPerCode)
    .filter(([code]) => code.startsWith(DOELGROEP_AFWIJZING_PREFIX))
    .sort((a, b) => b[1] - a[1])
}

export interface CategorieTelling {
  geduid: number
  metMechanisme: number
  /** metMechanisme / geduid (0–1), of null bij 0 geduid. */
  dekking: number | null
}

export interface WeekMeting {
  week: string
  /** Artikelen binnengekomen in deze week (fetched_at). */
  binnen: number
  /** Ooit geduid: nu 'geduid' of later 'teruggetrokken' (dat was eerst geduid). */
  geduid: number
  metMechanisme: number
  /** Dekking van de poort: metMechanisme / geduid (0–1), of null bij 0 geduid. */
  dekking: number | null
  /** Geduid met een rekenend mechanisme: wat beheer voor de poort naloopt. */
  rekenend: number
  /** Keuze 7: geduid, maar het mechanisme viel af op een controle. */
  mechanismeVervallen: number
  perCategorie: Record<string, CategorieTelling>
  /** G5 — waar de grondslag vandaan kwam: het eigen fragment, of alleen de bronkop. */
  perGrondslag: Record<GrondslagSoort, number>
  /**
   * De TEKSTPOORT (B26). G1/G2/G3 lees je uit `perReden` (de codes `g1:…`,
   * `g2:datum`, `g3:meta`); G6 uit `perReden['g6:lexicon']` PLUS de
   * `doelgroep:ongegrond:*`-codes in `afgewezenPerCode` — die helft van G6
   * wijst hard af en komt dus nooit langs de poort.
   */
  poort: {
    groen: number
    gedegradeerd: number
    /** Per controlecode het aantal gedegradeerde rijen. */
    perReden: Record<string, number>
  }
  /**
   * G4 — geduide rijen waarvan de kop NIET van de bron kwam. Hoort 0 te zijn
   * by construction (`kopBron` is een literal in het schema); we tellen 'm toch,
   * zodat drift zichtbaar wordt in plaats van aangenomen.
   */
  kopNietVanBron: number
  /**
   * G5 — geduide rijen waarvan de grondslag als modeltekst is gemarkeerd. Net
   * als G4 een literal in het schema, en om dezelfde reden geteld: "nooit
   * modeltekst" is een belofte, en een belofte die niemand meet is een aanname.
   */
  metModeltekst: number
  teruggetrokken: Record<TerugtrekReden, number>
  teruggetrokkenTotaal: number
  /** De poortmaat: teruggetrokken om een fout getal bij een rekenend mechanisme. */
  foutGetalRekenend: number
  afgewezenPerCode: Record<string, number>
  afgewezenTotaal: number
  wacht: number
  mislukt: number
  /** Aantal geduide artikelen zonder mechanisme (volledig, ook boven de lijst-cap). */
  zonderMechanismeTotaal: number
  /**
   * De titels daarvan — stuurt de groei van de catalogus. Afgekapt op
   * ZONDER_MECHANISME_MAX per week; het totaal staat in zonderMechanismeTotaal.
   */
  zonderMechanisme: Array<{ id: string; title: string; category: string | null }>
}

/** Bovengrens op de titellijst per week (de JSON blijft klein; het totaal telt wel alles). */
export const ZONDER_MECHANISME_MAX = 100

const ZONDER_CATEGORIE = 'zonder categorie'

function legeWeek(week: string): WeekMeting {
  return {
    week,
    binnen: 0,
    geduid: 0,
    metMechanisme: 0,
    dekking: null,
    rekenend: 0,
    mechanismeVervallen: 0,
    perCategorie: {},
    perGrondslag: { fragment: 0, kop: 0 },
    poort: { groen: 0, gedegradeerd: 0, perReden: {} },
    kopNietVanBron: 0,
    metModeltekst: 0,
    teruggetrokken: { 'fout-getal': 0, 'verkeerde-doelgroep': 0, 'verkeerd-mechanisme': 0, anders: 0 },
    teruggetrokkenTotaal: 0,
    foutGetalRekenend: 0,
    afgewezenPerCode: {},
    afgewezenTotaal: 0,
    wacht: 0,
    mislukt: 0,
    zonderMechanismeTotaal: 0,
    zonderMechanisme: [],
  }
}

function isTerugtrekReden(waarde: string | null): waarde is TerugtrekReden {
  return waarde !== null && (TERUGTREK_REDENEN as readonly string[]).includes(waarde)
}

function isGrondslagSoort(waarde: string | null): waarde is GrondslagSoort {
  return waarde !== null && (GRONDSLAG_SOORTEN as readonly string[]).includes(waarde)
}

/**
 * De K1-meting per week, nieuwste week eerst. Rijen worden op `id` ontdubbeld:
 * schuift een insert van de cron de sortering tijdens het pagineren door, dan
 * komt dezelfde rij op twee pagina's — die telt één keer.
 */
export function bouwDuidingMeting(rijen: readonly MetingRij[]): WeekMeting[] {
  const weken = new Map<string, WeekMeting>()
  const gezien = new Set<string>()

  for (const r of rijen) {
    if (gezien.has(r.id)) continue
    gezien.add(r.id)
    const moment = new Date(r.fetched_at)
    if (Number.isNaN(moment.getTime())) continue
    const key = amsterdamWeekKey(moment)
    let w = weken.get(key)
    if (!w) {
      w = legeWeek(key)
      weken.set(key, w)
    }
    w.binnen++

    const status = r.duiding_status
    if (status === 'wacht') {
      w.wacht++
      continue
    }
    if (status === 'mislukt') {
      w.mislukt++
      continue
    }
    if (status === 'afgewezen') {
      const code = r.duiding_fout ?? 'onbekend'
      w.afgewezenPerCode[code] = (w.afgewezenPerCode[code] ?? 0) + 1
      w.afgewezenTotaal++
      continue
    }
    if (status !== 'geduid' && status !== 'teruggetrokken') continue

    const mech = r.mechanisme !== null && isMechanismeId(r.mechanisme) ? r.mechanisme : null
    const rekent = mech !== null && MECHANISMEN[mech].rekent
    const cat = r.category ?? ZONDER_CATEGORIE

    w.geduid++
    const perCat = (w.perCategorie[cat] ??= { geduid: 0, metMechanisme: 0, dekking: null })
    perCat.geduid++
    if (mech) {
      w.metMechanisme++
      perCat.metMechanisme++
    } else {
      w.zonderMechanismeTotaal++
      if (w.zonderMechanisme.length < ZONDER_MECHANISME_MAX) {
        w.zonderMechanisme.push({ id: r.id, title: r.title, category: r.category })
      }
    }
    if (rekent) w.rekenend++
    if (r.duiding_fout) w.mechanismeVervallen++
    if (isGrondslagSoort(r.grondslag)) w.perGrondslag[r.grondslag]++
    if (r.kop_bron !== null && r.kop_bron !== 'bron') w.kopNietVanBron++
    if (r.modeltekst !== null && r.modeltekst !== 'false') w.metModeltekst++
    if (r.poort_status === 'gedegradeerd') {
      w.poort.gedegradeerd++
      const reden = r.poort_reden ?? 'onbekend'
      w.poort.perReden[reden] = (w.poort.perReden[reden] ?? 0) + 1
    } else if (r.poort_status === 'groen') {
      w.poort.groen++
    }

    if (status === 'teruggetrokken' && isTerugtrekReden(r.teruggetrokken_reden)) {
      w.teruggetrokken[r.teruggetrokken_reden]++
      w.teruggetrokkenTotaal++
      if (r.teruggetrokken_reden === 'fout-getal' && rekent) w.foutGetalRekenend++
    }
  }

  const aandeel = (deel: number, geheel: number) => (geheel > 0 ? deel / geheel : null)
  for (const w of weken.values()) {
    w.dekking = aandeel(w.metMechanisme, w.geduid)
    for (const c of Object.values(w.perCategorie)) c.dekking = aandeel(c.metMechanisme, c.geduid)
  }

  return [...weken.values()].sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0))
}

/** Aantal weken dat de meting standaard en maximaal teruggekijkt (120 dagen bewaren ≈ 17 weken). */
export const METING_WEKEN_STANDAARD = 8
export const METING_WEKEN_MAX = 17

// ── G7: de handmatige steekproef ─────────────────────────────────────────────
//
// G1–G6 zijn controles die de code zelf draait; G7 is een MENSELIJKE
// steekproef: beheer leest wekelijks 20 vrijgegeven samenvattingen na en telt
// hoeveel er niet door de beugel konden. De poort is gehaald bij hoogstens
// één fout per twintig, twee weken op rij.
//
// Daarom is dit een INVOER-/REGISTRATIEVORM en geen berekening: de cijfers
// kunnen niet uit de rijen worden afgeleid — ze zijn een oordeel. Wat hier
// wél wordt afgeleid is `g7Gehaald`: dat leest het register, telt niets op en
// bewaart geen stand.
//
// Opslag: één sleutel in `app_settings` (platformtabel, al VRIJ_LEESBAAR in de
// ADR 0146-gate — die gate wordt hiervoor dus NIET verruimd). Per ISO-week één
// rij met wie, wanneer, hoeveel gecontroleerd en hoeveel fout. Geen
// artikel-id's, geen tekst: alleen tellingen en de beheerder-id.

export const POORT_STEEKPROEF_KEY = 'krant_poort_steekproef'
/** De omvang van de steekproef die de poort vraagt. */
export const STEEKPROEF_OMVANG = 20
/** Hoogstens zoveel fouten per `STEEKPROEF_OMVANG` gecontroleerde samenvattingen. */
export const STEEKPROEF_MAX_FOUTEN = 1
/** Zoveel weken op rij moet dat lukken. */
export const STEEKPROEF_WEKEN_OP_RIJ = 2

const isoWeek = z.string().regex(/^\d{4}-W\d{2}$/, 'week moet de vorm 2026-W39 hebben')

/**
 * Eén geregistreerde steekproef: twee tellingen en het moment.
 *
 * GEEN `door`-veld, en dat is een privacykeuze (eindreview 1F fase 2, L2). Het
 * register leeft in `app_settings` onder een sleutel ZONDER uuid, en de
 * SELECT-policy van die tabel geeft zulke sleutels vrij aan elke
 * `authenticated` rol — niet alleen aan beheer. De beheerder-id zou daarmee
 * voor iedere ingelogde gebruiker leesbaar zijn. Wie de steekproef vastlegde
 * staat waar het hoort: in `admin_actions_log` (`nieuws.duiding.steekproef`),
 * dat alleen beheer leest.
 */
export const steekproefRegelSchema = z.strictObject({
  gecontroleerd: z.number().int().min(0).max(500),
  fouten: z.number().int().min(0).max(500),
  op: z.string(),
})
export type SteekproefRegel = z.infer<typeof steekproefRegelSchema>

/** Het hele register zoals het in `app_settings.value` staat. */
export const steekproefRegisterSchema = z.record(isoWeek, steekproefRegelSchema)
export type SteekproefRegister = z.infer<typeof steekproefRegisterSchema>

/** POST /api/admin/news-duiding/steekproef — beheer legt één week vast. */
export const steekproefBodySchema = z
  .strictObject({
    week: isoWeek,
    gecontroleerd: z.number().int().min(1).max(500),
    fouten: z.number().int().min(0).max(500),
  })
  .refine((b) => b.fouten <= b.gecontroleerd, {
    message: 'Er kunnen niet meer fouten zijn dan gecontroleerde samenvattingen',
    path: ['fouten'],
  })
export type SteekproefBody = z.infer<typeof steekproefBodySchema>

/**
 * De formulier-uitlegnorm van deze repo (keuze · effect · waarom) voor het
 * G7-invoerformulier, in dezelfde vorm als `BRON_SOORT_UITLEG` in
 * lib/news-sources.ts. Hier omdat het contract van het veld hier woont: wie de
 * grens verandert (`STEEKPROEF_OMVANG`, `STEEKPROEF_MAX_FOUTEN`) leest deze
 * tekst ernaast en past 'm in dezelfde stap aan.
 */
export const STEEKPROEF_VELD_UITLEG: Record<keyof SteekproefBody, { label: string; effect: string; waarom: string }> = {
  week: {
    label: 'Week',
    effect: 'De telling landt op deze week. Een tweede invoer voor dezelfde week vervangt de eerste — dat is de correctie.',
    waarom: 'Kies de week waarvan je de vrijgegeven samenvattingen hebt nagelezen; meestal de vorige hele week.',
  },
  gecontroleerd: {
    label: 'Nagelezen',
    effect: `Hoeveel vrijgegeven samenvattingen je hebt gelezen. Onder de ${STEEKPROEF_OMVANG} telt de week niet mee voor de poort.`,
    waarom: `${STEEKPROEF_OMVANG} is de omvang die de poort vraagt. Lees er meer na als een week er vreemd uitziet — meer mag, minder telt niet.`,
  },
  fouten: {
    label: 'Fout',
    effect: `Hoeveel daarvan iets beweerden dat niet in de bron staat. Bij hoogstens ${STEEKPROEF_MAX_FOUTEN} telt de week als gehaald.`,
    waarom: 'Dit is het enige cijfer dat niet uit de code komt: G1 tot en met G6 draait de app zelf, G7 is jouw oordeel.',
  },
}

/**
 * Lees het register uit `app_settings.value` (string of al geparsed). Wat niet
 * parst, is leeg — fail-closed: een kapotte waarde mag nooit als "gehaald"
 * gelden, en hij overschrijft niets (de route doet read-modify-write op wat
 * hier uitkomt).
 */
export function leesSteekproefRegister(ruw: unknown): SteekproefRegister {
  let waarde = ruw
  if (typeof waarde === 'string') {
    try {
      waarde = JSON.parse(waarde)
    } catch {
      return {}
    }
  }
  const parsed = steekproefRegisterSchema.safeParse(waarde ?? {})
  return parsed.success ? parsed.data : {}
}

/** Haalt één week de norm (≥ STEEKPROEF_OMVANG gecontroleerd, ≤ STEEKPROEF_MAX_FOUTEN fout)? */
export function steekproefWeekGehaald(regel: SteekproefRegel | undefined): boolean {
  if (!regel) return false
  return regel.gecontroleerd >= STEEKPROEF_OMVANG && regel.fouten <= STEEKPROEF_MAX_FOUTEN
}

/**
 * Is G7 gehaald? Afgeleid uit het register, over de weken die de meting toont
 * (nieuwste eerst). Twee AANEENGESLOTEN weken uit die reeks moeten beide de
 * norm halen — geen opgetelde teller, geen bewaarde stand.
 */
export function g7Gehaald(register: SteekproefRegister, wekenNieuwsteEerst: readonly string[]): boolean {
  for (let i = 0; i + STEEKPROEF_WEKEN_OP_RIJ <= wekenNieuwsteEerst.length; i++) {
    const reeks = wekenNieuwsteEerst.slice(i, i + STEEKPROEF_WEKEN_OP_RIJ)
    if (reeks.every((week) => steekproefWeekGehaald(register[week]))) return true
  }
  return false
}
