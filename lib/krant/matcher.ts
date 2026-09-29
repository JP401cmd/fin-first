// ── De matcher: van geduide artikelen en een profiel naar een editie ─────────
//
// Puur en deterministisch: alles wat de uitkomst beïnvloedt komt via
// `MatchContext` binnen (tijd, gezien, gedempt, parameters). Geen Date.now(),
// geen Math.random(); ties sorteren op artikel-id, de sjabloonvariant is een
// hash van het artikel-id. Zelfde profiel + artikelen + context + versie =
// byte-dezelfde editie (matcher.golden.test.ts).
//
// Zeven stappen:
//   1. LEESCONTRACT (1A, ADR 0171): alleen `duiding_status = 'geduid'`,
//      `category` als rubriek, `fetched_at` binnen het venster óf een
//      deadline in de toekomst; gezien telt niet.
//   2. DOELGROEP: elke regel van de duiding toetst ja/nee/onbekend op het
//      profiel. Eén "nee" = weg. "Onbekend" laat het artikel door en noteert
//      het veld onder `watMist`.
//   3. IMPACT: berekenImpact op de bandranden (impact.ts).
//   4. VORM + SCORE: direct/gevoeligheid uit de impact, anders relevant;
//      score 1–5 op de ONDERGRENS per maand (de tabel hieronder). Relevant
//      telt als GERICHT bij een bevestigde doelgroep óf een thema dat dit
//      profiel raakt (B35, `lib/krant/themas.ts`); thema's sluiten nooit iets
//      uit, ze maken een artikel alleen persoonlijk.
//   5. BIJSTELLING: deadline in de toekomst +1, rubriek uit de voorkeur +1
//      (max 5) — alleen bij een BEVESTIGDE doelgroep (geen regel onbekend);
//      een gedempte rubriek ("minder", demotedCategories) haalt de editie
//      alleen met 4 of 5; beursbeweging nooit boven 2.
//   6. SELECTIE: drempel 3; direct eerst, dan score, dan artikel-id; hoogstens
//      RUBRIEK_MAX per rubriek tenzij er anders te weinig is; EDITIE_MAX.
//   7. RENDER: het sjabloon met gevulde slots; wat overblijft en niet gezien
//      is, vult het algemene katern (B7, gelabeld) — op recency en id, bewust
//      LOS van `is_used`/`potential_impact` (staat van het AI-editiepad,
//      keuze 8 houdt de twee paden gescheiden).
//
// Leeg is geldig: geen artikel boven de drempel → `leeg: true`.
//
// TWEE MODI (MATCHER_VERSIE 4, Krant 1C · B37/B38):
//   'editie'   (standaard) de schaduweditie van K1. De SELECTIE is gelijk aan
//              v3 (welke artikelen, score, vorm, volgorde); alleen de teksten
//              volgen catalogus v2.
//   'tijdlijn' één verversing van de tijdlijn-bèta. Verschilt op drie
//              punten: (a) een bericht zonder bedrag haalt de tijdlijn al met
//              score 2 (SCORE_DREMPEL_RAAKT) — alleen bij een BEVESTIGDE grond
//              (doelgroepregel of thema dat raakt), nooit bij een onbevestigde
//              doelgroep; (b) zo'n bericht krijgt de vorm 'raakt' ("Over jouw
//              situatie"): reden uit de raakt-regel die 'ja' gaf, onderwerp,
//              slot naar de grond — en zonder grond is het geen bericht maar
//              Achtergrond of katern; (c) `algemeen.achtergrond` draagt
//              hoogstens ACHTERGROND_MAX kwalitatieve artikelen zonder regel
//              voor jou.
//
// Getallen in een item komen UITSLUITEND uit impact.ts (canonieke motoren of
// gegronde params). De `samenvatting` is de door 1A gecontroleerde tekst van
// het artikel zelf — geen persoonlijke som, en elk getal daarin staat
// letterlijk in de bron (duiding-controles.ts). Raakt ze tóch de
// Wft-woordenlijst (gebiedende wijs, aanbieder), dan gaat ze hier op null:
// dit is de laatste pure stap vóór opslag, en dus de goedkoopste plek.
//
// euro-only (B2, ADR 0172): geen dagtarief, geen vrijheidstijd — bewaakt door
// lib/krant/euro-only.test.ts.
//
// PUUR: geen IO.

import { type DuidingV1, type DoelgroepRegel, type Deadline } from './duiding-schema'
import { vindWftOvertreding } from './wft-woordenlijst'
import { THEMAS, type ThemaId } from './themas'
import { DOELGROEP_SLEUTELS, type DoelgroepSleutel } from './profiel-velden'
import type { MechanismeId, MechanismeVorm } from './mechanismen'
import {
  BELEGGINGEN_BANDEN,
  HYPOTHEEK_RESTSCHULD_BANDEN,
  INKOMEN_BANDEN,
  SPAARGELD_BANDEN,
  STUDIESCHULD_BANDEN,
  bandVolgorde,
  isStudieschuldBand,
  profielType,
  profielWaarde,
  type NieuwsprofielV1,
} from './profiel'
import { berekenImpact, type ImpactBereik, type ImpactContext, type ImpactUitkomst } from './impact'
import {
  SJABLOON_VERSIE,
  aowTekst,
  bandTekst,
  bereikTekst,
  datumTekst,
  eur,
  maandenTekst,
  renderSjabloon,
  stapTekst,
  variantVoor,
  veldenTekst,
  type SjabloonId,
  type Slots,
} from './sjablonen'

