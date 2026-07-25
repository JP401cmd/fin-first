// Robuuste extractie van één actie-VOORSTEL uit ruwe modeltekst (lokaal pad).
//
// Zusje van `parse.ts` (categorisatie): puur, fail-closed en los unit-testbaar.
// Waar `parse.ts` een JSON-array bergt, bergt dit één actie-object uit een
// FENCE-SENTINEL-blok. Het model markeert een voorstel met een uniek gefenced
// blok zodat de zichtbare proza en de machine-leesbare intent hard gescheiden
// zijn (en de transport de JSON nooit in de bubbel laat lekken).
//
// ── FENCE-SENTINEL CONTRACT (afgesproken blokformaat) ────────────────────────
//
//   ```fin-actie
//   { "title": "...", "description": "...", "freedom_days_impact": N,
//     "euro_impact_monthly": N, "priority_score": N }
//   ```
//
// Precies één blok per antwoord, bij voorkeur aan het EIND van de proza. De
// opening is drie backticks + `fin-actie` (optionele spaties/tabs toegestaan),
// de sluiting is de eerstvolgende drie backticks. De inhoud is één JSON-object.
//
// LET OP (scope): de PROMPT-instructie die het model dit blok laat emitteren
// loopt in een aparte ronde (P1 / `ai-specialist-prompt-dna`). Deze parser +
// resolver zijn gebouwd tegen het CONTRACT hierboven en getest met synthetische
// fixtures — er is nog geen echte modelaanroep die fences produceert.
//
// ── CIJFER-GUARDRAIL — consume, don't recompute (harde regel, CLAUDE.md) ─────
//
// `freedom_days_impact` en `euro_impact_monthly` uit het model-antwoord worden
// NOOIT vertrouwd. `resolveFinActionIntent` leidt die deterministisch af uit het
// canonieke `LocalChatOverview` (dezelfde bundel die de systeemprompt voedt) door
// de titel te matchen tegen `kansen` / `openstaandeActies` / `jaarruimte` en de
// canonieke `vrijheidsdagen` + `besparingPerJaar`/`besparing` over te nemen. Geen
// canonieke match → géén kaart: de resolver geeft dan `null` (fail-closed, exact
// zoals de parser bij een onparsebaar blok — nooit een "+0 dagen vrijheid"-kaart
// uit het niets). De model-getallen worden genegeerd.

import type { LocalChatOverview } from './local-chat-context'

/** Opening-marker van het fin-actie-blok (spaties/tabs na de backticks toegestaan). */
const FENCE_OPEN_RE = /```[ \t]*fin-actie[ \t]*/

/** Sluit-marker: de eerstvolgende drie backticks. */
const FENCE_CLOSE = '```'

/**
 * Ruwe, geparste velden uit het fin-actie-blok — precies zoals het model ze
 * aanleverde. De numerieke velden zijn HIER nog aanwezig maar worden door
 * `resolveFinActionIntent` bewust genegeerd/overschreven (cijfer-guardrail).
 */
export type RawFinActionIntent = {
  title: string
  description: string | null
  /** Model-suggestie — NIET vertrouwd; overschreven door de resolver. */
  freedom_days_impact: number | null
  /** Model-suggestie — NIET vertrouwd; overschreven door de resolver. */
  euro_impact_monthly: number | null
  /** Zachte UX-ranking (1–5), géén financieel cijfer; geklemd door de resolver. */
  priority_score: number | null
}

/**
 * Opgeloste intent met CANONIEKE getallen — structureel identiek aan de cloud
 * `SuggestActionResult`, zodat `ActionSuggestionCard` het 1-op-1 kan renderen.
 * Een opgeloste intent bestaat ALLEEN wanneer er een canonieke bron matchte;
 * bij geen match geeft `resolveFinActionIntent` `null` (dan is er geen kaart).
 */
export type ResolvedFinActionIntent = {
  title: string
  description: string | null
  /** Canonieke vrijheidsdagen uit de gematchte bron (mag 0 zijn, bv. een actie zonder impact). */
  freedom_days_impact: number
  /** Canonieke maand-euro, afgeleid van de gematchte bron (null wanneer die bron geen euro draagt). */
  euro_impact_monthly: number | null
  /** Geklemde prioriteit 1–5 (default 3). */
  priority_score: number
}

export type ParseFinActionResult = {
  /** De proza MÉT het fin-actie-blok verwijderd (voor de zichtbare bubbel). */
  cleanedText: string
  /** De ruwe geparste intent, of null wanneer er geen bruikbaar blok in zat. */
  intent: RawFinActionIntent | null
}

