// ── De AI-laag op de tijdlijn: alles wat géén modelcall is (Krant 1E) ────────
//
// ADR 0190, besluiten eigenaar 29-09-2026 (K1–K9). De Krant met AI is dezelfde
// tijdlijnverversing als de Krant zonder AI, met één extra stap: een model
// schrijft per matcherbericht een eigen toelichting en mag hoogstens drie
// berichten toevoegen uit een kleine set kandidaten die de matcher níet koos.
// Deze module is die stap MIN de modelcall — PUUR en volledig getest zonder
// model:
//
//   kiesAiKandidaten   welke niet-gekozen artikelen het model mag toevoegen (K3)
//   bouwAiLaagInvoer   de gesaneerde invoer: berichten, kandidaten, lezer (K3/K4)
//   aiLaagSchema       het zod-schema met een artikelId-ENUM per aanroep (K3)
//   valideerAiUitvoer  de grondingstoets per bericht: id in de aangeleverde set,
//                      uniek, tekst aanwezig (K3) — per bericht, niet per antwoord
//   toetsAiTekst       de guards per tekst: nummer-guard (ook datums), Wft-lijst,
//                      koopmetafoor, geen Fin, lengte (K4, K9)
//   verwerkAiUitvoer   het geheel → de te schrijven berichten + de tellers
//
// DE SERVER BLIJFT DE AUTEUR VAN DE FEITEN (K3): id, URL, bron, kop en datum van
// elk bericht komen altijd uit de bronrij, nooit uit het model; het model levert
// per bericht alleen een artikelId uit de AANGELEVERDE set plus tekst. Het model
// laat niets weg (elk matcherbericht blijft staan, met of zonder toelichting) en
// ordent niets (de volgorde is die van de matcher; toevoegingen komen erachter in
// kandidaatvolgorde).
//
// TERUGVAL PER TEKST (K4): faalt een tekst een guard, dan vervalt alléén die
// AI-tekst; de matcherregel blijft staan. Een toegevoegd bericht heeft geen
// matcherregel — vervalt zijn tekst, dan vervalt het bericht.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets. Het toetst dat de AI-tekst
// alleen getallen noemt die al in de duiding, de matcherregel of de gesaneerde
// lezerscontext staan, en weert de woorden van de tijdvertaling (Wft-lijst).

import { z } from 'zod'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { datumTokens, isNumericGrounded, numericUnitPairs, numericValueSet, zonderDatums } from '@/lib/nummer-grond'
import type { DuidingSoort, DuidingV1 } from './duiding-schema'
import type { SchrijfItem } from './editie-schrijver'
import { voldoetAanLeescontract, type EditieItem, type EditieUitkomst, type KandidaatArtikel, type MatchContext } from './matcher'
import { profielWaarde, type NieuwsprofielV1 } from './profiel'
import { DOELGROEP_SLEUTEL_LIJST } from './profiel-velden'
import { vindWftOvertreding } from './wft-woordenlijst'

// ── Grenzen (K3, K5) ─────────────────────────────────────────────────────────
// Eén bron voor server en scherm: lib/krant/ai-laag-grenzen.ts (eindreview Y7).

import {
  AI_LAAG_MAX_KANDIDATEN,
  AI_LAAG_MAX_PER_WEEK,
  AI_LAAG_MAX_TOEVOEGINGEN,
  AI_TEKST_MAX_TEKENS,
  AI_TEKST_MAX_ZINNEN,
} from './ai-laag-grenzen'
export {
  AI_LAAG_MAX_KANDIDATEN,
  AI_LAAG_MAX_PER_WEEK,
  AI_LAAG_MAX_TOEVOEGINGEN,
  AI_LAAG_QUOTUM_DAGEN,
  AI_TEKST_MAX_TEKENS,
  AI_TEKST_MAX_ZINNEN,
} from './ai-laag-grenzen'

/**
 * Het model voegt alleen berichten toe van een soort die de matcher ook als
 * "Over jouw situatie" mag tonen (B37, eindreview H1): besloten, voorstel,
 * achtergrond. Nooit markt, cijfers of verwachtingen — een koers of prognose aan
 * jouw situatie koppelen is de Wft-grens.
 */
