'use client'

import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Flame,
  RefreshCw,
  Lightbulb,
  TrendingUp,
  Trophy,
  ArrowUp,
} from 'lucide-react'
import { useChatContext } from '@/components/app/chat/chat-provider'
import type { Notification, NotificationType } from '@/app/api/notifications/route'

const ICON_MAP: Record<string, typeof AlertTriangle> = {
  AlertTriangle,
  Flame,
  RefreshCw,
  Lightbulb,
  TrendingUp,
  Trophy,
  ArrowUp,
}

const COLOR_MAP: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
  orange: 'bg-orange-100 text-orange-600',
  teal: 'bg-wil-100 text-wil-600',
  blue: 'bg-blue-100 text-blue-600',
  purple: 'bg-horizon-100 text-horizon-600',
}

const TYPE_LABELS: Record<NotificationType, { label: string; className: string }> = {
  budget: { label: 'Budget', className: 'bg-amber-100 text-amber-700' },
  streak: { label: 'Streak', className: 'bg-orange-100 text-orange-700' },
  sync: { label: 'Sync', className: 'bg-red-100 text-red-700' },
  recommendation: { label: 'Aanbeveling', className: 'bg-wil-100 text-wil-700' },
  insight: { label: 'Inzicht', className: 'bg-blue-100 text-blue-700' },
  badge: { label: 'Badge', className: 'bg-gradient-to-r from-amber-100 to-teal-100 text-amber-700' },
  levelup: { label: 'Level Up', className: 'bg-horizon-100 text-horizon-700' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'nu'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}u`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

type Props = {
  notification: Notification
  onRead: (id: string) => void
  onClose: () => void
}

export function NotificationItem({ notification, onRead, onClose }: Props) {
  const router = useRouter()
  const { openWithMessage } = useChatContext()
  const IconComponent = ICON_MAP[notification.icon] || AlertTriangle
  const colorClass = COLOR_MAP[notification.color] || COLOR_MAP.amber
  const typeLabel = TYPE_LABELS[notification.type]

  const handleClick = () => {
    onRead(notification.id)
    if (notification.actionUrl) {
      onClose()
      router.push(notification.actionUrl)
    }
  }

  const handleAskAI = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRead(notification.id)
    onClose()
    if (notification.aiContext) {
      openWithMessage(notification.aiContext)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 ${
        !notification.read ? 'bg-blue-50/30' : ''
      }`}
    >
      {/* Icon */}
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}
      >
        <IconComponent className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${typeLabel.className}`}
            >
              {typeLabel.label}
            </span>
            {!notification.read && (
              <span className="h-2 w-2 rounded-full bg-blue-500" />
            )}
          </div>
          <span className="shrink-0 text-xs text-zinc-400">
            {timeAgo(notification.createdAt)}
          </span>
        </div>

        <p
          className={`mt-1 text-sm leading-snug ${
            !notification.read
              ? 'font-semibold text-zinc-900'
              : 'font-medium text-zinc-700'
          }`}
        >
          {notification.title}
        </p>

        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-500">
          {notification.description}
        </p>

        {notification.aiContext && (
          <button
            onClick={handleAskAI}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-wil-50 px-2 py-1 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100"
          >
            <Lightbulb className="h-3 w-3" />
            Vraag Will
          </button>
        )}
      </div>
    </div>
  )
}
