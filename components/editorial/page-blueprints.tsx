'use client'

/**
 * Page-blueprint primitives — compositie-helpers voor de 10 page-types
 * uit de ui-ux skill. Gebruiken de editorial primitives uit `./index`.
 *
 * Doel: pagina-templates in `/app/(app)/**` kunnen `<PageMiniHero>`,
 * `<PageDetailHeader>`, `<PageActionBar>` etc. importeren in plaats van
 * inline JSX te schrijven dat 10× gedupliceerd moet worden over de app.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Kicker,
  EditorialHeadline,
  EditorialDeck,
  HighlightMark,
  FiguresStrip,
  type FigureProps,
} from './index'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ─────────────────────────────────────────────────────────────────
// PageBackLink — back-navigation voor non-landing pagina's
// ─────────────────────────────────────────────────────────────────

export function PageBackLink({
  href,
  label,
  className = '',
}: {
  href: string
  label: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)] ${className}`}
    >
      <ChevronLeft className="w-3 h-3" aria-hidden />
      Terug naar {label}
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────
// PageMiniHero — Type 2 (categorie/list-pagina) hero
// ─────────────────────────────────────────────────────────────────

export function PageMiniHero({
  kicker,
  title,
  emphasis,
  figures,
  deck,
  className = '',
}: {
  kicker: string
  title: string
  emphasis?: string
  figures?: FigureProps[]
  deck?: ReactNode
  className?: string
}) {
  return (
    <header className={`space-y-3 ${className}`}>
      <Kicker>{kicker}</Kicker>
      <EditorialHeadline level="h1" emphasis={emphasis} size="lg">
        {title}
      </EditorialHeadline>
      {figures && figures.length > 0 && (
        <FiguresStrip cols={figures.length === 2 ? 2 : 4} figures={figures} />
      )}
      {deck && <EditorialDeck>{deck}</EditorialDeck>}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────
// PageDetailHeader — Type 3 (detail-pagina) hero met hoofdwaarde-marker
// ─────────────────────────────────────────────────────────────────

export function PageDetailHeader({
  kicker,
  title,
  emphasis,
  amount,
  meta,
  className = '',
}: {
  kicker: string
  title: string
  emphasis?: string
  /** Hoofdwaarde — krijgt automatisch highlight-marker (`<HighlightMark>`). */
  amount?: string
  /** Sub-meta in italic Source Serif (provider, looptijd, "Bijgewerkt om HH:mm"). */
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={`space-y-2 ${className}`}>
      <Kicker>{kicker}</Kicker>
      <EditorialHeadline level="h1" emphasis={emphasis} size="lg">
        {title}
      </EditorialHeadline>
      {amount && (
        <p className="font-mono tabular-nums text-[32px] sm:text-[40px] font-bold leading-none mt-2">
          <HighlightMark>{amount}</HighlightMark>
        </p>
      )}
      {meta && (
        <p
          className="italic text-[12.5px] text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {meta}
        </p>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────
// PageFormSection — Type 4 (form-flow) section-wrapper met section-label
// ─────────────────────────────────────────────────────────────────

export function PageFormSection({
  label,
  num,
  children,
  className = '',
}: {
  label: string
  num?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-3">
        <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          {label}
        </span>
        {num && (
          <span
            className="italic text-sm text-[var(--module-active-700)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {num}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// PageActionBar — Type 3/4/7 sticky action-bar met duo-CTA
// ─────────────────────────────────────────────────────────────────

export interface PageActionProps {
  label: string
  onClick?: () => void
  href?: string
  /** 'primary' = solid module-active button (default rechts).
   *  'secondary' = outlined ink button.
   *  'tertiary' = mono UPPERCASE link (annuleren-stijl). */
  variant?: 'primary' | 'secondary' | 'tertiary'
  /** Optioneel icon-component (Lucide) voor links of rechts van het label. */
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  iconPosition?: 'left' | 'right'
  disabled?: boolean
}

export function PageActionBar({
  primary,
  secondary,
  tertiary,
  sticky = false,
  className = '',
}: {
  primary?: PageActionProps
  secondary?: PageActionProps
  /** Tertiair links (bv. "Annuleren") — wordt als tekstlink gerenderd. */
  tertiary?: PageActionProps
  /** Sticky op mobile met safe-area-bottom. */
  sticky?: boolean
  className?: string
}) {
  const stickyClass = sticky
    ? 'sticky bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-[var(--border-ed)] py-3 px-4 z-10 safe-bottom'
    : 'py-3 border-t border-[var(--border-ed)]'
  return (
    <div
      className={`flex items-center justify-between gap-3 flex-wrap ${stickyClass} ${className}`}
    >
      <div className="flex items-center gap-2">
        {tertiary && <PageActionButton {...tertiary} variant="tertiary" />}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        {secondary && <PageActionButton {...secondary} variant="secondary" />}
        {primary && <PageActionButton {...primary} variant="primary" />}
      </div>
    </div>
  )
}

function PageActionButton({
  label,
  onClick,
  href,
  variant = 'primary',
  icon: Icon,
  iconPosition = 'right',
  disabled,
}: PageActionProps) {
  const baseClass =
    'inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em] font-mono'
  let variantClass = ''
  if (variant === 'primary') {
    variantClass = 'px-4 py-2'
  } else if (variant === 'secondary') {
    variantClass = 'px-3 py-1.5 border border-[var(--ink)] text-[var(--ink)]'
  } else {
    variantClass =
      'text-[var(--ink-3)] hover:text-[var(--ink)] tracking-[0.15em]'
  }
  const inlineStyle =
    variant === 'primary'
      ? { background: 'var(--module-active-500)', color: 'var(--paper)' }
      : undefined

  const content = (
    <>
      {Icon && iconPosition === 'left' && (
        <Icon className="w-3.5 h-3.5" aria-hidden />
      )}
      {label}
      {Icon && iconPosition === 'right' && (
        <Icon className="w-3.5 h-3.5" aria-hidden />
      )}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={`${baseClass} ${variantClass}`}
        style={inlineStyle}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClass} disabled:opacity-50`}
      style={inlineStyle}
    >
      {content}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// PageStepIndicator — Type 7 (wizard) stappen-balk + progress
// ─────────────────────────────────────────────────────────────────

export function PageStepIndicator({
  step,
  total,
  className = '',
}: {
  step: number
  total: number
  className?: string
}) {
  const romans = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.', 'vii.', 'viii.']
  const roman = romans[step - 1] ?? `${step}.`
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span
          className="italic text-sm text-[var(--module-active-700)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          {roman} / {romans[total - 1] ?? `${total}.`}
        </span>
        <span
          className="italic text-[12px] text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          stap {step} van {total}
        </span>
      </div>
      <div
        className="h-[2px] w-full"
        style={{ background: 'var(--rule-soft)' }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(step / total) * 100}%`,
            background: 'var(--module-active-500)',
          }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PageMasthead — Type 10 (calculator) masthead met dubbele lijn boven
// ─────────────────────────────────────────────────────────────────

export function PageMasthead({
  metaLeft,
  metaRight,
  logo = 'tf',
  logoDot = '.',
  className = '',
}: {
  metaLeft: string
  metaRight: string
  logo?: string
  logoDot?: string
  className?: string
}) {
  return (
    <header
      className={`border-t-4 border-double border-b border-[var(--ink)] py-3 sm:py-4 flex items-baseline justify-between gap-4 flex-wrap ${className}`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-2)]">
        {metaLeft}
      </div>
      <div
        className="text-[28px] sm:text-[34px] leading-none italic font-black tracking-[-0.02em]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {logo}
        <span style={{ color: 'var(--color-horizon-500)' }}>{logoDot}</span>
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-2)] text-right">
        {metaRight}
      </div>
    </header>
  )
}

// Re-export everything from index for one-stop import
export {
  Kicker,
  EditorialHeadline,
  EditorialDeck,
  HighlightMark,
  HL,
  HLNeg,
  FiguresStrip,
  PullQuote,
  ScenarioCallout,
  RekeningTag,
  TogglePill,
  ComparisonRow,
  RomanSection,
  OrnamentColophon,
} from './index'

export { ChevronRight, ChevronLeft }
