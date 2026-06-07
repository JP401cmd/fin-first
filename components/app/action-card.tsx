'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Check, Clock, X, RotateCcw, UserPlus, UserCheck, Landmark, CreditCard, ArrowUpDown, Receipt, type LucideIcon } from 'lucide-react'
import { PostponeForm } from '@/components/app/postpone-form'
import { ActionEditModal } from '@/components/app/action-edit-modal'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import {
  getSourceBadgeClasses,
  ACTION_SOURCE_LABELS,
} from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import { tagToLever, type LeverId } from '@/lib/lever-mapping'

// ── Lever icon config (consistent with kompas) ────────────────────────────────

const LEVER_ICON: Record<LeverId, LucideIcon> = {
  assets: Landmark,
  debts: CreditCard,
  cashflow: ArrowUpDown,
  tax: Receipt,
}

const LEVER_TOOLTIP: Record<LeverId, string> = {
  assets: 'Bezittingen',
  debts: 'Schulden',
  cashflow: 'Cashflow',
  tax: 'Belasting',
}

type ActionCardProps = {
  action: Action
  onStatusChange: (id: string, status: ActionStatus, data?: Record<string, unknown>) => Promise<void>
  onUpdate?: (id: string, data: Record<string, unknown>) => Promise<void>
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  /** Partner info for assignment feature — null if no household */
  partnerInfo?: { partnerId: string; partnerName: string } | null
  /** Callback when action is assigned/unassigned to partner */
  onAssign?: (actionId: string, partnerId: string | null) => Promise<void>
  /** Whether this action was assigned by a partner to the current user */
  isPartnerAssigned?: boolean
  /** Show only checkbox + title (used in the column block view) */
  compact?: boolean
}

