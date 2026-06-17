// lib/page-status/types.ts
//
// Type-contract voor de status-duiding-melding bovenaan niet-groene pagina's
// onder /overzicht. De UI-banner bouwt tegen dit contract; de namen/signaturen
// zijn bewust stabiel (parallelle bouw).
//
// Filosofie: de statussen bestaan al (nav-dots, hefbomen, cashflow-kaarten). We
// CONSUMEREN ze (geen nieuwe drempels) en geven ze gecureerde betekenis —
// "wat is er aan de hand" (reason) + "wat kun je eraan doen" (remedy).

import type { LeverageStatus } from '@/lib/leverage-status'

/** Optionele actie-deeplink: brengt de gebruiker naar waar hij het oplost. */
export interface PageStatusAction {
  label: string
  href: string
}

/** "Bespreek met Will"-aanknoping: onderwerp + optionele context-detail. */
export interface PageStatusWill {
  onderwerp: string
  detail?: string
}

/** De gecureerde status-duiding voor één pagina onder /overzicht. */
export interface PageStatusInfo {
  /** Canonieke route-sleutel, bv. '/overzicht/schulden'. */
  route: string
  /** Status — identiek aan de nav-dot van deze pagina (geen herberekening). */
  status: LeverageStatus
  /** Kort gebieds-label, bv. 'Schulden'. */
  title: string
  /** "Wat is er aan de hand" — gecureerd, mag een live cijfer bevatten. */
  reason: string
  /** "Wat kun je eraan doen" — concreet, geen Wft-advies. */
  remedy: string
  /** Optionele actie-deeplink. */
  action?: PageStatusAction
  /** "Bespreek met Will"-onderwerp + context. */
  will: PageStatusWill
}

/** Route → status-duiding. Bevat ALLEEN warn/bad-routes (good/neutral → geen melding). */
export type PageStatusMap = Record<string, PageStatusInfo>
