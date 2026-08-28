'use client'

import { useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb, Clock } from 'lucide-react'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { ListDensity } from '@/components/app/density-toggle'
import type { Notification, NotificationType } from '@/app/api/notifications/route'
import { formatAmsterdamTime } from '@/lib/tz'

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
  partner_transaction: { label: 'Partner',     colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  horizon:             { label: 'Toekomst',    colorVar: 'var(--hor)',    textVar: 'var(--hor-t)',    lightVar: 'var(--hor-l)',  mediumVar: 'var(--hor-m)' },
  holding_alert:       { label: 'Belegging',   colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
  briefing:            { label: 'Briefing',    colorVar: 'var(--will)',   textVar: 'var(--will-t)',   lightVar: 'var(--will-l)', mediumVar: 'var(--will-m)' },
  budget_model_proposal: { label: 'Huishouden', colorVar: 'var(--will)',   textVar: 'var(--will-t)',   lightVar: 'var(--will-l)', mediumVar: 'var(--will-m)' },
  // Naamneutraal label: de gebruiker kiest zelf hoe dit concept heet, dus staat
  // de naam alleen in de melding zelf (samengesteld uit lib/spend-limits/copy.ts).
  spend_limit:         { label: 'Je grens',    colorVar: 'var(--kern)',   textVar: 'var(--kern-t)',   lightVar: 'var(--kern-l)', mediumVar: 'var(--kern-m)' },
}

/**
 * Vangnet voor bericht-types die niet (meer) in MODULE_MAP staan. De DB kan
 * nog rijen bevatten met gesaneerde legacy-types (bv. insight/streak/badge,
 * jun 2026) — runtime-data houdt zich niet aan de NotificationType-union.
 * Zonder dit vangnet crasht de hele berichtenlijst op één oud bericht.
 */
const FALLBACK_MODULE_INFO: ModuleInfo = {
  label: 'Bericht',
  colorVar: 'var(--will)',
  textVar: 'var(--will-t)',
  lightVar: 'var(--will-l)',
  mediumVar: 'var(--will-m)',
}

// Amsterdamse wandkloktijd via `lib/tz.ts` — `toLocaleTimeString` zonder
// `timeZone` leest de runtime-tijdzone, dus de server (UTC) zou hier een ander
// uur renderen dan de browser (#418-klasse).
function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return formatAmsterdamTime(d)
}

// ── Notification Item ───────────────────────────────────────────────

type Props = {
  notification: Notification
  onRead: (id: string) => void
  onClose: () => void
  /**
   * Weergavedichtheid (M-08). 'compact' verkleint de verticale padding en
   * verbergt de secundaire meta-regels (omschrijving + vrijheidstijd-badge);
   * 'ruim' is het bestaande uiterlijk (default → geen regressie).
   */
  density?: ListDensity
}

export const NotificationItem = memo(function NotificationItem({ notification, onRead, onClose, density = 'ruim' }: Props) {
  const router = useRouter()
  const { openWithMessage } = useChatContext()
  const moduleInfo = MODULE_MAP[notification.type] ?? FALLBACK_MODULE_INFO
  const isCompact = density === 'compact'

  const handleClick = useCallback(() => {
    onRead(notification.id)

    if (notification.actionUrl) {
      onClose()
      router.push(notification.actionUrl)
    }
  }, [notification, onRead, onClose, router])

  const handleAskAI = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
    if (notification.aiContext) {
      // Pas gelezen zodra Fin daadwerkelijk antwoordt (M25). Eerder vuurde
      // onRead hier synchroon bij de klik, terwijl de AI-aanvraag pas later
      // async vertrok — of nooit. Bij een storing liep de ongelezen-teller dus
      // terug zonder dat er ook maar iets te lezen viel, en er is geen rollback
      // in markAsRead. De koppeling loopt nu via de chatcontext.
      openWithMessage(notification.aiContext, () => onRead(notification.id))
      return
    }
    // Geen AI-vervolg mogelijk: dan is de klik zelf de enige lezing.
    onRead(notification.id)
  }, [notification, onRead, onClose, openWithMessage])

  // ── Standard notification item ─────────────────────────────────────
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      // Deze rij bevat een genest interactief element (de "Vraag Fin"-knop),
      // dus blijft het een role="button"-div i.p.v. een echte <button>. De
      // globale focus-ring scopet alleen op echte a/button, daarom hier expliciet
      // een zichtbare focus-visible-outline zodat toetsenbordnavigatie leesbaar is.
      className="w-full cursor-pointer text-left transition-all hover:bg-[var(--subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)] focus-visible:-outline-offset-2"
      style={{
        borderLeft: `3px solid ${moduleInfo.colorVar}`,
      }}
    >
      <div className={`border-b border-dashed border-[var(--border-ed)] px-5 ${isCompact ? 'py-1.5' : 'py-3'}`}>
        {/* Top row: module tag + unread dot + timestamp */}
        <div className="flex items-center gap-2">
          <span
            className="font-[family-name:var(--font-inter)] text-[9px] font-bold uppercase tracking-[.1em]"
            style={{ color: moduleInfo.textVar }}
          >
            {moduleInfo.label}
          </span>
          {!notification.read && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: moduleInfo.colorVar }}
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

        {/* Description — max 2 lines (secundaire meta, verborgen in compact) */}
        {!isCompact && (
          <p className="mt-0.5 line-clamp-2 font-[family-name:var(--font-source-serif)] text-[13px] leading-snug text-[var(--ink-3)]">
            {notification.description}
          </p>
        )}

        {/* Bedragen bij een grens-melding — NOOIT in de zin zelf.
            Bedragmaskering is client-side en per call-site opt-in, dus een bedrag
            dat in `title`/`description` is ingebakken blijft onder de privacy-
            toggle zichtbaar. Daarom draagt de melding de getallen apart mee
            (lib/notifications/spend-limit.ts) en renderen we ze hier live —
            hetzelfde patroon als de opzeg-actie na migratie 20260807120000
            (ADR 0091, laag 2). */}
        {!isCompact && notification.type === 'spend_limit' && notification.metadata != null && (
          <p className="mt-1 font-[family-name:var(--font-inter)] text-[11px] text-[var(--ink-3)]">
            {notification.metadata.over != null && (
              <>
                {/* "eroverheen", niet "boven": het bedrag bóven de grens heet in
                    de hele app zo (widget, sectie, periodegrafiek, pane). "Boven
                    je grens" blijft wél de STATUS-formulering — dat is een ander
                    begrip (waar sta je) dan dit bedrag (hoeveel eroverheen). */}
                <MaskedAmount value={Number(notification.metadata.over)} tone="kern" /> eroverheen
                {' · '}
              </>
            )}
            {notification.metadata.headroom != null && (
              <>
                <MaskedAmount value={Number(notification.metadata.headroom)} tone="kern" /> ruimte
                {' · '}
              </>
            )}
            <MaskedAmount value={Number(notification.metadata.matched)} tone="kern" />
            {' van '}
            <MaskedAmount value={Number(notification.metadata.limit)} tone="kern" />
          </p>
        )}

        {/* Freedom-time badge for partner transactions (verborgen in compact) */}
        {!isCompact && notification.type === 'partner_transaction' && notification.metadata?.freedomDays != null && Number(notification.metadata.freedomDays) > 0 && (
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
              backgroundColor: moduleInfo.lightVar,
              color: moduleInfo.textVar,
              border: `1px solid ${moduleInfo.mediumVar}`,
            }}
          >
            <Lightbulb className="h-3 w-3" />
            Vraag Fin
          </button>
        )}
      </div>
    </div>
  )
})
