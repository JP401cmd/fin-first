/**
 * Aggregatie van `news_feedback` voor het beheervenster op `/beheer/nieuws`
 * (ADR 0113).
 *
 * WAAROM DIT GEEN INBOX IS. `news_feedback` draagt `verdict: 'less' | 'more'`
 * per (gebruiker, artikel) — dat is een VOORKEURSSIGNAAL, geen melding die
 * afhandeling vraagt. Er is geen natuurlijke `new -> reviewed`; een statusknop
 * zou afvinkbaarheid faken op een tabel die er niet om vraagt. Vandaar een
 * alleen-lezen aggregaat, en dat staat eerlijk zo in het beheerders-runbook.
 *
 * PRIVACY-VORM (dwingend, geen stijlkeuze). Beheer heeft nodig "welke
 * categorieën dempen mensen", niet "wie dempte wat". `user_id` gaat deze module
 * wél in — de demotieregel van `/api/news` is namelijk PER GEBRUIKER, dus zonder
 * die sleutel kun je het effect niet eerlijk weergeven — maar komt er alleen als
 * TELLING weer uit. Er is geen veld waarin een identiteit past, en de route
 * stuurt `user_id` nooit naar de client.
 *
 * Puur: geen DB, geen I/O. De route levert de rijen, deze module de betekenis.
 */

export type NewsVerdict = 'less' | 'more'

/** De kolommen die het aggregaat nodig heeft. */
export interface NewsFeedbackRow {
  user_id: string
  article_id: string
  headline: string | null
  category: string | null
  verdict: NewsVerdict
  created_at: string
}

export interface NewsFeedbackCategoryStat {
  category: string
  less: number
  more: number
  /** less - more; positief = per saldo gedempt. Sorteersleutel. */
  net: number
  /** Aantal onderscheiden gebruikers dat deze categorie beoordeelde. */
  users: number
  /**
   * Aantal lezers dat de demotiedrempel haalt, bepaald met {@link demotedCategories}
   * — dezelfde functie die `/api/news` gebruikt, niet een kopie ervan. Voor díe
   * lezers stuurt de nieuwsgeneratie aan op alleen nog hoge-impact-items uit
   * deze categorie. Altijd 0 voor de bucket zonder categorie.
   */
  demotedForUsers: number
}

export interface NewsFeedbackHeadlineStat {
  articleId: string
  headline: string | null
  category: string | null
  less: number
  more: number
  lastAt: string
}

export interface NewsFeedbackSummary {
  totalRows: number
  less: number
  more: number
  /** Aantal onderscheiden artikelen waarop is gereageerd. */
  articles: number
  /** Aantal onderscheiden gebruikers dat ooit feedback gaf. */
  users: number
  categories: NewsFeedbackCategoryStat[]
  /** Meest recent beoordeelde koppen, nieuwste eerst. */
  recent: NewsFeedbackHeadlineStat[]
  /** Nieuwste feedbackmoment, of null bij een lege inbak. */
  lastAt: string | null
}

/** Vanaf dit aantal 'less' binnen het venster demoveert een categorie voor die lezer. */
export const NEWS_DEMOTION_LESS_THRESHOLD = 2
/** Venster waarin die 'less'-stemmen tellen. */
export const NEWS_DEMOTION_WINDOW_DAYS = 90

/**
 * Bucketlabel voor rijen zonder categorie. Belangrijk: `/api/news` slaat die
 * rijen bij de demotiebepaling OVER (`if (!row.category) continue`), dus deze
 * bucket kan per definitie nooit "gedempt" zijn — hij bestaat alleen zodat het
 * venster de rijen niet stil laat verdwijnen.
 */
export const ZONDER_CATEGORIE = 'zonder categorie'

/**
 * DE canonieke demotieregel — één implementatie, twee consumenten.
 *
 * `/api/news` gebruikt hem om de nieuwsgeneratie te sturen; het beheervenster op
 * `/beheer/nieuws` gebruikt hem om te tónen hoeveel lezers hem halen. Stond dit
 * twee keer, dan zou het beheerscherm stil kunnen gaan liegen zodra de regel
 * wijzigt — en dat is precies waar `consume, don't recompute` voor bestaat.
 *
 * Rijen zonder categorie tellen NIET mee.
 */