// ── Versie en selectieregels ─────────────────────────────────────────────────

/**
 * Bumpt bij elke wijziging van de regels hieronder; landt op de editie zodat een regelwijziging zichtbaar is.
 * 2 (22-09-2026, ADR 0176): tiebreak van het algemeen katern op duidingssoort en kop in plaats van id.
 * 3 (27-09-2026, B35 · Krant 1G): een relevant artikel zonder bevestigde doelgroep scoort toch GERICHT
 *   als één van zijn gegronde thema's dit profiel raakt (OF over de `raakt`-regels); waarom `thema:<id>`.
 * 4 (28-09-2026, Krant 1C · B37/B38): modus 'tijdlijn' (drempel 2 voor 'raakt', Achtergrond); in beide modi
 *   een bedrag van € 0 nooit als som (compliance-check §3a) en de relevant-tekst naar de grond.
 * 5 (29-09-2026, eigenaarsbesluit): een publicatiedatum ouder dan NIEUWS_MAX_OUDERDOM_DAGEN telt niet als
 *   nieuw, ook als het artikel binnen het venster is opgehaald; een aankomende deadline gaat voor.
 */
export const MATCHER_VERSIE = 5

/** Volgorde bij gelijke datum in het algemeen katern: wat vastligt of gemeten is, vóór verwachting en uitleg. */
const KATERN_SOORT_RANG: Record<DuidingV1['soort'], number> = {
  besloten: 0,
  cijfer: 1,
  voorstel: 2,
  verwachting: 3,
  marktbeweging: 4,
  achtergrond: 5,
}

/** Een artikel haalt de editie vanaf deze score (LOCAL_NEWS_MIN_SCORE-lijn). */
export const SCORE_DREMPEL = 3
/** B37: in de tijdlijn haalt een bericht zonder bedrag met een BEVESTIGDE grond het al met deze score. */
export const SCORE_DREMPEL_RAAKT = 2
/** B37: het blok Achtergrond naast de tijdlijn. */
export const ACHTERGROND_MAX = 3
/**
 * Welke soorten duiding Achtergrond zijn — en welke in de tijdlijn de vorm
 * 'raakt' mogen krijgen: vastgelegde of voorgestelde regels en uitleg. Nooit
 * markt, cijfers of verwachtingen: een koersbeweging aan jouw beleggingen
 * koppelen ("Dat geldt ook voor jou") is precies wat de Wft-grens verbiedt
 * (eindreview 28-09, H1).
 */
const ACHTERGROND_SOORTEN: ReadonlySet<DuidingV1['soort']> = new Set(['besloten', 'voorstel', 'achtergrond'])
/** Hoogstens zoveel items per editie (LOCAL_NEWS_MAX_ITEMS-lijn). */
export const EDITIE_MAX = 8
/** Hoogstens zoveel items per rubriek, tenzij er anders te weinig is. */
export const RUBRIEK_MAX = 3
/** Het algemene katern (B7). */
export const ALGEMEEN_MAX = 5
/** Het editievenster in dagen: de weekeditie leest de afgelopen week. */
export const WEEK_VENSTER_DAGEN = 7
/**
 * Een bericht dat de bron langer dan dit geleden publiceerde, telt niet als
 * nieuw, ook als we het net ophaalden (eigenaarsbesluit 29 sep 2026: CBS-
 * berichten van april en CPB-ramingen uit 2025 kwamen via nieuwe bronnen als
 * "deze week" binnen). Een aankomende deadline gaat voor. Redactioneel, geen
 * financiële aanname.
 */
export const NIEUWS_MAX_OUDERDOM_DAGEN = 45

/**
 * Score op de ONDERGRENS van het bereik, per maand (jaarbedrag ÷ 12). Dit
 * zijn redactionele drempels (wat is de moeite van een bericht), geen
 * financiële aannames — vandaar hier en niet in lib/constants.ts, net als
 * NEWS_DEMOTION_LESS_THRESHOLD.
 */
export const SCORE_PER_MAAND: ReadonlyArray<{ vanaf: number; score: number }> = [
  { vanaf: 25, score: 5 },
  { vanaf: 10, score: 4 },
  { vanaf: 2, score: 3 },
]
/** Een verschuiving van de AOW-leeftijd is altijd materieel, ongeacht het profiel. */
export const SCORE_AOW_VERSCHUIVING = 4
/** Gevoeligheid (B5) scoort nooit hoger dan de drempel: het is blootstelling, geen regel. */
export const SCORE_GEVOELIGHEID_MAX = 3
/**
 * Relevant zonder bedrag: gericht (bevestigde doelgroep, of een thema dat het profiel raakt — v3) 2, algemeen 1. Bewust ónder
 * de drempel (analyse 1B §5): "wat mist" en "relevant" halen de editie alleen
 * met een bonus. Laat de meting per profieltype dunne edities zien, dan is dít
 * de eerste knop — niet vooraf verlagen.
 */
export const SCORE_RELEVANT_GERICHT = 2
export const SCORE_RELEVANT_ALGEMEEN = 1
/** Een gedempte rubriek haalt de editie alleen met deze score of hoger. */
export const SCORE_GEDEMPT_MIN = 4
/** Beursnieuws is nooit een regel voor jou: hoogstens 2, dus nooit in de editie (wel in het algemene katern). */
export const SCORE_BEURSBEWEGING_MAX = 2

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Een rij uit `news_articles` zoals de editie-loader (fase 2) 'm levert —
 * alleen bronfeiten en de duiding; bewust zonder `summary`, `is_used` of
 * `potential_impact` (modeltekst en staat van het AI-editiepad).
 */
