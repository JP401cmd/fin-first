'use client'

import { useCallback } from 'react'
import { TrendingUp, Lightbulb, MessageSquare, CheckCheck, Loader2, ExternalLink } from 'lucide-react'
import { useChatContext } from '@/components/app/chat/chat-provider'
import type { NewsItem } from '@/app/api/news/route'

// ── Category config ──────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  fiscaal: { label: 'Fiscaal', color: 'bg-kern-50 text-kern-700 border-kern-200', dotColor: 'bg-kern-400' },
  rente: { label: 'Rente', color: 'bg-blue-50 text-blue-700 border-blue-200', dotColor: 'bg-blue-400' },
  woningmarkt: { label: 'Woningmarkt', color: 'bg-purple-50 text-purple-700 border-purple-200', dotColor: 'bg-purple-400' },
  beleggingen: { label: 'Beleggingen', color: 'bg-wil-50 text-wil-700 border-wil-200', dotColor: 'bg-wil-400' },
  pensioen: { label: 'Pensioen', color: 'bg-horizon-50 text-horizon-700 border-horizon-200', dotColor: 'bg-horizon-400' },
  macro: { label: 'Macro', color: 'bg-zinc-100 text-zinc-700 border-zinc-200', dotColor: 'bg-zinc-400' },
}

// ── Format news date ─────────────────────────────────────────────────

export function formatNewsDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ── Category badge ───────────────────────────────────────────────────

