import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────
//
// WidgetEmpty is the canonical empty-state for dashboard widgets and
// lijstcomponenten op entiteitpagina's. The design bible (see
// `.claude/commands/ui-ux.md`, section "Empty states") prescribes three
// types, each with its own copy + CTA convention:
//
//   • first-use   — onboarding moment; caller MUST supply an action and
//                   explicit message/description. "Geen CTA = doodlopend".
//   • cleared     — user has finished everything; celebratory-but-muted.
//                   Default description: "Alles afgerond.".
//   • no-results  — filter or perspective is active but returns nothing;
//                   default description: "Geen resultaten. Pas je filters aan.".
//
// Rendering follows krant-esthetiek: optional icon, optional UPPERCASE
// kicker, optional serif italic description line, and an optional
// primary CTA that satisfies 44×44 touch target with scherpe hoeken.

export type WidgetEmptyVariant = 'first-use' | 'cleared' | 'no-results'

export interface WidgetEmptyAction {
  /**
   * Werkwoord-eerst Dutch label, e.g. "Maak je eerste budget aan".
   * Keep the CTA short — bible rule: "Werkwoord eerst in CTA's".
   */
  label: string
  /**
   * Destination for a navigation CTA; renders a next/link anchor.
   * Mutually exclusive with `onClick`; if both are provided, `href` wins.
   */
  href?: string
  /**
   * Handler for a non-navigation CTA; renders a <button>.
   */
  onClick?: () => void
}

export interface WidgetEmptyProps {
  /**
   * Illustrative icon. Per bible: "Illustratie alleen als die iets léért".
   * Accepts a Lucide component OR any ReactNode for custom SVG/inline icons.
   */
  icon?: LucideIcon | ReactNode
  /**
   * Primary empty-state copy line. Rendered in serif italic.
   * Existing callers that pass `message` continue to work — `message` is
   * treated as the description when `description` is not supplied.
   */
  message?: string
  /**
   * Explicit 1-sentence description in serif italic. Takes precedence
   * over `message`. Use this for callers that adopt the full variant-aware
   * pattern (title + description + CTA).
   */
  description?: string
  /**
   * Optional UPPERCASE kicker shown above the description — anchors the
   * empty state to the krant-esthetiek for entity-page lists.
   */
  title?: string
  /**
   * Which of the three bible-sanctioned empty variants this is.
   * Drives data-attribute (for tests + styling) and default copy.
   */
  variant?: WidgetEmptyVariant
  /**
   * Primary CTA. Verplicht voor lijstcomponenten op entiteitpagina's
   * (bible rule). Dashboard widgets mogen de CTA weglaten in 'cleared'.
   */
  action?: WidgetEmptyAction
}

// Per-variant default description — only applied when neither
// `description` nor `message` is provided by the caller.
const DEFAULT_DESCRIPTION_BY_VARIANT: Record<WidgetEmptyVariant, string | null> = {
  // first-use: intentionally null — onboarding copy must be caller-supplied
  // and specific to the entiteit. A generic default would dilute the
  // onboarding moment ("Eerste-gebruik empty state IS het onboarding-moment").
  'first-use': null,
  'cleared': 'Alles afgerond.',
  'no-results': 'Geen resultaten. Pas je filters aan.',
}

// Type-guard: distinguish a Lucide component (function OR forwardRef
// object) from a pre-rendered ReactNode. Lucide v0.563 exports its icons
// as `forwardRef` objects — `{ $$typeof, render }` — not plain functions.
// ReactNodes that are already-rendered elements have `$$typeof` but no
// `render` field; plain function components have `typeof === 'function'`.
function isLucideIcon(icon: LucideIcon | ReactNode | undefined): icon is LucideIcon {
  if (typeof icon === 'function') return true
  if (icon && typeof icon === 'object' && 'render' in icon && typeof (icon as { render?: unknown }).render === 'function') {
    return true
  }
  return false
}