export interface KandidaatArtikel {
  id: string
  title: string
  source_url: string
  source_name: string
  category: string | null
  published_at: string | null
  fetched_at: string
  duiding_status: string
  duiding: DuidingV1 | null
}

export interface MatchContext {
  now: Date
  /** Artikel-id's die de lezer al zag (news_read); tellen niet mee. */
  gezienArtikelIds: ReadonlySet<string>
  /** Rubrieken waarvan de lezer "minder" zei (demotedCategories). */
  gedemptRubrieken: ReadonlySet<string>
  impact: ImpactContext
  weekVensterDagen?: number
  /** 'editie' (standaard, de K1-schaduw) of 'tijdlijn' (de bèta, B37/B38). */
  modus?: MatchModus
}

export type MatchModus = 'editie' | 'tijdlijn'

/** 'raakt' bestaat alleen in de tijdlijn: "Over jouw situatie", zonder bedrag (B37). */
export type EditieVorm = MechanismeVorm | 'raakt'

export interface EditieDeadline extends Deadline {
  tekst: string
}

export interface EditieItem {
  artikelId: string
  titel: string
  rubriek: string | null
  bron: string
  url: string
  gepubliceerd: string | null
  vorm: EditieVorm
  score: number
  mechanisme: MechanismeId | null
  /** Het ruwe bereik (1E, B22) — null bij relevant. */
  impact: ImpactBereik | null
  sjabloonId: SjabloonId
  variant: number
  slots: Slots
  /** De gerenderde regel voor jou. */
  tekst: string
  deadline: EditieDeadline | null
  /** Profielvelden die ontbraken om een bedrag te geven. */
  watMist: DoelgroepSleutel[]
  /** Waarom dit artikel hier staat (grep-bare regels, voor "waarom zie ik dit?"). */
  waarom: string[]
  /** De algemene samenvatting van het artikel (B3, door 1A gecontroleerd); null als ze de Wft-woordenlijst raakt. */
  samenvatting: string | null
}

export interface AlgemeenItem {
  artikelId: string
  titel: string
  rubriek: string | null
  bron: string
  url: string
  gepubliceerd: string | null
  samenvatting: string | null
}

export interface EditieUitkomst {
  matcherVersie: number
  sjabloonVersie: number
  profielType: string
  items: EditieItem[]
  algemeen: {
    kop: string
    label: string
    items: AlgemeenItem[]
    /** Alleen in de tijdlijnmodus: kwalitatief nieuws zonder regel voor jou (B37). */
    achtergrond?: { kop: string; label: string; items: AlgemeenItem[] }
  }
  leeg: boolean
  /** De tekst bij een lege editie; null als er items zijn. */
  legeTekst: string | null
}

// ── 1. Leescontract ──────────────────────────────────────────────────────────

const DAG_MS = 24 * 60 * 60 * 1000

function inVenster(a: KandidaatArtikel, ctx: MatchContext): boolean {
  const deadline = a.duiding?.deadline
  if (deadline && isDeadlineToekomst(deadline, ctx.now)) return true
  const venster = ctx.weekVensterDagen ?? WEEK_VENSTER_DAGEN
  const grens = ctx.now.getTime() - venster * DAG_MS
  if (new Date(a.fetched_at).getTime() < grens) return false
  return !isOudNieuws(a, ctx.now)
}

/**
 * De bron publiceerde het lang geleden — dat we het nu pas ophalen (een nieuwe
 * bron, een backfill) maakt het geen nieuws. Zonder bruikbare publicatiedatum
 * beslist de ophaaldatum.
 */
function isOudNieuws(a: KandidaatArtikel, now: Date): boolean {
  if (!a.published_at) return false
  const t = Date.parse(a.published_at)
  if (!Number.isFinite(t)) return false
  return t < now.getTime() - NIEUWS_MAX_OUDERDOM_DAGEN * DAG_MS
}

function isDeadlineToekomst(deadline: Deadline, now: Date): boolean {
  return new Date(`${deadline.datum}T23:59:59Z`).getTime() >= now.getTime()
}

/** Voldoet een rij aan het leescontract van 1A? Geëxporteerd zodat de loader (fase 2) dezelfde regel draagt. */
export function voldoetAanLeescontract(a: KandidaatArtikel, ctx: MatchContext): a is KandidaatArtikel & { duiding: DuidingV1 } {
  return a.duiding_status === 'geduid' && a.duiding != null && !ctx.gezienArtikelIds.has(a.id) && inVenster(a, ctx)
}

// ── 2. Doelgroep ─────────────────────────────────────────────────────────────

export type RegelUitkomst = 'ja' | 'nee' | 'onbekend'

