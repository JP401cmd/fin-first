// ── News Selection — pure helpers voor bronartikel-selectie en grounding ──
//
// Drie verantwoordelijkheden, allemaal puur en getest:
// 1. selectSourceArticles — kiest welke bronartikelen de generatieprompt ingaan
//    (categoriespreiding + recency-decay + voorkeur voor ongebruikt)
// 2. filterGroundedItems — verwijdert gegenereerde items waarvan de sourceUrl
//    niet uit de aangeleverde bronnen komt (anti-hallucinatie)
// 3. dedupeSimilarTitles — inhoudelijke dedupe op titel-gelijkenis, naast de
//    URL-dedupe in de database

// ── Types ────────────────────────────────────────────────────────────

export interface SelectableArticle {
  id: string
  title: string
  summary: string | null
  source_url: string
  source_name: string
  category: string | null
  published_at: string | null
  potential_impact: string | null
  is_used: boolean
}

// ── URL-normalisatie ─────────────────────────────────────────────────

/** Normaliseer een URL voor vergelijking: lowercase host, geen trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}${u.hash}`
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase()
  }
}

// ── 1. Bronartikel-selectie ──────────────────────────────────────────

/**
 * Score een artikel op nieuwswaarde voor de generatieprompt.
 * - Recency: lineaire decay over `windowDays` dagen sinds publicatie
 * - Ongebruikt: bonus zodat verse artikelen voorrang krijgen op herhaling
 * - Impact: bonus als de ingest-analyse concrete impact zag
 */
function scoreArticle(article: SelectableArticle, now: Date, windowDays: number): number {
  let score = 0

  if (article.published_at) {
    const ageDays = (now.getTime() - new Date(article.published_at).getTime()) / 86_400_000
    score += Math.max(0, 1 - ageDays / windowDays) * 3
  }

  if (!article.is_used) score += 1.5

  const impact = (article.potential_impact || '').trim().toLowerCase()
  if (impact && !impact.startsWith('geen directe impact')) score += 2

  return score
}

/**
 * Selecteer maximaal `limit` artikelen met spreiding over categorieën.
 * Round-robin over categorieën (gesorteerd op beste artikel per categorie),
 * binnen elke categorie op score aflopend. Artikelen zonder categorie doen
 * mee als eigen groep.
 */
export function selectSourceArticles(
  articles: SelectableArticle[],
  opts: { limit?: number; now?: Date; windowDays?: number } = {},
): SelectableArticle[] {
  const limit = opts.limit ?? 40
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? 30

  if (articles.length <= limit) {
    return [...articles].sort(
      (a, b) => scoreArticle(b, now, windowDays) - scoreArticle(a, now, windowDays),
    )
  }

  // Groepeer per categorie, sorteer binnen elke groep op score
  const groups = new Map<string, SelectableArticle[]>()
  for (const article of articles) {
    const key = article.category || 'overig'
    const group = groups.get(key) ?? []
    group.push(article)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => scoreArticle(b, now, windowDays) - scoreArticle(a, now, windowDays))
  }

  // Round-robin: categorieën gesorteerd op hun beste artikel
  const sortedGroups = [...groups.values()].sort(
    (a, b) => scoreArticle(b[0], now, windowDays) - scoreArticle(a[0], now, windowDays),
  )

  const selected: SelectableArticle[] = []
  let round = 0
  while (selected.length < limit) {
    let pickedAny = false
    for (const group of sortedGroups) {
      if (selected.length >= limit) break
      const candidate = group[round]
      if (candidate) {
        selected.push(candidate)
        pickedAny = true
      }
    }
    if (!pickedAny) break
    round++
  }

  return selected
}

// ── 2. Grounding-filter ──────────────────────────────────────────────

export interface GroundableItem {
  sourceUrl?: string
}

/**
 * Houd alleen gegenereerde items waarvan de sourceUrl daadwerkelijk uit de
 * aangeleverde bronartikelen komt. Zonder bronnen (allowedUrls leeg) wordt
 * niets gefilterd — dan is er niets om tegen te toetsen.
 */
export function filterGroundedItems<T extends GroundableItem>(
  items: T[],
  allowedUrls: string[],
): { kept: T[]; dropped: T[] } {
  if (allowedUrls.length === 0) return { kept: items, dropped: [] }

  const allowed = new Set(allowedUrls.map(normalizeUrl))
  const kept: T[] = []
  const dropped: T[] = []

  for (const item of items) {
    if (item.sourceUrl && allowed.has(normalizeUrl(item.sourceUrl))) {
      kept.push(item)
    } else {
      dropped.push(item)
    }
  }

  return { kept, dropped }
}

// ── 3. Titel-dedupe ──────────────────────────────────────────────────

/** Normaliseer een titel naar een set betekenisvolle tokens. */
function titleTokens(title: string): Set<string> {
  const stopwords = new Set([
    'de', 'het', 'een', 'en', 'van', 'in', 'op', 'voor', 'met', 'naar',
    'aan', 'bij', 'door', 'over', 'tot', 'uit', 'is', 'zijn', 'wordt',
    'worden', 'niet', 'ook', 'dat', 'dit', 'die', 'te', 'om', 'per',
  ])
  return new Set(
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stopwords.has(t)),
  )
}

/** Jaccard-overlap tussen twee token-sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}

const TITLE_SIMILARITY_THRESHOLD = 0.6

/**
 * Verwijder kandidaten waarvan de titel sterk lijkt op een al bestaande titel
 * of op een eerdere kandidaat in de batch. Volgorde bepaalt prioriteit: de
 * eerste van een duplicaat-paar wint.
 */
export function dedupeSimilarTitles<T extends { title: string }>(
  candidates: T[],
  existingTitles: string[] = [],
): { kept: T[]; duplicates: T[] } {
  const seen: Set<string>[] = existingTitles.map(titleTokens)
  const kept: T[] = []
  const duplicates: T[] = []

  for (const candidate of candidates) {
    const tokens = titleTokens(candidate.title)
    const isDuplicate = seen.some((other) => jaccard(tokens, other) >= TITLE_SIMILARITY_THRESHOLD)
    if (isDuplicate) {
      duplicates.push(candidate)
    } else {
      kept.push(candidate)
      seen.push(tokens)
    }
  }

  return { kept, duplicates }
}

// ── 4. Synthetische artikel-URL ──────────────────────────────────────

/** Klein, stabiel hash-suffix (djb2) voor synthetische artikel-URL's. */
function titleHash(title: string): string {
  let hash = 5381
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) + hash + title.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/**
 * Web-geëxtraheerde artikelen zonder eigen item-URL vallen terug op de
 * paginale URL — de unique constraint op source_url liet daardoor maar één
 * artikel per bronpagina toe. Maak de URL uniek met een titel-hash-fragment;
 * de link landt nog steeds op de juiste pagina.
 */
export function ensureUniqueArticleUrl(articleUrl: string, pageUrl: string, title: string): string {
  if (normalizeUrl(articleUrl) !== normalizeUrl(pageUrl)) return articleUrl
  const base = articleUrl.split('#')[0]
  return `${base}#tf-${titleHash(title)}`
}
