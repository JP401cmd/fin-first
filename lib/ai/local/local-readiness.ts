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
//       ~3,2 GB shards. Juiste actie: opnieuw downloaden via Mijn → Privacy.
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
  model: { state: LocalModelState },
): LocalReadiness {
  if (cap.ok && model.state === 'klaar') {
    return { ready: true, kind: 'ok', message: null }
  }

  if (!cap.ok) {
    const firstReason = cap.reasons[0]?.trim()
    const lead = firstReason ? firstSentence(firstReason) : CAPABILITY_FALLBACK_LEAD
    return { ready: false, kind: 'capability', message: `${lead} ${LOCAL_READINESS_FLAP_HINT}` }
  }

  // cap.ok, maar het model staat niet klaar. Een lopende download krijgt zijn
  // eigen, feitelijk juiste melding; 'niet-gedownload'/'fout' → het
  // eviction-/ontbreekt-narratief met de download-actie.
  return {
    ready: false,
    kind: 'model-missing',
    message: model.state === 'downloaden' ? LOCAL_MODEL_DOWNLOADING_MESSAGE : LOCAL_MODEL_MISSING_MESSAGE,
  }
}