export const AI_KANDIDAAT_SOORTEN: ReadonlySet<DuidingSoort> = new Set<DuidingSoort>(['besloten', 'voorstel', 'achtergrond'])

// ── Uitkomst en tellers ──────────────────────────────────────────────────────

/**
 * Wat de AI-laag bij één verversing deed — kolom krant_edities.ai_uitkomst.
 * 'met-ai' = het model antwoordde bruikbaar: ≥ 1 AI-tekst bleef staan, óf een
 * schoon leeg antwoord ("niets toe te voegen" is een goed antwoord, eindreview
 * Y4). 'teruggevallen' = aangeroepen, maar een fout, een onbruikbaar antwoord of
 * alle teksten afgewezen.
 */
export const AI_UITKOMSTEN = ['met-ai', 'teruggevallen', 'quotum', 'geweigerd', 'leeg'] as const
export type AiUitkomst = (typeof AI_UITKOMSTEN)[number]

/** De uitkomsten waarbij het model écht is aangeroepen — die tellen voor het quotum (K5). */
export const AI_AANROEP_UITKOMSTEN: readonly AiUitkomst[] = ['met-ai', 'teruggevallen']

/** Zit deze lezer aan zijn quotum? `aanroepen` = met-ai + teruggevallen in het venster. */
export function quotumOp(aanroepen: number): boolean {
  return aanroepen >= AI_LAAG_MAX_PER_WEEK
}

/** Tellingen per verversing — alleen aantallen, nooit tekst (ADR 0146). */
export interface AiLaagTellers {
  /** AI-teksten die vervielen op een getal of datum zonder grond. */
  getallenTegengehouden: number
  /** AI-teksten die vervielen op de Wft-lijst, de koopmetafoor of een naam. */
  wftTegengehouden: number
  /** AI-teksten die vervielen op vorm: id buiten de set, dubbel, leeg, te lang. */
  schemaTegengehouden: number
  /** Toelichtingen op matcherberichten die bleven staan. */
  toelichtingen: number
  /** Door het model toegevoegde berichten die bleven staan. */
  toevoegingen: number
  /** Matcherberichten zonder AI-toelichting (het model gaf niets, of zijn tekst viel af). */
  terugvalBericht: number
  /** 1 als de hele laag terugviel (onbruikbaar antwoord, modelfout, of niets bleef staan). */
  terugvalLaag: number
}

export function legeTellers(): AiLaagTellers {
  return {
    getallenTegengehouden: 0,
    wftTegengehouden: 0,
    schemaTegengehouden: 0,
    toelichtingen: 0,
    toevoegingen: 0,
    terugvalBericht: 0,
    terugvalLaag: 0,
  }
}

// ── K3: de kandidaten die de matcher níet koos ───────────────────────────────

export type AiKandidaat = KandidaatArtikel & { duiding: DuidingV1 }

function tijd(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}

/**
 * Hoogstens AI_LAAG_MAX_KANDIDATEN artikelen die de matcher níet koos: geduid,
 * binnen het venster volgens het leescontract (`voldoetAanLeescontract` met de
 * context van déze verversing — "gezien" is de eigen tijdlijn), nog niet in de
 * tijdlijn, niet ergens anders in deze verversing (bericht, katern, Achtergrond),
 * niet in een rubriek waarvan de lezer "minder" zei, en van een soort die de
 * matcher persoonlijk mag maken (AI_KANDIDAAT_SOORTEN). Op recency: nieuwste
 * publicatie eerst, dan het recentst opgehaald, dan het id (deterministisch).
 */
