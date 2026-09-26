'use client'

import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Minus } from 'lucide-react'
import {
  leverageStatusBgClass,
  leverageStatusTextClass,
  LEVERAGE_STATUS_DOT,
  type LeverageStatus,
} from '@/lib/leverage-status'
import { tapTargetClass } from '@/components/editorial/tap-target'

/**
 * PageStatusBannerBody — de zichtbare kaart van een status-melding: 3px streep,
 * mono-kicker, "Minimaliseren", titel, uitleg en actie-rij. Puur presentational
 * en los van `PageStatusContext`, zodat er één uiterlijk is voor twee hosts:
 *
 *  - `PageStatusBanner` (/overzicht) — `variant="block"`;
 *  - `KaternMelding` (/toekomst, ADR 0179 D6) — `variant="compact"`: op mobiel één
 *    regel van 44px (titel · actie · minimaliseren, uitleg na een tik), vanaf `lg`
 *    dezelfde block-look als de banner.
 *
 * De `aria-live`-regio hoort NIET hier maar bij de host: die moet altijd gemount
 * blijven, ook als deze kaart er niet is (geminimaliseerd of geen melding).
 *
 * Kleur: stoplicht-status, GEEN module-accent (CLAUDE.md, kleurconventie) — behalve
 * de informatieve variant, die de horizon-toon van de vrijheidsbanner draagt.
 */

/** De drie kleurklassen van een melding. */
export interface StatusBannerTone {
  bg: string
  stripe: string
  kickerText: string
}

/**
 * Kleur van de melding. `informational` = niets alarmeert (de informatieve
 * vrijheidsbanner, een neutrale katern-melding): horizon-toon. Anders volgt de
 * kleur de stoplicht-status, die de accentkeuze nooit volgt.
 */
export function statusBannerTone(status: LeverageStatus, informational: boolean): StatusBannerTone {
  if (informational) {
    return {
      bg: 'bg-gradient-to-r from-horizon-50 to-stone-50',
      stripe: 'bg-horizon-500',
      kickerText: 'text-horizon-700',
    }
  }
  return {
    bg: leverageStatusBgClass(status),
    stripe: LEVERAGE_STATUS_DOT[status],
    kickerText: leverageStatusTextClass(status),
  }
}

export interface PageStatusBannerBodyProps {
  tone: StatusBannerTone
  /**
   * Mono-kicker boven de titel ("Aandacht", "Actie nodig", of de ankertitel van de
   * vrijheidsbanner). `null`: de titel neemt de kicker-plek in (informatieve
   * katern-melding zonder alarmwoord).
   */
  kicker: ReactNode | null
  /** Optioneel icoon vóór de kicker (de vrijheidsbanner: Sparkles). */
  kickerIcon?: ReactNode
  title: ReactNode
  /** Uitleg onder de titel; `null`/`undefined` = geen regel. */
  explanation?: ReactNode | null
  action?: { label: string; href: string } | null
  /** Extra knoppen in de actie-rij, na de actie (de banner: Bespreek met Fin). */
  extraActions?: ReactNode
  /** Zonder handler geen Minimaliseren-knop (een host die niets onthoudt). */
  onMinimize?: () => void
  /** 'block' = de banner; 'compact' = mobiel één regel, vanaf `lg` de block-look. */
  variant?: 'block' | 'compact'
  /** Attributen op de wortel, bv. `data-testid`. */
  rootProps?: { 'data-testid'?: string; 'data-ernst'?: string }
}

const MINIMALISEREN = 'Minimaliseren'
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

export function PageStatusBannerBody(props: PageStatusBannerBodyProps) {
  const { tone, variant = 'block', rootProps } = props

  if (variant === 'compact') return <CompactBody {...props} />

  return (
    <div
      className={`mt-4 flex gap-3 rounded-[var(--r)] border border-[var(--border-md)] ${tone.bg} p-4`}
      {...rootProps}
    >
      {/* 3px verticale streep: stoplicht, of horizon-accent als informatief. */}
      <div
        className={`w-[3px] shrink-0 self-stretch rounded-full ${tone.stripe}`}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <BlockContent {...props} />
      </div>
    </div>
  )
}

