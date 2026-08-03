// Robuuste extractie van één TIP-concept uit ruwe modeltekst (lokaal pad).
//
// Broertje van `parse-intent.ts` (actie-voorstel) en `parse.ts` (categorisatie):
// puur, fail-closed en los unit-testbaar. De LiteRT-web-SDK kent geen constrained
// decoding, geen grammar en geen sampling-parameters, dus we kunnen het schema
// niet afdwingen zoals `generateObject` + zod dat cloud-zijdig doen. In plaats
// daarvan: een fence-sentinel-contract plus een parser die alles wat er niet
// exact aan voldoet weggooit.
//
// ── FENCE-SENTINEL CONTRACT ──────────────────────────────────────────────────
//
//   ```fin-tip
//   { "title": "...", "description": "...", "actions": ["...", "..."] }
//   ```
//
// LAATSTE BLOK WINT. Anders dan bij `fin-actie` bevat de systeemprompt hier zélf
// een voorbeeldblok (LOCAL_RECOMMENDATIONS_DNA). Kleine modellen herhalen soms
// een deel van hun instructie vóór ze antwoorden; een parser die op het EERSTE
// blok matcht landt dan in de echo van dat voorbeeld en levert de voorbeeldtip
// van de boodschappen op — bij elke kandidaat opnieuw. We pakken daarom het
// laatste volledige blok.
//
// ── CIJFER-GUARDRAIL — consume, don't recompute (harde regel, CLAUDE.md) ─────
//
// Het model levert UITSLUITEND TAAL. Er staat geen enkel numeriek veld in het
// contract, en `resolveLocalTip` haalt élk cijfer — euro-impact, vrijheidsdagen,
// type, prioriteit, budget-slug — uit de canonieke `LocalTipCandidate`.
//
// MAAR: de VELDEN afschermen is niet genoeg. De zin die de gebruiker leest is
// modeltekst, en "GETALLEN ZIJN HEILIG" was daar alleen een prompt-INSTRUCTIE —
// terwijl elke andere instructie (type, prioriteit, dedupe) hier code is geworden.
// Twee concrete faalmodi maakten dat gat echt:
//   • het model echoot het VOORBEELD uit LOCAL_RECOMMENDATIONS_DNA (€520/€90/
//     €1.080 over boodschappen) bij een wíllekeurige kandidaat — canonieke
//     metrics naast drie verzonnen bedragen;
//   • het model schrijft "win je 45 vrijheidsdagen per jaar" terwijl
//     `renderKansBlok` de `Vrijheidsdagen:`-regel juist heeft wéggelaten. Het veld
//     blijft dan keurig 0, maar de KAART doet een Wft-relevante belofte die de
//     app expliciet besloot niet te doen.
// Daarom draait `resolveLocalTip` nu twee tekstuele guards: `guardFigures`
// (gedeeld met de lokale briefing-redactie) over elk bedrag/percentage, en een
// expliciete vrijheidsdagen-claim-toets. Beide fail-closed.
//
// FAIL-CLOSED: geen kandidaat, geen parsebaar blok, geen beschrijving, of tekst
// met een niet-herleidbaar cijfer → `null`, en dus GEEN kaart. Nooit een tip met
// nul-waarden of een half concept — precies dezelfde lijn als
// `resolveFinActionIntent`, waar een titel zonder canonieke match ook geen kaart
// oplevert.

import type { LocalTipCandidate } from './local-tips-context'
import type { RecommendationType } from '@/lib/recommendation-data'
import { stripThink } from './parse'
import { guardFigures } from './figure-guard'

/** Opening-marker van het fin-tip-blok (spaties/tabs na de backticks toegestaan). */
const FENCE_OPEN_RE = /```[ \t]*fin-tip[ \t]*/g

/** Sluit-marker: de eerstvolgende drie backticks. */
const FENCE_CLOSE = '```'

/** Bovengrenzen — een model dat doorratelt vult geen halve pagina in een kaart. */
const MAX_TITLE_CHARS = 120
const MAX_DESCRIPTION_CHARS = 400
const MAX_ACTION_CHARS = 120
const MAX_ACTIONS = 3

/** Ruw geparst tip-concept: precies de drie tekstvelden die het model mag leveren. */
export interface RawFinTipDraft {
  title: string | null
  description: string | null
  actions: string[]
}

/**
 * Een tip met CANONIEKE cijfers, klaar om te tonen én op te slaan. De numerieke
 * velden komen uit de kandidaat, niet uit het model.
 *
 * De opslagroute (`app/api/local-tips`) leidt ze onafhankelijk NOGMAALS af uit de
 * server-side kandidatenlijst en vertrouwt de waarden hieronder dus niet — die
 * zijn er om de kaart meteen te kunnen tonen terwijl de volgende tip nog draait.
 */
export interface ResolvedLocalTip {
  /** Stabiele kandidaat-id; de sleutel waarmee de server de cijfers her-afleidt. */
  candidateId: string
  title: string
  description: string
  /** 1-3 actietitels (tekst van het model, of de titel als vangnet). */
  actions: string[]
  recommendationType: RecommendationType
  euroImpactMonthly: number | null
  euroImpactYearly: number
  freedomDaysPerYear: number
  relatedBudgetSlug: string | null
  priorityScore: number
}

