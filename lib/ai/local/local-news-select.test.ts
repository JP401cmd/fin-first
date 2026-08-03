import { describe, it, expect } from 'vitest'
import {
  composeLocalNewsItem,
  selectWinners,
  LOCAL_NEWS_MAX_ITEMS,
  LOCAL_NEWS_MIN_SCORE,
  type ScoredSource,
} from './local-news-select'
import type { LocalNewsSource } from './local-news-source'
import type { LocalNewsScore } from './local-news-parse'

function source(overrides: Partial<LocalNewsSource> = {}): LocalNewsSource {
  return {
    id: 'art-1',
    title: 'ECB verhoogt de rente',
    summary: 'De rente gaat naar 3,25 procent.',
    sourceUrl: 'https://www.ecb.europa.eu/persbericht-2026-03',
    sourceName: 'ECB',
    category: 'rente',
    date: '2026-03-07',
    potentialImpact: 'Raakt spaarders en hypotheekhouders.',
    ...overrides,
  }
}

function score(overrides: Partial<LocalNewsScore> = {}): LocalNewsScore {
  return {
    relevant: true,
    impactType: 'relevant',
    impactScore: 4,
    impactDirection: 'neutraal',
    ...overrides,
  }
}

const PROFIEL = '- Maanduitgaven: €2.550 · dagtarief (uitgaven per dag): €85'

describe('selectWinners — de 0-8-begrenzing zit in de CODE, niet in de prompt', () => {
  it('kapt hard af op 8, ook als het model alles relevant vindt', () => {
    // Het scenario waarvoor de drempel bestaat: een klein model zegt overal ja.
    const scored: ScoredSource[] = Array.from({ length: 25 }, (_, i) => ({
      source: source({ id: `art-${i}` }),
      score: score({ relevant: true, impactScore: 5 }),
    }))
    expect(selectWinners(scored)).toHaveLength(LOCAL_NEWS_MAX_ITEMS)
    expect(LOCAL_NEWS_MAX_ITEMS).toBe(8)
  })

  it('laat een lege editie toe — dat is een geldige uitkomst', () => {
    const scored: ScoredSource[] = [
      { source: source({ id: 'a' }), score: score({ relevant: false, impactScore: 5 }) },
      { source: source({ id: 'b' }), score: score({ relevant: true, impactScore: 1 }) },
    ]
    expect(selectWinners(scored)).toEqual([])
  })

  it('weert alles onder de score-drempel, ook bij RELEVANT: ja', () => {
    const onder: ScoredSource[] = [
      { source: source({ id: 'a' }), score: score({ impactScore: LOCAL_NEWS_MIN_SCORE - 1 }) },
    ]
    const op: ScoredSource[] = [
      { source: source({ id: 'b' }), score: score({ impactScore: LOCAL_NEWS_MIN_SCORE }) },
    ]
    expect(selectWinners(onder)).toEqual([])
    expect(selectWinners(op)).toHaveLength(1)
  })

  it('sorteert direct-impact eerst, daarbinnen op score aflopend', () => {
    const scored: ScoredSource[] = [
      { source: source({ id: 'rel-5' }), score: score({ impactType: 'relevant', impactScore: 5 }) },
      { source: source({ id: 'dir-3' }), score: score({ impactType: 'direct', impactScore: 3 }) },
      { source: source({ id: 'dir-5' }), score: score({ impactType: 'direct', impactScore: 5 }) },
    ]
    expect(selectWinners(scored).map((w) => w.source.id)).toEqual(['dir-5', 'dir-3', 'rel-5'])
  })
})

describe('composeLocalNewsItem — bronvelden komen uit de BRONRIJ, nooit uit het model', () => {
  const PROZA = {
    headline: 'Rente stijgt',
    summary: 'De ECB verhoogt de rente.',
    personalImpact: 'Als spaarder merk je dit.',
  }

  it('neemt sourceUrl, sourceName, category en date letterlijk over uit de bron', () => {
    const src = source()
    const item = composeLocalNewsItem(src, score(), PROZA, PROFIEL)

    expect(item.sourceUrl).toBe('https://www.ecb.europa.eu/persbericht-2026-03')
    expect(item.sourceName).toBe('ECB')
    expect(item.category).toBe('rente')
    expect(item.date).toBe('2026-03-07')
    expect(item.id).toBe('news-local-art-1')
  })

  it('laat modeltekst NIET in sourceUrl belanden, ook niet als het proza een URL bevat', () => {
    // Kern van de herstructurering: het proza-argument draagt de bronvelden niet
    // eens, dus er is geen pad waarlangs een gehallucineerde URL binnenkomt.
    const src = source()
    const item = composeLocalNewsItem(
      src,
      score(),
      {
        headline: 'Zie https://nep-domein.example/verzonnen',
        summary: 'Bron: https://ook-nep.example/artikel volgens Nepkrant.',
        personalImpact: 'Als spaarder merk je dit.',
      },
      PROFIEL,
    )

    expect(item.sourceUrl).toBe(src.sourceUrl)
    expect(item.sourceName).toBe(src.sourceName)
    expect(item.sourceUrl).not.toContain('nep-domein')
    expect(item.sourceName).not.toContain('Nepkrant')
  })

  it('laat de impactzin vervallen bij een verzonnen bedrag en degradeert naar relevant', () => {
    const item = composeLocalNewsItem(
      source(),
      score({ impactType: 'direct' }),
      { ...PROZA, personalImpact: 'Dit bespaart je €45 per maand.' },
      PROFIEL,
    )
    expect(item.personalImpact).toBe('')
    expect(item.impactType).toBe('relevant')
  })

  it('behoudt "direct" wanneer de bedragen wél gegrond zijn', () => {
    const item = composeLocalNewsItem(
      source(),
      score({ impactType: 'direct' }),
      { ...PROZA, personalImpact: 'Met jouw maanduitgaven van €2.550 telt dit aan.' },
      PROFIEL,
    )
    expect(item.impactType).toBe('direct')
    expect(item.personalImpact).toContain('2.550')
  })

  it('gebruikt getallen uit het bronartikel als grondslag', () => {
    const item = composeLocalNewsItem(
      source(),
      score({ impactType: 'direct' }),
      { ...PROZA, personalImpact: 'De rente van 3,25 procent raakt je spaargeld.' },
      PROFIEL,
    )
    expect(item.impactType).toBe('direct')
  })
})
