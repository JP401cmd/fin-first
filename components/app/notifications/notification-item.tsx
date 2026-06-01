'use client'

import { useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb, Clock } from 'lucide-react'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { LevelUpCelebration } from '@/components/app/level-up-celebration'
import type { Notification, NotificationType } from '@/app/api/notifications/route'

// ── Module mapping ──────────────────────────────────────────────────

type ModuleInfo = {
  label: string
  colorVar: string    // CSS variable for the module base color
  textVar: string     // CSS variable for text
  lightVar: string    // CSS variable for light background
  mediumVar: string   // CSS variable for medium border
}

// De oude module-indeling (Kern/Wil/Horizon) bestaat niet meer als gebruikers-
// term. We tonen daarom een concept-label per bericht-type (uitgelijnd op de
// huidige navigatie: Overzicht / Acties / Toekomst) en houden de kleur-accenten
// puur visueel aan via de bestaande --kern/--will/--hor tokens.
const MODULE_MAP: Record<NotificationType, ModuleInfo> = {
  budget:         { label: 'Budget',       colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  sync:           { label: 'Bank',         colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  recommendation: { label: 'Partner-actie',colorVar: 'var(--will)',   textVar: 'var(--will-t)',   lightVar: 'var(--will-l)', mediumVar: 'var(--will-m)' },
  levelup:             { label: 'Niveau',      colorVar: 'var(--hor)',    textVar: 'var(--hor-t)',    lightVar: 'var(--hor-l)',  mediumVar: 'var(--hor-m)' },
  partner_transaction: { label: 'Partner',     colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  horizon:             { label: 'Toekomst',    colorVar: 'var(--hor)',    textVar: 'var(--hor-t)',    lightVar: 'var(--hor-l)',  mediumVar: 'var(--hor-m)' },
  holding_alert:       { label: 'Belegging',   colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  module_nudge:        { label: 'Invullen',    colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  briefing:            { label: 'Briefing',    colorVar: 'var(--will)',   textVar: 'var(--will-t)',   lightVar: 'var(--will-l)', mediumVar: 'var(--will-m)' },
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// ── Notification Item ───────────────────────────────────────────────

type Props = {
  notification: Notification
  onRead: (id: string) => void
  onClose: () => void
}

export const NotificationItem = memo(function NotificationItem({ notification, onRead, onClose }: Props) {
  const router = useRouter()
  const { openWithMessage } = useChatContext()
  const [showLevelUp, setShowLevelUp] = useState(false)
  let module = MODULE_MAP[notification.type]

  // Dynamic module label for nudges
  if (notification.type === 'module_nudge' && notification.metadata?.moduleId) {
    const nudgeModuleId = notification.metadata.moduleId as string
    const navColors: Record<string, Pick<ModuleInfo, 'label' | 'colorVar' | 'textVar' | 'lightVar' | 'mediumVar'>> = {
      budgetteren:          { label: 'Overzicht', colorVar: 'var(--kern)', textVar: 'var(--kern-t)', lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
      vermogensregistratie: { label: 'Overzicht', colorVar: 'var(--kern)', textVar: 'var(--kern-t)', lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
      aandelenregistratie:  { label: 'Overzicht', colorVar: 'var(--kern)', textVar: 'var(--kern-t)', lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
      inzicht_acties:       { label: 'Acties',    colorVar: 'var(--will)', textVar: 'var(--will-t)', lightVar: 'var(--will-l)', mediumVar: 'var(--will-m)' },
      toekomstplannen:      { label: 'Toekomst',  colorVar: 'var(--hor)',  textVar: 'var(--hor-t)',  lightVar: 'var(--hor-l)',  mediumVar: 'var(--hor-m)' },
    }
    const nudgeColors = navColors[nudgeModuleId]
    if (nudgeColors) {
      module = { ...module, ...nudgeColors }
    }
  }

  const handleClick = useCallback(() => {
    onRead(notification.id)

    // Level-up: show celebration overlay first
    if (notification.type === 'levelup' && notification.metadata) {
      setShowLevelUp(true)
      return
    }

    if (notification.actionUrl) {
      onClose()
      router.push(notification.actionUrl)
    }
  }, [notification, onRead, onClose, router])

  const handleLevelUpClose = useCallback(() => {
    setShowLevelUp(false)
    onClose()
    if (notification.actionUrl) {
      router.push(notification.actionUrl)
    }
  }, [notification.actionUrl, onClose, router])

  const handleAskAI = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRead(notification.id)
    onClose()
    if (notification.aiContext) {
      openWithMessage(notification.aiContext)
    }
  }, [notification, onRead, onClose, openWithMessage])

  // ── Level-up: special full-width card ──────────────────────────────
  if (notification.type === 'levelup') {
    const meta = notification.metadata as { oldLevel?: number; newLevel?: number } | undefined
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className="w-full text-left transition-all hover:shadow-[var(--s1)]"
          style={{
            borderLeft: `3px solid ${module.colorVar}`,
            background: `linear-gradient(135deg, ${module.lightVar}, transparent)`,
          }}
        >
          <div className="px-5 py-3">
            <div className="flex items-center gap-2">
              <span
                className="font-[family-name:var(--font-inter)] text-[9px] font-bold uppercase tracking-[.1em]"
                style={{ color: module.textVar }}
              >
                {module.label}
              </span>
              {!notification.read && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: module.colorVar }}
                />
              )}
              <span className="ml-auto font-[family-name:var(--font-inter)] text-[11px] text-[var(--ink-4)]">
                {formatTime(notification.createdAt)}
              </span>
            </div>
            <p className="mt-1 font-[family-name:var(--font-playfair)] text-[20px] text-[var(--ink)]">
              {notification.title}
            </p>
            <p className="mt-0.5 font-[family-name:var(--font-source-serif)] text-[13px] leading-snug text-[var(--ink-2)]">
              {notification.description}
            </p>
          </div>
        </button>
        {showLevelUp && meta?.oldLevel !== undefined && meta?.newLevel !== undefined && (
          <LevelUpCelebration
            oldLevel={meta.oldLevel}
            newLevel={meta.newLevel}
            onClose={handleLevelUpClose}
          />
        )}
      </>
    )
  }

  // ── Standard notification item ─────────────────────────────────────
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      className="w-full cursor-pointer text-left transition-all hover:bg-[var(--subtle)]"
      style={{
        borderLeft: `3px solid ${module.colorVar}`,
      }}
    >
      <div className="border-b border-dashed border-[var(--border-ed)] px-5 py-3">
        {/* Top row: module tag + unread dot + timestamp */}
        <div className="flex items-center gap-2">
          <span
            className="font-[family-name:var(--font-inter)] text-[9px] font-bold uppercase tracking-[.1em]"
            style={{ color: module.textVar }}
          >
            {module.label}
          </span>
          {!notification.read && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: module.colorVar }}
            />
          )}
          <span className="ml-auto font-[family-name:var(--font-inter)] text-[11px] text-[var(--ink-4)]">
            {formatTime(notification.createdAt)}
          </span>
        </div>

        {/* Title */}
        <p
          className={`mt-1 font-[family-name:var(--font-source-serif)] text-[15px] leading-snug ${
            !notification.read
              ? 'font-semibold text-[var(--ink)]'
              : 'font-normal text-[var(--ink-2)]'
          }`}
        >
          {notification.title}
        </p>

        {/* Description — max 2 lines */}
        <p className="mt-0.5 line-clamp-2 font-[family-name:var(--font-source-serif)] text-[13px] leading-snug text-[var(--ink-3)]">
          {notification.description}
        </p>

        {/* Freedom-time badge for partner transactions */}
        {notification.type === 'partner_transaction' && notification.metadata?.freedomDays != null && Number(notification.metadata.freedomDays) > 0 && (
          <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            notification.metadata?.isIncome
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-[var(--subtle)] text-[var(--ink-3)]'
          }`}>
            <Clock className="h-2.5 w-2.5" />
            {notification.metadata?.isIncome ? '+' : ''}{Number(notification.metadata.freedomDays)} {Number(notification.metadata.freedomDays) === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'}
            {notification.metadata?.isIncome ? ' gewonnen' : ''}
          </div>
        )}

        {/* AI action button */}
        {notification.aiContext && (
          <button
            type="button"
            onClick={handleAskAI}
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-2 font-[family-name:var(--font-inter)] text-[11px] font-medium transition-colors sm:min-h-0 sm:px-2 sm:py-1"
            style={{
              backgroundColor: module.lightVar,
              color: module.textVar,
              border: `1px solid ${module.mediumVar}`,
            }}
          >
            <Lightbulb className="h-3 w-3" />
            Vraag Will
          </button>
        )}
      </div>
    </div>
  )
})
