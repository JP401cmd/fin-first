'use client'

/**
 * PageActionBar — Bitvavo-stijl primary/secondary action-bar voor reguliere
 * pagina's (niet binnen een SlideInPane).
 *
 * Doel: bied dezelfde primary/secondary footer-affordance als de pane-footer
 * (`SlideInPane.primaryAction` / `secondaryAction`), maar dan beschikbaar op
 * standalone-pagina's. Toepassing: edit/create-form-pagina's met een save-CTA
 * die altijd zichtbaar moet blijven, of overzicht-pagina's met één primaire
 * actie boven de fold.
 *
 * ── Render-strategie (twee breakpoints, één props-API) ───────────────────
 * - **Mobile (<lg)**: registreert via `MobileBottomBarLive` met
 *   `kind: 'action-bar'`. De bestaande tray-of-three (`MobileBottomBar`)
 *   pakt de config op en toont de action-bar i.p.v. de tab-rij. Geen
 *   eigen DOM-footer — alle styling/layout komt van de mobile shell.
 *
 * - **Desktop (≥lg)**: `position: fixed` strip onderaan de viewport, naast
 *   de sidebar (`lg:left-[264px]`) en boven eventuele chat-sidebar-overlay
 *   (`right: var(--chat-sidebar-width, 0px)`). Gebruikt dezelfde knop-
 *   styling als `SlideInPane`-footer zodat beide patronen visueel
 *   uitwisselbaar zijn.
 *
 * ── Z-index — bewust onder de pane ───────────────────────────────────────
 * Desktop-strip gebruikt `z-30` (lager dan SlideInPane's `z-40`, en lager
 * dan zwevende FAB's op `z-50`). Reden: als een pagina ZOWEL een
 * PageActionBar toont ALS een pane opent, moet de pane-footer voorrang
 * krijgen — anders zouden twee primary-knoppen tegelijk gerenderd worden
 * in dezelfde viewport-zone (UX-conflict). Door de page-bar onder de pane
 * te plaatsen blijft alleen de pane-actie zichtbaar zolang die open is.
 *
 * ── Sidebar-collapse ─────────────────────────────────────────────────────
 * `lg:left-[264px]` matcht het hardcoded padding-pattern in
 * `desktop-sidebar-shell.tsx`. Wanneer de sidebar gecollapsed is (64px),
 * ontstaat tijdelijk een 200px gap links — bewust geaccepteerd, gelijk
 * aan de bestaande `<main>`-padding-keuze. Bij toekomstige adoptie van
 * een `--sidebar-width` CSS-var kan dit class-paar overschakelen op
 * `lg:left-[var(--sidebar-width,264px)]`.
 *
 * ── Spacer onder content ─────────────────────────────────────────────────
 * Op desktop creeert de fixed strip GEEN auto-spacer. Pagina's die
 * laatste-content-afdekking willen voorkomen kunnen zelf
 * `pb-20 lg:pb-24` of vergelijkbaar toevoegen onder hun laatste sectie.
 * Op mobile is geen spacer nodig: de tray-of-three regelt z'n eigen
 * content-area-hoogte.
 */

import { MobileBottomBarLive } from '@/components/app/shell/mobile-bottom-bar-live'
import type { PaneAction } from '@/components/app/shell/slide-in-pane'

export type PageActionBarProps = {
  /** Primaire CTA — solid ink-bg, rechts in de bar. */
  primaryAction: PaneAction
  /** Optionele secondary CTA — outline, links van de primary. */
  secondaryAction?: PaneAction
  /**
   * Wanneer false: render alleen de mobile-bar (via MobileBottomBarLive).
   * Default true. Schakel uit voor pagina's die op desktop hun eigen
   * footer-strategie hebben (bv. een eigen scroll-container met een
   * sticky-footer in de page-flow).
   */
  desktop?: boolean
}

export function PageActionBar({
  primaryAction,
  secondaryAction,
  desktop = true,
}: PageActionBarProps) {
  return (
    <>
      {/*
        Mobile (<lg): registreer een action-bar config via Live-context. Het
        component is render-loos (return null) — de tray-of-three picks 'm op
        en rendert de bar i.p.v. de tab-rij. Op unmount valt de config terug
        op de stack-entry default (meestal `tabs`).

        We mappen de PaneAction (label + onClick + disabled + loading) naar
        BottomBarAction (label + onClick). `disabled` en `loading` worden
        op mobile niet doorgegeven omdat MobileBottomBar geen disabled-state
        kent — een loading-knop op mobile zou consumer-side opgevangen
        moeten worden door simpelweg geen onClick te triggeren.
      */}
      <MobileBottomBarLive
        primary={{
          label: primaryAction.loading
            ? `${primaryAction.label} …`
            : primaryAction.label,
          onClick:
            primaryAction.disabled || primaryAction.loading
              ? undefined
              : primaryAction.onClick,
        }}
        secondary={
          secondaryAction
            ? {
                label: secondaryAction.label,
                onClick: secondaryAction.disabled
                  ? undefined
                  : secondaryAction.onClick,
              }
            : undefined
        }
      />

      {/*
        Desktop (≥lg): fixed strip boven content. `hidden lg:flex` houdt 'm
        weg op mobile, waar MobileBottomBarLive het werk doet. Border-top en
        paper-background zijn identiek aan SlideInPane-footer en
        BottomSheet.footerSlot, zodat alle drie de varianten dezelfde
        visuele taal spreken.
      */}
      {desktop && (
        // Knoppen LINKS uitgelijnd (`justify-start`) — bewust afwijkend van
        // platform-conventie (rechts) om visuele overlap met de zwevende
        // chat-FAB rechtsonderin te voorkomen. Volgorde: primary EERST
        // (links), secondary erna. Dit matcht de desktop pane-footer in
        // `slide-in-pane.tsx` zodat beide patronen visueel uitwisselbaar
        // zijn op desktop.
        //
        // NB Mobile-rendering (via `MobileBottomBarLive` → `MobileBottomBar`):
        // de bestaande `MobileBottomBar` rendert action-bars als
        // [secondary, primary] (secondary links, primary rechts) — zie
        // `components/app/shell/mobile-bottom-bar.tsx` rond regel 199-211.
        // Die volgorde wordt door meer flows gebruikt dan alleen
        // PageActionBar, dus we passen 'm hier niet aan om regressies te
        // voorkomen. Resultaat: PageActionBar mobile = [secondary, primary],
        // desktop = [primary, secondary]. Een toekomstige refactor kan dit
        // gelijktrekken zodra de impact op andere consumers is geëvalueerd.
        <div
          className="hidden lg:flex fixed bottom-0 left-0 z-30 items-center justify-start gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-7 py-4 lg:left-[264px] lg:px-8 backdrop-blur-md"
          style={{
            // Reserveer ruimte voor de chat-sidebar overlay zodat de bar
            // niet onder een geopende chat-panel verdwijnt. Bij geen chat
            // valt deze terug op 0px en strekt de bar tot rechts.
            right: 'var(--chat-sidebar-width, 0px)',
          }}
        >
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || primaryAction.loading}
            className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            {primaryAction.loading
              ? `${primaryAction.label} …`
              : primaryAction.label}
          </button>
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="inline-flex min-h-11 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium leading-none text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </>
  )
}