export function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.macro
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cat.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cat.dotColor}`} />
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.06em]">
        {cat.label}
      </span>
    </span>
  )
}

// ── Impact block ─────────────────────────────────────────────────────

export function ImpactBlock({ impact }: { impact: string }) {
  return (
    <div className="mt-3 rounded-[var(--r)] border-l-3 border-wil-400 bg-wil-50/60 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-wil-600" />
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-wil-700">
          Impact voor jou
        </span>
      </div>
      <p className="font-source-serif text-[13px] leading-relaxed text-wil-900">
        {impact}
      </p>
    </div>
  )
}

// ── Relevance block ─────────────────────────────────────────────────

export function RelevanceBlock({ relevance }: { relevance: string }) {
  return (
    <div className="mt-3 rounded-[var(--r)] border-l-3 border-[var(--border-md)] bg-[var(--subtle)]/60 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-[var(--ink-3)]" />
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Relevant voor jou
        </span>
      </div>
      <p className="font-source-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
        {relevance}
      </p>
    </div>
  )
}

// ── News article actions ─────────────────────────────────────────────

export function NewsArticleActions({ item, isRead, onMarkRead }: { item: NewsItem; isRead: boolean; onMarkRead: (id: string) => void }) {
  const { openWithMessage } = useChatContext()

  const handleDiscuss = useCallback(() => {
    onMarkRead(item.id)

    const googleNewsUrl = `https://news.google.com/search?q=${encodeURIComponent(
      item.sourceContext || item.headline
    )}&hl=nl&gl=NL&ceid=NL:nl`

    const message = `Ik las dit nieuwsartikel:\n\n"${item.headline}"\n\n${item.summary}\n\n` +
      `Hier is een link naar gerelateerd nieuws: ${googleNewsUrl}\n\n` +
      `Wat betekent dit voor mijn financiële situatie? ` +
      `Deel de link als je aanraadt om meer te lezen, en verwijs ernaar bij het voorstellen van acties.`

    openWithMessage(message)
  }, [item, onMarkRead, openWithMessage])

  const handleToggleRead = useCallback(() => {
    onMarkRead(item.id)
  }, [item.id, onMarkRead])

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={handleDiscuss}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] border border-wil-200 bg-wil-50 px-3 py-2 font-inter text-[11px] font-medium text-wil-700 transition-colors hover:bg-wil-100 sm:min-h-0 sm:px-2 sm:py-1"
      >
        <MessageSquare className="h-3 w-3" />
        Bespreek met Will
      </button>
      {!isRead && (
        <button
          type="button"
          onClick={handleToggleRead}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] px-3 py-2 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] sm:min-h-0 sm:px-2 sm:py-1"
        >
          <CheckCheck className="h-3 w-3" />
          Gelezen
        </button>
      )}
    </div>
  )
}

// ── Hero news article ────────────────────────────────────────────────

export function HeroNewsArticle({ item, isRead, onMarkRead, readOnly }: {
  item: NewsItem
  isRead: boolean
  onMarkRead: (id: string) => void
  readOnly?: boolean
}) {
  const firstLetter = item.summary.charAt(0)
  const restOfSummary = item.summary.slice(1)

  return (
    <article className={`mb-8 transition-opacity duration-300 ${isRead && !readOnly ? 'opacity-70' : ''}`}>
      <div className="mb-3 flex items-center gap-3">
        <CategoryBadge category={item.category} />
        {!isRead && !readOnly && (
          <span className="h-2 w-2 rounded-full bg-wil-500" title="Nieuw" />
        )}
        {item.sourceContext && (
          <span className="font-inter text-[11px] text-[var(--ink-4)]">
            {item.sourceContext}
          </span>
        )}
      </div>

      <h2
        className="font-source-serif text-2xl font-semibold leading-snug text-[var(--ink)] sm:text-3xl"
        style={{ letterSpacing: '-0.02em' }}
      >
        {item.headline}
      </h2>

      <p className="mt-3 font-source-serif text-base leading-relaxed text-[var(--ink-2)] sm:text-lg">
        <span
          className="float-left mr-2 font-playfair text-[3.2rem] font-bold leading-[0.8] text-[var(--ink)]"
          aria-hidden="true"
        >
          {firstLetter}
        </span>
        <span aria-label={item.summary}>{restOfSummary}</span>
      </p>

      <div className="mt-3 flex items-center gap-1 clear-left">
        <span className="font-inter text-[11px] text-[var(--ink-4)]">
          {formatNewsDate(item.date)}
        </span>
        {item.sourceUrl && (
          <>
            <span className="text-[var(--ink-4)]">&middot;</span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 font-inter text-[11px] text-[var(--ink-4)] underline decoration-[var(--ink-4)]/30 underline-offset-2 transition-colors hover:text-[var(--ink-2)]"
            >
              {item.sourceName || 'Bron'}
              <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" />
            </a>
          </>
        )}
      </div>

      {item.impactType === 'relevant' ? (
        <RelevanceBlock relevance={item.personalImpact} />
      ) : (
        <ImpactBlock impact={item.personalImpact} />
      )}
      {!readOnly && <NewsArticleActions item={item} isRead={isRead} onMarkRead={onMarkRead} />}
      <div className="mt-6 h-px bg-[var(--border-ed)]" />
    </article>
  )
}

// ── Regular news article ─────────────────────────────────────────────

export function NewsArticle({ item, isRead, onMarkRead, readOnly }: {
  item: NewsItem
  isRead: boolean
  onMarkRead: (id: string) => void
  readOnly?: boolean
}) {
  return (
    <article className={`flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)] transition-opacity transition-shadow duration-300 hover:shadow-[var(--s1)] ${isRead && !readOnly ? 'opacity-70' : ''}`}>
      <div className="mb-2.5 flex items-center gap-3">
        <CategoryBadge category={item.category} />
        {!isRead && !readOnly && (
          <span className="h-2 w-2 rounded-full bg-wil-500" title="Nieuw" />
        )}
        {item.sourceContext && (
          <span className="font-inter text-[11px] text-[var(--ink-4)]">
            {item.sourceContext}
          </span>
        )}
      </div>

      <h3 className="font-source-serif text-lg font-semibold leading-snug text-[var(--ink)]">
        {item.headline}
      </h3>

      <p className="mt-1.5 flex-1 font-source-serif text-sm leading-relaxed text-[var(--ink-2)]">
        {item.summary}
      </p>

      <div className="mt-2 flex items-center gap-1">
        <span className="font-inter text-[11px] text-[var(--ink-4)]">
          {formatNewsDate(item.date)}
        </span>
        {item.sourceUrl && (
          <>
            <span className="text-[var(--ink-4)]">&middot;</span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 font-inter text-[11px] text-[var(--ink-4)] underline decoration-[var(--ink-4)]/30 underline-offset-2 transition-colors hover:text-[var(--ink-2)]"
            >
              {item.sourceName || 'Bron'}
              <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" />
            </a>
          </>
        )}
      </div>

      {item.impactType === 'relevant' ? (
        <RelevanceBlock relevance={item.personalImpact} />
      ) : (
        <ImpactBlock impact={item.personalImpact} />
      )}
      {!readOnly && <NewsArticleActions item={item} isRead={isRead} onMarkRead={onMarkRead} />}
    </article>
  )
}

// ── News skeleton loader ─────────────────────────────────────────────

export function NewsSkeletonLoader() {
  return (
    <div>
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
        </div>
        <div className="space-y-2">
          <div className="h-7 w-full animate-pulse rounded bg-[var(--subtle)] sm:h-9" />
          <div className="h-7 w-3/4 animate-pulse rounded bg-[var(--subtle)] sm:h-9" />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="h-4 w-full animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
        </div>
        <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[var(--subtle)]" />
        <div className="mt-3 rounded-[var(--r)] border-l-3 border-[var(--subtle)] bg-[var(--subtle)]/30 px-4 py-3">
          <div className="mb-1 h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
        </div>
        <div className="mt-6 h-px bg-[var(--border-ed)]" />
      </div>
      <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]"
          >
            <div className="mb-2.5 h-5 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
            <div className="space-y-1.5">
              <div className="h-5 w-full animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
        <p className="font-source-serif text-sm italic text-[var(--ink-3)]">
          Nieuws wordt gepersonaliseerd&hellip;
        </p>
      </div>
    </div>
  )
}
