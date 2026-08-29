'use client'

import { useEffect, useState } from 'react'
import { ThumbsDown } from 'lucide-react'
import type { NewsFeedbackSummary } from '@/lib/news-feedback-summary'
import { NEWS_DEMOTION_LESS_THRESHOLD, NEWS_DEMOTION_WINDOW_DAYS } from '@/lib/news-feedback-summary'

/**
 * Nieuwsfeedback op `/beheer/nieuws` — bewust een ALLEEN-LEZEN VENSTER (ADR 0113).
 *
 * `news_feedback` draagt "minder/meer hierover" per artikel. Dat is een
 * voorkeurssignaal, geen melding die afhandeling vraagt: er is geen natuurlijke
 * `nieuw -> gelezen`. Statusknoppen zouden hier afvinkbaarheid faken op een
 * inbak die er niet om vraagt — en het beheerders-runbook waarschuwt letterlijk
 * voor een checklist die suggereert dat je alle inbakken kunt legen.
 *
 * Privacy: het aggregaat toont categorieën, koppen en TELLINGEN. Er is geen
 * kolom per gebruiker, en de route stuurt `user_id` niet mee.
 */

const dateFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

export function NewsFeedbackPanel() {
  const [summary, setSummary] = useState<NewsFeedbackSummary | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/news-feedback')
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok) {
          setError(body?.error || 'Ophalen mislukt')
        } else {
          setSummary(body.summary as NewsFeedbackSummary)
          setTruncated(Boolean(body.truncated))
        }
      })
      .catch(() => {
        if (!cancelled) setError('Ophalen mislukt')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <ThumbsDown className="h-5 w-5 text-[var(--ink-3)]" />
        <h3 className="text-lg font-bold text-[var(--ink)]">Feedback op nieuwsitems</h3>
        {summary && (
          <span className="ml-auto font-mono text-xs tabular-nums text-[var(--ink-meta)]">
            {summary.totalRows} {summary.totalRows === 1 ? 'reactie' : 'reacties'}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--ink-3)]">
        Wat lezers met &ldquo;minder/meer hierover&rdquo; aangeven. Bewust alleen-lezen: dit is een
        voorkeurssignaal, geen werkvoorraad — er valt hier niets af te vinken. Vanaf{' '}
        {NEWS_DEMOTION_LESS_THRESHOLD}&times; &ldquo;minder&rdquo; binnen {NEWS_DEMOTION_WINDOW_DAYS}{' '}
        dagen stuurt de nieuwsgeneratie voor die lezer aan op alleen nog
        hoge-impact-items uit die categorie.
      </p>

      {error ? (
        <div className="border border-[var(--negative)] bg-[var(--negative-bg)] px-3 py-2 text-sm text-[var(--negative)]">
          {error}
        </div>
      ) : loading ? (
        <p className="text-sm text-[var(--ink-meta)]">Laden...</p>
      ) : !summary || summary.totalRows === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-6 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen feedback op nieuwsitems.</p>
          <p className="mt-1 text-xs text-[var(--ink-meta)]">
            Zolang deze inbak leeg is, is er hier niets langs te lopen.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-y border-[var(--border-ed)] py-2 font-mono text-xs tabular-nums text-[var(--ink-3)]">
            <span>
              <span className="text-[var(--ink)]">{summary.less}</span> minder
            </span>
            <span>
              <span className="text-[var(--ink)]">{summary.more}</span> meer
            </span>
            <span>
              <span className="text-[var(--ink)]">{summary.articles}</span> artikelen
            </span>
            <span>
              <span className="text-[var(--ink)]">{summary.users}</span> lezers
            </span>
            {summary.lastAt && (
              <span className="text-[var(--ink-meta)]">laatst {fmt(summary.lastAt)}</span>
            )}
            {truncated && <span className="text-[var(--ink-meta)]">venster afgekapt</span>}
          </div>

          <div className="mb-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Feedback per nieuwscategorie</caption>
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)]">
                  <th scope="col" className="py-2 pr-4 font-normal">Categorie</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Minder</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Meer</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Lezers</th>
                  <th scope="col" className="py-2 text-right font-normal">Gedempt voor</th>
                </tr>
              </thead>
              <tbody>
                {summary.categories.map((c) => (
                  <tr key={c.category} className="border-b border-[var(--border-ed)]/60">
                    <td className="py-2 pr-4 text-[var(--ink)]">{c.category}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{c.less}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-2)]">{c.more}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink-3)]">{c.users}</td>
                    <td
                      className={`py-2 text-right font-mono tabular-nums ${
                        c.demotedForUsers > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-meta)]'
                      }`}
                    >
                      {c.demotedForUsers > 0
                        ? `${c.demotedForUsers} ${c.demotedForUsers === 1 ? 'lezer' : 'lezers'}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mb-2 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)]">
            Recent beoordeelde koppen
          </h4>
          <ul className="space-y-1.5">
            {summary.recent.map((r) => (
              <li
                key={r.articleId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-[var(--border-ed)]/60 pb-1.5"
              >
                <span className="min-w-0 flex-1 text-sm text-[var(--ink-2)]">
                  {r.headline || <span className="text-[var(--ink-meta)]">(kop onbekend)</span>}
                </span>
                <span className="font-mono text-xs tabular-nums text-[var(--ink-meta)]">
                  {r.category ? `${r.category} · ` : ''}
                  {r.less} minder / {r.more} meer · {fmt(r.lastAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
