'use client'

import { useState } from 'react'
import { Check, Clock, X, RotateCcw } from 'lucide-react'
import { PostponeForm } from '@/components/app/postpone-form'
import { ActionEditModal } from '@/components/app/action-edit-modal'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import {
  getActionStatusColor,
  getSourceBadgeClasses,
  ACTION_SOURCE_LABELS,
} from '@/lib/recommendation-data'

type ActionCardProps = {
  action: Action
  onStatusChange: (id: string, status: ActionStatus, data?: Record<string, unknown>) => Promise<void>
  onUpdate?: (id: string, data: Record<string, unknown>) => Promise<void>
}

export function ActionCard({ action, onStatusChange, onUpdate }: ActionCardProps) {
  const [showPostpone, setShowPostpone] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const statusBorder = getActionStatusColor(action.status)
  const sourceBadge = getSourceBadgeClasses(action.source)

  async function handleStatus(status: ActionStatus, data?: Record<string, unknown>) {
    setIsLoading(true)
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
        className={`rounded-lg border border-zinc-200 border-l-4 ${statusBorder} bg-white px-3 py-2.5 transition-all hover:shadow-sm cursor-pointer`}
        onClick={() => {
          if (!showPostpone && !showReject && onUpdate) setShowEdit(true)
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: title + badges */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h4 className="truncate text-sm font-medium text-zinc-900">{action.title}</h4>
            <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${sourceBadge}`}>
              {ACTION_SOURCE_LABELS[action.source]}
            </span>
          </div>

          {/* Right: meta + action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Compact meta */}
            {action.freedom_days_impact != null && action.freedom_days_impact > 0 && (
              <span className="hidden sm:inline-flex rounded-full bg-teal-50 px-2 py-px text-[11px] font-medium text-teal-700">
                {Math.round(action.freedom_days_impact)}d
              </span>
            )}
            {action.due_date && action.status === 'open' && (
              <span className="hidden sm:inline text-[11px] text-zinc-400">
                {new Date(action.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {action.status === 'postponed' && action.postponed_until && (
              <span className="hidden sm:inline-flex items-center text-[11px] text-amber-600">
                <Clock className="mr-0.5 h-3 w-3" />
                {new Date(action.postponed_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {action.recommendation?.title && (
              <span className="hidden md:inline truncate max-w-[120px] text-[11px] text-zinc-400">
                {action.recommendation.title}
              </span>
            )}

            {/* Quick action buttons */}
            {action.status === 'open' && !showPostpone && !showReject && (
              <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => handleStatus('completed')}
                  disabled={isLoading}
                  title="Afronden"
                  className="rounded p-1 text-emerald-500 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPostpone(true)}
                  disabled={isLoading}
                  title="Uitstellen"
                  className="rounded p-1 text-amber-500 transition-colors hover:bg-amber-50 disabled:opacity-50"
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  disabled={isLoading}
                  title="Afwijzen"
                  className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50"
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
                  className="rounded p-1 text-teal-500 transition-colors hover:bg-teal-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {action.status === 'completed' && (
              <div className="rounded-full bg-emerald-100 p-1">
                <Check className="h-3 w-3 text-emerald-600" />
              </div>
            )}
          </div>
        </div>

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

        {showReject && (
          <div className="mt-2 space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reden (optioneel)"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleStatus('rejected', { rejection_reason: rejectReason })}
                disabled={isLoading}
                className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                Afwijzen
              </button>
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
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
