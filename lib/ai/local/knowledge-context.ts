// Kennisbank lokale AI — pure injectie-helper (fase K1).
//
// De kennisbank is een door de beheerder gecureerde UITLEG-laag (begrippen als
// "wat is Box 3", "hoe werkt jaarruimte") die later (fase C1b) binnen een hard
// token-budget in de systeemprompt van de lokale Will-chat wordt geïnjecteerd.
//
// HARDE INHOUDSREGEL (Wft/correctheid, uit het fase-2-plan §K1): de kennisbank
// bevat uitsluitend uitleg en begrippen — NOOIT cijfers, tarieven of
// rekentabellen. Bedragen en percentages komen altijd uit de deterministische
// rekenmotoren (lib/constants.ts, de tax-engines). Deze module rendert dus
// alleen tekst; het afdwingen van de regel gebeurt redactioneel in het
// beheerscherm.
//
// Deze module is bewust PUUR (geen Supabase-/Transformers.js-imports) zodat de
// budget-afkap los te unit-testen is. Er is in V1 nog GEEN consument — de
// lokale chat (C1b) wordt de eerste.
//
// TWEE selectiestrategieën, bewust gescheiden:
//   • buildKnowledgeContext  — ALLE actieve items op volgorde (voor de
//     beheer-preview: "wat zou er maximaal meegaan binnen het budget").
//   • selectKnowledgeForQuestion — GERICHTE selectie: alleen items waarvan
//     titel of tags in de vraag voorkomen. Dit is het productiepad voor de
//     lokale chat.
//
// Waarom gericht i.p.v. alles-injecteren? Een klein lokaal model (Gemma 2B-klasse)
// wordt SLECHTER van irrelevante context: het budget vult zich met ruis en de
// prefill kost tijd. Minder-maar-relevant verslaat veel-maar-vaag. Geen match →
// bewust een LEGE context: het model antwoordt dan puur vanuit z'n eigen DNA,
// beter dan gestuurd door niet-passende uitleg. `tags` fungeren daarbij als
// zoektriggers/synoniemen zodat één begrip op meerdere formuleringen meegaat.

/**
 * Eén kennisitem zoals opgeslagen in `app_settings.local_knowledge` en beheerd
 * op /beheer/kennisbank.
 */
export interface LocalKnowledgeItem {
  /** Stabiele uuid (client-gegenereerd via crypto.randomUUID). */
  id: string
  /** Korte kop, bv. "Wat is Box 3". */
  titel: string
  /** De uitleg zelf — begrippen, geen cijfers/tarieven. */
  tekst: string
  /** Trefwoorden voor latere per-vraag-selectie (nu ongebruikt bij injectie). */
  tags: string[]
  /** Uitgeschakelde items tellen niet mee bij injectie. */
  actief: boolean
  /** Sorteervolgorde (oplopend); bepaalt de prioriteit bij budget-afkap. */
  volgorde: number
  /** ISO-tijdstempel van de laatste wijziging. */
  bijgewerkt: string
}

/** Het resultaat van {@link buildKnowledgeContext}. */
export interface KnowledgeContext {
  /** De samengestelde injectie-tekst (leeg als er niets past/actief is). */
  text: string
  /** Ids van de items die daadwerkelijk zijn opgenomen, op volgorde. */
  includedIds: string[]
  /** Geschat aantal tokens van `text` (chars/4). */
  estTokens: number
}

/**
 * Standaard token-budget voor de kennisinjectie — SINGLE SOURCE.
 *
 * Het fase-2-plan §K1 mikt op ~2-4k tokens (~3-5s extra prefill op het lokale
 * model). 3000 zit daar bewust middenin.
 */
export const LOCAL_KNOWLEDGE_TOKEN_BUDGET = 3000

/**
 * Grove token-schatting (chars/4) — dezelfde heuristiek als de rest van de
 * lokale-AI-laag. Bewust simpel: exacte tokenisatie vergt het model, en voor een
 * budget-plafond is een conservatieve bovengrens genoeg.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Render één item als een markdown-blokje: kop + uitleg. */
function renderItem(item: LocalKnowledgeItem): string {
  return `### ${item.titel.trim()}\n${item.tekst.trim()}`
}

/**
 * Bouw de kennis-injectie voor de lokale chat: filtert op `actief`, sorteert op
 * `volgorde` en neemt items op tot het token-budget vol is — altijd op
 * ITEM-GRENS (nooit een half item). De items staan op prioriteitsvolgorde, dus
 * bij overschrijding stopt de opname (de rest valt af).
 *
 * @param items     De volledige kennisbank (actief én inactief).
 * @param maxTokens Hard plafond; standaard {@link LOCAL_KNOWLEDGE_TOKEN_BUDGET}.
 */