/**
 * WidgetEmpty — canonical empty-state for widgets and entity-list pages.
 *
 * Backward compatible: `<WidgetEmpty icon={Bell} message="..." />` still
 * renders identically to the pre-refactor component.
 *
 * Variant-aware: supply `variant` + optional `title` + `description` +
 * `action` to match the design bible's three-type model.
 *
 * @example first-use
 * ```tsx
 * <WidgetEmpty
 *   variant="first-use"
 *   icon={LayoutGrid}
 *   title="Nog geen budgetten"
 *   description="Maak je eerste budget aan om je bestedingen te volgen."
 *   action={{ label: 'Maak je eerste budget aan', href: '/core/budgets/new' }}
 * />
 * ```
 *
 * @example no-results
 * ```tsx
 * <WidgetEmpty
 *   variant="no-results"
 *   icon={Users}
 *   description="Nog geen gedeelde transacties dit perspectief."
 * />
 * ```
 */
export function WidgetEmpty({
  icon,
  message,
  description,
  title,
  variant = 'first-use',
  action,
}: WidgetEmptyProps) {
  // Resolve the body copy: explicit `description` wins, then legacy
  // `message`, then the variant default (null for first-use).
  const resolvedDescription =
    description ?? message ?? DEFAULT_DESCRIPTION_BY_VARIANT[variant] ?? ''

  // Dev-only guard: per the bible rule "Geen CTA = doodlopend", a
  // first-use empty state without an action is a design smell. Warn in
  // development so the issue surfaces during code review, but never in
  // production (noise for end-users + shipped builds).
  if (
    process.env.NODE_ENV !== 'production' &&
    variant === 'first-use' &&
    !action
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[WidgetEmpty] first-use variant rendered without an `action` prop. ' +
        'The design bible mandates a CTA for first-use empty states ' +
        '("Geen CTA = doodlopend"). Supply `action={{ label, href|onClick }}` ' +
        'or switch to variant="cleared" / "no-results".'
    )
  }

  // Touch-target: min 44×44 per WCAG AAA. We meet the spec via the
  // combination of vertical (py-3 = 24px) + the line-height of the label
  // (text-sm ≈ 20px) = 44px total, widened by px-4. `rounded-none` is
  // explicit here — scherpe hoeken, geen radius op UI-elementen.
  const ctaClasses =
    'inline-flex min-h-[44px] items-center justify-center rounded-none ' +
    'border border-[var(--ink)] bg-[var(--ink)] px-4 py-3 ' +
    'text-sm font-medium text-[var(--paper)] ' +
    'transition-opacity duration-150 hover:opacity-80 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-[var(--ink)]'

  return (
    <div
      data-variant={variant}
      className="flex flex-col items-center justify-center gap-2 py-4"
    >
      {/* Icon — either a Lucide component (rendered with our default
          sizing/stroke) or a pre-rendered ReactNode the caller fully
          controls. Both paths are additive so this stays backward
          compatible with the old `icon: LucideIcon` signature. */}
      {icon && isLucideIcon(icon) ? (() => {
        const Icon = icon
        return <Icon className="h-5 w-5 text-[var(--ink-4)]" strokeWidth={1.5} />
      })() : icon}

      {/* Optional UPPERCASE kicker met 28×1px module-streep — blueprint
          signature-element. Voor cross-module pagina's valt de streep terug
          op --module-active-500 (= ink-2 default). */}
      {title && (
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono font-medium text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          {title}
        </div>
      )}

      {/* Serif italic body — identical typography to the pre-refactor
          component so legacy usages are pixel-stable. */}
      {resolvedDescription && (
        <p className="font-serif italic text-[13px] text-[var(--ink-3)] text-center leading-relaxed">
          {resolvedDescription}
        </p>
      )}

      {/* Primary CTA — href wins over onClick when both are supplied.
          Rendered as a next/link anchor for intra-app navigation
          (client-side transitions) or a <button> for in-place handlers. */}
      {action && (
        action.href ? (
          <Link href={action.href} className={ctaClasses}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={ctaClasses}>
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
