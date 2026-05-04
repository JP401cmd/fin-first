'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  formatCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Kicker, HighlightMark, FiguresStrip } from '@/components/editorial'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import { ModuleTipStrip } from './module-tip-strip'

interface CoreHeroProps {
  /** Effectief netto vermogen in EUR. */
  netWorth: number
  /** Totaal bezittingen, EUR. */
  totalAssets: number
  /** Totaal schulden, EUR (positief getoond). */
  totalDebts: number
  /** Aantal actieve bezittingen — gebruikt in 3-koloms strip. */
  assetCount: number
  /** Aantal actieve schulden — gebruikt in 3-koloms strip. */
  debtCount: number
  /** Jaarlijkse must-uitgaven — basis voor de vrijheid-rekenregel. */
  yearlyMustExpenses: number
  /**
   * Net-worth snapshots, oudste-eerst. Gebruikt voor delta vs vorige maand.
   * Behouden voor compatibiliteit, niet meer in de hero zichtbaar.
   */
  snapshots: NetWorthSnapshot[]
  /** Of `toekomstplannen` actief is — bepaalt zichtbaarheid van FIRE-bar. */
  toekomstActive: boolean
  /** FIRE-doelbedrag in EUR (0 = nog niet bepaald). */
  fireTarget: number
  /** Klik op het bedrag → open netto-vermogen-kassabon. */
  onShowNetWorthReceipt?: () => void
  /** Klik op de FIRE-bar → open FIRE-kassabon. */
  onShowFireReceipt?: () => void
}

/**
 * Pure registratie-hero voor de Kern-landing.
 *
 * Layout (zie referentie-afbeelding):
 *  1. Kern-bruin accent-streep boven
 *  2. Groot bedrag (Playfair) + "netto vermogen" naast in serif
 *  3. Vrijheidstijd-regel in horizon-amber italic
 *  4. FIRE-voortgangsbar (kern-bruin) met % links + doelbedrag rechts
 *  5. Bezittingen/schulden-bar (positive groen / negative rood) met bedragen
 *  6. Drie kolommen: Totale Bezittingen, Totale Schulden, Schuldgraad
 */
