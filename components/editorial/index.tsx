'use client'

/**
 * Editorial primitives — TriFinity design system.
 *
 * Pure presentation-components zonder eigen state of side-effects.
 * Alle primitives zijn module-aware via `--module-active-*` CSS-variabelen
 * (gezet door route-layouts in `app/(app)/{core,will,horizon}/layout.tsx`).
 * Cross-module-routes vallen terug op ink-shades; highlight-marker valt
 * terug op Horizon-200.
 *
 * Gebruik via: `import { Kicker, HighlightMark, FiguresStrip } from '@/components/editorial'`.
 */

import type { ReactNode } from 'react'

// Re-export Button (gesanctioneerde CTA-primitive — ink/secondary/moment; ADR 0038)
export { Button } from './button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './button'
// Re-export GlossaryTerm (lives in own file due to state/effects)
export { GlossaryTerm } from './glossary-term'
export type { GlossaryTermProps } from './glossary-term'
// Re-export InlineInfoDisclosure (i-knop + inline uitleg-paneel; eigen file wegens state)
export { InlineInfoDisclosure } from './inline-info-disclosure'
export type { InlineInfoDisclosureProps } from './inline-info-disclosure'
// Re-export InfoIconTooltip (scherpe inline i + zwevende popover; derde info-affordance; eigen file wegens state)
export { InfoIconTooltip, InfoTooltip } from './info-icon-tooltip'
// Re-export PageInfoButton (page context popover)
export { PageInfoButton } from './page-info-button'
// Re-export PageOpening (canonieke editorial pagina-aanhef — standaard-aanhef)
export { PageOpening, PageOpeningFigure } from './page-opening'
// Re-export SubtotalLine (gedeeld "excl. eigen woning"-subtotaal; raakt privacy-context)
export { SubtotalLine } from './subtotal-line'
export type { SubtotalLineProps } from './subtotal-line'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ─────────────────────────────────────────────────────────────────
// Tekst-primitives
// ─────────────────────────────────────────────────────────────────

/** Kicker met 28×1px module-streep ervoor. UPPERCASE mono. */
export function Kicker({
  children,
  className = '',
  size = 'default',
}: {
  children: ReactNode
  className?: string
  /** 'small' = 9px (modal headers); 'default' = 10px; 'large' = 11px (hero). */
  size?: 'small' | 'default' | 'large'
}) {
  const sizeClass =
    size === 'small'
      ? 'text-[9px] tracking-[0.18em]'
      : size === 'large'
      ? 'text-[11px] tracking-[0.22em]'
      : 'text-[10px] tracking-[0.20em]'
  const stripWidth = size === 'small' ? 'w-5' : 'w-7'
  return (
    <div
      // `ed-kicker`: stabiele haak zodat het Krant-palet deze labels naar Inter
      // kan scopen (globals.css :root[data-palette="krant"] .ed-kicker). Zonder
      // dat palet blijft `font-mono` (DM Mono) leidend — geen regressie.
      className={`ed-kicker flex items-center gap-2.5 ${sizeClass} uppercase font-mono text-[var(--module-active-700)] ${className}`}
    >
      <span
        aria-hidden
        className={`inline-block ${stripWidth} h-px shrink-0`}
        style={{ background: 'var(--module-active-500)' }}
      />
      {children}
    </div>
  )
}

/** Editorial headline (H1/H2) met optionele italic-em in module-kleur.
 *  Geeft de "narratieve" headlines het signature TriFinity-DNA.
 *  - `emphasis`: het exacte woord (case-sensitive) dat italic-em krijgt.
 *  - `level`: 'h1' (default) of 'h2' voor semantiek; visueel via `size`.
 *  - `size`: 'sm' (24-30px), 'lg' (28-44px, default), 'xl' (36-60px hero). */
