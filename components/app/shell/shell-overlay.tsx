'use client'

/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5 (overlay-strategie / driewegregel)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Driewegregel-wrapper. Eén component, drie kinds:
 *  - `pane`    : SlideInPane op desktop (lg:); BottomSheet `size="full"`
 *                als fallback op mobile. TODO Fase 0.5: vervang mobile-fallback
 *                door echte stack-push via NavStackProvider.
 *  - `sheet`   : bestaande BottomSheet, al responsive (mobile peek/full + desktop
 *                `md:max-w-*`). Geen extra logica nodig.
 *  - `confirm` : smal centered modal voor onomkeerbare bevestiging.
 *                Bouwt op BottomSheet `size="sm"` voor focus-trap, scroll-lock
 *                en reduced-motion uniformiteit. Op desktop verschijnt dit
 *                door BottomSheet's `md:items-center md:max-w-*` reeds centered.
 *                Destructive variant kleurt de primary CTA rood.
 *
 * Verbod (zie CLAUDE.md update Fase 4): direct gebruik van BottomSheet buiten
 * deze wrapper, behalve in sandbox/prototype.
 */

import type { ReactNode } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { SlideInPane, type PaneAction } from './slide-in-pane'

type ShellOverlayKind = 'pane' | 'sheet' | 'confirm'
type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

type ShellOverlayProps = {
  open: boolean
  onClose: () => void
  kind: ShellOverlayKind
  title?: string
  /** Alleen voor kind="sheet". Default `md`. */
  size?: SheetSize
  /** Alleen voor kind="confirm". Kleurt primaire CTA rood. */
  destructive?: boolean
  /** Alleen voor kind="pane". ←-knop wijst standaard naar `onClose`; geef
   *  `onBack` mee als je een eigen back-handler nodig hebt (bv. naar een
   *  voorafgaande sub-mode binnen de pane). */
  onBack?: () => void
  /** Pane-header actions (rechts naast titel). Alleen voor kind="pane". */
  actions?: ReactNode
  /** Standaard pane-footer — primary action (links, solid). Alleen voor
   *  kind="pane". Wanneer minimaal één van primary/secondary is doorgegeven
   *  verschijnt een sticky footer in zowel desktop SlideInPane als mobile
   *  BottomSheet-fallback. Knoppen worden links uitgelijnd om visuele
   *  overlap met de zwevende chat-FAB rechtsonderin te voorkomen. */
  primaryAction?: PaneAction
  /** Standaard pane-footer — secondary action (rechts naast primary,
   *  outline). Alleen voor kind="pane". Zie `primaryAction` voor
   *  render-strategie. */
  secondaryAction?: PaneAction
  children: ReactNode
}

// Re-export voor consumers die direct het type nodig hebben (bv. wrappers
// die `primaryAction` als prop accepteren en doorgeven).
export type { PaneAction }

export function ShellOverlay({
  open,
  onClose,
  kind,
  title,
  size = 'md',
  destructive = false,
  onBack,
  actions,
  primaryAction,
  secondaryAction,
  children,
}: ShellOverlayProps) {
  // SSR-safe matchMedia hook — bepaalt voor `kind="pane"` of we de SlideInPane
  // (≥lg) of de BottomSheet-fallback (<lg) renderen. Class-based `lg:hidden`
  // werkt niet voor de BottomSheet-portal die naar document.body escaped.
  const isLgUp = useIsLgUp()

  if (kind === 'pane') {
    // Desktop (lg:): echte SlideInPane van rechts. Mobile: tijdelijke
    // full-height BottomSheet-fallback tot Fase 0.5 (NavStackProvider-stack-push).
    //
    // We gebruiken `useIsLgUp` (matchMedia) ipv een `lg:hidden`-wrapper, omdat
    // BottomSheet via createPortal naar document.body rendert — een
    // class-based wrapper bereikt de portal-content niet. Resultaat zonder
    // hook: pane EN sheet beide open op desktop ("dubbele overlay"-bug).
    //
    // TODO Fase 0.5: vervang BottomSheet-fallback door stack-push via
    // NavStackProvider, zodat het mobile-overlay-gevoel verdwijnt.
    //
    // De mobile-footer-slot dupliceert de desktop-footer-knoppen visueel
    // identiek, maar layoutet ze als full-width-naast-elkaar (`flex-1`).
    // Volgorde: **primary EERST (links), secondary erna** — gelijk aan de
    // desktop pane-footer (zie `slide-in-pane.tsx`). Reden: gebruikers-
    // mental-model identiek over breakpoints heen. Op mobile is er geen
    // zwevende chat-FAB náást de buttons, dus de links-uitlijning is hier
    // niet om overlap-redenen — alleen voor consistentie.
    // Touch-target ≥44px via `min-h-11`.
    const hasFooter = Boolean(primaryAction || secondaryAction)
    const mobileFooterSlot = hasFooter ? (
      <div className="flex items-center gap-2">
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || primaryAction.loading}
            className="inline-flex flex-1 min-h-11 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            {primaryAction.loading ? `${primaryAction.label} …` : primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            className="inline-flex flex-1 min-h-11 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium leading-none text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    ) : undefined
    return (
      <>
        <SlideInPane
          open={open && isLgUp}
          onClose={onClose}
          onBack={onBack}
          title={title}
          actions={actions}
          primaryAction={primaryAction}
          secondaryAction={secondaryAction}
        >
          {children}
        </SlideInPane>
        <BottomSheet
          open={open && !isLgUp}
          onClose={onClose}
          title={title}
          size="full"
          footerSlot={mobileFooterSlot}
          actions={actions}
        >
          {children}
        </BottomSheet>
      </>
    )
  }

  if (kind === 'sheet') {
    // BottomSheet is al responsive (mobile detents + desktop `md:max-w-*`).
    // Een refactor zou dit vereenvoudigen tot een directe pass-through.
    return (
      <BottomSheet open={open} onClose={onClose} title={title} size={size}>
        {children}
      </BottomSheet>
    )
  }

  // kind === 'confirm'
  // Smal centered modal. We hergebruiken BottomSheet `size="sm"` (max-w-sm =
  // 448px op desktop) zodat focus-trap, scroll-lock, reduced-motion en
  // safe-area-padding consistent zijn met de rest van het overlay-systeem.
  // BottomSheet centreert al op `md:items-center` — geen extra desktop-logica.
  //
  // De `destructive` variant wordt door de consumer gebruikt om de primaire
  // CTA in `children` rood te stylen. We exposeren het hier zodat de wrapper
  // weet of dit een bevestigings-context is (en in de toekomst extra a11y
  // attributen kan zetten zoals `aria-describedby` op een waarschuwingsblok).
  // Voor nu: we forwarden `data-destructive` voor styling-hooks in children.
  return (
    <BottomSheet open={open} onClose={onClose} title={title} size="sm">
      <div data-destructive={destructive ? 'true' : undefined}>{children}</div>
    </BottomSheet>
  )
}