export function CoreHero({
  netWorth,
  totalAssets,
  totalDebts,
  assetCount,
  debtCount,
  yearlyMustExpenses,
  toekomstActive,
  fireTarget,
  onShowNetWorthReceipt,
  onShowFireReceipt,
}: CoreHeroProps) {
  // useFlashChange leeft binnen HeroAmount zelf — flashClass-updates triggeren
  // dan alleen een re-render van die span en niet van de omhullende button
  // (LCP-element). Houdt INP stabiel bij netWorth-mutaties.

  // Vrijheidstijd: hoeveel jaren/maanden kan dit netto vermogen je dragen?
  // Basis = jaarlijkse must-uitgaven; bij 0 valt de regel weg.
  const freedomLine = useMemo(() => {
    if (yearlyMustExpenses <= 0 || netWorth <= 0) return null
    const dailyExpenses = yearlyMustExpenses / 365
    const breakdown = calculateFreedomTime(netWorth, dailyExpenses)
    if (breakdown.isInfinite || breakdown.totalDays <= 0) return null
    return `dat is ${formatFreedomTimeString(breakdown, 'long', false)} vrijheid`
  }, [yearlyMustExpenses, netWorth])

  // Schuldgraad = totaal schulden / totaal bezittingen × 100. Categorie
  // bepaalt het label rechtsonder; krant-discipline → geen kleur in label.
  const debtRatio =
    totalAssets > 0 ? (totalDebts / totalAssets) * 100 : 0
  const debtRatioLabel =
    debtRatio <= 0
      ? 'Geen schulden'
      : debtRatio < 30
        ? 'Gezonde schuldenlast'
        : debtRatio < 60
          ? 'Gemiddelde schuldenlast'
          : 'Hoge schuldenlast'

  return (
    <section
      data-testid="kern-hero"
      className="border-b border-[var(--border-ed)] bg-[var(--paper)]"
    >
      {/* Module-active accent-streep — automatisch Kern-700 op /core. */}
      <div
        className="h-1"
        style={{ background: 'var(--module-active-700)' }}
      />

      <div className="px-4 py-7 sm:px-6 sm:py-9">
        {/* Kicker met 28×1px module-streep — editorial signature-element.
            Vervangt het inline "netto vermogen"-label hieronder als primaire context. */}
        <div className="mb-3">
          <Kicker>Netto vermogen</Kicker>
        </div>

        {/* Hoofdbedrag + "netto vermogen" inline (klein label voor mobile-context) */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {onShowNetWorthReceipt ? (
            <button
              type="button"
              onClick={onShowNetWorthReceipt}
              className="text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <HeroAmount netWorth={netWorth} />
            </button>
          ) : (
            <HeroAmount netWorth={netWorth} />
          )}
          <span className="font-serif text-base italic text-[var(--ink-3)] sm:text-lg">
            netto vermogen
          </span>
        </div>

        {/* Vrijheidstijd — horizon-amber italic */}
        {freedomLine && (
          <p className="mt-3 font-serif text-sm italic text-horizon-700 sm:text-base">
            {freedomLine}
          </p>
        )}

        {/* FIRE-voortgangsbar — kern-bruin, met % links + doelbedrag rechts */}
        {toekomstActive ? (
          <FireProgressBar
            currentValue={netWorth}
            targetAmount={fireTarget}
            onClick={onShowFireReceipt}
          />
        ) : (
          <div className="mt-6">
            <ModuleTipStrip
              copy="Activeer Toekomstplannen om je FIRE-voortgang en vrijheidsdatum te zien."
              linkLabel="Instellingen"
            />
          </div>
        )}

        {/* Bezittingen/schulden-bar */}
        <AssetsDebtsBar totalAssets={totalAssets} totalDebts={totalDebts} />

        {/* Drie kolommen onderaan — Type 1 blueprint figures-strip met
            top + bottom solid borders en verticale rule-soft dividers.
            Bezittingen en Schulden zijn klikbaar; Schuldgraad blijft static. */}
        <FiguresStrip
          cols={3}
          figures={[
            {
              kicker: 'Totale bezittingen',
              amount: formatCurrency(totalAssets),
              sub: `${assetCount} ${assetCount === 1 ? 'bezitting' : 'bezittingen'}`,
              variant: 'positive',
              href: '/core/assets',
            },
            {
              kicker: 'Totale schulden',
              amount: formatCurrency(totalDebts),
              sub: `${debtCount} ${debtCount === 1 ? 'schuld' : 'schulden'}`,
              variant: 'negative',
              href: '/core/debts',
            },
            {
              kicker: 'Schuldgraad',
              amount: `${(Math.round(debtRatio * 10) / 10).toString().replace('.', ',')}%`,
              sub: debtRatioLabel,
              variant: 'neutral',
            },
          ]}
        />
      </div>
    </section>
  )
}

// ── Subcomponent: hoofdbedrag ────────────────────────────────

function HeroAmount({ netWorth }: { netWorth: number }) {
  // Hook leeft hier zodat flash-class-updates alleen deze span re-renderen
  // en de omhullende button (LCP-element) stabiel blijft.
  const { flashClass } = useFlashChange(netWorth)
  return (
    <span
      className={[
        'font-mono text-[40px] font-bold leading-[1] tabular-nums tracking-tight text-[var(--ink)]',
        'sm:text-[56px] md:text-[64px]',
        flashClass,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ fontFamily: 'var(--font-playfair, var(--font-mono, monospace))' }}
    >
      {/* Halve transparante streep in module-active-200 (Kern-200 op /core).
          Markeert het netto vermogen als hoofduitkomst-cijfer van de pagina. */}
      <HighlightMark>{formatCurrency(netWorth)}</HighlightMark>
    </span>
  )
}

// ── Subcomponent: FIRE-voortgangsbar ─────────────────────────

function FireProgressBar({
  currentValue,
  targetAmount,
  onClick,
}: {
  currentValue: number
  targetAmount: number
  onClick?: () => void
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  if (targetAmount <= 0) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          FIRE-voortgang
        </p>
        <p className="font-serif italic text-sm text-[var(--ink-3)]">
          Stel je FIRE-doel in via Instellingen.
        </p>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, (currentValue / targetAmount) * 100))
  const pctRounded = Math.round(pct * 10) / 10

  const Wrapper: React.ElementType = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        className:
          'group mt-6 block w-full text-left transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]',
      }
    : { className: 'mt-6 block w-full' }

  return (
    <Wrapper {...wrapperProps}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="font-mono text-sm font-semibold tabular-nums sm:text-base"
          style={{ color: 'var(--module-active-700)' }}
        >
          {pctRounded.toString().replace('.', ',')}%
        </span>
        <span
          className="font-mono text-sm font-semibold tabular-nums sm:text-base"
          style={{ color: 'var(--module-active-700)' }}
        >
          {formatCurrency(targetAmount)}
        </span>
      </div>
      <div
        ref={ref}
        className="mt-1.5 h-[5px] w-full overflow-hidden bg-[var(--subtle)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="FIRE-voortgang"
      >
        <div
          className="h-full"
          style={{
            background: 'var(--module-active-700)',
            width: hasEntered ? `${pct}%` : '0%',
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
          }}
        />
      </div>
    </Wrapper>
  )
}