/** Toets één doelgroepregel op het profiel. Een onbekend veld is nooit "nee". */
export function toetsRegel(regel: DoelgroepRegel, profiel: NieuwsprofielV1): RegelUitkomst {
  const sleutel = regel.veld as DoelgroepSleutel
  const def = DOELGROEP_SLEUTELS[sleutel]
  if (!def) return 'nee'
  const waarde = profielWaarde(profiel, sleutel)
  if (waarde == null) return 'onbekend'
  const w0 = regel.waarden[0]
  switch (def.soort) {
    case 'jaartal': {
      const n = waarde as number
      const t = Number(w0)
      if (regel.op === 'is') return n === t ? 'ja' : 'nee'
      if (regel.op === 'minstens') return n >= t ? 'ja' : 'nee'
      if (regel.op === 'hoogstens') return n <= t ? 'ja' : 'nee'
      return regel.waarden.map(Number).includes(n) ? 'ja' : 'nee'
    }
    case 'keuze': {
      const s = waarde as string
      return regel.waarden.includes(s) ? 'ja' : 'nee'
    }
    case 'band': {
      const s = waarde as string
      const volgorde = bandVolgorde(sleutel)
      const i = volgorde.indexOf(s)
      const t = volgorde.indexOf(w0)
      if (regel.op === 'minstens') return i >= t ? 'ja' : 'nee'
      if (regel.op === 'hoogstens') return i <= t ? 'ja' : 'nee'
      return regel.waarden.includes(s) ? 'ja' : 'nee'
    }
    case 'meerkeuze': {
      const arr = waarde as readonly string[]
      if (regel.op === 'bevat') return regel.waarden.every((w) => arr.includes(w)) ? 'ja' : 'nee'
      return regel.waarden.some((w) => arr.includes(w)) ? 'ja' : 'nee'
    }
  }
}

interface DoelgroepUitkomst {
  past: boolean
  onbekend: DoelgroepSleutel[]
}

function toetsDoelgroep(duiding: DuidingV1, profiel: NieuwsprofielV1): DoelgroepUitkomst {
  const onbekend: DoelgroepSleutel[] = []
  for (const regel of duiding.doelgroep) {
    const u = toetsRegel(regel, profiel)
    if (u === 'nee') return { past: false, onbekend: [] }
    if (u === 'onbekend') onbekend.push(regel.veld as DoelgroepSleutel)
  }
  return { past: true, onbekend }
}

/**
 * Raakt dit thema het profiel? OF-semantiek over de `raakt`-regels: één 'ja'
 * → ja; alle 'nee' → nee; anders onbekend. 'iedereen' is bewust 'nee': het
 * raakt elk profiel en maakt dus niemand in het bijzonder gericht.
 */
export function toetsThema(thema: ThemaId, profiel: NieuwsprofielV1): RegelUitkomst {
  const raakt = THEMAS[thema].raakt
  if (raakt === 'iedereen') return 'nee'
  let onbekend = false
  for (const regel of raakt) {
    const u = toetsRegel(regel, profiel)
    if (u === 'ja') return 'ja'
    if (u === 'onbekend') onbekend = true
  }
  return onbekend ? 'onbekend' : 'nee'
}

/** De raakt-regels van een thema die voor dit profiel 'ja' geven, in themavolgorde. */
export function jaRegels(thema: ThemaId, profiel: NieuwsprofielV1): DoelgroepRegel[] {
  const raakt = THEMAS[thema].raakt
  if (raakt === 'iedereen') return []
  return raakt.filter((r) => toetsRegel(r, profiel) === 'ja')
}

/** De sleutel van een regel: veld, operator en waarden — zonder spaties, dus geen lezerstekst. */
export function regelSleutel(regel: DoelgroepRegel): string {
  return `${regel.veld}:${regel.op}:${regel.waarden.join('|')}`
}

/**
 * De reden-zin per raakt-regel van themas.ts (catalogus `reden-*`). Een nieuwe
 * regel in themas.ts zonder rij hier maakt matcher.test.ts rood. De bedragen
 * in de labels zijn de grens van de regel, niet de band van de lezer.
 */
export const REDEN_PER_REGEL: Readonly<Record<string, SjabloonId>> = {
  'spaargeld:minstens:50k-100k': 'reden-spaargeld-50k',
  'spaargeld:minstens:5k-25k': 'reden-spaargeld-5k',
  'beleggingen:minstens:25k-100k': 'reden-beleggingen-25k',
  'beleggingen:minstens:tot-25k': 'reden-beleggingen',
  'beleggingen_vorm:bevat:tweede-woning': 'reden-tweede-woning',
  'pensioen_werkgever:is:ja': 'reden-pensioen-werkgever',
  'pensioen_lijfrente:is:ja': 'reden-lijfrente',
  'geboortejaar:hoogstens:1970': 'reden-geboren-tot-1970',
  'werk:bevat:pensioen': 'reden-met-pensioen',
  'wonen:in:huur-sociaal|huur-vrije-sector': 'reden-huur',
  'wonen:in:koop-met-hypotheek|koop-zonder-hypotheek': 'reden-koopwoning',
  'woonplan:is:kopen-binnen-2-jaar': 'reden-koopplan',
  'inkomen:hoogstens:2500-3250': 'reden-inkomen-3250',
  'inkomen:hoogstens:tot-1750': 'reden-inkomen-1750',
  'kinderen:in:jongste-0-3|jongste-4-11|jongste-12-17': 'reden-kinderen-onder-18',
  'kinderen:in:jongste-0-3|jongste-4-11|jongste-12-17|alleen-18-plus': 'reden-kinderen',
  'schulden:in:studieschuld-tot-15k|studieschuld-15k-40k|studieschuld-boven-40k': 'reden-studieschuld',
  'werk:bevat:studie': 'reden-studie',
  'werk:in:zelfstandig|dga': 'reden-ondernemer',
  'werk:in:uitkering': 'reden-uitkering',
  'schulden:in:consumptief-krediet': 'reden-krediet',
}

/**
 * Gevoelige redenen (compliance-keuze 4): inkomen, uitkering, krediet staan
 * nooit in de zichtbare regel — alleen als `reden:<id>` in `waarom`, voor
 * "waarom zie ik dit?". Schermdelen en screenshots spelen mee.
 */