/** Kicker-rij, titel, uitleg en actie-rij — gedeeld door block en compact-vanaf-lg. */
function BlockContent({
  tone,
  kicker,
  kickerIcon,
  title,
  explanation,
  action,
  extraActions,
  onMinimize,
}: PageStatusBannerBodyProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        {kicker != null ? (
          <p
            className={`flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${tone.kickerText}`}
          >
            {kickerIcon}
            {kicker}
          </p>
        ) : (
          <p className="font-sans text-sm font-semibold text-[var(--ink)]">{title}</p>
        )}
        {/* Minimaliseren — klapt de melding in tot het statuspunt. Zichtbaar label
            (niet icon-only), zodat de actie als "inklappen" leest, niet als
            "wegklikken". */}
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            aria-label={MINIMALISEREN}
            title={MINIMALISEREN}
            className={`-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] ${FOCUS_RING}`}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            {MINIMALISEREN}
          </button>
        )}
      </div>
      {kicker != null && (
        <p className="mt-1 font-sans text-sm font-semibold text-[var(--ink)]">{title}</p>
      )}
      {explanation != null && (
        <p className="mt-1 font-serif text-sm text-[var(--ink-2)]">{explanation}</p>
      )}

      {(action || extraActions) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {action && (
            <Link
              href={action.href}
              className={`inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--ink)] px-3 py-2.5 text-[12px] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] ${FOCUS_RING}`}
            >
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          {extraActions}
        </div>
      )}
    </>
  )
}

/**
 * Compact: op mobiel één regel van 44px — titel (tik = uitleg), actie, minimaliseren —
 * en vanaf `lg` dezelfde inhoud als de block-variant. Eén component, twee breedtes.
 */
function CompactBody(props: PageStatusBannerBodyProps) {
  const { tone, title, explanation, action, onMinimize, rootProps } = props
  const [uitlegOpen, setUitlegOpen] = useState(false)
  const uitlegId = useId()
  const heeftUitleg = explanation != null

  return (
    <div
      className={`flex gap-3 rounded-[var(--r)] border border-[var(--border-md)] ${tone.bg} px-3 lg:mt-4 lg:p-4`}
      {...rootProps}
    >
      <div
        className={`my-2 w-[3px] shrink-0 self-stretch rounded-full lg:my-0 ${tone.stripe}`}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 lg:hidden">
          {heeftUitleg ? (
            <button
              type="button"
              onClick={() => setUitlegOpen((o) => !o)}
              aria-expanded={uitlegOpen}
              aria-controls={uitlegId}
              className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-1 text-left font-sans text-[13px] font-semibold text-[var(--ink)] ${FOCUS_RING}`}
            >
              <span className="truncate">{title}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-3)] transition-transform ${uitlegOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <p className="flex min-h-[44px] min-w-0 flex-1 items-center font-sans text-[13px] font-semibold text-[var(--ink)]">
              <span className="truncate">{title}</span>
            </p>
          )}
          {action && (
            <Link
              href={action.href}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 font-sans text-[12px] font-semibold text-[var(--ink)] underline underline-offset-4 ${FOCUS_RING}`}
            >
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label={MINIMALISEREN}
              title={MINIMALISEREN}
              className={`${tapTargetClass('reserve')} inline-flex shrink-0 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)] ${FOCUS_RING}`}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {heeftUitleg && uitlegOpen && (
          <p id={uitlegId} className="pb-3 font-serif text-[13px] text-[var(--ink-2)] lg:hidden">
            {explanation}
          </p>
        )}

        <div className="hidden lg:block">
          <BlockContent {...props} />
        </div>
      </div>
    </div>
  )
}
