'use client'

import { useState } from 'react'
import { Plus, Sparkles, CheckCircle } from 'lucide-react'
import { RecommendationList } from '@/components/app/recommendation-list'
import { ActionBoard } from '@/components/app/action-board'
import { WillEditorialHeader } from '@/components/will/will-editorial-header'
import type { Recommendation, Action } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'

interface ActionCenterProps {
  recommendations: Recommendation[]
  actions: Action[]
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  /** Called after any child mutation so parent can refresh server data */
  onDataChanged?: () => void
  /** KPI counts for header cells */
  openRecommendationCount?: number
  openActionCount?: number
  avgGoalProgress?: number
  /** Doorgegeven vanuit WillLanding voor het tonen van Doelvoortgang-cel */
  doelenEnabled?: boolean
}

/**
 * ActionCenter — 2-koloms werk-board (Voorstellen ↔ Acties) met editorial banner.
 *
 * De landing-pijplijn is teruggebracht tot het feitelijke werk: links de open
 * voorstellen, rechts de acties. De Resultaat-kolom (doelen) is verhuisd naar
 * de losse `<DoelenStrook />` op /will, gescheiden door een double-rule. De
 * editorial banner (`WillEditorialHeader`) toont de KPI's; deze component
 * concentreert zich puur op de twee werk-kolommen + sectielabel.
 *
 * CTA-hiërarchie: "Nieuwe actie" is primair (solid wil-500) — dat is de hoofd-
 * actie van de pagina. "Analyseren" blijft secundair (outline) omdat het
 * voorstellen genereert die de gebruiker daarna nog moet wegen.
 */
export function ActionCenter({
  recommendations,
  actions,
  partnerInfo,
  currentUserId,
  onCancellationOpen,
  onDataChanged,
  openRecommendationCount,
  openActionCount,
  avgGoalProgress,
  doelenEnabled = true,
}: ActionCenterProps) {
  const [activeTab, setActiveTab] = useState<'inzicht' | 'actie'>('actie')
  const [generateTrigger, setGenerateTrigger] = useState(0)
  const [addTrigger, setAddTrigger] = useState(0)

  const pendingCount = openRecommendationCount ?? recommendations.filter(r => r.status === 'pending').length

  const totalPendingRecDays = Math.round(
    recommendations
      .filter(r => r.status === 'pending')
      .reduce((s, r) => s + (r.freedom_days_per_year || 0), 0),
  )

  const totalOpenActionDays = Math.round(
    actions
      .filter(a => a.status === 'open' || a.status === 'postponed')
      .reduce((s, a) => s + (a.freedom_days_impact || 0), 0),
  )

  // Acties die in de laatste 90 dagen zijn afgerond — voedt de "Afgerond"-cel
  // in de header en geeft de gebruiker een gevoel van voortgang per kwartaal.
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const completedActionsCount = actions.filter(a => {
    if (a.status !== 'completed' || !a.completed_at) return false
    return new Date(a.completed_at).getTime() >= ninetyDaysAgo
  }).length

  const goalProgress = avgGoalProgress ?? 0

  const tabs = [
    { key: 'inzicht' as const, label: `Voorstellen (${pendingCount})` },
    { key: 'actie' as const, label: `Acties (${openActionCount ?? 0})` },
  ]

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
      {/* Accent bar */}
      <div className="h-[3px] w-full" style={{ background: 'var(--module-active-500)' }} />

      {/* Editorial banner — KPI's + intentvraag */}
      <WillEditorialHeader
        totalPendingRecDays={totalPendingRecDays}
        totalOpenActionDays={totalOpenActionDays}
        goalProgress={goalProgress}
        completedActionsCount={completedActionsCount}
        doelenEnabled={doelenEnabled}
      />

      {/* Sectie-label "Het werk" — situeert het 2-koloms gedeelte */}
      <div className="px-5 sm:px-6 pt-6 pb-3 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
        <span aria-hidden className="inline-block h-px w-7" style={{ background: 'var(--module-active-500)' }} />
        Het werk · Voorstellen ↔ Acties
      </div>

      {/* Mobile tab bar (< lg) — desktop toont beide kolommen naast elkaar */}
      <div className="border-b border-[var(--border-ed)] px-5 pb-3 lg:hidden">
        <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`flex-1 rounded-[var(--r-sm)] px-2 py-2 text-[11px] font-semibold transition-colors min-h-[44px] ${
                activeTab === tab.key
                  ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2-koloms grid: Voorstellen ↔ Acties */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Voorstellen */}
        <div
          id="voorstellen"
          className={`scroll-mt-8 p-5 lg:border-r lg:border-[var(--border-ed)] ${
            activeTab !== 'inzicht' ? 'hidden lg:block' : ''
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-wil-500" />
              <h3 className="label-editorial text-[var(--ink-2)]">Voorstellen</h3>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                {pendingCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGenerateTrigger(t => t + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)] min-h-[44px] sm:min-h-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Analyseren</span>
            </button>
          </div>
          <RecommendationList
            initialRecommendations={recommendations}
            hideHeader
            generateTrigger={generateTrigger}
            onDataChanged={onDataChanged}
          />
        </div>

        {/* Acties */}
        <div
          id="acties"
          className={`scroll-mt-8 p-5 ${activeTab !== 'actie' ? 'hidden lg:block' : ''}`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-wil-500" />
              <h3 className="label-editorial text-[var(--ink-2)]">Acties</h3>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                {openActionCount ?? 0}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAddTrigger(t => t + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] bg-wil-500 text-white px-3 py-2 text-xs font-semibold transition-colors hover:bg-wil-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] min-h-[44px] sm:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nieuwe actie</span>
            </button>
          </div>
          <ActionBoard
            initialActions={actions}
            partnerInfo={partnerInfo}
            currentUserId={currentUserId}
            onCancellationOpen={onCancellationOpen}
            addTrigger={addTrigger}
            onDataChanged={onDataChanged}
          />
        </div>
      </div>
    </div>
  )
}
