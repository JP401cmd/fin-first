import { Target, X } from 'lucide-react'
import { useState } from 'react'
import type { PersonaMeta, SovereigntyPhase } from '@/lib/test-personas'

const PHASE_COLORS: Record<SovereigntyPhase, { bg: string; border: string; text: string; accent: string; badge: string }> = {
  recovery:  { bg: 'bg-[var(--color-phase-recovery-50)]',  border: 'border-[var(--color-phase-recovery-200)]',  text: 'text-[var(--color-phase-recovery-700)]',  accent: 'bg-[var(--color-phase-recovery-600)]',  badge: 'bg-[var(--color-phase-recovery-100)] text-[var(--color-phase-recovery-700)]' },
  stability: { bg: 'bg-[var(--color-phase-stability-50)]', border: 'border-[var(--color-phase-stability-200)]', text: 'text-[var(--color-phase-stability-700)]', accent: 'bg-[var(--color-phase-stability-600)]', badge: 'bg-[var(--color-phase-stability-100)] text-[var(--color-phase-stability-700)]' },
  momentum:  { bg: 'bg-[var(--color-phase-momentum-50)]',  border: 'border-[var(--color-phase-momentum-200)]',  text: 'text-[var(--color-phase-momentum-700)]',  accent: 'bg-[var(--color-phase-momentum-600)]',  badge: 'bg-[var(--color-phase-momentum-100)] text-[var(--color-phase-momentum-700)]' },
  mastery:   { bg: 'bg-[var(--color-phase-mastery-50)]',   border: 'border-[var(--color-phase-mastery-200)]',   text: 'text-[var(--color-phase-mastery-700)]',   accent: 'bg-[var(--color-phase-mastery-700)]',   badge: 'bg-[var(--color-phase-mastery-100)] text-[var(--color-phase-mastery-700)]' },
}

const PHASE_HOVER_BORDER: Record<SovereigntyPhase, string> = {
  recovery:  'hover:border-[var(--color-phase-recovery-300)]',
  stability: 'hover:border-[var(--color-phase-stability-300)]',
  momentum:  'hover:border-[var(--color-phase-momentum-300)]',
  mastery:   'hover:border-[var(--color-phase-mastery-300)]',
}

