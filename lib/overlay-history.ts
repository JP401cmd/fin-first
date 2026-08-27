/**
 * overlay-history — de back-knop sluit de bovenste overlay, niet de pagina.
 *
 * Zonder deze integratie navigeert een druk op "terug" met een open modal de
 * ONDERLIGGENDE pagina weg: de modal blijft staan of verdwijnt samen met de
 * hele route. Op mobiel is terug het natuurlijke sluitgebaar, dus dat maakt
 * elke modal moeilijk te verlaten.
 *
 * Model: LIFO-stack van history-entries.
 *  - Openen duwt één entry op de browser-history (`pushState`, zelfde URL) én
 *    op onze eigen stack. Twee gestapelde overlays leveren twee entries; terug
 *    sluit ze in omgekeerde volgorde — modal→modal valt daarmee gratis goed uit.
 *  - `popstate` (echte terug-druk) popt de bovenste entry en roept diens
 *    `close()` aan.
 *  - Sluiten via X / Escape / swipe / backdrop roept de release-functie aan.
 *    Die consumeert de eigen entry met `history.back()`, zodat er geen
 *    WEESENTRY achterblijft (anders moet je twee keer terug drukken voor er
 *    iets gebeurt).
 *  - Weigert een overlay te sluiten (`close()` geeft `false`, zoals het
 *    chatpaneel tijdens een lopende verzending), dan krijgt hij zijn entry
 *    terug. Zonder die teruggave staat er een open overlay zónder entry en
 *    verlaat de volgende terug-druk de pagina met dat paneel nog open.
 *
 * De `selfBackPending`-teller onderscheidt onze eigen `history.back()` van een
 * echte terug-druk: beide leveren een identieke `popstate`. Zonder die teller
 * zou onze eigen back de ONDERLIGGENDE overlay sluiten. De teller loopt na
 * 1,5s vanzelf leeg voor het geval een `back()` geen popstate oplevert (bv.
 * omdat de gebruiker intussen wegnavigeerde), zodat hij nooit een echte
 * terug-druk kan opeten.
 *
 * ── Vijfde sluitroute: SLUITEN DOOR NAVIGATIE ──────────────────────────────
 * Een `<Link>` ín een overlay sluit de overlay (`onClick={onClose}`) én start
 * een route-wissel. Die twee lopen niet gelijk op: de overlay is direct dicht
 * (React-commit), maar Next's navigatie is asynchroon — de router duwt zijn
 * eigen history-entry pas als de RSC-payload binnen is. Vuurde de release in
 * dat gat een `history.back()`, dan ondermijnde die de lopende navigatie: de
 * RSC-fetch werd afgebroken (`ERR_ABORTED`) en de URL bleef op de oude route
 * staan. Zichtbaar als "tik op een menu-item doet niets" — voor ELKE link in
 * een overlay, ongeacht invoermethode. Een check op "is onze entry nog de
 * huidige?" ziet dit niet: op dat moment heeft de router nog niets gepusht.
 *
 * We herkennen die sluiting daarom aan de BRON: een klik op een navigerende
 * link (capture-fase, dus vóór Next's eigen handler `preventDefault()` doet).
 * Sluit een overlay binnen `NAV_WINDOW_MS` daarna, dan laten we de history met
 * rust — de navigatie consumeert de entry zelf door er zijn eigen entry
 * overheen te duwen. Het venster is een marge, geen exacte meting: React
 * draait passive-effect-cleanups in een eigen scheduler-taak, dus de release
 * valt nét ná de klik-taak.
 *
 * Navigeert een overlay PROGRAMMATISCH (`onClose()` + `router.push()`, zoals
 * de command-palette — daar is de trigger vaak niet eens een klik maar Enter),
 * dan is er geen link-klik om aan te herkennen. Die sluitroute meldt zich
 * daarom zelf met `noteOverlayNavigation()`; verder loopt alles gelijk.
 *
 * Wat overblijft is een ACHTERGEBLEVEN entry (zelfde URL) ónder de nieuwe
 * router-entry. Die markeren we als "stale": landt een latere terug-druk erop,
 * dan slaan we 'm meteen over met één extra `back()`. Eén keer terug vanaf de
 * nieuwe route brengt je zo op de vorige pagina in plaats van op een dode
 * tussenstap. Dezelfde afhandeling geldt wanneer de app al doorgenavigeerd
 * blijkt op het moment van release.
 *
 * In DEV laat React StrictMode het open-effect twee keer lopen (push → release →
 * push). De release consumeert daar netjes zijn eigen entry, maar de browser
 * verwerkt `back()` asynchroon, dus er blijft in dev één extra (forward-)entry
 * staan. Het zichtbare gedrag klopt — terug sluit nog steeds de bovenste
 * overlay — en in productie treedt het niet op.
 *
 * NIET voor overlays waarvan de open-staat uit de URL komt (`?holding=<id>`,
 * `?planEditor=true`): die schrijven bij sluiten zelf de URL met
 * `router.replace`, waardoor onze entry en de hunne elkaar in de weg zitten.
 * Zie de `manageHistory`-prop op `BottomSheet` en de `kind="pane"`-tak van
 * `ShellOverlay`.
 */