export function demotedCategories(
  rows: readonly { category: string | null }[],
): string[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.category) continue
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= NEWS_DEMOTION_LESS_THRESHOLD)
    .map(([category]) => category)
}

/** Cutoff-ISO van het demotievenster: 'less'-stemmen ouder dan dit tellen niet. */
export function demotionWindowStartIso(now: Date = new Date()): string {
  return new Date(now.getTime() - NEWS_DEMOTION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

interface CategoryAccumulator {
  category: string
  less: number
  more: number
  users: Set<string>
  /** user_id -> aantal 'less' binnen het demotievenster. */
  recentLessPerUser: Map<string, number>
}

/**
 * @param rows       feedbackrijen (elke volgorde toegestaan)
 * @param now        referentiemoment voor het 90-dagenvenster (injectie = testbaar)
 * @param recentMax  hoeveel koppen het venster toont
 */
export function summarizeNewsFeedback(
  rows: readonly NewsFeedbackRow[],
  now: Date = new Date(),
  recentMax = 20,
): NewsFeedbackSummary {
  const windowStart = now.getTime() - NEWS_DEMOTION_WINDOW_DAYS * 24 * 60 * 60 * 1000

  const byCategory = new Map<string, CategoryAccumulator>()
  const byArticle = new Map<string, NewsFeedbackHeadlineStat>()
  const allUsers = new Set<string>()
  let less = 0
  let more = 0
  let lastAt: string | null = null

  for (const row of rows) {
    const at = new Date(row.created_at).getTime()
    allUsers.add(row.user_id)
    if (row.verdict === 'less') less += 1
    else more += 1
    if (!lastAt || at > new Date(lastAt).getTime()) lastAt = row.created_at

    const category = row.category?.trim() || ZONDER_CATEGORIE
    let cat = byCategory.get(category)
    if (!cat) {
      cat = { category, less: 0, more: 0, users: new Set(), recentLessPerUser: new Map() }
      byCategory.set(category, cat)
    }
    cat.users.add(row.user_id)
    if (row.verdict === 'less') {
      cat.less += 1
      if (Number.isFinite(at) && at >= windowStart) {
        cat.recentLessPerUser.set(row.user_id, (cat.recentLessPerUser.get(row.user_id) ?? 0) + 1)
      }
    } else {
      cat.more += 1
    }

    let art = byArticle.get(row.article_id)
    if (!art) {
      art = {
        articleId: row.article_id,
        headline: row.headline,
        category: row.category,
        less: 0,
        more: 0,
        lastAt: row.created_at,
      }
      byArticle.set(row.article_id, art)
    }
    if (row.verdict === 'less') art.less += 1
    else art.more += 1
    if (at > new Date(art.lastAt).getTime()) {
      art.lastAt = row.created_at
      // Kop/categorie kunnen per rij verschillen (de generator hergebruikt een
      // article_id); de nieuwste rij is de meest actuele weergave.
      art.headline = row.headline
      art.category = row.category
    }
  }

  const categories: NewsFeedbackCategoryStat[] = [...byCategory.values()]
    .map((c) => ({
      category: c.category,
      less: c.less,
      more: c.more,
      net: c.less - c.more,
      users: c.users.size,
      // De lege bucket kan nooit gedempt zijn: `demotedCategories` slaat rijen
      // zonder categorie over, dus /api/news demoveert hem ook nooit.
      demotedForUsers:
        c.category === ZONDER_CATEGORIE
          ? 0
          : [...c.recentLessPerUser.values()].filter(
              (rowsVanEenLezer) =>
                demotedCategories(
                  Array.from({ length: rowsVanEenLezer }, () => ({ category: c.category })),
                ).length > 0,
            ).length,
    }))
    // Sterkst gedempt bovenaan; bij gelijke stand het grootste signaal eerst.
    .sort(
      (a, b) =>
        b.net - a.net ||
        b.less + b.more - (a.less + a.more) ||
        a.category.localeCompare(b.category, 'nl'),
    )

  const recent = [...byArticle.values()]
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .slice(0, recentMax)

  return {
    totalRows: rows.length,
    less,
    more,
    articles: byArticle.size,
    users: allUsers.size,
    categories,
    recent,
    lastAt,
  }
}