// ── Subcomponent: bezittingen/schulden split-bar ─────────────

function AssetsDebtsBar({
  totalAssets,
  totalDebts,
}: {
  totalAssets: number
  totalDebts: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const sum = totalAssets + totalDebts
  const assetPct = sum > 0 ? (totalAssets / sum) * 100 : 0

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)] sm:text-base">
          {formatCurrency(totalAssets)}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)] sm:text-base">
          {formatCurrency(totalDebts)}
        </span>
      </div>
      <div
        ref={ref}
        className="mt-1.5 flex h-[5px] w-full overflow-hidden bg-[var(--subtle)]"
        role="img"
        aria-label={`Bezittingen ${formatCurrency(totalAssets)} en schulden ${formatCurrency(totalDebts)}`}
      >
        <div
          className="h-full bg-positive"
          style={{
            width: hasEntered ? `${assetPct}%` : '0%',
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
          }}
        />
        <div
          className="h-full bg-negative"
          style={{
            width: hasEntered ? `${100 - assetPct}%` : '0%',
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
            transitionDelay: '60ms',
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.08em]">
        <span className="text-positive">bezittingen</span>
        <span className="text-negative">schulden</span>
      </div>
    </div>
  )
}

// ── Subcomponent: één kolom in de 3-koloms strip ─────────────

function SummaryColumn({
  kicker,
  kickerClass,
  value,
  valueClass,
  meta,
  asPercentage = false,
  href,
}: {
  kicker: string
  kickerClass: string
  value: number
  valueClass: string
  meta: string
  asPercentage?: boolean
  /** Optioneel: maakt de hele kolom klikbaar als deeplink. */
  href?: string
}) {
  const formatted = asPercentage
    ? `${(Math.round(value * 10) / 10).toString().replace('.', ',')}%`
    : formatCurrency(value)

  const content = (
    <>
      <dt
        className={[
          'text-[10px] font-semibold uppercase tracking-[0.1em]',
          kickerClass,
        ].join(' ')}
      >
        {kicker}
      </dt>
      <dd
        className={[
          'mt-2 font-mono text-2xl font-bold tabular-nums sm:text-3xl',
          valueClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {formatted}
      </dd>
      <p className="mt-1 text-[11px] text-[var(--ink-4)]">{meta}</p>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="group -mx-2 -my-1 block px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        aria-label={`${kicker} — bekijk overzicht`}
      >
        {content}
      </Link>
    )
  }

  return <div>{content}</div>
}
