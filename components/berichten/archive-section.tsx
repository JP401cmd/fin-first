'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Loader2, Archive } from 'lucide-react'
import { Masthead } from './masthead'
import { HeroNewsArticle, NewsArticle } from './news-components'
import { ArchiveEditionCard, type EditionSummary } from './archive-edition-card'
import { NewspaperFooter } from './newspaper-footer'
import type { NewsItem } from '@/app/api/news/route'

interface FullEdition extends EditionSummary {
  articles: NewsItem[]
}

// Noop handler for readOnly articles
const noop = () => {}

export function ArchiveSection() {
  const [editions, setEditions] = useState<EditionSummary[]>([])
  const [selectedEdition, setSelectedEdition] = useState<FullEdition | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    fetch('/api/news/archive')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.editions) setEditions(data.editions)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadEdition = useCallback(async (editionNr: number) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/news/archive?edition=${editionNr}`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.edition) setSelectedEdition(data.edition)
    } catch {
      // Silent fail
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const goBack = useCallback(() => {
    setSelectedEdition(null)
  }, [])

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
      </div>
    )
  }

  // ── Detail view ──
  if (selectedEdition) {
    const dateline = new Date(selectedEdition.created_at).toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    const articles: NewsItem[] = selectedEdition.articles

    return (
      <div>
        <button
          type="button"
          onClick={goBack}
          className="mb-4 flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-2 py-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Terug naar archief
        </button>

        <Masthead
          editionNr={selectedEdition.edition_nr}
          jaargang={selectedEdition.jaargang}
          dateline={dateline}
        />

        {articles.length > 0 && (
          <div>
            <HeroNewsArticle
              item={articles[0]}
              isRead={false}
              onMarkRead={noop}
              readOnly
            />
            {articles.length > 1 && (
              <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                {articles.slice(1).map((item) => (
                  <NewsArticle
                    key={item.id}
                    item={item}
                    isRead={false}
                    onMarkRead={noop}
                    readOnly
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <NewspaperFooter />
      </div>
    )
  }

  // ── Loading detail overlay ──
  if (loadingDetail) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
        <span className="ml-2 font-source-serif text-sm italic text-[var(--ink-3)]">
          Editie wordt geladen&hellip;
        </span>
      </div>
    )
  }

  // ── Empty state ──
  if (editions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-8 py-16 text-center shadow-[var(--s0)]">
        <Archive className="h-8 w-8 text-[var(--ink-4)]" />
        <p className="font-inter text-sm text-[var(--ink-3)]">
          Nog geen archief.
        </p>
        <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
          Ververs het nieuws om je eerste editie te archiveren.
        </p>
      </div>
    )
  }

  // ── List view grouped by jaargang ──
  const jaargangMap = new Map<number, EditionSummary[]>()
  for (const edition of editions) {
    const group = jaargangMap.get(edition.jaargang) ?? []
    group.push(edition)
    jaargangMap.set(edition.jaargang, group)
  }
  const jaargangen = Array.from(jaargangMap.entries()).sort(([a], [b]) => b - a)

  return (
    <div className="space-y-6">
      {jaargangen.map(([jaargang, editionGroup]) => (
        <div key={jaargang}>
          <div className="mb-3 flex items-center gap-4">
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Jaargang {jaargang} ({2025 + jaargang})
            </span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editionGroup.map((edition) => (
              <ArchiveEditionCard
                key={edition.id}
                edition={edition}
                onClick={loadEdition}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
