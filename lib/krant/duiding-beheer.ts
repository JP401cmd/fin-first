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
//      `fetched_at` en de mechanisme-soort/brontekst uit de jsonb. De duiding
//      zelf (modeluitvoer) levert nooit een getal aan de meting — alleen of er
//      een mechanisme IS en welke soort; of die soort rekent, komt uit de
//      catalogus in code (`MECHANISMEN[id].rekent`).
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
  TERUGTREK_REDENEN,
  type DuidingStatus,
  type TerugtrekReden,
  type DuidingSoort,
  type Deadline,
  type BrontekstSoort,
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
  samenvatting: string
  mechanisme: {
    id: MechanismeId
    label: string
    rekent: boolean
    drempel: string | null
    params: ParamWeergave[]
  } | null
  brontekst: BrontekstSoort
  tekens: number
  model: string
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
      brontekst: d.meta.brontekst,
      tekens: d.meta.tekens,
      model: d.meta.model,
    },
  }
}

// ── Meting ───────────────────────────────────────────────────────────────────

/** De kolommen die de meting leest — geen modeltekst, geen params. */
export const METING_KOLOMMEN =
  'id, title, category, fetched_at, duiding_status, duiding_fout, teruggetrokken_reden, mechanisme:duiding->mechanisme->>soort, brontekst:duiding->meta->>brontekst'

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
  /** `duiding->meta->>brontekst` */
  brontekst: string | null
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
  perBrontekst: Record<BrontekstSoort, number>
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
    perBrontekst: { teaser: 0, volledig: 0 },
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
    if (r.brontekst === 'teaser' || r.brontekst === 'volledig') w.perBrontekst[r.brontekst]++

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
