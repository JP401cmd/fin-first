'use client'

import { useState, useCallback } from 'react'
import { ChevronRight, Lightbulb } from 'lucide-react'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { NotificationItem } from './notification-item'
import type { ListDensity } from '@/components/app/density-toggle'
import { bundleNotifications, type NotificationRow } from '@/lib/notifications/bundelen'
import type { Notification } from '@/app/api/notifications/route'

type BundleRow = Extract<NotificationRow, { kind: 'bundle' }>

type Props = {
  bundle: BundleRow
  onRead: (id: string) => void
  onClose: () => void
  density?: ListDensity
  /**
   * Horizontale padding van de omliggende lijst. De bel-dropdown gebruikt
   * `px-5`, /berichten `px-4` — de bundelkop moet met de losse meldingen
   * meelopen, anders springt de linkerrand bij het uitklappen.
   */
  paddingClass?: string
}

/**
 * Eén opgevouwen regel voor meerdere meldingen van dezelfde soort.
 *
 * De kop markeert bewust NIETS als gelezen — precies zoals de dag-groepen in
 * de lijst: opvouwen is een weergavekeuze, geen leeshandeling. Alleen de losse
 * meldingen binnenin markeren zichzelf wanneer de gebruiker ze aantikt, zodat
 * de read-state per melding-id intact blijft (de history-upsert hangt aan dat
 * id).
 *
 * De groep staat standaard open zodra hij een ongelezen melding van de
 * hoogste urgentie bevat: iets écht dringends hoort niet achter een vouw te
 * verdwijnen.
 */
export function NotificationBundle({ bundle, onRead, onClose, density = 'ruim', paddingClass = 'px-5' }: Props) {
  const { openWithMessage } = useChatContext()
  const [expanded, setExpanded] = useState(bundle.hasUrgent)

  const handleAskAI = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onClose()
      openWithMessage(bundle.aiContext)
    },
    [bundle.aiContext, onClose, openWithMessage],
  )

  const count = bundle.items.length

  return (
    <div className="border-b border-dashed border-[var(--border-ed)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full min-h-[44px] items-start gap-2 ${paddingClass} py-3 text-left transition-colors hover:bg-[var(--subtle)]`}
      >
        <ChevronRight
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-inter)] text-[13px] font-semibold text-[var(--ink)]">
              {bundle.title}
            </span>
            {bundle.unread > 0 && (
              <span className="font-[family-name:var(--font-inter)] text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-3)]">
                {bundle.unread} ongelezen
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate font-[family-name:var(--font-source-serif)] text-[12px] italic text-[var(--ink-3)]">
            {bundle.description}
          </span>
        </span>
        <span className="shrink-0 font-[family-name:var(--font-inter)] text-[11px] text-[var(--ink-4)]">
          {count}
        </span>
      </button>

      {/* Eén chat-vraag over de hele groep, in plaats van één knop per melding
          — dat was precies de stapeling die de bundel oplost. */}
      <div className={`${paddingClass} pb-3`}>
        <button
          type="button"
          onClick={handleAskAI}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 font-[family-name:var(--font-inter)] text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--paper)] sm:min-h-0 sm:px-2 sm:py-1"
        >
          <Lightbulb className="h-3 w-3" />
          Vraag Fin over deze {count}
        </button>
      </div>

      {expanded && (
        <div>
          {bundle.items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={onRead}
              onClose={onClose}
              density={density}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Rendert één lijstsectie (Dringend / Vandaag / één dag uit Eerder) met
 * bundeling erin: soorten met drie of meer meldingen worden één opvouwbare
 * regel, de rest blijft een gewone melding.
 *
 * Beide meldingenoppervlakken — de bel-dropdown en /berichten — gaan hier
 * doorheen, zodat ze niet uit elkaar kunnen lopen.
 */
export function NotificationRows({
  items,
  onRead,
  onClose,
  density = 'ruim',
  paddingClass = 'px-5',
}: {
  items: Notification[]
  onRead: (id: string) => void
  onClose: () => void
  density?: ListDensity
  paddingClass?: string
}) {
  const rows = bundleNotifications(items)
  return (
    <>
      {rows.map((row) =>
        row.kind === 'bundle' ? (
          <NotificationBundle
            key={row.key}
            bundle={row}
            onRead={onRead}
            onClose={onClose}
            density={density}
            paddingClass={paddingClass}
          />
        ) : (
          <NotificationItem
            key={row.key}
            notification={row.notification}
            onRead={onRead}
            onClose={onClose}
            density={density}
          />
        ),
      )}
    </>
  )
}
