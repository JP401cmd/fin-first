'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface ReisStapSectionProps {
  id: string
  step: number
  icon: LucideIcon
  title: string
  color: string
  subtitle: string
  statusLines: string[]
  valueSentence: string
  ctaLabel: string
  ctaHref: string
  isComplete: boolean
  children?: ReactNode
}

/**
 * Container for a journey step in the gids (guide) page.
 *
 * Renders: accent bar, header with step badge + icon + title,
 * motivational subtitle, personal status lines, italic value sentence,
 * CTA button, and nested children (GuideTopicCards).
 *
 * Has scroll-mt-24 + id for progress bar linking.
 */
export default function ReisStapSection({
  id,
  step,
  icon: Icon,
  title,
  color,
  subtitle,
  statusLines,
  valueSentence,
  ctaLabel,
  ctaHref,
  isComplete,
  children,
}: ReisStapSectionProps) {
  return (
    <div
      id={id}
      className="card-editorial overflow-hidden scroll-mt-24"
    >
      {/* Accent bar top */}
      <div className="h-[3px]" style={{ backgroundColor: color }} />

      {/* Header: step badge + icon + title + complete badge */}
      <div className="flex items-center gap-3 p-3 pb-2 sm:p-4 sm:pb-2.5">
        {/* Step number badge */}
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {step}
        </div>

        {/* Icon */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]"
          style={{ color }}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        </div>

        {/* Completion badge */}
        {isComplete && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">Voltooid</span>
          </div>
        )}
      </div>

      {/* Motivational subtitle */}
      <div className="px-3 pb-2 sm:px-4 sm:pb-2.5">
        <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">{subtitle}</p>
      </div>

      {/* Personal status box */}
      {statusLines.length > 0 && (
        <div className="mx-3 mb-2.5 sm:mx-4 sm:mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 sm:p-3">
          <p className="label-editorial text-[var(--ink-4)] mb-1.5">Jouw status</p>
          {statusLines.map((line, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              {line.split(/(\d[\d.,]*)/g).map((part, j) =>
                /^\d/.test(part) ? (
                  <span key={j} className="font-mono tabular-nums">{part}</span>
                ) : (
                  part
                )
              )}
            </p>
          ))}
        </div>
      )}

      {/* Italic value sentence */}
      <div className="px-3 pb-2.5 sm:px-4 sm:pb-3">
        <p className="font-serif italic text-[12px] leading-relaxed text-[var(--ink-3)]">
          {valueSentence}
        </p>
      </div>

      {/* CTA button */}
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-4 py-2.5 min-h-[44px] sm:py-2 sm:min-h-0 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: color }}
        >
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Nested children (GuideTopicCards) */}
      {children && (
        <div className="border-t border-[var(--border-ed)] px-3 py-3 sm:px-4 sm:py-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}
