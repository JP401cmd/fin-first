/**
 * immersive-routes — routes waar de ZWEVENDE shell-knoppen wijken.
 *
 * Op de meeste pagina's zweven onderin twee bedieningen: de nav-pill
 * (`FloatingNavButton`, z-[60]) en de Fin-bubbel (`FinHome`). Een stap-voor-stap
 * taakflow zet zijn eigen primaire actie ("Volgende" / "Afronden") juist in een
 * sticky voettekst onderaan — en dan vechten drie dingen om dezelfde hoek van
 * het scherm: de zwevende knoppen dekken de actieknop af of staan er pal naast.
 *
 * Dit is dezelfde afweging als bij een open overlay (zie CLAUDE.md
 * §Modal-conventie: de pill verdwijnt zodra een modal de onderrand claimt),
 * maar dan voor een PAGINA in plaats van een overlay. Daarom niet via
 * `acquireOverlay()`: die teller hoort bij open overlays, en een pagina die
 * zich als overlay voordoet zou dat signaal vertroebelen (en, bij de
 * scroll-lock-variant die de Fin-bubbel leest, de pagina onscrollbaar maken).
 *
 * Voorwaarde om een route hier toe te voegen: de pagina biedt zelf een
 * navigatie-uitgang (de TopBar-terugknop op mobiel) én een eigen sticky
 * primaire actie. Anders haal je de enige navigatie-affordance weg.
 */

/** Exacte routes (geen prefix-match) waar de zwevende knoppen verborgen zijn. */
export const IMMERSIVE_ROUTES: readonly string[] = [
  // De maandelijkse check-in is een wizard met een eigen sticky
  // Vorige/Volgende/Afronden-balk onderaan.
  '/core/checkin',
]

/**
 * `true` wanneer het pad een immersieve taakflow is. Exacte match: subroutes
 * (bv. `/core/checkin/historie`) zijn gewone pagina's en houden de zwevende
 * knoppen. Een afsluitende slash telt als dezelfde route.
 */
export function isImmersiveRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return IMMERSIVE_ROUTES.includes(normalized)
}
