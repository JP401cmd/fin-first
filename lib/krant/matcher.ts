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
//      score 1–5 op de ONDERGRENS per maand (de tabel hieronder).
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

/** Bumpt bij elke wijziging van de regels hieronder; landt op de editie zodat een regelwijziging zichtbaar is. */
export const MATCHER_VERSIE = 1

/** Een artikel haalt de editie vanaf deze score (LOCAL_NEWS_MIN_SCORE-lijn). */
export const SCORE_DREMPEL = 3
/** Hoogstens zoveel items per editie (LOCAL_NEWS_MAX_ITEMS-lijn). */
export const EDITIE_MAX = 8
/** Hoogstens zoveel items per rubriek, tenzij er anders te weinig is. */
export const RUBRIEK_MAX = 3
/** Het algemene katern (B7). */
export const ALGEMEEN_MAX = 5
/** Het editievenster in dagen: de weekeditie leest de afgelopen week. */
export const WEEK_VENSTER_DAGEN = 7

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
 * Relevant zonder bedrag: gericht (met doelgroep) 2, algemeen 1. Bewust ónder
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
}

export type EditieVorm = MechanismeVorm

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
  algemeen: { kop: string; label: string; items: AlgemeenItem[] }
  leeg: boolean
  /** De tekst bij een lege editie; null als er items zijn. */
  legeTekst: string | null
}

// ── 1. Leescontract ──────────────────────────────────────────────────────────

const DAG_MS = 24 * 60 * 60 * 1000

function inVenster(a: KandidaatArtikel, ctx: MatchContext): boolean {
  const venster = ctx.weekVensterDagen ?? WEEK_VENSTER_DAGEN
  const grens = ctx.now.getTime() - venster * DAG_MS
  if (new Date(a.fetched_at).getTime() >= grens) return true
  const deadline = a.duiding?.deadline
  return !!deadline && isDeadlineToekomst(deadline, ctx.now)
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

// ── 4. Vorm en score ─────────────────────────────────────────────────────────

function scoreBedragPerMaand(loPerJaar: number): number {
  const perMaand = loPerJaar / 12
  for (const { vanaf, score } of SCORE_PER_MAAND) if (perMaand >= vanaf) return score
  return perMaand > 0 ? 2 : 1
}

function basisScore(impact: ImpactUitkomst, duiding: DuidingV1): number {
  if (impact.soort === 'bereik') {
    if (impact.richting === 'geen' && impact.lo === 0 && (impact.hi ?? 0) === 0 && impact.vorm !== 'gevoeligheid') return 1
    if (impact.eenheid === 'maanden') return impact.lo !== 0 ? SCORE_AOW_VERSCHUIVING : 1
    const s = scoreBedragPerMaand(impact.lo)
    return impact.vorm === 'gevoeligheid' ? Math.min(SCORE_GEVOELIGHEID_MAX, s) : s
  }
  return duiding.doelgroep.length > 0 ? SCORE_RELEVANT_GERICHT : SCORE_RELEVANT_ALGEMEEN
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
      return 'relevant'
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
        partner: profiel.huishouden === 'fiscaal-partner' ? ' (samen met je fiscale partner)' : '',
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
    case 'gevoeligheid-studieschuld':
      return { schuld: bandTekst(STUDIESCHULD_BANDEN[studieschuld!]), bedrag, richting, stap }
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
  const watMist = [...dg.onbekend]
  // Een ONBEVESTIGDE doelgroep (een regel onbekend) krijgt geen som en geen
  // bonus: "misschien raakt dit jou" mag geen stellige zin met een bedrag
  // worden en geen deadline-artikel bij iedereen met een leeg veld zetten.
  // De som wordt dan niet eens gemaakt; het item zegt wat er mist.
  const bevestigd = dg.onbekend.length === 0
  const impact: ImpactUitkomst = bevestigd ? berekenImpact(duiding, profiel, ctx.impact) : { soort: 'ontbreekt', velden: dg.onbekend }

  let vorm: EditieVorm = 'relevant'
  let bereik: ImpactBereik | null = null
  let sjabloonId: SjabloonId = 'relevant'
  if (impact.soort === 'bereik') {
    vorm = impact.vorm
    bereik = impact
    sjabloonId = sjabloonVoor(duiding.mechanisme!.soort, impact)
    waarom.push(`impact:${impact.vorm}`)
  } else if (impact.soort === 'ontbreekt') {
    for (const v of impact.velden) if (!watMist.includes(v)) watMist.push(v)
    sjabloonId = 'wat-mist'
    waarom.push(bevestigd ? 'impact:ontbreekt' : 'doelgroep-onbevestigd')
  } else {
    waarom.push(`impact:${impact.reden}`)
  }
  let score = bevestigd ? basisScore(impact, duiding) : SCORE_RELEVANT_GERICHT
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
  if (score < SCORE_DREMPEL) return null

  const variant = variantVoor(sjabloonId, artikel.id)
  const slots: Slots = sjabloonId === 'wat-mist' ? { velden: veldenTekst(watMist) } : bereik ? slotsVoor(sjabloonId, bereik, profiel, ctx) : {}
  // Een voorstel of verwachting is geen besluit: de regel voor jou krijgt een voorbehoud.
  const voorbehoud =
    duiding.soort === 'voorstel' ? renderSjabloon('voorbehoud-voorstel', 0) : duiding.soort === 'verwachting' ? renderSjabloon('voorbehoud-verwachting', 0) : null
  const regel = renderSjabloon(sjabloonId, variant, slots)
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

/** De eerste letter omlaag ná een voorbehoud, behalve bij een hoofdletterwoord (AOW, DUO). */
function naVoorbehoud(regel: string): string {
  return /^[A-Z][a-z]/.test(regel) ? `${regel.charAt(0).toLowerCase()}${regel.slice(1)}` : regel
}

/** De 1A-samenvatting, of null als ze de Wft-woordenlijst raakt (met een grep-bare reden in `waarom`). */
function samenvattingVoor(duiding: DuidingV1, waarom: string[]): string | null {
  const overtreding = vindWftOvertreding(duiding.samenvatting)
  if (!overtreding) return duiding.samenvatting
  waarom.push(`samenvatting-geweerd:${overtreding.soort}`)
  return null
}

const VORM_RANG: Record<EditieVorm, number> = { direct: 0, gevoeligheid: 1, relevant: 2 }

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
  // eerst (published_at, dan fetched_at, dan id), gelabeld (B7). Geen
  // koppeling met `is_used`/`potential_impact` van het AI-pad.
  const algemeenItems: AlgemeenItem[] = leesbaar
    .filter((a) => !gekozen.has(a.id))
    .sort((a, b) => {
      const ta = a.published_at ?? a.fetched_at
      const tb = b.published_at ?? b.fetched_at
      return ta < tb ? 1 : ta > tb ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .slice(0, ALGEMEEN_MAX)
    .map((a) => ({
      artikelId: a.id,
      titel: a.title,
      rubriek: a.category,
      bron: a.source_name,
      url: a.source_url,
      gepubliceerd: a.published_at,
      samenvatting: samenvattingVoor(a.duiding, []),
    }))

  const leeg = items.length === 0
  return {
    matcherVersie: MATCHER_VERSIE,
    sjabloonVersie: SJABLOON_VERSIE,
    profielType: profielType(profiel, ctx.impact.peiljaar),
    items,
    algemeen: { kop: renderSjabloon('algemeen-kop', 0), label: renderSjabloon('algemeen-label', 0), items: algemeenItems },
    leeg,
    legeTekst: leeg ? renderSjabloon('editie-leeg', 0) : null,
  }
}
