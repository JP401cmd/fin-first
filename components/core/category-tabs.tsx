'use client'

import { useCallback, useEffect, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────

export interface CategoryTab {
  /** Stabiele tab-key (bv. "items" of "budgetteren"). Vormt de URL ?tab=… */
  key: string
  /** Zichtbaar tab-label, sentence case (bv. "Rekeningen", "Budgetteren"). */
  label: string
}

interface CategoryTabsProps {
  /**
   * Lijst van tabs in render-volgorde. Twee items is de canonieke vorm
   * (items + verdieping); meer is technisch toegestaan.
   */
  tabs: CategoryTab[]
  /** Actieve tab-key. Moet matchen met één van `tabs[].key`. */
  activeKey: string
  /** Aanroep bij tab-wissel — parent kan URL syncen of state updaten. */
  onChange: (key: string) => void
  /** Optionele extra classes voor de tab-list container. */
  className?: string
}

// ── Component ────────────────────────────────────────────────

/**
 * Generieke tab-strip in krant-kicker-stijl. Wordt hergebruikt door
 * `asset-category-page` en `debt-category-page`.
 *
 * Design (UX-skill):
 * - Tabs als UPPERCASE 11px met `tracking-[0.08em]`. Inactief = `var(--ink-3)`,
 *   actief = `var(--ink)` met 2px onderstreep. Hover op inactieve tabs lift
 *   naar `var(--ink-2)`.
 * - 32px touch target via `min-h-[32px]` op de button — boven de 32px-lat uit
 *   de skill-checklist en op de WCAG aanbevolen 44px-randverschuiving wanneer
 *   de tabs in een wide-spaced row staan (8px gap).
 * - Toetsenbord: Pijl links/rechts roteert door de tabs (volgens WAI-ARIA tab
 *   pattern). Tab-navigatie respecteert `tabIndex={-1}` voor inactieve tabs.
 * - `role="tablist"` + `aria-selected` + `aria-controls` zodat screenreaders
 *   de tab-state correct aankondigen.
 */
export function CategoryTabs({
  tabs,
  activeKey,
  onChange,
  className = '',
}: CategoryTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusTabAt = useCallback(
    (index: number) => {
      const node = tabRefs.current[index]
      if (node) node.focus()
    },
    [],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      // Alleen pijlen links/rechts en home/end activeren navigatie — andere
      // toetsen (Enter, Space) volgen het standaard button-gedrag.
      const last = tabs.length - 1
      let nextIndex: number | null = null

      if (event.key === 'ArrowRight') nextIndex = index === last ? 0 : index + 1
      else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? last : index - 1
      else if (event.key === 'Home') nextIndex = 0
      else if (event.key === 'End') nextIndex = last

      if (nextIndex == null) return
      event.preventDefault()
      const target = tabs[nextIndex]
      if (!target) return
      onChange(target.key)
      focusTabAt(nextIndex)
    },
    [focusTabAt, onChange, tabs],
  )

  // Houd de refs-array gesynchroniseerd met het aantal tabs zonder tijdens
  // render aan refs te raken — alle ref-mutaties in een useEffect.
  useEffect(() => {
    if (tabRefs.current.length !== tabs.length) {
      const next = new Array<HTMLButtonElement | null>(tabs.length).fill(null)
      // Behoud bestaande nodes voor bestaande tabs zodat focus niet verspringt.
      for (let i = 0; i < Math.min(tabs.length, tabRefs.current.length); i++) {
        next[i] = tabRefs.current[i]
      }
      tabRefs.current = next
    }
  }, [tabs.length])

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={[
        'flex items-end gap-2 border-b border-[var(--border-ed)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.key === activeKey
        return (
          <button
            key={tab.key}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            type="button"
            role="tab"
            id={`category-tab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`category-tabpanel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              'inline-flex min-h-[32px] items-center px-2 pt-2 pb-1.5',
              'text-[11px] font-medium uppercase tracking-[0.08em]',
              'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]',
              isActive
                ? 'border-b-2 border-[var(--ink)] text-[var(--ink)]'
                : 'border-b-2 border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