/**
 * Berg het EERSTE complete top-level `{…}`-object uit `s`, met string-/escape-
 * bewuste balanced scan (identiek aan `parse-intent.ts` / `parse.ts`). Null
 * wanneer er geen gebalanceerd object in zit (afgekapt of afwezig).
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

/** Trim + kap een tekstveld; lege of niet-string invoer geeft null. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max).trimEnd() : t
}

/**
 * Normaliseer het ruwe object naar een `RawFinTipDraft`. Tolerant op de vorm van
 * `actions`: een array van strings is het contract, maar een enkele string of een
 * array van `{title}`-objecten komt voor en is gratis te bergen.
 */
function normalizeDraft(obj: unknown): RawFinTipDraft | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>

  const rawActions: unknown[] = Array.isArray(o.actions)
    ? o.actions
    : typeof o.actions === 'string'
      ? [o.actions]
      : []

  const actions = rawActions
    .map((a) => {
      if (typeof a === 'string') return text(a, MAX_ACTION_CHARS)
      if (a && typeof a === 'object') return text((a as Record<string, unknown>).title, MAX_ACTION_CHARS)
      return null
    })
    .filter((a): a is string => a !== null)
    .slice(0, MAX_ACTIONS)

  return {
    title: text(o.title, MAX_TITLE_CHARS),
    description: text(o.description, MAX_DESCRIPTION_CHARS),
    actions,
  }
}

/**
 * Parse het tip-concept uit ruwe modeltekst. Fail-closed op elke faalmodus:
 * geen fence + geen bruikbaar object → null, afgekapt blok → null, onparsebare
 * JSON → null.
 *
 * Volgorde:
 *  1. `<think>`-preambles strippen (gedeeld met de categorisatie-parser);
 *  2. het LAATSTE volledige `fin-tip`-blok zoeken (zie de kop: promptecho);
 *  3. valt er geen blok te vinden, dan als laatste redmiddel het eerste
 *     gebalanceerde object in de kale tekst proberen — kleine modellen laten de
 *     fence weleens weg terwijl de JSON verder klopt (salvage, zoals `parse.ts`
 *     dat voor een afgekapte array doet).
 */
export function parseFinTipDraft(raw: string): RawFinTipDraft | null {
  const t = stripThink(raw ?? '').trim()
  if (!t) return null

  // Alle fence-openingen verzamelen en van achter naar voren proberen: het
  // laatste blok met een geldige sluiting én parsebare JSON wint.
  const opens: { start: number; end: number }[] = []
  FENCE_OPEN_RE.lastIndex = 0
  for (let m = FENCE_OPEN_RE.exec(t); m !== null; m = FENCE_OPEN_RE.exec(t)) {
    opens.push({ start: m.index, end: m.index + m[0].length })
  }

  for (let i = opens.length - 1; i >= 0; i--) {
    const { end } = opens[i]
    const close = t.indexOf(FENCE_CLOSE, end)
    // Geen sluiting = afgekapt blok; die telt niet mee (nooit half-JSON bergen).
    if (close === -1) continue
    const objStr = firstBalancedObject(t.slice(end, close))
    if (!objStr) continue
    try {
      const draft = normalizeDraft(JSON.parse(objStr))
      if (draft) return draft
    } catch {
      // Onparsebaar blok: probeer het blok ervóór.
    }
  }

  // Salvage: geen bruikbaar gefenced blok, maar misschien kale JSON.
  const bare = firstBalancedObject(t)
  if (!bare) return null
  try {
    return normalizeDraft(JSON.parse(bare))
  } catch {
    return null
  }
}

/**
 * Woorden waarmee het model een vrijheidsdagen-claim kan doen. Bewust ruim: de
 * DNA verbiedt expliciet óók de omschrijvingen ("dagen vrijheid", "levenstijd
 * terug"), dus de guard moet ze alle drie zien.
 */
const VRIJHEIDSDAGEN_CLAIM_RE = /vrijheidsdag\w*|dagen\s+vrijheid|levenstijd/i

/** Een getal dat vlak vóór een dag-/vrijheidswoord staat, bv. "11 vrijheidsdagen". */
const DAGEN_GETAL_RE = /(\d[\d.,]*)\s*(?:extra\s+)?(?:vrijheidsdag\w*|dagen\s+vrijheid|dagen)/gi

/**
 * Toets de vrijheidsdagen-CLAIM in de tekst tegen de compliance-regel.
 *
 * Dit is de tekstuele tegenhanger van `resolveTipFreedomDays`. Dat laatste zet
 * het VELD op 0; deze functie zorgt dat de ZIN dezelfde grens respecteert.
 *  - regel geldt niet → élke claim is fout (fail-closed);
 *  - regel geldt wél → het genoemde aantal moet het canonieke aantal zijn.
 */