export function ActionCard({ action, onStatusChange, onUpdate, onCancellationOpen, partnerInfo, onAssign, isPartnerAssigned, compact }: ActionCardProps) {
  const [showPostpone, setShowPostpone] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [showLongPressMenu, setShowLongPressMenu] = useState(false)
  const animTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAssigned = action.assigned_to != null
  const assignedByName = action.assigned_by_name ?? action.assigned_by ?? null

  // Long-press handlers for mobile
  const handleTouchStart = useCallback(() => {
    if (action.status !== 'open' || showPostpone || showReject) return
    longPressTimer.current = setTimeout(() => {
      setShowLongPressMenu(true)
    }, 500)
  }, [action.status, showPostpone, showReject])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Close long-press menu on outside click
  useEffect(() => {
    if (!showLongPressMenu) return
    function close() { setShowLongPressMenu(false) }
    // Delay to avoid immediate close from the same touch event
    const t = setTimeout(() => {
      document.addEventListener('click', close, { once: true })
      document.addEventListener('touchstart', close, { once: true })
    }, 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', close)
      document.removeEventListener('touchstart', close)
    }
  }, [showLongPressMenu])

  const sourceBadge = getSourceBadgeClasses(action.source)

  // Lever icon — derived from linked recommendation type or fallback to cashflow
  const leverId = action.recommendation?.recommendation_type
    ? tagToLever(action.recommendation.recommendation_type)
    : 'cashflow'
  const LeverIcon = LEVER_ICON[leverId]
  const leverTooltip = LEVER_TOOLTIP[leverId]

  async function handleStatus(status: ActionStatus, data?: Record<string, unknown>) {
    setIsLoading(true)
    setShowLongPressMenu(false)
    try {
      await onStatusChange(action.id, status, data)
      setShowPostpone(false)
      setShowReject(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div
        className={`group relative border ${isPartnerAssigned ? 'border-wil-200 bg-wil-50/30' : 'border-[var(--border-ed)] bg-[var(--paper)]'} px-3 py-1.5 transition-all duration-150 ease-in-out hover:border-[var(--border-md)] cursor-pointer`}
        onClick={() => {
          if (showLongPressMenu) return
          if (!showPostpone && !showReject && onUpdate) setShowEdit(true)
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="flex h-[28px] items-center gap-2.5">
          {/* Checkbox circle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (action.status === 'open' || action.status === 'postponed') {
                setJustCompleted(true)
                if (animTimeout.current) clearTimeout(animTimeout.current)
                animTimeout.current = setTimeout(() => setJustCompleted(false), 500)
                handleStatus('completed')
              } else if (action.status === 'completed') {
                handleStatus('open')
              }
            }}
            disabled={isLoading}
            title={action.status === 'completed' ? 'Heropenen' : action.status === 'rejected' ? 'Afgewezen' : 'Afronden'}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 disabled:opacity-50 ${justCompleted ? 'scale-125' : ''}`}
            style={{
              borderColor: action.status === 'completed' ? 'var(--positive)' : action.status === 'postponed' ? 'var(--color-amber-400)' : 'var(--border-md)',
              backgroundColor: action.status === 'completed' ? 'var(--positive)' : 'transparent',
            }}
          >
            {action.status === 'completed' && (
              <Check className={`h-3 w-3 text-white ${justCompleted ? 'animate-[checkPop_300ms_ease-out]' : ''}`} />
            )}
            {action.status === 'rejected' && <X className="h-2.5 w-2.5 text-[var(--ink-3)]" />}
          </button>

          {/* Amber clock icon next to checkbox for postponed */}
          {action.status === 'postponed' && (
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}

          {/* Title + lever icon */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h4 className={`truncate text-sm font-medium ${action.status === 'completed' ? 'text-[var(--ink-4)] line-through' : 'text-[var(--ink)]'}`}>{action.title}</h4>
            <span title={leverTooltip} className="shrink-0 text-[var(--ink-4)]">
              <LeverIcon className="h-3 w-3" />
            </span>
            {!compact && (
              <>
                {action.status === 'postponed' && action.postponed_until && (
                  <span className="shrink-0 text-xs text-amber-600">
                    tot {new Date(action.postponed_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                <span className={`hidden sm:inline-flex shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${sourceBadge}`}>
                  {ACTION_SOURCE_LABELS[action.source]}
                </span>
                {/* Partner assignment badge — outgoing (I assigned to partner) */}
                {isAssigned && !isPartnerAssigned && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-wil-50 px-1.5 py-px text-[10px] font-medium text-wil-700">
                    <UserCheck className="h-2.5 w-2.5" />
                    {action.assigned_to_name ?? 'Partner'}
                  </span>
                )}
                {/* Partner assignment badge — incoming (partner assigned to me) */}
                {isPartnerAssigned && assignedByName && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-wil-100 px-1.5 py-px text-[10px] font-medium text-wil-700">
                    <UserCheck className="h-2.5 w-2.5" />
                    Toegewezen door {assignedByName}
                  </span>
                )}
                {!isPartnerAssigned && assignedByName && (
                  <span className="hidden sm:inline shrink-0 text-[10px] text-[var(--ink-4)]">
                    Toegewezen door {assignedByName}
                  </span>
                )}
              </>
            )}
          </div>

          {!compact && (
          <>
          {/* Right: meta + action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Compact meta */}
            {action.freedom_days_impact != null && action.freedom_days_impact > 0 && (
              <span className="inline-flex rounded-full bg-wil-50 px-2 py-px text-xs font-mono tabular-nums font-medium text-wil-700">
                {Math.round(action.freedom_days_impact)}d
              </span>
            )}
            {action.due_date && action.status === 'open' && (
              <span className="hidden sm:inline text-xs text-[var(--ink-3)]">
                {new Date(action.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {action.status === 'postponed' && action.postponed_until && (
              <span className="hidden sm:inline-flex items-center text-xs text-amber-600">
                <Clock className="mr-0.5 h-3 w-3" />
                {new Date(action.postponed_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {action.recommendation?.title && (
              <span className="hidden md:inline truncate max-w-[120px] text-[11px] text-[var(--ink-3)]">
                {action.recommendation.title}
              </span>
            )}

            {/* Quick action buttons — desktop: hidden by default, visible on hover, 24px targets */}
            {action.status === 'open' && !showPostpone && !showReject && (
              <div className="hidden sm:flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={(e) => e.stopPropagation()}>
                {partnerInfo && onAssign && (
                  <button
                    type="button"
                    onClick={async () => {
                      setAssigning(true)
                      try {
                        await onAssign(action.id, isAssigned ? null : partnerInfo.partnerId)
                      } finally {
                        setAssigning(false)
                      }
                    }}
                    disabled={assigning || isLoading}
                    title={isAssigned ? 'Toewijzing intrekken' : `Toewijzen aan ${partnerInfo.partnerName}`}
                    className={`flex h-6 w-6 items-center justify-center transition-colors disabled:opacity-50 ${
                      isAssigned
                        ? 'text-wil-600 hover:bg-wil-50'
                        : 'text-[var(--ink-3)] hover:bg-wil-50 hover:text-wil-600'
                    }`}
                  >
                    {isAssigned ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPostpone(true)}
                  disabled={isLoading}
                  title="Uitstellen"
                  className="flex h-6 w-6 items-center justify-center text-amber-500 transition-colors hover:bg-amber-50 disabled:opacity-50"
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  disabled={isLoading}
                  title="Afwijzen"
                  className="flex h-6 w-6 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-negative disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {action.status === 'postponed' && (
              <div onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => handleStatus('open')}
                  disabled={isLoading}
                  title="Heropenen"
                  className="flex h-6 w-6 items-center justify-center text-wil-500 transition-colors hover:bg-wil-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Mobile long-press action menu */}
        {showLongPressMenu && action.status === 'open' && (
          <div
            className="absolute right-2 top-full z-20 mt-1 flex gap-1 border border-[var(--border-ed)] bg-[var(--paper)] p-1.5 shadow-lg sm:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {partnerInfo && onAssign && (
              <button
                type="button"
                onClick={async () => {
                  setAssigning(true)
                  try {
                    await onAssign(action.id, isAssigned ? null : partnerInfo.partnerId)
                  } finally {
                    setAssigning(false)
                    setShowLongPressMenu(false)
                  }
                }}
                disabled={assigning || isLoading}
                className={`flex h-9 w-9 items-center justify-center transition-colors disabled:opacity-50 ${
                  isAssigned
                    ? 'text-wil-600 bg-wil-50'
                    : 'text-[var(--ink-3)] hover:bg-wil-50 hover:text-wil-600'
                }`}
              >
                {isAssigned ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowLongPressMenu(false)
                setShowPostpone(true)
              }}
              disabled={isLoading}
              className="flex h-9 w-9 items-center justify-center text-amber-500 transition-colors hover:bg-amber-50 disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLongPressMenu(false)
                setShowReject(true)
              }}
              disabled={isLoading}
              className="flex h-9 w-9 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-negative disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Inline postpone/reject forms */}
        {showPostpone && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <PostponeForm
              mode="action"
              onSubmit={(data) => handleStatus('postponed', { postpone_weeks: data.postpone_weeks })}
              onCancel={() => setShowPostpone(false)}
            />
          </div>
        )}

        {/* Cancellation shortcut — hidden by default, visible on hover/tap */}
        {action.metadata?.type === 'subscription_cancellation' && onCancellationOpen && (
          <div className="mt-1.5 hidden group-hover:block group-focus-within:block" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onCancellationOpen(action.metadata as CancellationMetadata)}
              className="touch-target font-serif text-[11px] italic text-wil-600 transition-colors hover:text-wil-800"
            >
              Open opzegbrief →
            </button>
          </div>
        )}

        {showReject && (
          <div className="mt-2 space-y-2 border border-[var(--negative)]/30 bg-[var(--negative)]/10 p-3" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reden (optioneel)"
              className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--negative)] focus:outline-none focus:ring-1 focus:ring-[var(--negative)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleStatus('rejected', { rejection_reason: rejectReason })}
                disabled={isLoading}
                className="bg-[var(--negative)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--negative)]/90 disabled:opacity-50"
              >
                Afwijzen
              </button>
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {showEdit && onUpdate && (
        <ActionEditModal
          action={action}
          onClose={() => setShowEdit(false)}
          onSave={async (data) => {
            await onUpdate(action.id, data)
            setShowEdit(false)
          }}
          onStatusChange={async (status, data) => {
            await handleStatus(status, data)
            setShowEdit(false)
          }}
        />
      )}
    </>
  )
}