export function EditorialHeadline({
  children,
  emphasis,
  level = 'h1',
  size = 'lg',
  className = '',
}: {
  children: string
  emphasis?: string
  level?: 'h1' | 'h2'
  size?: 'sm' | 'lg' | 'xl'
  className?: string
}) {
  const sizes = {
    sm: 'text-2xl sm:text-3xl',
    lg: 'text-[28px] sm:text-[36px] md:text-[44px]',
    xl: 'text-[36px] sm:text-[48px] md:text-[60px]',
  }
  const Tag = level
  if (!emphasis) {
    return (
      <Tag
        className={`font-black leading-[0.95] tracking-[-0.025em] ${sizes[size]} ${className}`}
        style={{ fontFamily: PLAYFAIR }}
      >
        {children}
      </Tag>
    )
  }
  const parts = children.split(emphasis)
  return (
    <Tag
      className={`font-black leading-[0.95] tracking-[-0.025em] ${sizes[size]} ${className}`}
      style={{ fontFamily: PLAYFAIR }}
    >
      {parts.map((part, idx) => (
        <span key={idx}>
          {part}
          {idx < parts.length - 1 && (
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              {emphasis}
            </em>
          )}
        </span>
      ))}
    </Tag>
  )
}

/** Editorial deck — italic Source Serif body met linker module-border.
 *  Vervangt gewone `<p>` als de pagina een redactionele intro nodig heeft. */
export function EditorialDeck({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={`italic text-base sm:text-[17px] leading-snug max-w-[60ch] text-[var(--ink-2)] pl-4 ${className}`}
      style={{
        fontFamily: SOURCE_SERIF,
        borderLeft: '2px solid var(--module-active-500)',
      }}
    >
      {children}
    </p>
  )
}

/** Highlight-marker — halve transparante streep in module-active 200-shade.
 *  Op cross-module-pagina's valt `--module-active-200` terug op Horizon-200. */
export function HighlightMark({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline px-1"
      style={{
        backgroundImage:
          'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
      }}
    >
      {children}
    </span>
  )
}

/** Concept-highlight binnen pull-quote of paragraaf — bold module-700, niet italic. */
export function HL({ children }: { children: ReactNode }) {
  return (
    <strong
      className="font-bold not-italic"
      style={{ color: 'var(--module-active-700)' }}
    >
      {children}
    </strong>
  )
}

/** Negatief-highlight — bold negative-color, niet italic. */
export function HLNeg({ children }: { children: ReactNode }) {
  return (
    <strong
      className="font-bold not-italic"
      style={{ color: 'var(--negative)' }}
    >
      {children}
    </strong>
  )
}

// ─────────────────────────────────────────────────────────────────
// Block-primitives
// ─────────────────────────────────────────────────────────────────

export interface FigureProps {
  kicker: string
  /** Either a pre-formatted string ("€ 12.345") or a node (e.g. <MaskedAmount>) — the latter lets privacy-aware widgets swap in masked bullets without losing the cell's typography. */
  amount: string | ReactNode
  sub?: string
  variant?: 'neutral' | 'positive' | 'negative' | 'winner'
  /** Maakt de cell een klikbare deeplink. Wordt gerenderd als Next.js `<Link>`. */
  href?: string
}

/** Figures-strip — 4-kolommen-summary voor kassabonnen, scenario-output,
 *  analyse-conclusie, jaaroverzicht-headers, asset-detail mini-hero.
 *  Top + bottom solid borders, verticale rule-soft dividers tussen kolommen.
 *  Eindresultaat-kolom (`variant: 'winner'`) krijgt highlight-marker.
 *  Cellen met `href` worden klikbaar — voor /core/-stijl klikbare summaries. */
export function FiguresStrip({
  cols = 4,
  figures,
  className = '',
}: {
  cols?: 2 | 3 | 4
  figures: FigureProps[]
  className?: string
}) {
  const colsClass =
    cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'
  // 3-cols heeft geen even aantal op mobile; pas border-bottom-row-rule aan.
  const mobileRowBorderRule =
    cols === 3
      ? '[&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0'
      : '[&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0'
  return (
    <div
      // `data-figures-strip` is een print-hook: de compact-tier in
      // `@media print` gebruikt deze attribuut om de strip in PDF te
      // verkleinen (cell-padding, amount-font-size). Geen effect op
      // schermweergave — puur een addressable target.
      data-figures-strip
      className={`grid grid-cols-2 ${colsClass} border-t border-b border-[var(--ink)] my-5 ${className}`}
    >
      {figures.map((f, idx) => (
        <FiguresStripCell key={idx} figure={f} mobileRowBorderRule={mobileRowBorderRule} />
      ))}
    </div>
  )
}

