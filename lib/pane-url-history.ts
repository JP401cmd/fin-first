/**
 * pane-url-history — terugknop-gedrag voor URL-GEDREVEN panes (B-012).
 *
 * De centrale overlay-history (lib/overlay-history.ts) dekt state-gedreven
 * overlays: openen pusht een entry op dezelfde URL, terug sluit de overlay.
 * Voor panes waarvan de open-state uit de URL-query komt (bv. het
 * budget-detail via `?budget=<id>`) botst dat model: sluiten herschrijft de
 * URL met `router.replace`, en een tweede claim op dezelfde entry liet de
 * pane na "terug" heropenen (zie de aantekening in shell-overlay.tsx). Die
 * panes stonden daarom búiten de history-integratie — met als gevolg dat de
 * Android-/browser-terugknop met een open pane de hele route verliet.
 *
 * Dit moduul geeft zo'n pane alsnog correct terugknop-gedrag door de
 * browser-history zélf de bron te laten zijn:
 *  - open vanaf gesloten → `router.push` (één entry per pane-sessie; de
 *    terugknop landt op de schone onderliggende entry en sluit zo de pane);
 *  - wisselen binnen een open pane → `router.replace` (géén entry-stapeling:
 *    één terugdruk = pane dicht, conform "één back-klik = één pane-stap");
 *  - programmatisch sluiten (X/backdrop/Escape) → `router.back()` consumeert
 *    de eigen entry, zodat er geen wees-entry achterblijft;
 *  - deeplink/refresh (de pane-URL is de éérste entry, er is niets gepusht)
 *    → sluiten valt terug op `router.replace` zonder de query-param.
 *
 * De consument meldt met `reset()` dat de pane door de terugknop zelf (of een
 * andere navigatie) al gesloten is — de entry is dan al geconsumeerd en een
 * latere close mag géén extra `back()` doen.
 *
 * BEKENDE BEPERKING (review 29-08-2026): `close()` doet een blinde
 * `router.back()` zonder de isCurrent-/navigatie-detectie van
 * lib/overlay-history.ts. Een `<Link>` of `router.push` BINNEN de pane die
 * eerst `onClose()` aanroept, kan die navigatie afbreken (zelfde klasse als de
 * "vijfde sluitroute" daar). Vandaag heeft geen consument zo'n in-pane-link;
 * komt die er, neem dan de nav-window-detectie over of routeer die sluiting
 * buiten deze helper om.
 */

export interface PaneRouter {
  push: (href: string, opts?: { scroll?: boolean }) => void
  replace: (href: string, opts?: { scroll?: boolean }) => void
  back: () => void
}

export function createPaneUrlHistory(router: PaneRouter) {
  let pushed = false
  return {
    /**
     * Open (vanaf gesloten → push) of wissel (pane al open → replace).
     * De `!pushed`-guard vangt de dubbeltik: `alreadyOpen` komt uit
     * `useSearchParams` en commit pas ná de push-transitie, dus een snelle
     * tweede tik ziet nog "gesloten" — zonder guard stapelt die een tweede
     * entry en sluit één terugdruk de pane niet meer.
     */
    open(url: string, alreadyOpen: boolean): void {
      if (!alreadyOpen && !pushed) {
        pushed = true
        router.push(url, { scroll: false })
      } else {
        router.replace(url, { scroll: false })
      }
    },
    /**
     * Programmatisch sluiten. Consumeert de eigen entry met `back()`; zonder
     * eigen entry (deeplink, of al gereset) herschrijft hij de URL.
     */
    close(fallbackUrl: string): void {
      if (pushed) {
        pushed = false
        router.back()
      } else {
        router.replace(fallbackUrl, { scroll: false })
      }
    },
    /** De pane is al dicht door navigatie (popstate) — entry is geconsumeerd. */
    reset(): void {
      pushed = false
    },
  }
}
