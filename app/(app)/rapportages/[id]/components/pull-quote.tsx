import type { ReportAiInsight } from '@/lib/report-data'

const MODULE_CONFIG = {
  kern: { borderColor: 'border-kern-400', name: 'De Kern' },
  wil: { borderColor: 'border-wil-400', name: 'De Wil' },
  horizon: { borderColor: 'border-horizon-400', name: 'De Horizon' },
}

const AVATAR_NAMES: Record<string, string> = {
  fhin: 'Fhin',
  finn: 'Will',
  ffin: 'Ffin',
  will: 'Will',
}

export function PullQuote({ insight }: { insight: ReportAiInsight }) {
  const config = MODULE_CONFIG[insight.module]

  return (
    <div className={`pull-quote border-l-[3px] ${config.borderColor} pl-4 py-2`}>
      <p className="font-source-serif text-[15px] italic leading-relaxed text-[var(--ink-2)]">
        &ldquo;{insight.quote}&rdquo;
      </p>
      <p className="mt-1 font-inter text-[11px] text-[var(--ink-3)]">
        — {AVATAR_NAMES[insight.avatar] || insight.avatar}, {config.name}
      </p>
    </div>
  )
}

export function PullQuoteSection({ insights }: { insights: ReportAiInsight[] }) {
  if (insights.length === 0) return null

  return (
    <div className="report-section my-10 border-t border-b border-[var(--border-ed)] py-6">
      <p className="mb-4 text-center font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Redactioneel Commentaar
      </p>
      <div className="space-y-5">
        {insights.map((insight, i) => (
          <PullQuote key={i} insight={insight} />
        ))}
      </div>
    </div>
  )
}