function vrijheidsdagenClaimOk(text: string, candidate: LocalTipCandidate): boolean {
  const claimt = VRIJHEIDSDAGEN_CLAIM_RE.test(text)
  if (!claimt) return true
  if (!candidate.vrijheidsdagenToegestaan || candidate.vrijheidsdagen <= 0) return false

  // Wél toegestaan: elk genoemd dag-aantal moet het canonieke aantal zijn.
  for (const m of text.matchAll(DAGEN_GETAL_RE)) {
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n)) continue
    if (Math.round(n) !== Math.round(candidate.vrijheidsdagen)) return false
  }
  return true
}

/**
 * De canonieke getallen die in de tekst genoemd MOGEN worden — precies de
 * waarden die via `renderKansBlok` in het KANS-blok stonden. Alles daarbuiten
 * heeft het model verzonnen of doorgerekend.
 */
function toegestaneGetallen(candidate: LocalTipCandidate): number[] {
  const allowed = [candidate.besparingPerJaar]
  if (candidate.euroImpactMonthly != null) allowed.push(candidate.euroImpactMonthly)
  if (candidate.vrijheidsdagenToegestaan) allowed.push(candidate.vrijheidsdagen)
  return allowed
}

/**
 * Koppel een geparst concept aan zijn CANONIEKE kandidaat.
 *
 * CIJFER-GUARDRAIL: elk numeriek veld en het `recommendation_type` komen uit
 * `candidate` — het model heeft ze niet eens kunnen noemen, en zou het toch een
 * getal in zijn proza zetten, dan blijft dat proza en verandert er niets aan wat
 * we opslaan.
 *
 * FAIL-CLOSED, drie poorten:
 *  1. geen kandidaat (onbekende id — het canonieke overzicht is inmiddels
 *     veranderd, of de client verzon een id) → null, dus géén kaart;
 *  2. geen geparst concept → null;
 *  3. geen beschrijving van het model → null. De beschrijving IS de bijdrage van
 *     het model; zonder die tekst zouden we een kaart tonen die volledig uit de
 *     kandidaat komt en tóch als "door Fin geschreven" oogt.
 *
 * De titel valt wél terug op de canonieke kandidaat-titel: die is altijd correct
 * en beter dan een tip verliezen omdat één veld ontbrak.
 */
export function resolveLocalTip(
  draft: RawFinTipDraft | null,
  candidate: LocalTipCandidate | null | undefined,
): ResolvedLocalTip | null {
  if (!candidate) return null
  if (!draft) return null
  if (!draft.description) return null

  const title = draft.title ?? candidate.titel
  // Zonder acties valt "Doe nu" in het niets; de titel is dan de actie.
  const actions = draft.actions.length > 0 ? draft.actions : [title]

  // ── Tekstuele guards (zie de kop) — alles wat de gebruiker LEEST ──────────
  const zichtbareTekst = [title, draft.description, ...actions].join('\n')

  // 1. Elk bedrag/percentage moet herleidbaar zijn tot het KANS-blok. Een
  //    geëchood promptvoorbeeld of een doorgerekend bedrag sneuvelt hier.
  const figures = guardFigures(zichtbareTekst, toegestaneGetallen(candidate))
  if (!figures.ok) {
    console.warn(
      '[lokale-ai] tip afgekeurd — niet-herleidbare getallen in de tekst:',
      candidate.id,
      figures.offending,
    )
    return null
  }

  // 2. De vrijheidsdagen-claim moet de compliance-regel volgen. Het veld staat
  //    al op 0; hier voorkomen we dat de ZIN de belofte alsnog doet.
  if (!vrijheidsdagenClaimOk(zichtbareTekst, candidate)) {
    console.warn('[lokale-ai] tip afgekeurd — ongeoorloofde vrijheidsdagen-claim:', candidate.id)
    return null
  }

  return {
    candidateId: candidate.id,
    title,
    description: draft.description,
    actions,
    recommendationType: candidate.type,
    euroImpactMonthly: candidate.euroImpactMonthly,
    euroImpactYearly: candidate.besparingPerJaar,
    freedomDaysPerYear: candidate.vrijheidsdagen,
    relatedBudgetSlug: candidate.budgetSlug,
    priorityScore: candidate.priority,
  }
}

/**
 * Verdeel de canonieke vrijheidsdagen over de actietitels.
 *
 * De cloud laat het model per actie een eigen `freedom_days_impact` verzinnen;
 * dat kan hier niet (het model levert alleen titels) en mág hier niet (dan telt
 * de som al snel op tot meer dan de kans waard is). Deterministische regel: de
 * EERSTE actie realiseert de kans en draagt het volle canonieke getal, de
 * vervolgstappen zijn deelstappen zonder eigen cijfer. De som is daarmee per
 * definitie nooit groter dan de kans zelf.
 */
export function distributeFreedomDays(
  actions: string[],
  freedomDaysPerYear: number,
): { title: string; freedom_days_impact: number }[] {
  return actions.map((title, i) => ({
    title,
    freedom_days_impact: i === 0 ? freedomDaysPerYear : 0,
  }))
}