/**
 * Vind de start-index van het fin-actie-blok in `text`, of -1. Gedeeld met de
 * transport zodat streaming-strip en parser exact hetzelfde blok herkennen.
 */
export function finActionFenceStart(text: string): number {
  const m = FENCE_OPEN_RE.exec(text)
  return m ? m.index : -1
}

/**
 * Berg het EERSTE complete top-level `{…}`-object uit `s` als string, met
 * string-/escape-bewuste balanced scan (identiek aan de aanpak in `parse.ts`).
 * Null wanneer er geen gebalanceerd object in zit (afgekapt/niet aanwezig).
 */
function firstBalancedObject(s: string): string | null {
  const open = s.indexOf('{')
  if (open === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(open, i + 1)
    }
  }
  return null
}

/** Coerce een onbekende waarde naar een eindig getal, of null. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normaliseer één ruw fin-actie-object; null wanneer er geen bruikbare titel is. */
function normalizeIntent(obj: unknown): RawFinActionIntent | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) return null // zonder titel is er niets te matchen/tonen
  const description =
    typeof o.description === 'string' && o.description.trim() ? o.description.trim() : null
  return {
    title,
    description,
    freedom_days_impact: toNum(o.freedom_days_impact),
    euro_impact_monthly: toNum(o.euro_impact_monthly),
    priority_score: toNum(o.priority_score),
  }
}

/**
 * Parse één fin-actie-intent uit ruwe modeltekst. Fail-closed:
 *  - geen fence-open → `{ cleanedText: text, intent: null }`
 *  - fence-open maar geen sluiting (afgekapt) → blok tot het einde verwijderd,
 *    `intent: null` (nooit de half-JSON laten lekken)
 *  - fence aanwezig maar onparsebaar object → blok verwijderd, `intent: null`
 *
 * `cleanedText` behoudt de KOP (alles vóór het blok) exact en trimt alleen aan
 * het EIND — zo blijft het een betrouwbare prefix-basis voor de streaming-strip
 * in de transport (die de reeds-geëmitteerde proza als prefix moet terugvinden).
 */
export function parseFinActionIntent(text: string): ParseFinActionResult {
  const openIdx = finActionFenceStart(text)
  if (openIdx === -1) {
    return { cleanedText: text, intent: null }
  }

  const contentStart = openIdx + (FENCE_OPEN_RE.exec(text)?.[0].length ?? 0)
  const closeRel = text.indexOf(FENCE_CLOSE, contentStart)

  // Afgekapt blok (geen sluiting): strip alles vanaf de fence, geen intent.
  if (closeRel === -1) {
    return { cleanedText: text.slice(0, openIdx).replace(/\s+$/, ''), intent: null }
  }

  const blockEnd = closeRel + FENCE_CLOSE.length
  const inner = text.slice(contentStart, closeRel)
  // Behoud de kop exact (prefix-veilig); trim alleen het staart-witruimte.
  const cleanedText = (text.slice(0, openIdx) + text.slice(blockEnd)).replace(/\s+$/, '')

  const objStr = firstBalancedObject(inner)
  if (!objStr) return { cleanedText, intent: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(objStr)
  } catch {
    return { cleanedText, intent: null }
  }
  return { cleanedText, intent: normalizeIntent(parsed) }
}

/* ── Cijfer-guardrail: resolver tegen het canonieke overzicht ─────────────── */

