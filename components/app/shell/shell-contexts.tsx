/**
 * Shell-contexts — neutrale bron voor de shell-brede React-contexts + hooks.
 *
 * Eerder woonden deze contexts/hooks IN `responsive-shell.tsx`, wat een
 * runtime-importcyclus veroorzaakte: responsive-shell rendert de shell-kinderen
 * (top-bar, nav-menu-sheet, bottom-nav-tabs, mobile-app-strip), en elk van die
 * kinderen importeerde de `useXxx`-hooks terug uit responsive-shell → cyclus.
 *
 * Door de Context-objecten + hooks hier te extraheren importeren zowel de
 * composition root (responsive-shell, Provider-kant) als de consumenten (de
 * hooks-kant) uit één neutraal bestand dat NIET terugwijst naar de shell.
 * Context-identiteit blijft één singleton zolang Provider én hooks uit dit
 * zelfde bestand komen. Pure refactor — geen gedragswijziging (Arch F4).
 */
'use client'

import { createContext, useContext } from 'react'
import type { CategoryAppLink } from '@/lib/category-app-nav'
import type { LeverScores } from '@/components/app/shell/lever-compass'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * Goedkope sidebar-signalen voor de status-dots, voorberekend in
 * `app/(app)/layout.tsx` (server). Twee dot-talen:
 *  - binaire freshness-booleans ("iets nieuws / iets te doen")
 *  - status-mirror `belasting` (good/warn/bad/neutral) voor Box 1/2/3.
 */
export type SidebarSignals = {
  /** Tips & acties: open/uitgestelde acties óf aanbevelingen. */
  tipsActions: boolean
  /** Minstens één budget overschreden. */
  budgetOver: boolean
  /** Aandelen-koersen ouder dan de staleness-drempel. */
  aandelenStale: boolean
  /** Crypto-koersen ouder dan de staleness-drempel. */
  cryptoStale: boolean
  /** Hypotheek-rentevaste periode loopt binnen het venster af. */
  hypotheekRateReset: boolean
  /** Verhuurd onroerend goed zonder ingevulde huurinkomsten. */
  verhuurMissingIncome: boolean
  /** Status-mirror voor de Box 1/2/3-subpagina's onder Belasting. */
  belasting: { box1: LeverageStatus; box2: LeverageStatus; box3: LeverageStatus }
}

export type SidebarMetrics = {
  /** Netto vermogen (assets − debts, gewogen volgens inclusion-pct). */
  netWorth: number
  /** Aantal openstaande/uitgestelde acties (Wil-module). */
  actionCount: number
  /**
   * App-slugs die geactiveerd zijn door minstens één gekoppeld asset/debt —
   * voedt de Sidebar's apps-strip filter zodat apps alleen verschijnen
   * wanneer de gebruiker ze daadwerkelijk gebruikt.
   */
  activeAppKeys: string[]
  /**
   * Klikbare app-deeplinks per actieve categorie. Bron is dezelfde server-
   * builder die het Fin-dashboard voedt (`buildCategoryAppLinks`), zodat
   * iconen + labels exact matchen tussen dashboard en mobile shell.
   * Mobile-only consumer: `MobileAppStrip` boven de bottom-nav.
   */
  categoryAppLinks: CategoryAppLink[]
  /**
   * Vier-hefbomen-kompas: bezittingen, schulden, cashflow, belasting.
   * Berekend in layout.tsx uit reeds-geladen data. Optioneel voor
   * backwards-compatibiliteit.
   */
  leverScores?: LeverScores
  /**
   * Goedkope sidebar-signalen voor de status-dots (freshness + belasting-
   * status-mirror). Optioneel: bij weglaten tonen de dots hun grijze/neutrale
   * inactieve staat.
   */
  sidebarSignals?: SidebarSignals
}

// ── CategoryAppLinks context ────────────────────────────────────────────────
//
// Door de tree heen prop-drillen van `MobileStackShell → Tray → MobileBottomBar`
// zou Tray dwingen om iets van app-strip-data af te weten. Een lichte context
// houdt het slot-component-patroon zuiver — MobileBottomBar leest direct, Tray
// blijft puur over visuele transitie gaan. Sidebar zit elders in de tree
// (portal) en behoudt zijn bestaande prop-API.
export const CategoryAppLinksContext = createContext<CategoryAppLink[]>([])

export function useCategoryAppLinks(): CategoryAppLink[] {
  return useContext(CategoryAppLinksContext)
}

// ── LeverScores context ─────────────────────────────────────────────────────
//
// Vier-hefbomen-kompas data, voorberekend in layout.tsx. Via context beschikbaar
// voor zowel de Sidebar (portal, buiten tree) als de mobile TopBar.
export const DEFAULT_LEVER_SCORES: LeverScores = {
  assets: { score: null, status: 'neutral', detail: 'Geen data — Start' },
  debts: { score: null, status: 'neutral', detail: 'Geen data — Start' },
  cashflow: { score: null, status: 'neutral', detail: 'Geen data — Start' },
  tax: { score: null, status: 'neutral', detail: 'Geen data — Start' },
}

export const LeverScoresContext = createContext<LeverScores>(DEFAULT_LEVER_SCORES)

export function useLeverScores(): LeverScores {
  return useContext(LeverScoresContext)
}

// ── ActiveAppKeys context ────────────────────────────────────────────────────
//
// Welke deep-app-tools daadwerkelijk geactiveerd zijn door tracking-flags op
// assets/debts. Sidebar (desktop, portal-tree) consumeert dit al via prop;
// NavMenuSheet (mobile, render-tree) leest via context zodat hij dezelfde
// filtering kan toepassen voor de Overzicht-sub-items.
export const ActiveAppKeysContext = createContext<string[]>([])

export function useActiveAppKeys(): string[] {
  return useContext(ActiveAppKeysContext)
}
