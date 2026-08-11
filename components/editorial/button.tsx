'use client'

/**
 * Button — de twee gesanctioneerde CTA-varianten van TriFinity (ADR 0038).
 *
 * ── Waarom ───────────────────────────────────────────────────────────────
 * De UX-review (docs/ux-review-jul2026.md §8, besluit 5) vond >10 afwijkende
 * knop-recepten (rounded-lg/xl, zinc/stone, module-500, gradient, shadow).
 * Deze primitive is de ENIGE bron voor CTA's. Nieuwe knoppen lopen hierlangs.
 *
 * ── De varianten ─────────────────────────────────────────────────────────
 * - `primary`  (default): inkt-zwart — het canonieke recept, module-neutraal.
 *     `bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-2)]`.
 * - `secondary`: outline — zelfde maatvoering, `border-2 border-[var(--ink)]`.
 * - `destructive`: semantisch rood — UITSLUITEND voor de bevestigende knop van
 *     een onomkeerbare actie (verwijderen, loslaten, definitief wissen):
 *     `bg-negative text-white hover:bg-negative/90`. Dit is het recept dat de
 *     app al met de hand herhaalde (`asset-pane.tsx`, `doel-loslaten-confirm.tsx`)
 *     — nu één bron, zodat "Verwijder 43 transacties" er nooit meer uitziet als
 *     "Opslaan". Semantisch rood volgt bewust NIET de accentkleur van de module.
 *     Kleur is hier nooit het enige signaal: de knoptekst benoemt de uitkomst en
 *     de bevestiging draagt icoon + kop (GOV.UK-regel).
 * - `moment`   : module-kleur, UITSLUITEND voor grote momenten
 *     (onboarding-afronding, module-activatie, doel vastleggen):
 *     `bg-[var(--module-active-600)] text-white hover:bg-[var(--module-active-700)]`.
 *     Gebruikt `--module-active-*` zodat de kleur automatisch de route-module
 *     volgt (cross-module-routes vallen terug op ink-shades).
 *
 * ── Vorm & gedrag ────────────────────────────────────────────────────────
 * - Altijd scherpe hoeken (geen radius), Inter (UI-chrome), `text-sm`.
 * - `size`: `md` (min-h-11, default) of `sm` (min-h-9, krappe contexten).
 * - Press-feedback `active:scale-[0.98]` + `transition-[background-color,transform]`.
 * - `focus-visible` outline 2px voor toetsenbord-a11y.
 * - Rendert als echte `<button>` (default) of als `next/link` `<a>` zodra
 *   `href` is meegegeven. Alle standaard button-/anchor-props worden
 *   doorgegeven (incl. `disabled`, `type`, `aria-*`, `onClick`).
 */

import Link from 'next/link'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'moment'
export type ButtonSize = 'sm' | 'md'

type CommonProps = {
  /** `primary` (ink, default) · `secondary` (outline) · `destructive` (rood, onomkeerbaar) · `moment` (module-kleur, grote momenten). */
  variant?: ButtonVariant
  /** `md` = min-h-11 (default) · `sm` = min-h-9 (krappe contexten). */
  size?: ButtonSize
  children: ReactNode
  className?: string
}

type ButtonElementProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    href?: undefined
  }

type LinkElementProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
    /** Zodra gezet rendert de knop als `next/link` `<a>` (zelfde look). */
    href: string
  }

export type ButtonProps = ButtonElementProps | LinkElementProps

// Inter voor UI-chrome, identiek aan de bestaande footer-/pane-knoppen.
const INTER_FONT: CSSProperties = {
  fontFamily: 'var(--font-inter, system-ui, sans-serif)',
}

const BASE =
  'inline-flex items-center justify-center leading-none text-sm font-medium select-none ' +
  'transition-[background-color,transform] duration-150 active:scale-[0.98] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-4',
  md: 'min-h-11 px-5',
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-2)]',
  secondary:
    'border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]',
  destructive: 'border border-negative bg-negative text-white hover:bg-negative/90',
  moment:
    'bg-[var(--module-active-600)] text-white hover:bg-[var(--module-active-700)]',
}

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'md',
    className = '',
    children,
    style,
    ...rest
  } = props as CommonProps & { style?: CSSProperties } & Record<string, unknown>

  const cls = `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`.trim()
  const mergedStyle: CSSProperties = {
    ...INTER_FONT,
    ...(style as CSSProperties | undefined),
  }

  // Link-variant: `href` gezet → next/link. Anchors kennen geen `disabled`,
  // dus we vertalen dat naar aria-disabled + pointer-events-none + tabIndex.
  if (typeof props.href === 'string') {
    const {
      href: _href,
      disabled,
      ...anchorRest
    } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      href?: string
      disabled?: boolean
    }
    void _href
    return (
      <Link
        href={props.href}
        className={`${cls}${disabled ? ' pointer-events-none' : ''}`}
        style={mergedStyle}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        {...anchorRest}
      >
        {children}
      </Link>
    )
  }

  const {
    type,
    href: _href,
    ...buttonRest
  } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }
  void _href
  return (
    <button type={type ?? 'button'} className={cls} style={mergedStyle} {...buttonRest}>
      {children}
    </button>
  )
}
