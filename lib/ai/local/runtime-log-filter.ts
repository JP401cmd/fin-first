// ── De LiteRT-WASM-runtime schreeuwt INFO naar console.error ─────────────────
//
// `@litert-lm/core` is een Emscripten-build, en Emscripten stuurt álle stderr
// van de C++-kant naar `console.error` — ongeacht het niveau. De runtime logt
// bij elke start een handvol gewone opstartregels:
//
//   INFO: [environment.cc:30] Creating LiteRT environment with options
//   INFO: [accelerator_registry.cc:54] RegisterAccelerator: ... name=GPU WebGPU
//   INFO: [cpu_registry.cc:42] CPU accelerator registered.
//
// Dat zijn gezónde regels — ze zeggen juist dat WebGPU gevonden is. Maar de
// Next.js-dev-overlay toont iedere `console.error` als "Console Error", dus ze
// komen binnen als een reeks foutmeldingen bij iets dat gewoon goed gaat.
//
// WAAROM DIT MEER IS DAN COSMETICA. Onze eigen echte fouten gaan door hetzelfde
// kanaal: `console.error('[lokale-ai] Engine.create mislukt:', err)`,
// `'[lokale-ai] inferentie mislukt'`, de kanarie voor issue #2572. Als een échte
// fout tussen tien INFO-regels staat die er identiek uitzien, is het
// diagnostische pad stuk — en juist bij het beproeven van een nieuw model of een
// nieuw toestel moet dat pad scherp zijn.
//
// De SDK biedt geen uitweg: `LoadLiteRtLmOptions` kent alleen `threads`, er is
// geen log-niveau en geen `printErr`-haak. Daarom filteren we hier, aan onze
// kant, en uitsluitend rond het laden.
//
// WAT ER NIET GEBEURT: onderdrukken. Elke regel blijft in de console staan,
// alleen op het niveau dat erbij hoort. Alles wat niet herkenbaar het
// LiteRT-logformaat met een niet-fout-niveau heeft, gaat ONGEWIJZIGD door —
// inclusief elke echte fout en al onze eigen `[lokale-ai]`-meldingen.

/**
 * Het logformaat van de runtime: een niveau, een dubbele punt, en een
 * bronverwijzing tussen blokhaken (`INFO: [environment.cc:30] …`). Bewust zó
 * specifiek: een losse regel die toevallig met "INFO" begint, maar niet dit
 * formaat heeft, mag niet stilletjes van niveau veranderen.
 */
const RUNTIME_LOG_RE = /^\s*(INFO|VERBOSE|DEBUG|WARNING|ERROR|FATAL)\s*:\s*\[/i

export type RuntimeLogLevel = 'info' | 'warning' | 'error'

/**
 * Op welk console-niveau hoort deze regel thuis?
 *
 * - `info`    — opstartgepraat van de runtime; hoort niet in een foutenoverzicht
 * - `warning` — de runtime waarschuwt ergens voor; zichtbaar, maar geen fout
 * - `error`   — alles wat een echte fout is, én alles wat we niet herkennen
 *
 * Onbekend → `error`. Bij twijfel liever een regel te veel zien dan een echte
 * fout wegmoffelen.
 */
export function classifyRuntimeLog(text: string): RuntimeLogLevel {
  const match = RUNTIME_LOG_RE.exec(text)
  if (!match) return 'error'
  switch (match[1].toUpperCase()) {
    case 'INFO':
    case 'VERBOSE':
    case 'DEBUG':
      return 'info'
    case 'WARNING':
      return 'warning'
    default:
      return 'error'
  }
}

/** Alleen het eerste argument kan de logregel dragen; de rest laten we met rust. */
function firstText(args: unknown[]): string {
  return typeof args[0] === 'string' ? args[0] : ''
}

/**
 * Hoeveel filters er tegelijk actief zijn. `loadModelSession` serialiseert de
 * bouw al, maar een chatsessie die tegelijk opent zou anders de originele
 * `console.error` te vroeg terugzetten en de rest van het laden weer laten
 * lekken.
 */
let depth = 0
let original: typeof console.error | null = null

/**
 * Draait `work` met het niveaufilter actief. Herstelt `console.error` ALTIJD —
 * ook wanneer `work` werpt, want dan is een intacte foutenconsole juist het
 * hardst nodig.
 */
export async function withRuntimeLogFilter<T>(work: () => Promise<T>): Promise<T> {
  if (typeof console === 'undefined') return work()

  if (depth === 0) {
    original = console.error
    const passthrough = original
    console.error = (...args: unknown[]) => {
      switch (classifyRuntimeLog(firstText(args))) {
        case 'info':
          console.debug(...args)
          return
        case 'warning':
          console.warn(...args)
          return
        default:
          passthrough(...args)
      }
    }
  }
  depth++

  try {
    return await work()
  } finally {
    depth--
    if (depth === 0 && original) {
      console.error = original
      original = null
    }
  }
}
