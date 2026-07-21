// ── Navigatie: tab-afleiding uit pad ───────────────────────────
// Pure pad-helpers + het TabId-contract voor de mobiele nav-stack. Verhuisd uit
// components/app/shell/nav-stack-provider.tsx zodat lib (uat) ze kan importeren
// zonder terug naar components te reiken (import-richting UI→lib). Zuiver
// string-matching, geen React.

export type TabId = 'kern' | 'wil' | 'horizon' | 'identity' | 'other'

/**
 * Stack-diepte limiet per tab (zie plan §4.2 + §8.7). Bij push #6 wordt de
 * oudste entry weggegooid (FIFO).
 */
export const STACK_DEPTH_LIMIT = 5

/**
 * Leid de active tab af uit de pathname.
 *
 * Canonieke IA (single source of truth: `lib/nav-config.ts`):
 *  - /overzicht/** → kern
 *  - /toekomst/**  → horizon
 *  - /mijn/**      → identity
 *
 * Legacy backing-routes blijven werken en mappen op dezelfde tabs:
 *  - /core/**     → kern
 *  - /will/**     → wil
 *  - /horizon/**  → horizon
 *  - /identity/** → identity
 *
 * Alles anders → other. Belangrijk: de canonieke routes MOETEN hier herkend
 * worden — anders vallen ze in `other`, worden ze nooit als tab-root gezien
 * (zie `isTabRoot`) en krijgen de hoofd-pagina's `topBar.kind = 'simple'`
 * i.p.v. `'rich'` → de mobiele utility-cluster (kompas + account) verdwijnt.
 */
export function deriveTabFromPath(pathname: string): TabId {
  if (pathname === '/overzicht' || pathname.startsWith('/overzicht/')) return 'kern'
  if (pathname === '/toekomst' || pathname.startsWith('/toekomst/')) return 'horizon'
  if (pathname === '/mijn' || pathname.startsWith('/mijn/')) return 'identity'
  if (pathname === '/core' || pathname.startsWith('/core/')) return 'kern'
  if (pathname === '/will' || pathname.startsWith('/will/')) return 'wil'
  if (pathname === '/horizon' || pathname.startsWith('/horizon/')) return 'horizon'
  if (pathname === '/identity' || pathname.startsWith('/identity/')) return 'identity'
  return 'other'
}

/**
 * Bepaal of een pathname de root van een tab is. Gebruikt om automatisch te
 * resetten naar single-entry bij root-bezoek (auto-pop tot de root) én om de
 * TopBar-kind te bepalen: roots → `'rich'` (utility-cluster), sub-pages →
 * `'simple'`. Zowel de canonieke als de legacy root telt mee.
 */
export function isTabRoot(pathname: string, tab: TabId): boolean {
  switch (tab) {
    case 'kern': return pathname === '/overzicht' || pathname === '/core'
    case 'wil': return pathname === '/will'
    case 'horizon': return pathname === '/toekomst' || pathname === '/horizon'
    case 'identity': return pathname === '/mijn' || pathname === '/identity'
    case 'other': return false
  }
}