const SOVEREIGNTY_LABEL: Record<SovereigntyPhase, string> = {
  recovery: 'Herstel',
  stability: 'Stabiliteit',
  momentum: 'Momentum',
  mastery: 'Meesterschap',
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface PersonaCardProps {
  meta: PersonaMeta
  onSelect?: () => void
  showCta?: boolean
  disabled?: boolean
}

export function PersonaCard({ meta, onSelect, showCta, disabled }: PersonaCardProps) {
  const colors = PHASE_COLORS[meta.sovereignty]
  const firstName = meta.name.split(' ')[0]
  const [showDetail, setShowDetail] = useState(false)

  const detailModal = showDetail && (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={() => setShowDetail(false)}
    >
      <div
        className="mx-0 w-full max-w-lg overflow-hidden rounded-t-2xl bg-[var(--paper)] shadow-2xl sm:mx-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className={`h-1 w-full ${colors.accent}`} />
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-ed)]">
          <div>
            <p className="label-editorial text-[var(--ink-3)]">{meta.subtitle}</p>
            <h2 className="font-display text-xl font-bold text-[var(--ink)]">{meta.name}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center rounded-[var(--r-sm)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${colors.badge}`}>
              {SOVEREIGNTY_LABEL[meta.sovereignty]}
            </span>
            <button
              type="button"
              onClick={() => setShowDetail(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
          {/* Financial stats */}
          <div className="rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] p-4">
            <p className="label-editorial mb-3 text-[var(--ink-3)]">Financieel overzicht</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="label-editorial text-[var(--ink-3)]">Vermogen</p>
                <p className={`font-mono text-base font-semibold tabular-nums ${meta.netWorth < 0 ? 'text-[var(--color-phase-recovery-700)]' : 'text-[var(--color-phase-momentum-700)]'}`}>
                  {formatCurrency(meta.netWorth)}
                </p>
              </div>
              <div>
                <p className="label-editorial text-[var(--ink-3)]">Inkomen</p>
                <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                  {formatCurrency(meta.income)}
                </p>
              </div>
              <div>
                <p className="label-editorial text-[var(--ink-3)]">Uitgaven</p>
                <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                  {formatCurrency(meta.expenses)}
                </p>
              </div>
            </div>
          </div>

          {/* Background story */}
          <div>
            <p className="label-editorial mb-1.5 text-[var(--ink-3)]">Achtergrond</p>
            <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
              {meta.backgroundStory}
            </p>
          </div>

          {/* Current situation */}
          {meta.currentSituation && (
            <div>
              <p className="label-editorial mb-1.5 text-[var(--ink-3)]">Huidige situatie</p>
              <p className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
                {meta.currentSituation}
              </p>
            </div>
          )}

          {/* All challenges */}
          {meta.challenges.length > 0 && (
            <div>
              <p className="label-editorial mb-1.5 text-[var(--ink-3)]">Uitdagingen</p>
              <ul className="space-y-1.5">
                {meta.challenges.map((challenge, i) => (
                  <li key={i} className="flex items-start gap-2 font-serif text-sm text-[var(--ink-2)]">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${colors.accent}`} />
                    <span>{challenge}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* First goal */}
          <div className="flex items-start gap-2">
            <Target className={`mt-0.5 h-4 w-4 shrink-0 ${colors.text}`} />
            <div>
              <p className="label-editorial mb-0.5 text-[var(--ink-3)]">Eerste doel</p>
              <p className="font-serif text-sm italic text-[var(--ink-2)]">{meta.firstGoal}</p>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        {!showCta && onSelect && (
          <div className="border-t border-[var(--border-ed)] p-4">
            <button
              type="button"
              onClick={() => { setShowDetail(false); onSelect() }}
              className={`w-full rounded-[var(--r)] px-4 py-3 text-sm font-medium text-white transition-colors ${colors.accent}`}
            >
              Selecteer {firstName}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const content = (
    <>
      {/* 4px colour accent */}
      <div className={`h-1 w-full ${colors.accent} rounded-t-[var(--r-lg)]`} />

      <div className="p-4">
        {/* Header: subtitle + sovereignty badge */}
        <div className="flex items-center justify-between">
          <span className="label-editorial text-[var(--ink-3)]">
            {meta.subtitle}
          </span>
          <span className={`inline-flex items-center rounded-[var(--r-sm)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${colors.badge}`}>
            {SOVEREIGNTY_LABEL[meta.sovereignty]}
          </span>
        </div>

        {/* Name */}
        <h3 className="mt-2 font-display text-xl font-bold text-[var(--ink)]">
          {meta.name}
        </h3>

        {/* Background story */}
        <p className="mt-2 font-serif text-sm italic leading-relaxed text-[var(--ink-2)] line-clamp-3">
          {meta.backgroundStory}
        </p>

        {/* Dashed divider */}
        <div className="my-3 border-b border-dashed border-[var(--border-ed)]" />

        {/* 3-column financial stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="label-editorial text-[var(--ink-3)]">Vermogen</p>
            <p className={`font-mono text-sm font-medium tabular-nums ${meta.netWorth < 0 ? 'text-[var(--color-phase-recovery-700)]' : 'text-[var(--color-phase-momentum-700)]'}`}>
              {formatCurrency(meta.netWorth)}
            </p>
          </div>
          <div>
            <p className="label-editorial text-[var(--ink-3)]">Inkomen</p>
            <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">
              {formatCurrency(meta.income)}
            </p>
          </div>
          <div>
            <p className="label-editorial text-[var(--ink-3)]">Uitgaven</p>
            <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">
              {formatCurrency(meta.expenses)}
            </p>
          </div>
        </div>

        {/* Dashed divider */}
        <div className="my-3 border-b border-dashed border-[var(--border-ed)]" />

        {/* Challenges (max 2) */}
        <ul className="space-y-1">
          {meta.challenges.slice(0, 2).map((challenge, i) => (
            <li key={i} className="flex items-start gap-1.5 font-serif text-xs text-[var(--ink-3)]">
              <span className="mt-0.5 shrink-0">•</span>
              <span>{challenge}</span>
            </li>
          ))}
        </ul>

        {/* Dashed divider */}
        <div className="my-3 border-b border-dashed border-[var(--border-ed)]" />

        {/* First goal */}
        <div className="flex items-start gap-2">
          <Target className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colors.text}`} />
          <p className="font-serif text-xs italic text-[var(--ink-2)] line-clamp-1">{meta.firstGoal}</p>
        </div>

        {/* CTA button (beheer mode only) */}
        {showCta && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDetail(true) }}
              className="flex-1 rounded-[var(--r)] border border-[var(--border-md)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              Bekijken
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect?.() }}
              disabled={disabled}
              className={`flex-1 rounded-[var(--r)] px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors.accent}`}
            >
              {disabled ? 'Bezig...' : `Laden als ${firstName}`}
            </button>
          </div>
        )}
      </div>
    </>
  )

  // Onboarding mode: whole card is clickable → opens detail modal
  if (!showCta) {
    return (
      <>
        {detailModal}
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className={`card-editorial overflow-hidden text-left transition-all ${PHASE_HOVER_BORDER[meta.sovereignty]}`}
        >
          {content}
        </button>
      </>
    )
  }

  // Beheer mode: card is static, two buttons inside (Bekijken + Laden)
  return (
    <>
      {detailModal}
      <div className="card-editorial overflow-hidden">
        {content}
      </div>
    </>
  )
}
