// ── Lokale-AI gereedheid: één plek die capability-flap en model-eviction scheidt
//
// De categorisatie-sheet (components/app/ai-categorize-sheet.tsx) gooide twee
// heel verschillende oorzaken op één hoop met de generieke melding "Lokale AI is
// niet beschikbaar of nog niet gedownload…". Dat verwart een gebruiker die het
// model wél had gedownload en de toggle aan had staan:
//
//   (a) checkLocalAiCapability() faalt — kan TRANSIENT zijn: requestAdapter(
//       'high-performance') geeft soms null bij een GPU-proces-herstart of
//       driver-update. Juiste actie: opnieuw proberen / browser herstarten.
//   (b) getLocalModelState() ≠ 'klaar' — bv. Cache-Storage-eviction van de
//       ~2,0 GB bundel. Juiste actie: opnieuw downloaden via Mijn → Privacy.
//
// Deze pure helper kiest de juiste, concrete boodschap per oorzaak. Geen React,
// geen I/O — puur zodat 'm eenvoudig te testen en te hergebruiken is (ADR 0043).

import type { LocalAiCapability } from './webgpu-capability'
import type { LocalModelState } from './model-manager'

export type LocalReadinessKind = 'ok' | 'capability' | 'model-missing'

export type LocalReadiness = {
  ready: boolean
  kind: LocalReadinessKind
  message: string | null
}

/**
 * Transiënte-flap-hint bij een capability-fout: de adapter kan kortstondig null
 * geven (GPU-proces-herstart / driver-update). Eerst opnieuw proberen, dan pas
 * de browser herstarten.
 */
export const LOCAL_READINESS_FLAP_HINT =
  'Probeer het zo nog eens; helpt dat niet, herstart dan je browser.'

/** Melding wanneer het model uit de cache is verdwenen (eviction / verwijderd). */
export const LOCAL_MODEL_MISSING_MESSAGE =
  'Het lokale model staat niet (meer) op dit toestel — mogelijk heeft je browser het verwijderd om ruimte te maken. Download het opnieuw via Mijn → Privacy. Je regels en eerdere keuzes staan wel klaar.'

/**
 * Melding wanneer er op dit toestel nog nooit een model heeft gestaan.
 *
 * Bewust een ándere tekst dan `LOCAL_MODEL_MISSING_MESSAGE`. Die zegt "niet
 * (meer)" en oppert dat de browser het verwijderd heeft — een verlies-narratief.
 * Wie het model nooit gedownload had, leest daar dat hij iets kwijt is wat hij
 * nooit had, en gaat zoeken naar een oorzaak die niet bestaat (UR3-17 #13).
 * Hier is er niets misgegaan: dit is gewoon de eerste stap.
 */
export const LOCAL_MODEL_NOT_DOWNLOADED_MESSAGE =
  'Er staat nog geen lokaal model op dit toestel. Download het eenmalig via Mijn → Privacy; daarna werkt dit ook zonder internet. Je regels en eerdere keuzes staan al klaar.'

/**
 * Melding wanneer er nú een download loopt (transiente 'downloaden'-staat) —
 * het eviction-narratief zou hier feitelijk onjuist zijn (review 19 jul).
 */
export const LOCAL_MODEL_DOWNLOADING_MESSAGE =
  'Het lokale model wordt nog gedownload — rond de download af via Mijn → Privacy en probeer het daarna opnieuw. Je regels en eerdere keuzes staan wel klaar.'

/** Terugval-aanhef als een capability-fout onverhoopt geen reasons meegaf (defensief). */
const CAPABILITY_FALLBACK_LEAD = 'Lokale AI is nu niet beschikbaar op dit toestel.'

/**
 * Neemt de eerste zin uit een reden. Bewust DECIMAAL-VEILIG: een zin-einde is
 * `.!?` gevolgd door witruimte of einde-tekst — een decimaal als "0.85 GiB"
 * (waarvan de punt door een cijfer wordt gevolgd) telt dus NIET als zin-einde.
 * De reasons uit webgpu-capability bevatten zulke getallen (beschikbaar
 * geheugen), dus een naïeve split op de eerste punt zou ze afkappen.
 */
function firstSentence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/[.!?](\s|$)/)
  if (!match || match.index === undefined) return trimmed
  return trimmed.slice(0, match.index + 1)
}

/**
 * Beslist of het lokale pad kan draaien en, zo niet, MET WELKE concrete melding.
 *
 * Volgorde is bewust: een capability-fout (a) is de hardere blokkade en wint van
 * een ontbrekend model (b) — anders zou een gebruiker een download starten die
 * op hetzelfde toestel toch niet kan draaien.
 */
export function resolveLocalReadiness(
  cap: LocalAiCapability,
  model: {
    state: LocalModelState
    /**
     * Heeft dit toestel het model ooit compleet gehad
     * (`hasEverDownloadedLocalModel()`)? Alleen dán is een leeg cachepad
     * daadwerkelijk verlies. Ontbreekt het veld, dan gaan we uit van "nog nooit"
     * — de onschuldige lezing: een gebruiker ten onrechte vertellen dat hij iets
     * kwijt is, is de duurdere fout van de twee.
     */
    everDownloaded?: boolean
  },
): LocalReadiness {
  if (cap.ok && model.state === 'klaar') {
    return { ready: true, kind: 'ok', message: null }
  }

  if (!cap.ok) {
    const firstReason = cap.reasons[0]?.trim()
    const lead = firstReason ? firstSentence(firstReason) : CAPABILITY_FALLBACK_LEAD
    return { ready: false, kind: 'capability', message: `${lead} ${LOCAL_READINESS_FLAP_HINT}` }
  }

  // cap.ok, maar het model staat niet klaar. Drie feitelijk verschillende
  // toestanden, drie meldingen — de download-actie is dezelfde, de uitleg niet:
  //  - 'downloaden'      → hij is er al mee bezig, niets is misgegaan.
  //  - leeg cachepad ('niet-gedownload') zónder eerdere download → hij is er
  //    nog nooit aan begonnen; er is niets verloren gegaan.
  //  - al het overige ('fout', of een leeg cachepad ná een geslaagde download)
  //    → er stónd iets en dat is weg: het eviction-narratief.
  if (model.state === 'downloaden') {
    return { ready: false, kind: 'model-missing', message: LOCAL_MODEL_DOWNLOADING_MESSAGE }
  }
  if (model.state === 'niet-gedownload' && !model.everDownloaded) {
    return { ready: false, kind: 'model-missing', message: LOCAL_MODEL_NOT_DOWNLOADED_MESSAGE }
  }
  return { ready: false, kind: 'model-missing', message: LOCAL_MODEL_MISSING_MESSAGE }
}
