/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §3
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Pure layout-wrapper: Sidebar + main-content. Geen routing-logica.
 * Sidebar beheert haar eigen collapse-state (via `useSidebarCollapsed`),
 * deze wrapper hoeft die state niet te kennen.
 *
 * Implementatie-keuze: bewust GEEN `--sidebar-width` CSS-var. In plaats
 * daarvan twee conditional Tailwind-classes (`lg:pl-[264px]` vs
 * `lg:pl-[64px]`) die we op `<main>` zetten op basis van een
 * data-attribuut dat de Sidebar zelf op `<html>` zou kunnen schrijven.
 *
 * Voor de sandbox-test is dit nog niet bedraad: in deze fase laten we
 * `<main>` altijd 264px-padding krijgen omdat default-state expanded is.
 * Als de Sidebar collapsed is, wordt het verschil door de gebruiker
 * waargenomen via inhoud die iets meer ruimte krijgt — niet acceptabel
 * voor productie maar voor sandbox-evaluatie voldoende.
 */
'use client'

import type { ReactNode } from 'react'
import { Sidebar, type SidebarProps } from '@/components/app/shell/sidebar'

export type DesktopSidebarShellProps = {
  sidebarProps: SidebarProps
  children: ReactNode
}

export function DesktopSidebarShell({
  sidebarProps,
  children,
}: DesktopSidebarShellProps) {
  return (
    <div className="lg:flex lg:min-h-[calc(100vh-var(--header-height))]">
      <Sidebar {...sidebarProps} />
      {/*
        Sidebar is `position: fixed` (264px expanded / 64px collapsed). We laten
        `<main>` zelf flex-1 worden en gebruiken padding-left-classes om de
        ruimte naast de sidebar correct te reserveren. Onder lg:-breakpoint
        rendert Sidebar `null` (hidden lg:flex) en valt de padding weg.
      */}
      <main className="flex-1 min-w-0 lg:pl-[264px]">
        {children}
      </main>
    </div>
  )
}