function FiguresStripCell({
  figure,
  mobileRowBorderRule,
}: {
  figure: FigureProps
  mobileRowBorderRule: string
}) {
  const colorMap: Record<string, string> = {
    neutral: 'var(--ink)',
    positive: 'var(--positive)',
    negative: 'var(--negative)',
    winner: 'var(--ink)',
  }
  const variant = figure.variant ?? 'neutral'
  const isWinner = variant === 'winner'
  const cellClass = `p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 ${mobileRowBorderRule} last:border-b-0`

  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5">
        {figure.kicker}
      </div>
      <div
        // `data-figure-amount` is print-hook: compact-tier verkleint
        // amount-typografie naar 18pt voor PDF zonder schermweergave te raken.
        data-figure-amount
        className="text-[22px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
        style={{ fontFamily: PLAYFAIR, color: colorMap[variant] }}
      >
        {isWinner ? <HighlightMark>{figure.amount}</HighlightMark> : figure.amount}
      </div>
      {figure.sub && (
        <div
          className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {figure.sub}
        </div>
      )}
    </>
  )

  if (figure.href) {
    // Lazy-load Link only when needed — geen overhead op niet-klikbare cellen.
    // Next.js Link is cheap; we importeren via require om client-component-status
    // te respecteren zonder top-level import-extra in te voegen voor cellen die
    // hem toch niet gebruiken.
    return (
      <a
        href={figure.href}
        className={`${cellClass} block transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
      >
        {inner}
      </a>
    )
  }

  return <div className={cellClass}>{inner}</div>
}

/** Pull-quote met grote module-quote-mark + italic Playfair body.
 *  Gebruik `<HL>` en `<HLNeg>` voor inline highlights binnen de quote. */
export function PullQuote({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <blockquote
      className={`relative border-t border-b border-[var(--ink)] py-5 pl-7 sm:pl-9 mb-6 ${className}`}
      style={{ fontFamily: PLAYFAIR }}
    >
      <span
        aria-hidden
        className="absolute -top-2 -left-1 font-black not-italic text-[40px] sm:text-[56px] md:text-[80px] leading-none"
        style={{ fontFamily: PLAYFAIR, color: 'var(--module-active-500)' }}
      >
        &ldquo;
      </span>
      <p className="italic font-normal text-base sm:text-lg leading-snug text-[var(--ink)]">
        {children}
      </p>
    </blockquote>
  )
}

/** Scenario-callout / regime-info — info-block met linker module-border.
 *  Gebruikt bovenaan kassabonnen en scenario-output om de geactiveerde
 *  regel/instelling/keuze toe te lichten. */
export function ScenarioCallout({
  title,
  children,
  className = '',
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-[var(--paper)] border border-[var(--ink)] p-3 sm:p-4 mb-5 text-sm leading-snug text-[var(--ink-2)] ${className}`}
      style={{
        fontFamily: SOURCE_SERIF,
        borderLeftWidth: '4px',
        borderLeftColor: 'var(--module-active-500)',
      }}
    >
      {title && (
        <strong
          className="italic font-bold not-italic mr-1"
          style={{ fontFamily: PLAYFAIR, color: 'var(--ink)' }}
        >
          {title}
        </strong>
      )}
      {children}
    </div>
  )
}

/** Rekening-tag uit de bovenrand voor breakdown-cards.
 *  Italic Playfair label dat door de bovenrand "steekt", als kassabon-label. */