export function kiesAiKandidaten(artikelen: readonly KandidaatArtikel[], uitkomst: EditieUitkomst, ctx: MatchContext): AiKandidaat[] {
  const gekozen = new Set<string>([
    ...uitkomst.items.map((i) => i.artikelId),
    ...uitkomst.algemeen.items.map((i) => i.artikelId),
    ...(uitkomst.algemeen.achtergrond?.items.map((i) => i.artikelId) ?? []),
  ])
  return artikelen
    .filter((a): a is AiKandidaat => voldoetAanLeescontract(a, ctx))
    .filter((a) => !gekozen.has(a.id))
    .filter((a) => !(a.category != null && ctx.gedemptRubrieken.has(a.category)))
    .filter((a) => AI_KANDIDAAT_SOORTEN.has(a.duiding.soort))
    .sort((a, b) => tijd(b.published_at) - tijd(a.published_at) || tijd(b.fetched_at) - tijd(a.fetched_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, AI_LAAG_MAX_KANDIDATEN)
}

// ── K3/K4: de invoer voor het model — gesaneerd ──────────────────────────────

export interface AiBerichtInvoer {
  artikelId: string
  titel: string
  rubriek: string | null
  soort: DuidingSoort | null
  samenvatting: string | null
  /** De regel voor jou van de matcher (geattesteerd sjabloon). */
  regel: string
}

export interface AiKandidaatInvoer {
  artikelId: string
  titel: string
  rubriek: string | null
  soort: DuidingSoort
  samenvatting: string | null
}

export interface AiLaagInvoer {
  berichten: AiBerichtInvoer[]
  kandidaten: AiKandidaatInvoer[]
  /** De lezer in banden: één regel per bekend profielveld. Geen bedragen, geen namen. */
  lezer: string[]
}

/** Leeftijdsklasse in plaats van het geboortejaar (dataminimalisatie). */
export function leeftijdsklasse(geboortejaar: number | null, peiljaar: number): string | null {
  if (geboortejaar == null) return null
  const leeftijd = peiljaar - geboortejaar
  if (leeftijd < 25) return 'jonger dan 25'
  if (leeftijd < 35) return '25 tot 35'
  if (leeftijd < 50) return '35 tot 50'
  if (leeftijd < 67) return '50 tot 67'
  return '67 of ouder'
}

/**
 * Het nieuwsprofiel als regels "veld: waarde". Alleen de bandsleutels uit het
 * gesloten vocabulaire (lib/krant/profiel-velden.ts) — nooit een bedrag, een naam
 * of een datum; het geboortejaar wordt een leeftijdsklasse. Een onbekend veld
 * (null) laten we weg: "weet ik niet" is geen eigenschap van de lezer.
 */
export function lezerRegels(profiel: NieuwsprofielV1, peiljaar: number): string[] {
  const regels: string[] = []
  for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
    if (sleutel === 'geboortejaar') {
      const klasse = leeftijdsklasse(profiel.geboortejaar, peiljaar)
      if (klasse) regels.push(`leeftijd: ${klasse}`)
      continue
    }
    const waarde = profielWaarde(profiel, sleutel)
    if (waarde == null) continue
    const tekst = Array.isArray(waarde) ? (waarde as readonly string[]).join(', ') : String(waarde)
    if (tekst.length > 0) regels.push(`${sleutel}: ${tekst}`)
  }
  return regels
}

/** Eén regel zonder regeleindes: een bronkop kan zo nooit een eigen promptregel worden. */
function eenRegel(tekst: string | null | undefined, max = 600): string | null {
  if (tekst == null) return null
  const schoon = tekst.replace(/\s+/g, ' ').trim().slice(0, max)
  return schoon.length > 0 ? schoon : null
}

/**
 * De invoer voor het model. ELK tekstveld gaat door `sanitizeForAI`, maar niet
 * met dezelfde opties (eindreview G2):
 *   · OPENBARE velden van derden (bronkop, samenvatting) zonder de naam en de
 *     geboortedatum van de lezer. Anders verminkt een kop die toevallig een
 *     naamdeel van de lezer bevat, en is de naam af te lezen door de prompt
 *     naast de openbare kop te leggen. IBAN, e-mail, telefoon en adres gaan er
 *     wel uit.
 *   · De REGEL voor jou en de LEZER-regels mét naam en geboortedatum.
 * In de regel wordt het exacte geboortejaar (bv. sjabloon direct-aow "Voor wie
 * in {geboortejaar} is geboren…") vervangen door "[je geboortejaar]" (G1): de
 * leeftijdsklasse staat al in de LEZER-regels, en een jaartal of bandgrens in
 * de regel zou anders als grond voor getallen gaan tellen. De catalogus zelf
 * blijft ongemoeid. Dezelfde gesaneerde tekst is daarna de
 * grondslag van de nummer-guard.
 */