const STATE_KEY = '__trifinityOverlay'

/**
 * Marge tussen het navigatie-signaal (link-klik of `noteOverlayNavigation`) en
 * de sluiting die eruit volgt. Ruim genomen: een gemiste herkenning breekt de
 * navigatie (het defect), een overbodige herkenning kost hooguit een stale
 * entry — en die ruimen we bij de eerstvolgende terug-druk zelf op.
 */
const NAV_WINDOW_MS = 600

/** Plafond op de stale-administratie; alleen de recentste entries doen ertoe. */
const MAX_STALE_IDS = 16

/**
 * De sluit-callback mag WEIGEREN door `false` terug te geven (het chatpaneel
 * doet dat tijdens een lopende verzending). De overlay blijft dan open en
 * krijgt zijn history-entry terug — anders staat er een open overlay zonder
 * entry en verlaat de volgende terug-druk de pagina met die overlay nog open.
 */
export type OverlayCloseResult = void | boolean

type OverlayHistoryEntry = {
  id: number
  close: () => OverlayCloseResult
  /** Gezet zodra de browser deze entry heeft gepopt — dan geen eigen back(). */
  poppedByBrowser: boolean
}

const stack: OverlayHistoryEntry[] = []
/** Entries die niemand meer sluiten kan (gesloten door navigatie) — overslaan. */
const staleIds = new Set<number>()
let nextId = 1
let listening = false
let selfBackPending = 0
let lastNavSignalAt = 0

function noteSelfBack() {
  selfBackPending += 1
  // Vangnet: levert onze back() onverhoopt geen popstate op, dan mag de teller
  // niet blijven staan en de volgende ECHTE terug-druk opeten.
  setTimeout(() => {
    if (selfBackPending > 0) selfBackPending -= 1
  }, 1500)
}

function consumeSelfBack(): boolean {
  if (selfBackPending === 0) return false
  selfBackPending -= 1
  return true
}

function markStale(id: number) {
  staleIds.add(id)
  while (staleIds.size > MAX_STALE_IDS) {
    const oudste = staleIds.values().next().value
    if (oudste === undefined) break
    staleIds.delete(oudste)
  }
}

/**
 * Zijn we op een achtergebleven overlay-entry geland? Sla 'm dan over met één
 * extra back(). Zelfde URL, dus onzichtbaar — het scheelt de gebruiker een
 * dode terug-druk.
 */
function skipStaleEntry(): boolean {
  if (staleIds.size === 0) return false
  const state = window.history.state as Record<string, unknown> | null
  const landed = state ? state[STATE_KEY] : undefined
  if (typeof landed !== 'number' || !staleIds.has(landed)) return false
  staleIds.delete(landed)
  noteSelfBack()
  window.history.back()
  return true
}

/**
 * Duwt een gepopte entry terug op de history nadat de overlay weigerde te
 * sluiten. Bewust met HETZELFDE id: de release-closure van die overlay toetst
 * op dat id om te zien of hij nog de huidige entry is.
 */
function herstelEntry(entry: OverlayHistoryEntry) {
  entry.poppedByBrowser = false
  stack.push(entry)
  window.history.pushState(
    { ...(window.history.state as Record<string, unknown> | null), [STATE_KEY]: entry.id },
    '',
  )
}

function onPopState() {
  const wasSelfBack = consumeSelfBack()
  if (skipStaleEntry()) return
  if (wasSelfBack) return
  const entry = stack.pop()
  if (!entry) return
  entry.poppedByBrowser = true
  if (entry.close() === false) herstelEntry(entry)
}

