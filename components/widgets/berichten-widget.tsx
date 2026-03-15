'use client'

import { useState, useEffect } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Newspaper } from 'lucide-react'

interface NewsItemCached {
  id: string
  headline: string
  summary: string
  category: string
  date: string
}

interface LocalNewsCache {
  items: NewsItemCached[]
  fetchedAt: number
}

const NEWS_LOCAL_CACHE_KEY = 'trifinity_news_cache'

const CATEGORY_DOT: Record<string, string> = {
  fiscaal:      'bg-kern-400',
  rente:        'bg-blue-400',
  woningmarkt:  'bg-purple-400',
  beleggingen:  'bg-wil-400',
  pensioen:     'bg-horizon-400',
  macro:        'bg-zinc-400',
}

const CATEGORY_LABEL: Record<string, string> = {
  fiscaal:      'Fiscaal',
  rente:        'Rente',
  woningmarkt:  'Woningmarkt',
  beleggingen:  'Beleggingen',
  pensioen:     'Pensioen',
  macro:        'Macro',
}

function useNewsCache(): NewsItemCached[] | null {
  const [items, setItems] = useState<NewsItemCached[] | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NEWS_LOCAL_CACHE_KEY)
      if (!raw) return
      const cache: LocalNewsCache = JSON.parse(raw)
      if (cache.items?.length > 0) setItems(cache.items)
    } catch {
      // Silent fail
    }
  }, [])

  return items
}

function getEditionNumber(): number {
  const now = new Date()
  const launchDate = new Date(2026, 0, 1)
  return Math.max(1, Math.floor((now.getTime() - launchDate.getTime()) / 86_400_000))
}

function formatDateline(): string {
  return new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
  })
}

interface Props {
  size: WidgetSize
  href?: string
}

export function BerichtenWidget({ size, href }: Props) {
  const news = useNewsCache()
  const edition = getEditionNumber()

  // ── Empty state: no cached news — link to /berichten ──
  if (!news) {
    return (
      <WidgetShell module="cross" size={size} kicker="Berichten" href={href}>
        <WidgetEmpty icon={Newspaper} message="Bekijk je persoonlijke editie op de berichten-pagina" />
      </WidgetShell>
    )
  }

  // ── Mini: new article count ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Berichten" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {news.length} nieuw
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: edition + 1 headline + category dot ──
  if (size === 'quarter') {
    const item = news[0]
    const dot = CATEGORY_DOT[item.category] ?? 'bg-zinc-400'

    return (
      <WidgetShell module="cross" size={size} kicker="Berichten" href={href}>
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)] mb-1.5">
          Editie {edition}
        </p>
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <p className="text-xs text-[var(--ink-2)] leading-relaxed line-clamp-2">
            {item.headline}
          </p>
        </div>
        {news.length > 1 && (
          <p className="mt-1 text-[10px] text-[var(--ink-4)]">
            +{news.length - 1} meer
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: edition + date + 2 headlines with category badges ──
  if (size === 'half') {
    const shown = news.slice(0, 2)

    return (
      <WidgetShell module="cross" size={size} kicker="Berichten" href={href}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
            Editie {edition}
          </span>
          <span className="text-[var(--ink-4)]">&middot;</span>
          <span className="font-source-serif text-[11px] italic text-[var(--ink-4)]">
            {formatDateline()}
          </span>
        </div>
        <ul className="space-y-1.5">
          {shown.map(item => {
            const dot = CATEGORY_DOT[item.category] ?? 'bg-zinc-400'
            const label = CATEGORY_LABEL[item.category] ?? item.category
            return (
              <li key={item.id} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                <span className="flex-1 text-sm text-[var(--ink-2)] line-clamp-1">
                  {item.headline}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-[var(--ink-4)]">
                  {label}
                </span>
              </li>
            )
          })}
        </ul>
        {news.length > 2 && (
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">+{news.length - 2} meer</p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: edition + date + subtitle + 4 headlines with category + summary ──
  const shown = news.slice(0, 4)

  return (
    <WidgetShell module="cross" size={size} kicker="Berichten" href={href}>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Editie {edition}
        </span>
        <span className="text-[var(--ink-4)]">&middot;</span>
        <span className="font-source-serif text-[11px] italic text-[var(--ink-4)]">
          {formatDateline()}
        </span>
      </div>
      <p className="font-source-serif text-[11px] italic text-[var(--ink-3)] mb-3">
        Persoonlijk financieel overzicht
      </p>

      <div className="space-y-3">
        {shown.map(item => {
          const dot = CATEGORY_DOT[item.category] ?? 'bg-zinc-400'
          const label = CATEGORY_LABEL[item.category] ?? item.category
          return (
            <div key={item.id}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                <span className="text-sm font-medium text-[var(--ink)] line-clamp-1">
                  {item.headline}
                </span>
                <span className="ml-auto shrink-0 text-[10px] font-medium text-[var(--ink-4)]">
                  {label}
                </span>
              </div>
              <p className="pl-[14px] text-xs text-[var(--ink-3)] line-clamp-1 leading-relaxed">
                {item.summary}
              </p>
            </div>
          )
        })}
      </div>

      {news.length > 4 && (
        <p className="mt-2 text-[11px] text-[var(--ink-4)]">+{news.length - 4} meer</p>
      )}
    </WidgetShell>
  )
}
