// ── Heeft dit toestel het lokale model ooit compleet gehad? ─────────────────
//
// `getLocalModelState()` kan dat niet zien. "Nooit gedownload" en "gedownload,
// daarna door de browser geëvicteerd" leveren allebei `'niet-gedownload'` op —
// de Cache Storage is in beide gevallen leeg. Zonder dit vlaggetje kreeg iemand
// die nog nooit iets had gedownload het eviction-narratief ("staat niet (meer)
// op dit toestel — mogelijk heeft je browser het verwijderd om ruimte te
// maken") en ging hij zoeken naar een verlies dat nooit heeft plaatsgevonden
// (UR3-17 #13).
//
// localStorage en niet het profiel: dit is een eigenschap van dit APPARAAT, net
// als het proefoordeel hiernaast (proof-verdict.ts) — conform de
// datapad-conventie in CLAUDE.md. Wist iemand zijn site-gegevens, dan is de
// modelcache óók leeg en is "nog nooit gedownload" gewoon de juiste lezing.
//
// EIGEN MODULE, bewust niet in model-manager.ts: die wordt in acht testbestanden
// als geheel ge-mockt. Een extra export daar zou elk van die dubbels stilzwijgend
// incompleet maken — en dan valt niet de toets om die je aan het schrijven bent,
// maar een willekeurige andere suite, op een TypeError diep in de hook.

const STORAGE_KEY = 'trifinity.lokale-ai.ooit-gedownload'

/** Best-effort: private mode / quota-fouten lezen als "nog nooit gedownload". */
export function hasEverDownloadedLocalModel(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Aan te roepen zodra een download volledig is afgerond — nooit eerder. */
export function markLocalModelDownloaded(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* geen opslag → de melding valt terug op "nog nooit gedownload" */
  }
}