export function bouwAiLaagInvoer(
  items: readonly EditieItem[],
  kandidaten: readonly AiKandidaat[],
  profiel: NieuwsprofielV1,
  peiljaar: number,
  sanitize: SanitizeOptions,
  soortVan: (artikelId: string) => DuidingSoort | null,
): AiLaagInvoer {
  const openbaar = (t: string | null) => (t == null ? null : sanitizeForAI(t))
  const persoonlijk = (t: string | null) => (t == null ? null : sanitizeForAI(t, sanitize))
  const zonderGeboortejaar = (t: string | null) =>
    t == null || profiel.geboortejaar == null
      ? t
      : t.replace(new RegExp(`\\b${profiel.geboortejaar}\\b`, 'g'), '[je geboortejaar]')
  return {
    berichten: items.map((i) => ({
      artikelId: i.artikelId,
      titel: openbaar(eenRegel(i.titel, 300)) ?? '',
      rubriek: i.rubriek,
      soort: soortVan(i.artikelId),
      samenvatting: openbaar(eenRegel(i.samenvatting)),
      regel: persoonlijk(zonderGeboortejaar(eenRegel(i.tekst, 800))) ?? '',
    })),
    kandidaten: kandidaten.map((k) => ({
      artikelId: k.id,
      titel: openbaar(eenRegel(k.title, 300)) ?? '',
      rubriek: k.category,
      soort: k.duiding.soort,
      samenvatting: openbaar(eenRegel(schoneSamenvatting(k.duiding.samenvatting))),
    })),
    lezer: lezerRegels(profiel, peiljaar).map((r) => persoonlijk(r) ?? ''),
  }
}

/** Zoals de matcher: een samenvatting die de Wft-lijst raakt, wordt niet getoond (en niet aangeleverd). */
export function schoneSamenvatting(samenvatting: string | null): string | null {
  if (!samenvatting) return null
  return vindWftOvertreding(samenvatting) ? null : samenvatting
}

/**
 * De grondslag van de nummer-guard voor één bericht (K4): de duiding van dat
 * artikel (heel, als JSON — incl. parameters, grond-citaten, ingangsdatum en
 * deadline) en de aangeleverde (gesaneerde) regel en samenvatting. Bewust per
 * BERICHT: een getal uit een ánder bericht gront deze tekst niet. De
 * LEZER-banden gronden bewust NIETS (eindreview G7): een bandgrens ("35 tot
 * 50", "50k-100k") is geen uitspraak die het model mag herhalen als getal, en
 * zou anders in élk bericht als gegrond tellen.
 */
export function grondVoor(artikelId: string, invoer: AiLaagInvoer, duiding: DuidingV1 | null): string {
  const b = invoer.berichten.find((x) => x.artikelId === artikelId)
  const k = invoer.kandidaten.find((x) => x.artikelId === artikelId)
  const delen: string[] = []
  if (b) delen.push(b.titel, b.samenvatting ?? '', b.regel)
  if (k) delen.push(k.titel, k.samenvatting ?? '')
  if (duiding) {
    delen.push(JSON.stringify({ ...duiding, meta: undefined }))
    if (duiding.ingangsdatum) delen.push(duiding.ingangsdatum)
    if (duiding.deadline) delen.push(duiding.deadline.datum)
  }
  return delen.filter((d) => d.length > 0).join('\n')
}

// ── K3: het schema, met een enum per aanroep ─────────────────────────────────

const TEKST_BESCHRIJVING = `Hoogstens ${AI_TEKST_MAX_ZINNEN} zinnen in het Nederlands: wat dit bericht voor deze lezer betekent. Alleen bedragen in euro die in de invoer staan; niets uitrekenen.`

function enumVan(ids: readonly string[]) {
  return z.enum(ids as unknown as [string, ...string[]])
}

/**
 * Het schema dat het model krijgt. `artikelId` is een ENUM van precies de
 * aangeleverde id's — een id buiten de set is een schemabreuk, geen tekst. Een
 * lijst zonder ids laten we weg (een lege enum bestaat niet); beide lijsten zijn
 * optioneel (niets zeggen is een geldig antwoord). Bewust GEEN
 * min/max in het schema: een overschrijding mag niet het hele antwoord kosten
 * (de server begrenst, `verwerkAiUitvoer`).
 */