export const GEVOELIGE_REDENEN: ReadonlySet<SjabloonId> = new Set([
  'reden-inkomen-3250',
  'reden-inkomen-1750',
  'reden-uitkering',
  'reden-krediet',
] as SjabloonId[])

/** De thema's van de duiding die dit profiel raken ('ja'), in duidingvolgorde. */
function themasVoorProfiel(duiding: DuidingV1, profiel: NieuwsprofielV1): ThemaId[] {
  return duiding.themas.filter((t) => toetsThema(t.thema, profiel) === 'ja').map((t) => t.thema)
}

// ── 4. Vorm en score ─────────────────────────────────────────────────────────

function scoreBedragPerMaand(loPerJaar: number): number {
  const perMaand = loPerJaar / 12
  for (const { vanaf, score } of SCORE_PER_MAAND) if (perMaand >= vanaf) return score
  return perMaand > 0 ? 2 : 1
}

function basisScore(impact: ImpactUitkomst, duiding: DuidingV1, themaRaakt: boolean): number {
  if (impact.soort === 'bereik') {
    if (impact.richting === 'geen' && impact.lo === 0 && (impact.hi ?? 0) === 0 && impact.vorm !== 'gevoeligheid') return 1
    if (impact.eenheid === 'maanden') return impact.lo !== 0 ? SCORE_AOW_VERSCHUIVING : 1
    const s = scoreBedragPerMaand(impact.lo)
    return impact.vorm === 'gevoeligheid' ? Math.min(SCORE_GEVOELIGHEID_MAX, s) : s
  }
  return duiding.doelgroep.length > 0 || themaRaakt ? SCORE_RELEVANT_GERICHT : SCORE_RELEVANT_ALGEMEEN
}

// ── 7. Slots per sjabloon ────────────────────────────────────────────────────

function sjabloonVoor(mechanisme: MechanismeId, impact: ImpactBereik): SjabloonId {
  if (impact.vorm === 'gevoeligheid') {
    if (mechanisme === 'spaarrente-markt') return 'gevoeligheid-spaarrente'
    if (mechanisme === 'hypotheekrente-markt') return 'gevoeligheid-hypotheekrente'
    return 'gevoeligheid-studieschuld'
  }
  switch (mechanisme) {
    case 'box3-parameter':
      return 'direct-box3'
    case 'box1-parameter':
      return 'direct-box1'
    case 'aow-leeftijd':
      return 'direct-aow'
    case 'studieschuld-rente':
      return 'direct-studieschuld'
    case 'eigen-risico':
      return 'direct-eigen-risico'
    default:
      return 'raakt-thema'
  }
}

function slotsVoor(id: SjabloonId, impact: ImpactBereik, profiel: NieuwsprofielV1, ctx: MatchContext): Slots {
  const bedrag = bereikTekst(impact)
  const richting = impact.richting === 'geen' ? '' : impact.richting
  const stap = stapTekst(ctx.impact.gevoeligheidStapPp)
  const studieschuld = profiel.schulden?.find(isStudieschuldBand)
  switch (id) {
    case 'direct-box3':
      return {
        spaargeld: bandTekst(SPAARGELD_BANDEN[profiel.spaargeld!]),
        beleggingen: bandTekst(BELEGGINGEN_BANDEN[profiel.beleggingen.band!]),
        partner: profiel.huishouden === 'fiscaal-partner' ? renderSjabloon('fragment-partner', 0) : '',
        bedrag,
        richting,
        jaar: String(impact.jaar),
      }
    case 'direct-box1':
      return { inkomen: bandTekst(INKOMEN_BANDEN[profiel.inkomen!]), bedrag, richting, jaar: String(impact.jaar) }
    case 'direct-aow':
      return {
        geboortejaar: String(profiel.geboortejaar),
        oud: aowTekst(impact.aow!.oud[0], impact.aow!.oud[1]),
        nieuw: aowTekst(impact.aow!.nieuw[0], impact.aow!.nieuw[1]),
        maanden: maandenTekst(impact.lo),
      }
    case 'direct-studieschuld':
      return { schuld: bandTekst(STUDIESCHULD_BANDEN[studieschuld!]), bedrag, richting, jaar: String(impact.jaar) }
    case 'gevoeligheid-studieschuld':
      return { schuld: bandTekst(STUDIESCHULD_BANDEN[studieschuld!]), bedrag, stap }
    case 'direct-eigen-risico':
      return { oud: eur(impact.eigenRisico!.oud), nieuw: eur(impact.eigenRisico!.nieuw), bedrag, richting }
    case 'gevoeligheid-spaarrente':
      return { stap, spaargeld: bandTekst(SPAARGELD_BANDEN[profiel.spaargeld!]), bedrag }
    case 'gevoeligheid-hypotheekrente':
      return { stap, schuld: bandTekst(HYPOTHEEK_RESTSCHULD_BANDEN[profiel.hypotheek.restschuld!]), bedrag }
    default:
      return {}
  }
}

function deadlineVoor(duiding: DuidingV1, ctx: MatchContext): EditieDeadline | null {
  const d = duiding.deadline
  if (!d || !isDeadlineToekomst(d, ctx.now)) return null
  const id: SjabloonId =
    d.soort === 'aanvraag' ? 'deadline-aanvraag' : d.soort === 'aangifte' ? 'deadline-aangifte' : d.soort === 'bezwaar' ? 'deadline-bezwaar' : 'deadline-einde-regeling'
  return { ...d, tekst: renderSjabloon(id, 0, { datum: datumTekst(d.datum) }) }
}