/**
 * Registreert een klik die tot een route-wissel leidt. Capture-fase: Next's
 * `<Link>` roept in de bubble-fase `preventDefault()` aan en navigeert zelf,
 * dus later kijken levert niets op. We filteren op wat de browser óók als
 * navigatie zou behandelen (linkermuisknop, geen modifier, geen download,
 * geen ander target) — een X-knop of backdrop-klik valt er dus buiten en
 * houdt gewoon zijn eigen `history.back()`.
 */
function onDocumentClickCapture(event: MouseEvent) {
  // Zonder open overlay valt er niets te beschermen — en een signaal dat blijft
  // hangen zou een overlay die kort daarna opent én sluit onterecht raken.
  if (stack.length === 0) return
  if (event.defaultPrevented) return
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a[href]')
  if (!anchor) return
  if (anchor.hasAttribute('download')) return
  const linkTarget = anchor.getAttribute('target')
  if (linkTarget && linkTarget !== '_self') return
  if (!veranderDeHistory(anchor.getAttribute('href'))) return
  lastNavSignalAt = Date.now()
}

/**
 * Verandert een klik op deze href daadwerkelijk de history van dit document?
 *
 * `mailto:`, `tel:`, `sms:` en `javascript:` doen dat niet: ze openen een
 * mailclient of voeren script uit, de pagina blijft staan en er komt geen
 * entry bij. Een href naar exact de huidige URL evenmin. Armeren we daar toch
 * op, dan laat de sluiting die er kort na volgt zijn entry onterecht als stale
 * achter — en dat kost precies de dode terug-druk die deze module bestrijdt.
 * Een fragment-link (`#ergens`) duwt wél een entry en telt dus mee: een blinde
 * back() zou die sprong ongedaan maken.
 */
function veranderDeHistory(href: string | null): boolean {
  if (!href) return false
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.href !== window.location.href
}

function navigatieIsOnderweg(): boolean {
  return lastNavSignalAt > 0 && Date.now() - lastNavSignalAt <= NAV_WINDOW_MS
}

/**
 * Meld een route-wissel die NIET uit een link-klik komt: een overlay die
 * zichzelf sluit en daarna zelf `router.push()` doet. Roep 'm aan vlak vóór
 * het sluiten — de release die daarop volgt laat de history dan met rust,
 * precies zoals bij een link-klik. Zonder dit signaal breekt de eigen
 * `history.back()` die navigatie af.
 */
export function noteOverlayNavigation(): void {
  lastNavSignalAt = Date.now()
}

function ensureListening() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('popstate', onPopState)
  document.addEventListener('click', onDocumentClickCapture, true)
  listening = true
}

/**
 * Meld een open overlay aan bij de browser-history. Geeft een idempotente
 * release-functie terug: roep 'm aan (effect-cleanup) zodra de overlay sluit.
 *
 * De release doet alléén `history.back()` wanneer onze entry ook echt nog de
 * huidige is én er geen navigatie loopt. Navigeerde de app al door (Next duwt
 * dan zijn eigen state bovenop) of is die navigatie nog onderweg, dan laten we
 * de history met rust — een blinde `back()` zou die navigatie terugdraaien of
 * afbreken. De entry blijft dan als stale achter en wordt bij een latere
 * terug-druk overgeslagen.
 */
export function pushOverlayHistory(close: () => OverlayCloseResult): () => void {
  if (typeof window === 'undefined') return () => {}

  ensureListening()
  const id = nextId++
  const entry: OverlayHistoryEntry = { id, close, poppedByBrowser: false }
  stack.push(entry)
  window.history.pushState(
    { ...(window.history.state as Record<string, unknown> | null), [STATE_KEY]: id },
    '',
  )

  let released = false
  return () => {
    if (released) return
    released = true
    const index = stack.indexOf(entry)
    if (index >= 0) stack.splice(index, 1)
    if (entry.poppedByBrowser) return
    const state = window.history.state as Record<string, unknown> | null
    const isCurrent = !!state && state[STATE_KEY] === id
    if (!isCurrent || navigatieIsOnderweg()) {
      markStale(id)
      return
    }
    noteSelfBack()
    window.history.back()
  }
}

/** Aantal aangemelde overlay-entries. Bedoeld voor tests / debugging. */
export function getOverlayHistoryDepth(): number {
  return stack.length
}

/**
 * Reset de stack, de self-back-teller, de stale-administratie en de
 * navigatie-marge. ALLEEN voor tests — zorgt dat een niet-vrijgegeven entry
 * uit een vorige test niet naar de volgende lekt.
 */
export function __resetOverlayHistory(): void {
  stack.length = 0
  staleIds.clear()
  selfBackPending = 0
  lastNavSignalAt = 0
}
