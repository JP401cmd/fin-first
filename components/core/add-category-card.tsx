'use client'

import { Plus } from 'lucide-react'

// ── Props ────────────────────────────────────────────────────

export interface AddCategoryCardProps {
  /** Klikbare label in italic Source Serif — bv. "Bezitting toevoegen". */
  label: string
  /** Click-handler — opent de QuickAddWizard met de juiste initialIntent. */
  onClick: () => void
  /** Asset = module-active-tint (kern-bruin), debt = negative (rood). */
  variant?: 'asset' | 'debt'
  /**
   * `category` matcht de aspect/shell van `<CategoryCard>` (Kern-landing grid).
   * `item` matcht `<VermogenAssetCard>` / `<VermogenDebtCard>` (single-row).
   */
  shape?: 'category' | 'item'
  /** Stagger-index voor sequentiële fade-in — laatste cel in het grid. */
  staggerIndex?: number
  /** Toegankelijke beschrijving wanneer de label te kort is voor screenreaders. */
  ariaLabel?: string
}

// ── Component ────────────────────────────────────────────────

/**
 * Placeholder-kaart als "fake categorie" met een centraal +. Vervangt de
 * losse [+]-knop in `<SectionHeader>` (Kern-landing) en de standaard
 * "+ Voeg X toe"-button onderaan de items-tab op categorie-pagina's.
 *
 * Design (UX-skill):
 * - Dashed border (`border-[var(--border-md)]`) als affordance dat dit
 *   geen echte entiteit is. Hover → module-active border + lichte tint.
 * - Geen `card-editorial` shell — die suggereert opgeslagen data.
 * - Plus-icon (24px) + label in italic Source Serif (mini-artikel-blueprint
 *   meta-stijl).
 * - Touch target ≥ 44×44 dankzij `aspect-square` (category) of `min-h-[64px]`
 *   (item).
 */
export function AddCategoryCard({
  label,
  onClick,
  variant = 'asset',
  shape = 'category',
  staggerIndex = 0,
  ariaLabel,
}: AddCategoryCardProps) {
  const accentColor =
    variant === 'asset' ? 'var(--module-active-500)' : 'var(--negative)'
  const hoverTextColor =
    variant === 'asset' ? 'var(--module-active-700)' : 'var(--negative)'

  if (shape === 'item') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        className="add-category-card add-category-card--item group flex w-full items-center gap-3 border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-3 text-left transition-colors hover:bg-[color-mix(in_oklch,var(--module-active-500)_6%,var(--paper))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:p-4 animate-fade-up"
        style={
          {
            '--stagger': `${staggerIndex * 60}ms`,
            '--add-accent': accentColor,
            '--add-hover-ink': hoverTextColor,
          } as React.CSSProperties
        }
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--subtle)] text-[var(--ink-3)] transition-colors group-hover:text-[var(--add-hover-ink)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span
          className="font-serif italic text-sm text-[var(--ink-2)] transition-colors group-hover:text-[var(--add-hover-ink)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {label}
        </span>
      </button>
    )
  }

  // Default: shape === 'category' — matcht <CategoryCard> grid-cel.
  return (
    <div
      className="flex flex-col animate-fade-up"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        className="group flex flex-1 aspect-square w-full flex-col items-center justify-center gap-2 border border-dashed border-[var(--border-md)] bg-[var(--paper)] text-left transition-colors hover:border-[var(--add-accent)] hover:bg-[color-mix(in_oklch,var(--module-active-500)_6%,var(--paper))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:aspect-[5/4]"
        style={
          {
            '--add-accent': accentColor,
            '--add-hover-ink': hoverTextColor,
          } as React.CSSProperties
        }
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center text-[var(--ink-3)] transition-colors group-hover:text-[var(--add-hover-ink)]"
        >
          <Plus className="h-6 w-6" strokeWidth={2} />
        </span>
        <span
          className="px-3 text-center font-serif italic text-[12px] leading-snug text-[var(--ink-2)] transition-colors group-hover:text-[var(--add-hover-ink)] sm:text-[13px]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {label}
        </span>
      </button>

      {/* Alignment-placeholder: matcht de `<CategoryCardAppStrip>`-footer
          zodat de add-card op dezelfde y-as afsluit als de echte categorie-
          kaarten in het grid. Identiek markup als de placeholder in
          `<CategoryCard>`. */}
      <div
        aria-hidden="true"
        className="border-t border-[var(--border-ed)] border-dashed px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] leading-[1.4]"
      >
        &nbsp;
      </div>
    </div>
  )
}