/** Normaliseer een titel voor tolerante matching (case/whitespace-ongevoelig). */
function normTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Titels matchen wanneer ze gelijk zijn of de één de ander bevat (tolerant). */
function titlesMatch(a: string, b: string): boolean {
  const na = normTitle(a)
  const nb = normTitle(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** Klem een prioriteit naar een geheel getal 1–5; default 3 bij ontbreken/ongeldig. */
function clampPriority(v: number | null): number {
  if (v === null) return 3
  const n = Math.round(v)
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

/** Canonieke jaar-euro → maand-euro (deterministische periode-conversie, ≥0 → afgerond). */
function yearlyToMonthly(yearly: number): number | null {
  if (!Number.isFinite(yearly) || yearly <= 0) return null
  return Math.round(yearly / 12)
}

/**
 * Maand-euro van een kans, met dezelfde fallback-volgorde als de canonieke bron
 * (`aandachtspuntToActionPayload`, lib/aandachtspunten.ts): PREFEREER het
 * expliciete `euroImpactMonthly` (bv. de NIBUD-maandoverschrijding), val alleen
 * terug op JAAR÷12 wanneer dat veld ontbreekt. Zo toont dezelfde actie op
 * /overzicht en in de lokale chat hetzelfde €/mnd-bedrag (geen ÷12-drift).
 */
function kansMonthlyEuro(kans: { euroImpactMonthly?: number; besparingPerJaar: number }): number | null {
  const explicit = kans.euroImpactMonthly
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) return explicit
  return yearlyToMonthly(kans.besparingPerJaar)
}

/**
 * Los de canonieke cijfers van een geparste intent op uit het `LocalChatOverview`.
 *
 * CIJFER-GUARDRAIL (consume, don't recompute — CLAUDE.md): `freedom_days_impact`
 * en `euro_impact_monthly` komen UITSLUITEND uit het overzicht (de canonieke
 * engine), nooit uit `intent.*`. We matchen de titel tegen — in volgorde —
 * `kansen` (aandachtspunten-bus), `openstaandeActies` en de `jaarruimte`-lever,
 * en nemen dáár `vrijheidsdagen` + de canonieke maand-euro over. De maand-euro
 * volgt dezelfde fallback als de canonieke actie-payload (expliciet
 * `euroImpactMonthly`, anders JAAR÷12) zodat de kaart-labeling ("€X/mnd") klopt
 * zonder ooit een model-getal te vertrouwen.
 *
 * FAIL-CLOSED: matcht GEEN enkele canonieke bron, dan geeft de resolver `null` —
 * er is dan geen kaart (spiegelt de parser bij een onparsebaar blok). Zo verschijnt
 * er nooit een klikbare "+0 dagen vrijheid"-kaart uit een geparafraseerde titel.
 *
 * `title`, `description` en `priority_score` zijn tekst/UX-velden (geen financieel
 * cijfer): die komen wél uit het model, met `priority_score` geklemd op 1–5.
 */
export function resolveFinActionIntent(
  intent: RawFinActionIntent,
  overview: LocalChatOverview,
): ResolvedFinActionIntent | null {
  let freedomDays = 0
  let euroMonthly: number | null = null
  let matched = false

  const kans = overview.kansen.find((k) => titlesMatch(intent.title, k.titel))
  if (kans) {
    matched = true
    freedomDays = Math.round(kans.vrijheidsdagen)
    euroMonthly = kansMonthlyEuro(kans)
  } else {
    const actie = overview.openstaandeActies.find((a) => titlesMatch(intent.title, a.titel))
    if (actie) {
      // Openstaande acties dragen alleen vrijheidsdagen (geen euro-bron).
      matched = true
      freedomDays = Math.round(actie.vrijheidsdagen)
      euroMonthly = null
    } else if (overview.jaarruimte && normTitle(intent.title).includes('jaarruimte')) {
      matched = true
      freedomDays = Math.round(overview.jaarruimte.vrijheidsdagen)
      euroMonthly = yearlyToMonthly(overview.jaarruimte.besparing)
    }
    // else: matched blijft false → géén kaart (return null hieronder).
  }

  // Geen canonieke bron matchte → fail-closed: geen intent-met-nullen, maar null.
  // Dit tracket de ECHTE match (niet een 0/null-heuristiek), zodat een legitieme
  // match met 0 vrijheidsdagen (bv. een actie zonder impact) wél een kaart geeft.
  if (!matched) return null

  return {
    title: intent.title,
    description: intent.description,
    freedom_days_impact: freedomDays,
    euro_impact_monthly: euroMonthly,
    priority_score: clampPriority(intent.priority_score),
  }
}

/* ── Idempotentie-hash ────────────────────────────────────────────────────── */

/**
 * Stabiele hash over de identiteitsvelden van een opgeloste intent
 * (`title` + `description` + `freedom_days_impact`). Tekst-geparste voorstellen
 * hebben geen tool-`invocationId`; deze hash is de dedupe-sleutel waarop de UI
 * (`addedActions`) en de `data-finActie`-part-id sleutelen. Zelfde voorstel →
 * zelfde id → één "Toegevoegd"-status.
 */
export function finActionIntentHash(intent: ResolvedFinActionIntent): string {
  const basis = `${intent.title} ${intent.description ?? ''} ${intent.freedom_days_impact}`
  // djb2 — klein, deterministisch, botsingsarm genoeg voor UI-dedupe.
  let h = 5381
  for (let i = 0; i < basis.length; i++) {
    h = ((h << 5) + h + basis.charCodeAt(i)) | 0
  }
  return `finactie-${(h >>> 0).toString(36)}`
}