export function RekeningTag({
  label = 'rekening',
  children,
  className = '',
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative pt-3 overflow-visible ${className}`}>
      <span
        aria-hidden
        className="absolute -top-[10px] left-4 px-2 italic text-[11px] text-[var(--ink-3)] whitespace-nowrap"
        style={{ fontFamily: PLAYFAIR, background: 'var(--bg)' }}
      >
        {label}
      </span>
      <div className="bg-[var(--paper)] border border-[var(--ink)] p-5 sm:p-6">
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Control-primitives
// ─────────────────────────────────────────────────────────────────

/** Toggle-pill aan/uit. Voor scenario-toggles, wat-als-knoppen, density-switches.
 *  NIET als checkbox-vervanger in forms — gebruik `<Switch>`/`<Checkbox>`. */
export function TogglePill({
  on,
  label,
  onClick,
  className = '',
}: {
  on: boolean
  label?: string
  onClick?: () => void
  className?: string
}) {
  const text = label ?? (on ? 'aan' : 'uit')
  const onClasses =
    'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
  const offClasses =
    'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)]'
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      // Interactieve pills dragen hun stand ook voor schermlezers — de
      // aan/uit-stand is anders puur een achtergrondkleur.
      aria-pressed={onClick ? on : undefined}
      onClick={onClick}
      className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold uppercase tracking-[0.15em] border ${
        on ? onClasses : offClasses
      } ${onClick ? 'cursor-pointer min-h-[32px]' : ''} ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {text}
    </Comp>
  )
}

/** Comparison-row — tabel-rij met module-100/40 background + linker-border
 *  voor "current"/geselecteerde rij in scenario-vergelijkingen. */
export function ComparisonRow({
  highlight = false,
  children,
  className = '',
}: {
  highlight?: boolean
  children: ReactNode
  className?: string
}) {
  if (!highlight) {
    return <div className={className}>{children}</div>
  }
  return (
    <div
      className={`-mx-2 px-3 ${className}`}
      style={{
        background: 'color-mix(in oklch, var(--module-active-100) 40%, transparent)',
        borderLeft: '3px solid var(--module-active-500)',
      }}
    >
      {children}
    </div>
  )
}

/** Section-label met UPPERCASE kicker links + romeinse num rechts.
 *  Voor long-form editorial pagina's met ≤4 secties (gids, jaaroverzicht). */
export function RomanSection({
  label,
  num,
  children,
  className = '',
}: {
  label: string
  num?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-5">
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

/** Ornament colophon — krant-stijl footer-meta. */
export function OrnamentColophon({
  module = '',
  text,
}: {
  module?: string
  text: string
}) {
  return (
    <p className="text-center text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--ink-3)] py-4">
      Trifinity{' '}
      <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
        ✦
      </span>{' '}
      {text}
      {module && (
        <>
          {' '}
          <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
            ✦
          </span>{' '}
          {module}
        </>
      )}
    </p>
  )
}

/** Alias for OrnamentColophon — backwards-compat shorter name. */
export const Colophon = OrnamentColophon

// ─────────────────────────────────────────────────────────────────
// Layout-primitives
// ─────────────────────────────────────────────────────────────────

/** Section-label rij met UPPERCASE-kicker links + optionele romeinse num rechts.
 *  Zonder children — render zelf de section-content eronder. Voor section-content
 *  mét children-wrapper, gebruik `<RomanSection>`. */
export function SectionLabel({
  children,
  num,
  className = '',
}: {
  children: ReactNode
  num?: string
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-5 ${className}`}
    >
      <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
        {children}
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
  )
}

/** Compacte, gedempte mono sub-label bínnen een sectie- of pane-body (bv. "Kies je
 *  strategie", "Verfijn", "Zo werkt de prioriteit"). Bewust lichter dan
 *  `SectionLabel`: geen scheidingsrule, geen module-accent en geen romeins nummer —
 *  enkel een `--ink-3` mono-kicker. Eén bron voor het compacte-sublabel-patroon;
 *  eerder de lokale `RegelSectionLabel` in components/future/regels (K-06-consolidatie). */
export function SubsectionLabel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-2 ${className}`}
    >
      {children}
    </div>
  )
}

/** Card-editorial — minimale wrapper voor mini-artikel-blueprint cards.
 *  - `accent`: rendert 3px module-active-500 strip bovenaan (default false). */
export function CardEditorial({
  children,
  className = '',
  accent = false,
}: {
  children: ReactNode
  className?: string
  accent?: boolean
}) {
  return (
    <div
      className={`bg-[var(--paper)] border border-[var(--border-ed)] ${className}`}
    >
      {accent && (
        <div
          aria-hidden
          className="h-[3px] w-full"
          style={{ background: 'var(--module-active-500)' }}
        />
      )}
      {children}
    </div>
  )
}