// ── De matcher ───────────────────────────────────────────────────────────────

interface Kandidaat {
  artikel: KandidaatArtikel & { duiding: DuidingV1 }
  item: EditieItem
}

function bouwKandidaat(artikel: KandidaatArtikel & { duiding: DuidingV1 }, profiel: NieuwsprofielV1, ctx: MatchContext): Kandidaat | null {
  const duiding = artikel.duiding
  const dg = toetsDoelgroep(duiding, profiel)
  if (!dg.past) return null

  const waarom: string[] = duiding.doelgroep.map((r) => `doelgroep:${r.veld}`)
  const themaJa = themasVoorProfiel(duiding, profiel)
  for (const id of themaJa) waarom.push(`thema:${id}`)
  const watMist = [...dg.onbekend]
  // Een ONBEVESTIGDE doelgroep (een regel onbekend) krijgt geen som en geen
  // bonus: "misschien raakt dit jou" mag geen stellige zin met een bedrag
  // worden en geen deadline-artikel bij iedereen met een leeg veld zetten.
  // De som wordt dan niet eens gemaakt; het item zegt wat er mist.
  const bevestigd = dg.onbekend.length === 0
  const impact: ImpactUitkomst = bevestigd ? berekenImpact(duiding, profiel, ctx.impact) : { soort: 'ontbreekt', velden: dg.onbekend }
  const tijdlijn = ctx.modus === 'tijdlijn'
  // De grond van een bericht zonder bedrag: alleen een BEVESTIGDE doelgroep of
  // een thema dat raakt maakt het persoonlijk. Onbevestigd is nooit een grond.
  const grond: 'doelgroep' | 'thema' | null = !bevestigd ? null : duiding.doelgroep.length > 0 ? 'doelgroep' : themaJa.length > 0 ? 'thema' : null
  // Compliance-check §3a: een som van € 0 (of 0 maanden AOW) is geen regel voor
  // jou. Hij rendert nooit als bedrag ("€ 0 per jaar  box 3-heffing") maar
  // valt terug op de vorm zonder bedrag; de score (1) verandert niet.
  const nulBereik = impact.soort === 'bereik' && impact.vorm !== 'gevoeligheid' && impact.lo === 0 && (impact.hi ?? 0) === 0

  let vorm: EditieVorm = 'relevant'
  let bereik: ImpactBereik | null = null
  let sjabloonId: SjabloonId = grond === 'doelgroep' ? 'raakt-doelgroep' : 'raakt-thema'
  if (impact.soort === 'bereik' && !nulBereik) {
    vorm = impact.vorm
    bereik = impact
    sjabloonId = sjabloonVoor(duiding.mechanisme!.soort, impact)
    waarom.push(`impact:${impact.vorm}`)
  } else if (impact.soort === 'ontbreekt') {
    for (const v of impact.velden) if (!watMist.includes(v)) watMist.push(v)
    // Bevestigd + ontbreekt = een rekenend mechanisme mist een veld → er kán een
    // bedrag komen; onbevestigd → de Krant weet nog niet óf het jou raakt.
    sjabloonId = bevestigd ? 'wat-mist-bedrag' : 'wat-mist-raakt'
    waarom.push(bevestigd ? 'impact:ontbreekt' : 'doelgroep-onbevestigd')
  } else {
    waarom.push(nulBereik ? 'impact:nul' : `impact:${(impact as { reden: string }).reden}`)
    // In de tijdlijn is een bericht zonder bedrag en zonder grond geen bericht:
    // het hoort in Achtergrond of het katern (compliance-check §3b).
    if (tijdlijn) {
      if (grond === null || !ACHTERGROND_SOORTEN.has(duiding.soort) || duiding.mechanisme?.soort === 'beursbeweging') return null
      vorm = 'raakt'
    }
  }
  let score = bevestigd ? basisScore(impact, duiding, themaJa.length > 0) : SCORE_RELEVANT_GERICHT
  const deadline = deadlineVoor(duiding, ctx)
  const rubriek = artikel.category
  if (bevestigd) {
    if (deadline) {
      score += 1
      waarom.push('deadline')
    }
    if (rubriek && profiel.rubrieken?.includes(rubriek)) {
      score += 1
      waarom.push('rubriek-voorkeur')
    }
  }
  score = Math.min(5, score)
  // Een beursbeweging haalt de editie nooit (catalogus): hoogstens 2, ook mét bonus.
  if (duiding.mechanisme?.soort === 'beursbeweging') score = Math.min(SCORE_BEURSBEWEGING_MAX, score)
  if (rubriek && ctx.gedemptRubrieken.has(rubriek)) {
    waarom.push('rubriek-gedempt')
    if (score < SCORE_GEDEMPT_MIN) return null
  }
  const drempel = vorm === 'raakt' ? SCORE_DREMPEL_RAAKT : SCORE_DREMPEL
  if (score < drempel) return null

  const variant = variantVoor(sjabloonId, artikel.id)
  const watMistSjabloon = sjabloonId === 'wat-mist-bedrag' || sjabloonId === 'wat-mist-raakt'
  const slots: Slots = watMistSjabloon ? { velden: veldenTekst(watMist) } : bereik ? slotsVoor(sjabloonId, bereik, profiel, ctx) : {}
  // Zonder bedrag en mét grond (beide modi): de drie-delige regel "Over jouw
  // situatie" — een los "Dat geldt ook voor jou." verwees nergens naar
  // (eindreview L2). Bij een voorstel of verwachting nooit "geldt ook voor
  // jou": dan het neutrale slot, want toepasselijkheid van iets dat nog niet
  // besloten is, is niet te stellen (eindreview M6).
  const zonderBedrag = bereik === null && !watMistSjabloon && grond !== null
  const onzeker = duiding.soort === 'voorstel' || duiding.soort === 'verwachting'
  const slotGrond: 'doelgroep' | 'thema' = grond === 'doelgroep' && !onzeker ? 'doelgroep' : 'thema'
  if (zonderBedrag) sjabloonId = slotGrond === 'doelgroep' ? 'raakt-doelgroep' : 'raakt-thema'
  // Een voorstel of verwachting is geen besluit: een som krijgt een voorbehoud.
  // De regel zonder bedrag noemt geen gevolg en krijgt het neutrale slot.
  const voorbehoud = zonderBedrag
    ? null
    : duiding.soort === 'voorstel'
      ? renderSjabloon('voorbehoud-voorstel', 0)
      : duiding.soort === 'verwachting'
        ? renderSjabloon('voorbehoud-verwachting', 0)
        : null
  const regel = zonderBedrag ? raaktTekst(duiding, profiel, grond!, slotGrond, themaJa, waarom) : renderSjabloon(sjabloonId, variant, slots)
  const samenvatting = samenvattingVoor(duiding, waarom)
  const item: EditieItem = {
    artikelId: artikel.id,
    titel: artikel.title,
    rubriek,
    bron: artikel.source_name,
    url: artikel.source_url,
    gepubliceerd: artikel.published_at,
    vorm,
    score,
    mechanisme: duiding.mechanisme?.soort ?? null,
    impact: bereik,
    sjabloonId,
    variant,
    slots,
    tekst: voorbehoud ? `${voorbehoud} ${naVoorbehoud(regel)}` : regel,
    deadline,
    watMist,
    waarom,
    samenvatting,
  }
  return { artikel, item }
}

