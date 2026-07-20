import type { ReportAiInsight } from '@/lib/report-data'
import { PullQuote as EditorialPullQuote } from '@/components/editorial'

const MODULE_NAMES: Record<ReportAiInsight['module'], string> = {
  kern: 'Overzicht',
  wil: 'Tips & acties',
  horizon: 'Toekomst',
}

const AVATAR_NAMES: Record<string, string> = {
  fhin: 'Fin',
  finn: 'Fin',
  ffin: 'Fin',
  will: 'Fin',
}

export function PullQuote({ insight }: { insight: ReportAiInsight }) {
  const moduleName = MODULE_NAMES[insight.module]
  const avatarName = AVATAR_NAMES[insight.avatar] || insight.avatar

  return (
    <div>
      <EditorialPullQuote>{insight.quote}</EditorialPullQuote>
      <p className="-mt-3 mb-6 pl-7 sm:pl-9 font-source-serif text-[11px] italic text-[var(--ink-3)]">
        — {avatarName}, {moduleName}
      </p>
    </div>
  )
}

export function PullQuoteSection({ insights }: { insights: ReportAiInsight[] }) {
  if (insights.length === 0) return null

  return (
    <div className="report-section my-10">
      <p className="mb-4 text-center font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        Redactioneel commentaar
      </p>
      {insights.map((insight, i) => (
        <PullQuote key={i} insight={insight} />
      ))}
    </div>
  )
}
