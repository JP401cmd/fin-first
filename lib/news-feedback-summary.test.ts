import { describe, it, expect } from 'vitest'
import {
  demotedCategories,
  demotionWindowStartIso,
  summarizeNewsFeedback,
  ZONDER_CATEGORIE,
  type NewsFeedbackRow,
} from './news-feedback-summary'

/**
 * Het beheervenster is een AGGREGAAT, geen inbox (ADR 0113). Deze suite bewaakt
 * de twee dingen die het eerlijk houden: de demotie-telling volgt de regel van
 * `/api/news` (>= 2x 'less' per gebruiker binnen 90 dagen), en er komt nergens
 * een identiteit uit — alleen tellingen.
 */

const NU = new Date('2026-08-28T12:00:00.000Z')

function row(over: Partial<NewsFeedbackRow> = {}): NewsFeedbackRow {
  return {
    user_id: 'u1',
    article_id: 'a1',
    headline: 'Kop',
    category: 'beleggen',
    verdict: 'less',
    created_at: '2026-08-20T10:00:00.000Z',
    ...over,
  }
}

describe('summarizeNewsFeedback', () => {
  it('lege stapel levert een leeg, bruikbaar aggregaat', () => {
    const s = summarizeNewsFeedback([], NU)
    expect(s.totalRows).toBe(0)
    expect(s.categories).toEqual([])
    expect(s.recent).toEqual([])
    expect(s.lastAt).toBeNull()
    expect(s.users).toBe(0)
  })

  it('telt minder/meer per categorie en onderscheidt lezers', () => {
    const s = summarizeNewsFeedback(
      [
        row({ user_id: 'u1', article_id: 'a1', verdict: 'less' }),
        row({ user_id: 'u2', article_id: 'a2', verdict: 'more' }),
        row({ user_id: 'u2', article_id: 'a3', verdict: 'less', category: 'pensioen' }),
      ],
      NU,
    )
    expect(s.totalRows).toBe(3)
    expect(s.less).toBe(2)
    expect(s.more).toBe(1)
    expect(s.articles).toBe(3)
    expect(s.users).toBe(2)
    const beleggen = s.categories.find((c) => c.category === 'beleggen')
    expect(beleggen).toMatchObject({ less: 1, more: 1, net: 0, users: 2 })
  })

  it('demotie telt PER GEBRUIKER, niet over alle lezers samen', () => {
    // Twee lezers die elk één keer 'minder' zeggen halen de drempel NIET —
    // de regel in /api/news filtert op user_id.
    const gedeeld = summarizeNewsFeedback(
      [
        row({ user_id: 'u1', article_id: 'a1' }),
        row({ user_id: 'u2', article_id: 'a2' }),
      ],
      NU,
    )
    expect(gedeeld.categories[0].demotedForUsers).toBe(0)

    // Eén lezer die twee keer 'minder' zegt haalt hem wél.
    const eenLezer = summarizeNewsFeedback(
      [
        row({ user_id: 'u1', article_id: 'a1' }),
        row({ user_id: 'u1', article_id: 'a2' }),
      ],
      NU,
    )
    expect(eenLezer.categories[0].demotedForUsers).toBe(1)
  })

  it('stemmen buiten het 90-dagenvenster tellen niet mee voor demotie', () => {
    const s = summarizeNewsFeedback(
      [
        row({ user_id: 'u1', article_id: 'a1', created_at: '2026-08-20T10:00:00.000Z' }),
        row({ user_id: 'u1', article_id: 'a2', created_at: '2025-01-01T10:00:00.000Z' }),
      ],
      NU,
    )
    expect(s.categories[0].less).toBe(2)
    expect(s.categories[0].demotedForUsers).toBe(0)
  })

  it('rijen zonder categorie krijgen een leesbare bucket die nooit gedempt is', () => {
    const s = summarizeNewsFeedback(
      [
        row({ category: null, article_id: 'a1' }),
        row({ category: null, article_id: 'a2' }),
      ],
      NU,
    )
    expect(s.categories[0].category).toBe(ZONDER_CATEGORIE)
    expect(s.categories[0].less).toBe(2)
    // /api/news slaat rijen zonder categorie over bij de demotiebepaling, dus
    // het venster mag hier nooit "gedempt voor N lezers" tonen.
    expect(s.categories[0].demotedForUsers).toBe(0)
  })

  it('recente koppen zijn nieuwste-eerst en per artikel samengevoegd', () => {
    const s = summarizeNewsFeedback(
      [
        row({ user_id: 'u1', article_id: 'a1', created_at: '2026-08-01T10:00:00.000Z' }),
        row({ user_id: 'u2', article_id: 'a1', verdict: 'more', created_at: '2026-08-05T10:00:00.000Z', headline: 'Nieuwere kop' }),
        row({ user_id: 'u1', article_id: 'a2', created_at: '2026-08-10T10:00:00.000Z' }),
      ],
      NU,
    )
    expect(s.recent.map((r) => r.articleId)).toEqual(['a2', 'a1'])
    const a1 = s.recent.find((r) => r.articleId === 'a1')
    expect(a1).toMatchObject({ less: 1, more: 1, headline: 'Nieuwere kop' })
  })

  it('geeft nergens een user_id terug — alleen tellingen', () => {
    const s = summarizeNewsFeedback([row({ user_id: 'geheime-uuid' })], NU)
    expect(JSON.stringify(s)).not.toContain('geheime-uuid')
  })
})

describe('demotedCategories — de gedeelde regel', () => {
  it('is dezelfde regel die /api/news gebruikt: >= 2x binnen het venster', () => {
    expect(demotedCategories([{ category: 'beleggen' }])).toEqual([])
    expect(demotedCategories([{ category: 'beleggen' }, { category: 'beleggen' }])).toEqual([
      'beleggen',
    ])
  })

  it('negeert rijen zonder categorie', () => {
    expect(demotedCategories([{ category: null }, { category: null }])).toEqual([])
  })

  it('het venster ligt 90 dagen terug', () => {
    const start = new Date(demotionWindowStartIso(NU))
    const dagen = Math.round((NU.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    expect(dagen).toBe(90)
  })

  it('de paneeltelling en de nieuwsroute-uitkomst zeggen hetzelfde', () => {
    const rijen = [
      row({ user_id: 'u1', article_id: 'a1', category: 'beleggen' }),
      row({ user_id: 'u1', article_id: 'a2', category: 'beleggen' }),
      row({ user_id: 'u2', article_id: 'a3', category: 'pensioen' }),
    ]
    // Wat /api/news voor u1 zou demoveren:
    const voorU1 = demotedCategories(rijen.filter((r) => r.user_id === 'u1' && r.verdict === 'less'))
    expect(voorU1).toEqual(['beleggen'])
    // Wat het beheervenster daarover meldt:
    const s = summarizeNewsFeedback(rijen, NU)
    expect(s.categories.find((c) => c.category === 'beleggen')?.demotedForUsers).toBe(1)
    expect(s.categories.find((c) => c.category === 'pensioen')?.demotedForUsers).toBe(0)
  })
})
