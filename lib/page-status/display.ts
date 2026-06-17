// lib/page-status/display.ts
//
// Pure weergave-logica voor de status-duiding-banner: bepaalt of de banner
// EXPANDED (volledig bovenaan) of MINIMIZED (ingeklapt tot een gekleurde dot
// naast de pagina-'i') getoond moet worden.
//
// De gebruiker kan een banner minimaliseren; dat wordt server-side onthouden op
// het LeverageStatus-NIVEAU waarop hij minimaliseerde (warn of bad). De banner
// klapt automatisch weer open bij ESCALATIE — als de huidige status erger is dan
// het opgeslagen niveau (warn → bad) — zodat een verergerende situatie nooit
// verborgen blijft achter een eerder ingeklapte dot.
//
// Pure module (géén 'use client') + geëxporteerd zodat de unit-test de matrix
// rechtstreeks kan afdekken.

import type { LeverageStatus } from '@/lib/leverage-status'

export type BannerDisplay = 'expanded' | 'minimized'

/** Het niveau waarop de gebruiker een banner kan minimaliseren (warn of bad). */
export type MinimizedLevel = 'warn' | 'bad'

/**
 * Ernst-rangschikking: good/neutral = 0 (geen banner), warn = 1, bad = 2.
 * Alleen warn/bad leveren een banner; good/neutral worden nooit getoond, maar
 * krijgen severity 0 voor een totale ordening.
 */
function severity(status: LeverageStatus): number {
  return status === 'bad' ? 2 : status === 'warn' ? 1 : 0
}

/**
 * Bepaalt de weergave van de banner voor één route.
 *
 * @param status De huidige LeverageStatus van de pagina (de nav-dot-status).
 * @param minimizedLevel Het opgeslagen niveau waarop de gebruiker eerder
 *   minimaliseerde, of `null` als hij nooit minimaliseerde.
 * @returns `'minimized'` ALLEEN wanneer er een opgeslagen niveau is én de
 *   huidige status NIET geëscaleerd is t.o.v. dat niveau
 *   (severity(status) <= severity(minimizedLevel)); anders `'expanded'`.
 */
export function resolveBannerDisplay(
  status: LeverageStatus,
  minimizedLevel: MinimizedLevel | null,
): BannerDisplay {
  if (minimizedLevel == null) return 'expanded'
  // Geëscaleerd (huidige status erger dan toen geminimaliseerd) → weer tonen.
  return severity(status) <= severity(minimizedLevel) ? 'minimized' : 'expanded'
}