/**
 * B37 "Over jouw situatie", drie delen uit de catalogus: de reden uit de
 * raakt-regel die 'ja' gaf (compliance-check: nooit een vrij gekozen
 * profielkenmerk — "koopwoning" bij een box 3-bericht was precies die fout),
 * het onderwerp (het eerste thema dat raakt, anders het eerste thema van de
 * duiding) met het jaar alleen als de ingangsdatum gegrond is, en het slot
 * naar de grond. Een gevoelige reden (inkomen, uitkering, krediet) staat
 * alleen in `waarom`; is er geen andere, dan vervalt de zichtbare reden.
 */
function raaktTekst(
  duiding: DuidingV1,
  profiel: NieuwsprofielV1,
  grond: 'doelgroep' | 'thema',
  slotGrond: 'doelgroep' | 'thema',
  themaJa: readonly ThemaId[],
  waarom: string[],
): string {
  const kandidaten: DoelgroepRegel[] = [...(grond === 'doelgroep' ? duiding.doelgroep : []), ...themaJa.flatMap((t) => jaRegels(t, profiel))]
  const redenen = kandidaten.map((r) => REDEN_PER_REGEL[regelSleutel(r)]).filter((id): id is SjabloonId => id != null)
  for (const id of new Set(redenen)) waarom.push(`reden:${id}`)
  const zichtbaar = redenen.find((id) => !GEVOELIGE_REDENEN.has(id))

  const delen: string[] = []
  if (zichtbaar) delen.push(renderSjabloon('raakt-reden', 0, { reden: renderSjabloon(zichtbaar, 0) }))
  const thema = themaJa[0] ?? duiding.themas[0]?.thema
  if (thema) {
    const onderwerp = renderSjabloon(`onderwerp-${thema}` as SjabloonId, 0)
    const jaar = duiding.ingangsdatum?.slice(0, 4)
    delen.push(jaar ? renderSjabloon('raakt-onderwerp-jaar', 0, { onderwerp, jaar }) : renderSjabloon('raakt-onderwerp', 0, { onderwerp }))
  }
  delen.push(renderSjabloon(slotGrond === 'doelgroep' ? 'raakt-doelgroep' : 'raakt-thema', 0))
  return delen.join(' ')
}

/** De eerste letter omlaag ná een voorbehoud, behalve bij een hoofdletterwoord (AOW, DUO). */
function naVoorbehoud(regel: string): string {
  return /^[A-Z][a-z]/.test(regel) ? `${regel.charAt(0).toLowerCase()}${regel.slice(1)}` : regel
}

/**
 * De 1A-samenvatting, of null — met een grep-bare reden in `waarom`. Drie
 * uitkomsten, bewust te onderscheiden in de meting:
 *   (geen reden)                 de gecontroleerde tekst gaat mee;
 *   `samenvatting-leeg:<reden>`  er is geen tekst: de duiding leverde null,
 *                                omdat het model zelf niets schreef of omdat
 *                                de tekstpoort degradeerde (B26). De lezer
 *                                krijgt dan de bronkop + de link — dat is de
 *                                bedoelde uitkomst, geen storing;
 *   `samenvatting-geweerd:<wft>` er wás tekst, maar ze raakt de
 *                                Wft-woordenlijst.
 */
function samenvattingVoor(duiding: DuidingV1, waarom: string[]): string | null {
  if (duiding.samenvatting === null) {
    waarom.push(`samenvatting-leeg:${duiding.meta.poort.reden ?? 'model'}`)
    return null
  }
  const overtreding = vindWftOvertreding(duiding.samenvatting)
  if (!overtreding) return duiding.samenvatting
  waarom.push(`samenvatting-geweerd:${overtreding.soort}`)
  return null
}

