// ── Dashboard UI Preferences (client-only) ────────────────────
// Lichte, niet-kritieke UI-voorkeuren die per device gelden — bewust niet
// in `profiles` opgeslagen omdat ze geen invloed hebben op de berekeningen
// of op AI-output. Patroon volgt `briefing/user-preferences.ts`.

const CATEGORY_NAV_BAR_KEY = 'dashboard_category_nav_bar_visible'

/**
 * Lees of de categorie-app-balk zichtbaar is op het Fin-dashboard.
 * Default: `true` — nieuwe gebruikers zien de balk meteen, want hij maakt
 * de koppeling tussen widgets en categorie-pagina's expliciet. Wie de balk
 * uit zet, kan via Modify-mode altijd terug.
 */
export function readCategoryNavBarVisible(): boolean {
  try {
    const raw = localStorage.getItem(CATEGORY_NAV_BAR_KEY)
    if (raw === null) return true
    return raw === 'true'
  } catch {
    return true
  }
}

/** Sla de toggle-status van de categorie-app-balk op. */
export function saveCategoryNavBarVisible(visible: boolean): void {
  try {
    localStorage.setItem(CATEGORY_NAV_BAR_KEY, visible ? 'true' : 'false')
  } catch { /* quota / SSR */ }
}
