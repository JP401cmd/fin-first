// ── Welk lokaal model draait er op DIT toestel ───────────────────────────────
//
// Net als het oordeel van de uitvoer-toets is dit een per-apparaat-feit: de
// bundel staat in de Cache Storage van déze browser, dus de keuze hoort daar ook
// te wonen. Een profielvoorkeur zou betekenen dat je telefoon opeens een model
// "gekozen" heeft dat er nooit gedownload is.
//
// De beheerder blijft de baas over wát er te kiezen valt (`local_ai_gate`:
// `modelId` + `allowUserModelChoice`). De sectie op /mijn/privacy is de plek die
// beide samenbrengt en hier het EFFECTIEVE model wegschrijft — dit bestand
// bewaart alleen, het beslist niet.
//
// Iemand kan dit met de hand in zijn eigen localStorage veranderen. Dat kost
// hooguit hemzelf een download: er hangt geen serverrecht aan, er gaat niets naar
// buiten, en de uitvoer-toets bepaalt hoe dan ook of het resultaat bruikbaar is.

import {
  DEFAULT_LOCAL_MODEL_ID,
  resolveLocalModel,
  type LocalModelDescriptor,
  type LocalModelId,
} from './model-catalog'

const STORAGE_KEY = 'trifinity.lokale-ai.model'

/** Het gekozen model-id op dit toestel; onbekend/afwezig → de standaard. */
export function getSelectedLocalModelId(): LocalModelId {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCAL_MODEL_ID
  try {
    return resolveLocalModel(localStorage.getItem(STORAGE_KEY)).id
  } catch {
    return DEFAULT_LOCAL_MODEL_ID
  }
}

/** De volledige descriptor van het model dat hier draait. Nooit undefined. */
export function getSelectedLocalModel(): LocalModelDescriptor {
  return resolveLocalModel(getSelectedLocalModelId())
}

/**
 * Leg de keuze vast. Geeft terug of er iets VERANDERDE — de aanroeper moet dan
 * de geladen engine wegdoen (die draait nog het oude model) en het bewaarde
 * proefoordeel is niet langer van toepassing. `selectLocalModel` in
 * model-manager.ts doet dat allebei; gebruik die in plaats van deze functie.
 */
export function storeSelectedLocalModelId(id: LocalModelId): boolean {
  const previous = getSelectedLocalModelId()
  if (typeof localStorage === 'undefined') return false
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* best-effort: zonder opslag valt de keuze terug op de standaard */
  }
  return previous !== id
}