export function buildKnowledgeContext(
  items: LocalKnowledgeItem[],
  maxTokens: number = LOCAL_KNOWLEDGE_TOKEN_BUDGET,
): KnowledgeContext {
  const ordered = items
    .filter((item) => item.actief)
    // Stabiele sort (ES2019+): gelijke volgorde behoudt invoervolgorde.
    .sort((a, b) => a.volgorde - b.volgorde)

  return assembleWithinBudget(ordered, maxTokens)
}

/**
 * Gerichte selectie voor de lokale chat: neemt alleen actieve items op waarvan
 * de titel of een tag in de vraag voorkomt (case-insensitief, woord/substring),
 * op volgorde en afgekapt op item-grens binnen het budget. Géén match → lege
 * context (bewust: irrelevante uitleg verslechtert een klein model — dan liever
 * puur het eigen DNA laten antwoorden).
 *
 * @param items     De volledige kennisbank (actief én inactief).
 * @param vraag     De ruwe gebruikersvraag.
 * @param maxTokens Hard plafond; standaard {@link LOCAL_KNOWLEDGE_TOKEN_BUDGET}.
 */
export function selectKnowledgeForQuestion(
  items: LocalKnowledgeItem[],
  vraag: string,
  maxTokens: number = LOCAL_KNOWLEDGE_TOKEN_BUDGET,
): KnowledgeContext {
  const normalizedQuestion = vraag.toLowerCase()

  const matched = items
    .filter((item) => item.actief && itemMatchesQuestion(item, normalizedQuestion))
    .sort((a, b) => a.volgorde - b.volgorde)

  return assembleWithinBudget(matched, maxTokens)
}

/**
 * Neem items in volgorde op tot het token-budget vol is, altijd op ITEM-GRENS
 * (nooit een half item). Gedeelde bouwsteen van beide selectiestrategieën.
 */
function assembleWithinBudget(
  ordered: LocalKnowledgeItem[],
  maxTokens: number,
): KnowledgeContext {
  const blocks: string[] = []
  const includedIds: string[] = []

  for (const item of ordered) {
    const candidateText = [...blocks, renderItem(item)].join('\n\n')
    // Zou dit item het budget overschrijden? Stop dan op de item-grens.
    if (estimateTokens(candidateText) > maxTokens) break
    blocks.push(renderItem(item))
    includedIds.push(item.id)
  }

  const text = blocks.join('\n\n')
  return { text, includedIds, estTokens: estimateTokens(text) }
}

/** Match als één zoekterm (titelwoord of tag) als substring in de vraag zit. */
function itemMatchesQuestion(item: LocalKnowledgeItem, normalizedQuestion: string): boolean {
  return searchTermsFor(item).some((term) => normalizedQuestion.includes(term))
}

/**
 * Zoektermen van een item: de losse titelwoorden + de tags (synoniemen),
 * genormaliseerd (lowercase, randleestekens weg) en ontdaan van te korte
 * fragmenten (< 3 tekens) om triviale substring-matches te voorkomen.
 */
function searchTermsFor(item: LocalKnowledgeItem): string[] {
  const terms = new Set<string>()
  for (const raw of [...item.titel.split(/\s+/), ...item.tags]) {
    const norm = raw
      .toLowerCase()
      .trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (norm.length >= 3) terms.add(norm)
  }
  return [...terms]
}

/**
 * Defensieve parse van een opgeslagen `app_settings.local_knowledge`-waarde naar
 * een schone {@link LocalKnowledgeItem}-lijst. Accepteert een JSON-string (zoals
 * opgeslagen), een reeds-geparste array of null/undefined. Ongeldige/onvolledige
 * items worden overgeslagen — nooit throwen, zodat het beheerscherm blijft laden.
 */
export function parseLocalKnowledge(value: unknown): LocalKnowledgeItem[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []

  const items: LocalKnowledgeItem[] = []
  for (const entry of raw) {
    const item = normalizeItem(entry)
    if (item) items.push(item)
  }
  return items
}

/** Normaliseer één ruw item; null als id/titel/tekst ontbreekt (onbruikbaar). */
function normalizeItem(entry: unknown): LocalKnowledgeItem | null {
  if (!entry || typeof entry !== 'object') return null
  const o = entry as Record<string, unknown>

  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const titel = typeof o.titel === 'string' ? o.titel.trim() : ''
  const tekst = typeof o.tekst === 'string' ? o.tekst.trim() : ''
  if (!id || !titel || !tekst) return null

  const tags = Array.isArray(o.tags)
    ? o.tags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim())
    : []

  const actief = typeof o.actief === 'boolean' ? o.actief : true

  const volgordeNum = typeof o.volgorde === 'number' ? o.volgorde : Number(o.volgorde)
  const volgorde = Number.isFinite(volgordeNum) ? volgordeNum : 0

  const bijgewerkt = typeof o.bijgewerkt === 'string' ? o.bijgewerkt : ''

  return { id, titel, tekst, tags, actief, volgorde, bijgewerkt }
}
