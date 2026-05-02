'use client'

import type { ReactNode } from 'react'

/**
 * Inline editorial-primitives voor de blueprints-showcase.
 * NIET voor productie — deze worden later vervangen door de echte
 * `components/editorial/*` primitives (zie plan, sectie A van Out of scope).
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/** Kicker met 28×1px module-streep ervoor. */
export function Kicker({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] ${className}`}
    >
      <span
        aria-hidden
        className="inline-block w-7 h-px"
        style={{ background: 'var(--module-active-500)' }}
      />
      {children}
    </div>
  )
}

/** Editorial headline met italic-em in module-kleur. */
export function EditorialHeadline({
  children,
  emphasis,
  size = 'lg',
}: {
  children: string
  emphasis?: string
  size?: 'sm' | 'lg' | 'xl'
}) {
  const sizes = {
    sm: 'text-2xl sm:text-3xl',
    lg: 'text-[28px] sm:text-[36px] md:text-[44px]',
    xl: 'text-[36px] sm:text-[48px] md:text-[60px]',
  }
  if (!emphasis) {
    return (
      <h1
        className={`font-black leading-[0.95] tracking-[-0.025em] ${sizes[size]}`}
        style={{ fontFamily: PLAYFAIR }}
      >
        {children}
      </h1>
    )
  }
  const parts = children.split(emphasis)
  return (
    <h1
      className={`font-black leading-[0.95] tracking-[-0.025em] ${sizes[size]}`}
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
    </h1>
  )
}

/** Editorial deck — italic Source Serif met linker module-border. */
export function EditorialDeck({ children }: { children: ReactNode }) {
  return (
    <p
      className="italic text-base sm:text-[17px] leading-snug max-w-[60ch] text-[var(--ink-2)] pl-4"
      style={{
        fontFamily: SOURCE_SERIF,
        borderLeft: '2px solid var(--module-active-500)',
      }}
    >
      {children}
    </p>
  )
}

/** Highlight-marker — halve transparante streep in module-actieve kleur (200-shade).
 *  Op cross-module-pagina's valt `--module-active-200` terug op Horizon-200 (universele
 *  uitkomst-marker). */
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

/** Section-label met UPPERCASE kicker links + romeinse num rechts. */
export function SectionLabel({
  children,
  num,
}: {
  children: ReactNode
  num?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-5">
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

/** Card-editorial wrapper — paper bg + 1px border, no rounding. */
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
      style={accent ? { borderTopWidth: '0' } : undefined}
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

/** Figure binnen FiguresStrip — 1 van 2/3/4 kolommen. */
export interface FigureProps {
  kicker: string
  amount: string
  sub?: string
  variant?: 'neutral' | 'positive' | 'negative' | 'winner'
}

export function FiguresStrip({
  cols = 4,
  figures,
}: {
  cols?: 2 | 3 | 4
  figures: FigureProps[]
}) {
  const colsClass =
    cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'
  return (
    <div
      className={`grid grid-cols-2 ${colsClass} border-t border-b border-[var(--ink)] my-5`}
    >
      {figures.map((f, idx) => {
        const colorMap: Record<string, string> = {
          neutral: 'var(--ink)',
          positive: 'var(--positive)',
          negative: 'var(--negative)',
          winner: 'var(--ink)',
        }
        const variant = f.variant ?? 'neutral'
        const isWinner = variant === 'winner'
        return (
          <div
            key={idx}
            className="p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 last:border-b-0"
          >
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5">
              {f.kicker}
            </div>
            <div
              className="text-[22px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
              style={{ fontFamily: PLAYFAIR, color: colorMap[variant] }}
            >
              {isWinner ? <HighlightMark>{f.amount}</HighlightMark> : f.amount}
            </div>
            {f.sub && (
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                {f.sub}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Pull-quote met linker quote-mark in module-500 + body in italic Playfair. */
export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote
      className="relative border-t border-b border-[var(--ink)] py-5 pl-7 sm:pl-9 mb-6"
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

/** Concept-highlight binnen pull-quote — bold module-700, niet italic. */
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

/** Negatief-highlight binnen pull-quote. */
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

/** Scenario-callout — info-block met linker module-border. */
export function ScenarioCallout({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <div
      className="bg-[var(--paper)] border border-[var(--ink)] p-3 sm:p-4 mb-5 text-sm leading-snug text-[var(--ink-2)]"
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

/** Rekening-tag uit de bovenrand voor breakdown-cards. */
export function RekeningTag({
  label = 'rekening',
  children,
}: {
  label?: string
  children: ReactNode
}) {
  return (
    <div className="relative pt-3 overflow-visible">
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

/** Toggle-pill aan/uit. */
export function TogglePill({
  on,
  label = on ? 'aan' : 'uit',
}: {
  on: boolean
  label?: string
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold uppercase tracking-[0.15em] border ${
        on
          ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
          : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)]'
      }`}
    >
      {label}
    </span>
  )
}

/** Ornament colophon. */
export function Colophon({ module = '✦', text }: { module?: string; text: string }) {
  return (
    <p className="text-center text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--ink-3)] py-4">
      Trifinity{' '}
      <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
        {module}
      </span>{' '}
      {text}{' '}
      <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
        ✦
      </span>{' '}
      preview
    </p>
  )
}
