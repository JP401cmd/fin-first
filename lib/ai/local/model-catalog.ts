// ── Catalogus van lokale modellen ────────────────────────────────────────────
//
// Tot nu toe was er één model, als losse constante in litert-runtime. Met een
// tweede keuze (E4B) hoort dat een catalogus te zijn: één plek die weet welke
// bundels bestaan, hoe groot ze zijn en waar ze staan.
//
// DE OMVANG IS GEMETEN, NIET GESCHAT. Beide getallen komen uit een HEAD-request
// op de HuggingFace-resolve-URL (3 augustus 2026) — de consent-stap toont ze
// aan de gebruiker als belofte, en een geschat getal zou daar een onwaarheid
// zijn. E2B kwam uit op 2.008.432.640 bytes, wat de meting van 19 juli (2,01 GB)
// bevestigt; E4B op 2.969.059.328 bytes.
//
// Beide bundels zijn de ONGEGATE, Apache-2.0 web-builds van litert-community.

export type LocalModelId = 'gemma-4-e2b' | 'gemma-4-e4b'

export type LocalModelDescriptor = {
  id: LocalModelId
  label: string
  /** Directe download-URL van de .litertlm-webbundel. Tevens de cache-sleutel. */
  url: string
  /** Gemeten omvang in bytes (HEAD content-length). */
  bytes: number
  /**
   * Contextvenster (mainExecutorSettings.maxNumTokens). Bewust voor béíde
   * modellen 8.192: de gecondenseerde lokale DNA en het parity-manifest zijn op
   * dat budget geschreven, en dat mag niet stil per modelkeuze verschuiven.
   */
  tokenBudget: number
  /** Eén zin voor de keuzelijst — wat levert dit model op, en wat kost het. */
  blurb: string
}

export const LOCAL_MODEL_CATALOG: LocalModelDescriptor[] = [
  {
    id: 'gemma-4-e2b',
    label: 'Gemma 4 E2B',
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
    bytes: 2_008_432_640,
    tokenBudget: 8192,
    blurb: 'De lichtste keuze. Snel, en het model waarmee alles hier gemeten is.',
  },
  {
    id: 'gemma-4-e4b',
    label: 'Gemma 4 E4B',
    url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm',
    bytes: 2_969_059_328,
    tokenBudget: 8192,
    blurb: 'Groter en doorgaans beter van antwoord, maar bijna een gigabyte extra en trager per antwoord.',
  },
]

/** De standaardkeuze: het model waarop onze metingen en de gouden set rusten. */
export const DEFAULT_LOCAL_MODEL_ID: LocalModelId = 'gemma-4-e2b'

/** Descriptor bij een id; onbekend of ontbrekend → de standaard (nooit undefined). */
export function resolveLocalModel(id: string | null | undefined): LocalModelDescriptor {
  const found = LOCAL_MODEL_CATALOG.find((m) => m.id === id)
  return found ?? LOCAL_MODEL_CATALOG.find((m) => m.id === DEFAULT_LOCAL_MODEL_ID)!
}

/** "2,0" / "3,0" — NL-notatie, zodat de omvang niet groter of kleiner oogt dan hij is. */
export function formatModelGb(bytes: number): string {
  return (bytes / 1e9).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
