'use client'

import Link from 'next/link'
import { BriefingCard } from '../briefing-card'
import type { InsightCardSpec } from '@/lib/briefing/types'
import { ArrowRight } from 'lucide-react'

interface Props {
  spec: InsightCardSpec
}

const EMPHASIS_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  greeting: { border: '', bg: '', label: '' },
  observation: { border: 'border-l-2 border-l-wil-300', bg: 'bg-wil-50/30', label: 'Observatie' },
  celebration: { border: 'border-l-2 border-l-emerald-400', bg: 'bg-emerald-50/30', label: '' },
  tip: { border: 'border-l-2 border-l-amber-400', bg: 'bg-amber-50/30', label: 'Tip' },
}

// ── Keyword-based fallback CTA for tip/observation insights ────
// When the AI omits ctaLabel/href, we infer a sensible default.
// Uses word-boundary-aware matching to avoid false positives (e.g. "bespaart" ≠ "spaarquote").
const KEYWORD_CTA_MAP: { patterns: RegExp[]; href: string; label: string }[] = [
  { patterns: [/\bspaarquote\b/, /\bspaarpercentage\b/, /\bje spaart\b/], href: '/will#cashflow', label: 'Cashflow bekijken' },
  { patterns: [/\bschuld/, /\bafloss/, /\blening\b/, /\bhypotheek\b/, /\bschuldratio\b/], href: '/core/debts', label: 'Schulden bekijken' },
  { patterns: [/\bbudget/, /\buitgaven\b/, /\boverschreden\b/], href: '/core/budgets', label: 'Budget aanpassen' },
  { patterns: [/\bbelegg/, /\bfonds/, /\bter\b/, /\brendement\b/, /\betf\b/, /\bindex/], href: '/core/assets', label: 'Beleggingen bekijken' },
  { patterns: [/\bvermogen\b/, /\bbezitting/], href: '/core/assets', label: 'Bezittingen bekijken' },
  { patterns: [/\bfire\b/, /\bvrijheid\b/, /\bpensioen\b/, /\bonafhankelijk/], href: '/horizon', label: 'FIRE-plan bekijken' },
  { patterns: [/\bbelasting\b/, /\bbox 3\b/, /\bbox3\b/, /\bfiscaal/], href: '/core/belasting', label: 'Belasting bekijken' },
  { patterns: [/\btransact/, /\bbankzak/, /\bbetaling/], href: '/core/cash', label: 'Transacties bekijken' },
  { patterns: [/\babonnement/, /\bvaste lasten\b/, /\bsubscript/], href: '/core/cash', label: 'Vaste lasten bekijken' },
  { patterns: [/\bnoodfonds\b/, /\bbuffer\b/, /\bvangnet\b/], href: '/overzicht/cashflow', label: 'Noodfonds opbouwen' },
  { patterns: [/\bdoel\b/, /\bdoelen\b/, /\bstreefbedrag\b/], href: '/will', label: 'Doelen bekijken' },
]

function inferFallbackCta(text: string): { href: string; label: string } | null {
  const lower = text.toLowerCase()
  for (const entry of KEYWORD_CTA_MAP) {
    if (entry.patterns.some(re => re.test(lower))) {
      return { href: entry.href, label: entry.label }
    }
  }
  return null
}

export function InsightCard({ spec }: Props) {
  const emphasis = spec.emphasis ?? 'observation'
  const styles = EMPHASIS_STYLES[emphasis] ?? EMPHASIS_STYLES.observation

  // Resolve CTA: explicit > keyword-fallback for actionable tips/observations
  let ctaLabel = spec.ctaLabel
  let ctaHref = spec.href ?? (spec.ctaLabel ? '/core/assets' : undefined)

  // For tip/observation insights without explicit CTA, infer from content keywords
  if (!ctaLabel && (emphasis === 'tip' || emphasis === 'observation')) {
    const fallback = inferFallbackCta(spec.text)
    if (fallback) {
      ctaLabel = fallback.label
      ctaHref = spec.href ?? fallback.href
    }
  }

  return (
    <BriefingCard module={spec.module ?? 'wil'} href={!ctaLabel ? spec.href : undefined}>
      <div className={`${styles.border} ${styles.bg} ${styles.border ? 'pl-3 py-1' : ''}`}>
        {styles.label && (
          <p className="label-editorial text-[var(--ink-4)] mb-1">{styles.label}</p>
        )}
        <p className="font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
          {spec.text}
        </p>
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors group/cta"
          >
            <span className="underline decoration-[var(--border-md)] underline-offset-2 group-hover/cta:decoration-[var(--ink-2)]">
              {ctaLabel}
            </span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover/cta:translate-x-0.5" />
          </Link>
        )}
      </div>
    </BriefingCard>
  )
}