export function aiLaagSchema(berichtIds: readonly string[], kandidaatIds: readonly string[]) {
  const vorm: Record<string, z.ZodTypeAny> = {}
  if (berichtIds.length > 0) {
    vorm.toelichtingen = z
      .array(z.object({ artikelId: enumVan(berichtIds), tekst: z.string().describe(TEKST_BESCHRIJVING) }))
      .optional()
      .describe('Per bericht uit BERICHTEN één toelichting. Sla geen bericht over als je iets zinnigs kunt zeggen; liever niets dan iets verzonnen.')
  }
  if (kandidaatIds.length > 0) {
    vorm.toevoegingen = z
      .array(z.object({ artikelId: enumVan(kandidaatIds), tekst: z.string().describe(TEKST_BESCHRIJVING) }))
      .optional()
      .describe(`Hoogstens ${AI_LAAG_MAX_TOEVOEGINGEN} berichten uit KANDIDATEN die deze lezer duidelijk raken, elk met een toelichting. Leeg mag.`)
  }
  return z.object(vorm)
}

// ── K3: de grondingstoets — per bericht, niet per antwoord ───────────────────

export interface GevalideerdeUitvoer {
  /** artikelId → tekst, alleen voor id's uit de berichten. */
  toelichtingen: Map<string, string>
  /** In de volgorde van het model; de server ordent ze later op kandidaatvolgorde. */
  toevoegingen: Array<{ artikelId: string; tekst: string }>
  /** Onderdelen die de vorm niet haalden (id buiten de set, dubbel, geen tekst). */
  geweigerd: number
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Leest een modelantwoord ONDERDEEL VOOR ONDERDEEL. Een id buiten de
 * aangeleverde set (ook: een kandidaat-id in de toelichtingen of andersom), een
 * tweede tekst voor hetzelfde id of een lege tekst weigert alleen dát onderdeel.
 * Geen object = onbruikbaar (null): dan valt de hele laag terug.
 */
export function valideerAiUitvoer(
  ruw: unknown,
  set: { berichten: ReadonlySet<string>; kandidaten: ReadonlySet<string> },
): GevalideerdeUitvoer | null {
  if (!isObject(ruw)) return null
  const uit: GevalideerdeUitvoer = { toelichtingen: new Map(), toevoegingen: [], geweigerd: 0 }
  const gezienToevoeging = new Set<string>()

  const lees = (lijst: unknown, toegestaan: ReadonlySet<string>, neem: (id: string, tekst: string) => boolean) => {
    if (lijst === undefined) return
    if (!Array.isArray(lijst)) {
      uit.geweigerd++
      return
    }
    for (const el of lijst) {
      if (!isObject(el) || typeof el.artikelId !== 'string' || typeof el.tekst !== 'string' || !toegestaan.has(el.artikelId) || el.tekst.trim().length === 0) {
        uit.geweigerd++
        continue
      }
      if (!neem(el.artikelId, el.tekst)) uit.geweigerd++
    }
  }

  lees(ruw.toelichtingen, set.berichten, (id, tekst) => {
    if (uit.toelichtingen.has(id)) return false
    uit.toelichtingen.set(id, tekst)
    return true
  })
  lees(ruw.toevoegingen, set.kandidaten, (id, tekst) => {
    // G4: een id dat óók een matcherbericht is, is nooit een toevoeging.
    if (set.berichten.has(id)) return false
    if (gezienToevoeging.has(id)) return false
    gezienToevoeging.add(id)
    uit.toevoegingen.push({ artikelId: id, tekst })
    return true
  })
  return uit
}

// ── K4/K9: de guards per tekst ───────────────────────────────────────────────

export type AfwijsReden = 'lengte' | 'getal' | 'datum' | 'wft' | 'metafoor' | 'naam' | 'link'

/**
 * G3: geen link, domeinnaam of e-mailadres in een AI-tekst. Een bronkop of
 * samenvatting van derden kan een instructie of URL dragen; het model mag die
 * nooit doorgeven — de link naar de bron zet de server zelf uit de bronrij.
 */
export const LINK: readonly RegExp[] = [/https?:/i, /\bwww\./i, /\b[\w-]+\.(nl|com|eu|org|net)\b/i, /@/]

/**
 * G6: de prompt verbiedt "kies" en "doe"; de Wft-lijst vangt "kies" alleen als
 * "kies voor/een" en "doe" alleen als "doe er goed aan". Voor AI-tekst geldt de
 * strengere vorm — de Wft-lijst zelf blijft ongewijzigd (zij toetst ook de
 * geattesteerde catalogus).
 */
export const AI_EXTRA_AANSPORING: readonly RegExp[] = [/\bkies\b/i, /(^|[.!?:;]\s+)doe\b/i, /\boverweeg\b/i]

/**
 * De koop-/verkoopmetafoor (ADR 0165): nooit "vrijkopen", "terugkopen",
 * "gekochte of verkochte tijd". De Wft-lijst vangt "koop"/"verkoop" als
 * gebiedende wijs al; dit zijn de samenstellingen die daar doorheen glippen.
 */
export const KOOPMETAFOOR: readonly RegExp[] = [
  /\b(vrij|terug)(ge)?(kopen|koopt|koop|kocht|kochten|kochte)\b/i,
  /\b(ge|ver)?kochte (tijd|vrijheid|levenstijd)\b/i,
  /\b(tijd|vrijheid) (terug|vrij)?kopen\b/i,
]

/** K9: geen naam van de assistent in de Krant. Hoofdlettergevoelig ("fin" als woorddeel telt niet). */
export const ASSISTENTNAAM = /\bFin\b/

/** Tel zinnen: een punt, uitroep- of vraagteken gevolgd door witruimte of het einde. "€ 1.250" telt niet. */
export function telZinnen(tekst: string): number {
  const eindes = tekst.match(/[.!?]+(?=\s|$)/g)
  return Math.max(1, eindes?.length ?? 0)
}

/**
 * Toetst één AI-tekst tegen zijn grondslag. Volgorde: vorm → Wft/metafoor/naam
 * → datums → getallen. Elk getal moet in DEZELFDE eenheid in de grondslag staan
 * (een bedrag nooit op een kaal jaartal; `kaalStreng`: een kaal getal alleen op
 * een kaal getal); elke datum moet als datum in de grondslag staan. Het model
 * rekent dus niets: een som of een omrekening heeft geen grond en valt af.
 */
export function toetsAiTekst(tekst: string, grond: string): { ok: true; tekst: string } | { ok: false; reden: AfwijsReden } {
  const schoon = tekst.replace(/\s+/g, ' ').trim()
  if (schoon.length === 0 || schoon.length > AI_TEKST_MAX_TEKENS || telZinnen(schoon) > AI_TEKST_MAX_ZINNEN) return { ok: false, reden: 'lengte' }
  if (vindWftOvertreding(schoon) || AI_EXTRA_AANSPORING.some((re) => re.test(schoon))) return { ok: false, reden: 'wft' }
  if (LINK.some((re) => re.test(schoon))) return { ok: false, reden: 'link' }
  if (KOOPMETAFOOR.some((re) => re.test(schoon))) return { ok: false, reden: 'metafoor' }
  if (ASSISTENTNAAM.test(schoon)) return { ok: false, reden: 'naam' }

  const grondDatums = new Set(datumTokens(grond).map((d) => d.iso))
  for (const d of datumTokens(schoon)) if (!grondDatums.has(d.iso)) return { ok: false, reden: 'datum' }

  const gegrond = numericValueSet(grond)
  for (const { value, unit } of numericUnitPairs(zonderDatums(schoon))) {
    if (!isNumericGrounded(gegrond, value, unit, { kaalStreng: true })) return { ok: false, reden: 'getal' }
  }
  return { ok: true, tekst: schoon }
}

// ── Het geheel ───────────────────────────────────────────────────────────────

/** Een bericht dat het MODEL koos: alle feiten uit de bronrij, alleen de tekst van het model. */
export function toegevoegdItem(a: AiKandidaat, tekst: string): SchrijfItem {
  return {
    artikelId: a.id,
    titel: a.title,
    rubriek: a.category,
    bron: a.source_name,
    url: a.source_url,
    gepubliceerd: a.published_at,
    vorm: 'ai',
    score: 1,
    mechanisme: null,
    impact: null,
    sjabloonId: 'ai-toegevoegd',
    variant: 0,
    slots: {},
    tekst: '',
    deadline: null,
    watMist: [],
    waarom: ['ai:toegevoegd'],
    samenvatting: schoneSamenvatting(a.duiding.samenvatting),
    aiTekst: tekst,
    aiToegevoegd: true,
  }
}

export interface VerwerkteAiLaag {
  items: SchrijfItem[]
  tellers: AiLaagTellers
  /** true als er minstens één AI-tekst bleef staan. */
  metAi: boolean
  /**
   * true als het model schoon "niets toe te voegen" antwoordde: een geldig
   * object, geen enkele toelichting of toevoeging aangeboden, niets geweigerd.
   * Dat is geen terugval (eindreview Y4) — de call telt wel.
   */
  schoonLeeg: boolean
}

function telAfwijzing(t: AiLaagTellers, reden: AfwijsReden): void {
  if (reden === 'getal' || reden === 'datum') t.getallenTegengehouden++
  else if (reden === 'lengte' || reden === 'link') t.schemaTegengehouden++
  else t.wftTegengehouden++
}

/**
 * Van modelantwoord naar te schrijven berichten: grondingstoets → guards per
 * tekst → hoogstens AI_LAAG_MAX_TOEVOEGINGEN toevoegingen (in kandidaatvolgorde,
 * niet in modelvolgorde) → PII-masker. Een onbruikbaar antwoord geeft de
 * matcherberichten ongewijzigd terug met `terugvalLaag = 1`.
 */
export function verwerkAiUitvoer(args: {
  ruw: unknown
  items: readonly EditieItem[]
  kandidaten: readonly AiKandidaat[]
  invoer: AiLaagInvoer
  duidingVan: (artikelId: string) => DuidingV1 | null
}): VerwerkteAiLaag {
  const { items, kandidaten, invoer } = args
  const tellers = legeTellers()
  const set = {
    berichten: new Set(items.map((i) => i.artikelId)),
    kandidaten: new Set(kandidaten.map((k) => k.id)),
  }
  const gevalideerd = valideerAiUitvoer(args.ruw, set)
  if (!gevalideerd) {
    tellers.terugvalLaag = 1
    tellers.terugvalBericht = items.length
    return { items: [...items], tellers, metAi: false, schoonLeeg: false }
  }
  const aangeboden = gevalideerd.toelichtingen.size + gevalideerd.toevoegingen.length + gevalideerd.geweigerd
  tellers.schemaTegengehouden += gevalideerd.geweigerd

  const toets = (artikelId: string, tekst: string): string | null => {
    const uit = toetsAiTekst(tekst, grondVoor(artikelId, invoer, args.duidingVan(artikelId)))
    if (!uit.ok) {
      telAfwijzing(tellers, uit.reden)
      return null
    }
    return maskPIIInOutput(uit.tekst)
  }

  const berichten: SchrijfItem[] = items.map((item) => {
    const ruweTekst = gevalideerd.toelichtingen.get(item.artikelId)
    const tekst = ruweTekst == null ? null : toets(item.artikelId, ruweTekst)
    if (tekst == null) {
      tellers.terugvalBericht++
      return item
    }
    tellers.toelichtingen++
    return { ...item, aiTekst: tekst }
  })

  const volgorde = new Map(kandidaten.map((k, i) => [k.id, i]))
  const perId = new Map(kandidaten.map((k) => [k.id, k]))
  const goedgekeurd = gevalideerd.toevoegingen
    .map((t) => ({ artikelId: t.artikelId, tekst: toets(t.artikelId, t.tekst) }))
    .filter((t): t is { artikelId: string; tekst: string } => t.tekst != null)
    .sort((a, b) => (volgorde.get(a.artikelId) ?? 0) - (volgorde.get(b.artikelId) ?? 0))
  tellers.schemaTegengehouden += Math.max(0, goedgekeurd.length - AI_LAAG_MAX_TOEVOEGINGEN)
  const toegevoegd = goedgekeurd.slice(0, AI_LAAG_MAX_TOEVOEGINGEN).map((t) => toegevoegdItem(perId.get(t.artikelId)!, t.tekst))
  tellers.toevoegingen = toegevoegd.length

  const metAi = tellers.toelichtingen + tellers.toevoegingen > 0
  const schoonLeeg = !metAi && aangeboden === 0
  if (!metAi && !schoonLeeg) tellers.terugvalLaag = 1
  return { items: [...berichten, ...toegevoegd], tellers, metAi, schoonLeeg }
}
