'use client'

import { useState } from 'react'
import { Check, Clock, X, RotateCcw } from 'lucide-react'
import { PostponeForm } from '@/components/app/postpone-form'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import {
  getActionStatusColor,
  getSourceBadgeClasses,
  ACTION_SOURCE_LABELS,
} from '@/lib/recommendation-data'

type ActionCardProps = {
  action: Action
  onStatusChange: (id: string, status: ActionStatus, data?: Record<string, unknown>) => Promise<void>
}

export function ActionCard({ action, onStatusChange }: ActionCardProps) {
  const [showPostpone, setShowPostpone] = useState(false)
  const [showReject, setShowReject] = useState(false)
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
    <div className={`rounded-lg border border-zinc-200 border-l-4 ${statusBorder} bg-white p-4 transition-all hover:shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="mb-1 flex items-center gap-2">
            <h4 className="truncate font-medium text-zinc-900">{action.title}</h4>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceBadge}`}>
              {ACTION_SOURCE_LABELS[action.source]}
            </span>
          </div>

          {/* Description */}
          {action.description && (
            <p className="mb-2 text-sm text-zinc-500">{action.description}</p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2">
            {action.freedom_days_impact != null && action.freedom_days_impact > 0 && (
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                {Math.round(action.freedom_days_impact)} dagen
              </span>
            )}
            {action.recommendation?.title && (
              <span className="truncate text-xs text-zinc-400">
                via: {action.recommendation.title}
              </span>
            )}
            {action.status === 'postponed' && action.postponed_until && (
              <span className="text-xs text-amber-600">
                <Clock className="mr-0.5 inline h-3 w-3" />
                Terug op {new Date(action.postponed_until).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {action.due_date && action.status === 'open' && (
              <span className="text-xs text-zinc-400">
                Deadline: {new Date(action.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {action.status === 'open' && !showPostpone && !showReject && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => handleStatus('completed')}
              disabled={isLoading}
              title="Afronden"
              className="rounded-md p-1.5 text-emerald-500 transition-colors hover:bg-emerald-50 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowPostpone(true)}
              disabled={isLoading}
              title="Uitstellen"
              className="rounded-md p-1.5 text-amber-500 transition-colors hover:bg-amber-50 disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={isLoading}
              title="Afwijzen"
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {action.status === 'postponed' && (
          <button
            type="button"
            onClick={() => handleStatus('open')}
            disabled={isLoading}
            title="Heropenen"
            className="shrink-0 rounded-md p-1.5 text-teal-500 transition-colors hover:bg-teal-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}

        {action.status === 'completed' && (
          <div className="shrink-0 rounded-full bg-emerald-100 p-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </div>
        )}
      </div>

      {/* Postpone form */}
      {showPostpone && (
        <PostponeForm
          mode="action"
          onSubmit={(data) => handleStatus('postponed', { postpone_weeks: data.postpone_weeks })}
          onCancel={() => setShowPostpone(false)}
        />
      )}

      {/* Reject form */}
      {showReject && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3">
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
  )
}
