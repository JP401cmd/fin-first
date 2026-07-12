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
import { ModalFooter } from '@/components/app/modal-footer'
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
  /** Header actions (rechts naast titel). Beschikbaar voor kind="pane" en
   *  kind="sheet". Wordt doorgegeven aan BottomSheet (resp. SlideInPane) zodat
   *  consumers compacte controls — bv. navigatie-pijlen of share-icons — in
   *  de sticky title-bar kunnen plaatsen. */
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
  /** Optionele context-info naast de footer-knoppen (alleen kind="pane").
   *  Render-strategie volgt de pane-footer: desktop SlideInPane plaatst de
   *  info naast de knoppen, mobile BottomSheet-fallback toont het direct
   *  boven de knoppen-rij zodat de info altijd zichtbaar blijft naast de
   *  primaire actie. Gebruikt voor live-preview-bedragen e.d. */
  footerInfo?: ReactNode
  /** Sticky footer met primaire acties — voor kind="sheet" en kind="confirm".
   *  Wordt doorgegeven aan BottomSheet's `footerSlot` en rendert als
   *  niet-scrollend blok onderin de sheet (bovenrand + safe-area-padding),
   *  óók op klein scherm. Dit is de nieuwe standaard: sheets zetten hun
   *  Opslaan/Annuleren e.d. hier neer i.p.v. onderaan de scroll-content.
   *  Voor kind="pane" gebruik je in plaats hiervan `primaryAction`/
   *  `secondaryAction` (die genereren zelf de footer op desktop én mobiel). */
  footer?: ReactNode
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
  footerInfo,
  footer,
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
    // Op mobile (BottomSheet-fallback) plaatsen we `footerInfo` als eigen rij
    // BOVEN de knoppen — de knoppen zijn `flex-1` full-width en zouden de
    // info anders wegduwen. Visueel resultaat: amount/label op één regel,
    // knoppen-rij eronder, beide binnen dezelfde sticky-footer-container.
    const mobileFooterSlot = (hasFooter || footerInfo) ? (
      <div className="flex flex-col gap-2">
        {footerInfo && (
          <div className="text-[var(--ink-2)]">{footerInfo}</div>
        )}
        {/* Stacked full-width footer-knoppen via de gedeelde ModalFooter.
            `layout="stacked"` reproduceert exact de eerdere `flex items-center
            gap-2`-rij met twee `flex-1`-knoppen (mobiel BottomSheet-footerSlot).
            Volgorde primary EERST (links), secondary erna — ongewijzigd.
            NB: ModalFooter rendert altijd een primary; deze tak draait alleen
            wanneer `hasFooter` (dus `primaryAction || secondaryAction`). Bij een
            secondary-only footer toont ModalFooter de secondary-tekst als
            primary-knop — in de praktijk levert elke pane-flow een primaryAction
            mee, dus dit randgeval treedt hier niet op. */}
        {hasFooter && primaryAction && (
          <ModalFooter
            layout="stacked"
            primary={{
              label: primaryAction.label,
              onClick: primaryAction.onClick,
              disabled: primaryAction.disabled,
              loading: primaryAction.loading,
            }}
            secondary={
              secondaryAction
                ? {
                    label: secondaryAction.label,
                    onClick: secondaryAction.onClick,
                    disabled: secondaryAction.disabled,
                  }
                : undefined
            }
          />
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
          footerInfo={footerInfo}
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
    // `actions` worden in de sticky title-bar gerendered — handig voor
    // bv. pijl-navigatie of share-icons binnen een sheet.
    return (
      <BottomSheet open={open} onClose={onClose} title={title} size={size} actions={actions} footerSlot={footer}>
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
    <BottomSheet open={open} onClose={onClose} title={title} size="sm" footerSlot={footer}>
      <div data-destructive={destructive ? 'true' : undefined}>{children}</div>
    </BottomSheet>
  )
}
