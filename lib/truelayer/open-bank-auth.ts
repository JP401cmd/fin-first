/**
 * NAAR DE BANK, clientkant — hoe we de app verlaten voor de autorisatie (B-051).
 *
 * ## Het probleem
 *
 * In de browser is "naar de bank" gewoon `window.location.href = authUrl`: de
 * bank stuurt na afloop via TrueLayer terug naar `/api/bank-connect/callback`,
 * en die landt in hetzelfde tabblad op de succespagina.
 *
 * In de geïnstalleerde app (PWA/WebAPK) werkt die terugweg niet. De bankpagina
 * opent de bank-app, en die geeft de terugkeer-URL als intent aan de standaard-
 * browser — niet aan onze app. De callback draait dan wel (de koppeling slaagt),
 * maar de gebruiker belandt in Chrome, terwijl het app-venster nog op de
 * TrueLayer-pagina staat. Die overdracht is vanuit een webapp niet af te dwingen.
 *
 * ## De oplossing
 *
 * In de geïnstalleerde app openen we de bank in een **apart venster** en blijft
 * onze eigen pagina staan, op een wachtscherm (`BankAuthWaiting`) dat déze
 * koppelpoging volgt via `GET /api/bank-connect/connection-status`. Waar de terugkeer ook
 * landt, de app weet het. In de gewone browser verandert er niets.
 *
 * `window.open` na een `await fetch` mag nog: de gebruikersactivatie van de klik
 * blijft enkele seconden geldig (User Activation v2). Wordt het venster tóch
 * geblokkeerd (`null`), dan vallen we terug op de oude navigatie — liever de oude
 * terugweg dan een knop die niets doet.
 */

/** Draait deze pagina als geïnstalleerde app in plaats van in een browsertabblad? */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari kent `display-mode` pas sinds kort; `navigator.standalone` is daar
  // het oude, nog steeds gezette signaal.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  const standalone =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches)
  return iosStandalone || standalone
}

/**
 * - `'window'`: de bank staat in een apart venster; de aanroeper toont het wachtscherm.
 * - `'same-tab'`: we verlaten deze pagina; er valt niets meer te tonen.
 */
export type BankAuthLaunch = 'window' | 'same-tab'

/**
 * @param connectionId De koppelpoging die het wachtscherm volgt. Zonder id kan de
 *   app niet zien wanneer de bank klaar is — dan blijft de oude navigatie.
 */
export function openBankAuth(authUrl: string, connectionId: string | null): BankAuthLaunch {
  if (connectionId && isInstalledApp()) {
    // Geen `noopener` in de features: dan levert `window.open` altijd `null` en
    // kunnen we een geblokkeerd venster niet van een geopend onderscheiden. De
    // opener-verwijzing knippen we daarom direct zelf door.
    const opened = window.open(authUrl, '_blank')
    if (opened) {
      try {
        opened.opener = null
      } catch {
        // Sommige browsers laten dit niet toe; de bankpagina is hoe dan ook
        // cross-origin en kan onze pagina niet lezen.
      }
      return 'window'
    }
  }
  window.location.href = authUrl
  return 'same-tab'
}
