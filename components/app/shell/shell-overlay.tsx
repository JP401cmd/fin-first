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
import { SlideInPane } from './slide-in-pane'

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
  /** Alleen voor kind="pane". Toont ←-knop in pane-header. */
  onBack?: () => void
  /** Pane-header actions (rechts naast titel). Alleen voor kind="pane". */
  actions?: ReactNode
  children: ReactNode
}

export function ShellOverlay({
  open,
  onClose,
  kind,
  title,
  size = 'md',
  destructive = false,
  onBack,
  actions,
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
    return (
      <>
        <SlideInPane
          open={open && isLgUp}
          onClose={onClose}
          onBack={onBack}
          title={title}
          actions={actions}
        >
          {children}
        </SlideInPane>
        <BottomSheet open={open && !isLgUp} onClose={onClose} title={title} size="full">
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