const VORM_RANG: Record<EditieVorm, number> = { direct: 0, gevoeligheid: 1, relevant: 2, raakt: 3 }

function vergelijk(a: EditieItem, b: EditieItem): number {
  return VORM_RANG[a.vorm] - VORM_RANG[b.vorm] || b.score - a.score || (a.artikelId < b.artikelId ? -1 : a.artikelId > b.artikelId ? 1 : 0)
}

/** Direct eerst, dan score, dan id; hoogstens RUBRIEK_MAX per rubriek tenzij de editie anders niet vol komt; EDITIE_MAX. */
export function selecteer(items: EditieItem[]): EditieItem[] {
  const gesorteerd = [...items].sort(vergelijk)
  const gekozen: EditieItem[] = []
  const overloop: EditieItem[] = []
  const perRubriek = new Map<string, number>()
  for (const item of gesorteerd) {
    const key = item.rubriek ?? ''
    const n = perRubriek.get(key) ?? 0
    if (n < RUBRIEK_MAX) {
      gekozen.push(item)
      perRubriek.set(key, n + 1)
    } else {
      overloop.push(item)
    }
  }
  return [...gekozen, ...overloop].slice(0, EDITIE_MAX).sort(vergelijk)
}

export function matchEditie(profiel: NieuwsprofielV1, artikelen: readonly KandidaatArtikel[], ctx: MatchContext): EditieUitkomst {
  // Vaste volgorde vóór alles: de invoervolgorde mag de uitkomst niet sturen.
  const gesorteerd = [...artikelen].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const leesbaar = gesorteerd.filter((a): a is KandidaatArtikel & { duiding: DuidingV1 } => voldoetAanLeescontract(a, ctx))

  const kandidaten: EditieItem[] = []
  for (const artikel of leesbaar) {
    const k = bouwKandidaat(artikel, profiel, ctx)
    if (k) kandidaten.push(k.item)
  }
  const items = selecteer(kandidaten)
  const gekozen = new Set(items.map((i) => i.artikelId))

  // Het algemene katern: wat leesbaar was maar de editie niet haalde, nieuwste
  // eerst, gelabeld (B7). Geen koppeling met `is_used`/`potential_impact` van
  // het AI-pad. Bij gelijke datum (items uit één run delen hun "eerste
  // gezien"-moment) beslist de SOORT van de duiding — een besluit of cijfer
  // vóór achtergrond — dan de kop, en pas als laatste het id (bugkaart P2:
  // vóór MATCHER_VERSIE 2 besliste feitelijk de UUID).
  // Tijdlijn (B37): eerst de Achtergrond — kwalitatief nieuws zonder regel voor
  // jou (besloten, voorstel, uitleg; nooit markt of cijfers) — daarna het katern
  // uit wat overblijft. In de editiemodus bestaat Achtergrond niet.
  const tijdlijn = ctx.modus === 'tijdlijn'
  const achtergrondItems: AlgemeenItem[] = tijdlijn
    ? leesbaar
        .filter((a) => !gekozen.has(a.id) && ACHTERGROND_SOORTEN.has(a.duiding.soort) && a.duiding.mechanisme?.soort !== 'beursbeweging')
        .sort(katernVolgorde)
        .slice(0, ACHTERGROND_MAX)
        .map(naarAlgemeenItem)
    : []
  const inAchtergrond = new Set(achtergrondItems.map((i) => i.artikelId))

  const algemeenItems: AlgemeenItem[] = leesbaar
    .filter((a) => !gekozen.has(a.id) && !inAchtergrond.has(a.id))
    .sort(katernVolgorde)
    .slice(0, ALGEMEEN_MAX)
    .map(naarAlgemeenItem)

  const leeg = items.length === 0
  return {
    matcherVersie: MATCHER_VERSIE,
    sjabloonVersie: SJABLOON_VERSIE,
    profielType: profielType(profiel, ctx.impact.peiljaar),
    items,
    algemeen: {
      kop: renderSjabloon('algemeen-kop', 0),
      label: renderSjabloon('algemeen-label', 0),
      items: algemeenItems,
      ...(tijdlijn
        ? { achtergrond: { kop: renderSjabloon('achtergrond-kop', 0), label: renderSjabloon('achtergrond-label', 0), items: achtergrondItems } }
        : {}),
    },
    leeg,
    legeTekst: leeg ? renderSjabloon('editie-leeg', 0) : null,
  }
}

/** Katernvolgorde: nieuwste eerst; bij gelijke datum de soort (besluit/cijfer vóór uitleg), dan de kop, dan het id. */
function katernVolgorde(a: KandidaatArtikel & { duiding: DuidingV1 }, b: KandidaatArtikel & { duiding: DuidingV1 }): number {
  const ta = a.published_at ?? a.fetched_at
  const tb = b.published_at ?? b.fetched_at
  if (ta !== tb) return ta < tb ? 1 : -1
  const sa = KATERN_SOORT_RANG[a.duiding.soort]
  const sb = KATERN_SOORT_RANG[b.duiding.soort]
  if (sa !== sb) return sa - sb
  if (a.title !== b.title) return a.title < b.title ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function naarAlgemeenItem(a: KandidaatArtikel & { duiding: DuidingV1 }): AlgemeenItem {
  return {
    artikelId: a.id,
    titel: a.title,
    rubriek: a.category,
    bron: a.source_name,
    url: a.source_url,
    gepubliceerd: a.published_at,
    samenvatting: samenvattingVoor(a.duiding, []),
  }
}
