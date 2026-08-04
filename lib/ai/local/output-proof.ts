// ── Uitvoer-toets: bewijst dat dít toestel bruikbare antwoorden geeft ─────────
//
// `checkLocalAiCapability` beantwoordt één vraag: KAN dit toestel het model
// draaien (WebGPU, shader-f16, buffergrootte). Dat bleek de verkeerde vraag.
//
// De Android-meting van 19 juli (spikes/litert-lm/meetrapport-v1.md §L1.5, een
// Adreno 7xx) haalde die lat mét gemak — WebGPU ✓, shader-f16 ✓, 8,7-15,8 tok/s,
// 2,6 s per transactie, sneller dan menige laptop — en leverde tóch 0% bruikbare
// uitvoer: meertalige token-soep (Engels/Japans/Cyrillisch), herhaallussen, geen
// JSON. De oorzaak zit onder de WebGPU-API (Dawn/driver; zie LiteRT #8065 en
// LiteRT-LM #3012, beide open): gewichten raken corrupt zodra ze één keer door
// een compute-pass zijn gelezen. Het model rekent dus snel en fout, en geen
// enkele capability-vraag kan dat zien.
//
// Daarom deze toets. Hij vervangt de toestel-gok als POORT: niet "welke klasse
// apparaat is dit" (die gok sloot vorige week een prima laptop buiten) en niet
// "haalt de GPU de specificaties", maar het enige dat telt — KOMT ER IETS
// BRUIKBAARS UIT. Een telefoon die slaagt mag lokaal draaien; een desktop die
// zakt niet.
//
// WAAROM MEER DAN ÉÉN GENERATIE. De upstream-bug is nadrukkelijk "de eerste
// inferentie klopt, alles daarna is stilletjes rommel". Eén proefgeneratie zou
// die dus precies missen. We draaien er drie, in oplopende lengte, elk in een
// verse conversatie op dezelfde engine — exact het patroon van het echte gebruik.
//
// PUUR WAAR HET KAN. De toetsen (`findForeignScript`, `findRepetitionLoop`,
// `evaluateProofTask`) zijn losse functies zonder model of netwerk, zodat ze
// zonder GPU te testen zijn. Alleen `runLocalOutputProof` doet I/O, en die krijgt
// zijn sessie als argument.
//
// GEEN CLOUD-GUARDRAILS. Net als de rest van lib/ai/local draait dit volledig op
// het toestel: geen provider, geen egress, geen kosten. `sanitizeForAI`,
// `maskPIIInOutput` en token-logging zijn hier niet van toepassing — er gaan
// bovendien geen gebruikersgegevens in, alleen deze drie vaste testvragen.

import { extractLocalJsonObjects } from './parse'
import type { LocalChatMessage } from './litert-runtime'

/**
 * Versie van deze toets. Ophogen zodra de taken of de normen wijzigen: een
 * bewaard oordeel van een oudere versie telt dan niet meer mee en het toestel
 * wordt opnieuw beproefd (zie proof-verdict.ts).
 */
export const LOCAL_PROOF_VERSION = 1

/** Ruimte per proefantwoord. Bewust klein — de taken vragen korte uitvoer. */
export const PROOF_MAX_TOKENS = 64

/**
 * Harde bovengrens per generatie. De meting zag naast corrupte uitvoer ook een
 * HANG (batch 4, ~3 minuten GPU-last). Zonder deze grens zou de proef daar
 * blijven staan en de gebruiker met een eeuwig draaiend spinnertje achterlaten.
 * Ruim boven de gemeten ~10 s op een trage telefoon, dus een gezond toestel
 * raakt 'm niet.
 */
export const PROOF_TIMEOUT_MS = 45_000

/** Uitvoer die niet in het Latijnse schrift staat, was hét signaal in de meting. */
const FOREIGN_SCRIPT_RE =
  /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ぀-ゟ゠-ヿ㐀-䶿一-鿿가-힯]/u

/** Hoe vaak een woordgroep achter elkaar mag terugkomen vóór het een lus heet. */
const MIN_LOOP_REPEATS = 4
/** Tot hoeveel woorden een herhaalde groep mag tellen ("ja nee ja nee …"). */
const MAX_LOOP_UNIT = 4
/** Plafond op het aantal beschouwde woorden — houdt de lus-zoeker begrensd. */
const MAX_LOOP_TOKENS = 400

/**
 * Eerste teken uit een niet-Latijns schrift, of null. Nederlandse leestekens,
 * accenten en het euroteken vallen hier bewust buiten: die horen in een gezond
 * antwoord thuis.
 */
export function findForeignScript(text: string): string | null {
  const hit = text.match(FOREIGN_SCRIPT_RE)
  return hit ? hit[0] : null
}

/**
 * De herhaalde woordgroep als de tekst in een lus is beland, anders null.
 * Kijkt naar groepen van 1 tot MAX_LOOP_UNIT woorden die MIN_LOOP_REPEATS keer
 * direct achter elkaar staan — dat vangt zowel "de de de de" als het subtielere
 * "ja nee ja nee ja nee ja nee".
 */
export function findRepetitionLoop(text: string): string | null {
  const words = (text.toLowerCase().match(/\p{L}+|\d+/gu) ?? []).slice(0, MAX_LOOP_TOKENS)

  for (let unit = 1; unit <= MAX_LOOP_UNIT; unit++) {
    for (let start = 0; start + unit * MIN_LOOP_REPEATS <= words.length; start++) {
      let repeats = 1
      while (
        start + unit * (repeats + 1) <= words.length &&
        sameSlice(words, start, start + unit * repeats, unit)
      ) {
        repeats++
      }
      if (repeats >= MIN_LOOP_REPEATS) return words.slice(start, start + unit).join(' ')
    }
  }
  return null
}

/** Zijn de `len` woorden vanaf `a` gelijk aan die vanaf `b`? */
function sameSlice(words: string[], a: number, b: number, len: number): boolean {
  for (let i = 0; i < len; i++) {
    if (words[a + i] !== words[b + i]) return false
  }
  return true
}

export type ProofTask = {
  id: string
  /** Wat deze taak aantoont — verschijnt in de faalreden. */
  label: string
  system: string
  user: string
  /** In één zin: wat er goed is. Wordt aan de gebruiker getoond (transparantie). */
  verwacht: string
  /** Taakspecifieke toets: null = geslaagd, anders de concrete reden. */
  check: (raw: string) => string | null
}

/** Woorden vergelijkbaar maken: kleine letters, leestekens weg. */
function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+|\d+/gu) ?? []
}

/**
 * Welk deel van de verwachte woorden ontbreekt in het antwoord (0..1)?
 *
 * Bewust op woordniveau en niet letterlijk: een model dat een punt weglaat of
 * een hoofdletter anders zet, echoot prima. Een model dat rommel produceert,
 * mist woorden.
 */
export function missingWordFraction(expected: string, raw: string): number {
  const wanted = new Set(words(expected))
  if (wanted.size === 0) return 0
  const got = new Set(words(raw))
  let missing = 0
  for (const w of wanted) if (!got.has(w)) missing++
  return missing / wanted.size
}

/** Hoeveel van een te herhalen zin mag ontbreken vóór het een zakking is. */
const ECHO_TOLERANCE = 0.2

/** De zin uit de lange echo-taak — lang genoeg om het decoderen te belasten. */
const ECHO_SENTENCE = 'Een euro is opgeslagen tijd, en tijd is de enige echte munt.'

/**
 * De drie proefvragen. Alle drie ECHO-TAKEN: het goede antwoord staat letterlijk
 * in de vraag. Er is dus geen kennis, geen redeneerwerk en geen smaak voor nodig
 * — alleen de vraag correct decoderen en teruggeven.
 *
 * DAT IS EEN GELEERDE LES, GEEN VOORKEUR. De eerste versie vroeg "Wat is de
 * hoofdstad van Nederland?" en verwachtte Amsterdam. Een echte gebruiker kreeg
 * "Den Haag" terug en werd geweigerd — terwijl dat een coherent, verdedigbaar
 * antwoord is (regeringszetel versus grondwettelijke hoofdstad). De proef
 * verwierp daar een prima toestel op een twistpunt uit een quiz. Een toets die
 * PARATE KENNIS meet, meet niet wat hij moet meten: het gaat om de INTEGRITEIT
 * van de uitvoer, niet om hoe knap een 2B-model is.
 *
 * Oplopend in belasting, want corruptie groeit met het aantal gedecodeerde
 * tokens: één woord, dan een vaste JSON-vorm, dan een hele zin.
 */
export const LOCAL_PROOF_TASKS: ProofTask[] = [
  {
    id: 'echo-woord',
    label: 'één woord exact teruggeven',
    system: 'Je doet een technische zelftest. Antwoord met exact wat er gevraagd wordt, zonder uitleg.',
    user: 'Antwoord met exact dit ene woord: vrijheid',
    verwacht: 'het woord “vrijheid”',
    check: (raw) => (/\bvrijheid\b/i.test(raw) ? null : 'het gevraagde woord kwam niet terug'),
  },
  {
    id: 'json',
    label: 'een vaste JSON-vorm teruggeven',
    system: 'Je doet een technische zelftest. Antwoord uitsluitend met JSON, zonder uitleg.',
    user: 'Geef exact deze JSON terug: [{"status":"ok"}]',
    verwacht: 'geldige JSON met status “ok”',
    check: (raw) => {
      // Bewust via de canonieke lokale parser (fences, <think>-preambles,
      // afkapping) — dan toetst de proef precies het pad dat de echte lokale
      // taken ook lopen, in plaats van een eigen, mildere lezing.
      const objects = extractLocalJsonObjects(raw).objects
      const ok = objects?.some(
        (o) => typeof o === 'object' && o !== null && (o as Record<string, unknown>).status === 'ok',
      )
      return ok ? null : 'het model leverde geen bruikbare JSON'
    },
  },
  {
    id: 'echo-zin',
    label: 'een hele zin foutloos teruggeven',
    system: 'Je doet een technische zelftest. Antwoord met exact wat er gevraagd wordt, zonder uitleg.',
    user: `Herhaal deze zin exact: ${ECHO_SENTENCE}`,
    verwacht: `de zin “${ECHO_SENTENCE}”`,
    check: (raw) =>
      missingWordFraction(ECHO_SENTENCE, raw) <= ECHO_TOLERANCE
        ? null
        : 'de zin kwam er niet compleet uit',
  },
]

export type ProofTaskResult = {
  id: string
  raw: string
  /** null = geslaagd. */
  reason: string | null
}

export type ProofOutcome = {
  ok: boolean
  /** Menselijke, NL-taal redenen waarom het niet lukte — leeg bij ok. */
  reasons: string[]
  results: ProofTaskResult[]
}

/**
 * Toetst één ruwe uitvoer. De algemene toetsen (vreemd schrift, herhaallus)
 * gaan vóór de taakspecifieke: ze beschrijven de corruptie zelf, en dat is een
 * eerlijker en herkenbaarder reden dan "het antwoord klopte niet".
 */
export function evaluateProofTask(task: ProofTask, raw: string): string | null {
  const text = raw.trim()
  if (!text) return 'het model gaf een leeg antwoord'

  const foreign = findForeignScript(text)
  if (foreign) return `het antwoord bevatte tekens uit een ander schrift (“${foreign}”)`

  const loop = findRepetitionLoop(text)
  if (loop) return `het model bleef in herhaling hangen (“${loop}”)`

  return task.check(text)
}

/** Hoeveel tekens van het echte antwoord we in de faalreden tonen. */
const SNIPPET_LENGTH = 90

/**
 * Zet een falen om in één zin die de gebruiker iets vertelt — mét het
 * daadwerkelijke antwoord erbij.
 *
 * Dat laatste is geen luxe maar de kern van de diagnose: "het antwoord klopte
 * niet" laat in het midden of het toestel onzin uitkraamt of dat het model
 * gewoon iets net anders formuleerde. Het echte fragment maakt dat verschil in
 * één oogopslag zichtbaar. Er staat niets gevoeligs in — de proefvragen zijn
 * drie vaste testvragen zonder gebruikersgegevens.
 */
function describeFailure(task: ProofTask, reason: string, raw?: string): string {
  const base = `Bij de proef "${task.label}" ging het mis: ${reason}.`
  const text = raw?.trim().replace(/\s+/g, ' ')
  if (!text) return base
  const snippet = text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text
  return `${base} Het model antwoordde: «${snippet}»`
}

/**
 * Onderscheidt "te traag" van "vastgelopen". Die twee vragen om een ander
 * antwoord — een tijdslimiet is in beheer op te rekken, een crash niet — dus ze
 * mogen niet op één hoop.
 */
class ProofTimeoutError extends Error {}

/** Werpt na `ms` — de proef mag niet blijven hangen (zie PROOF_TIMEOUT_MS). */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ProofTimeoutError(`[lokale-ai] proeftaak "${label}" duurde langer dan ${ms} ms`)),
      ms,
    )
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export type ProofOptions = {
  /**
   * Hoeveel proefvragen minimaal goed moeten zijn. Beheer-instelbaar (zie
   * gate-config.ts); default is álle drie — de strengste stand.
   */
  minPassed?: number
  /** Wachttijd per antwoord vóór "vastgelopen". Beheer-instelbaar. */
  timeoutMs?: number
}

/**
 * Draait de proef op een geladen sessie.
 *
 * Stopt zodra de uitslag VASTSTAAT: bij de strenge stand (alles goed) is dat de
 * eerste zakking, bij een lagere drempel pas wanneer er te veel misgingen óf er
 * genoeg geslaagd zijn. Op een traag toestel scheelt dat echte minuten, en de
 * uitslag verandert er niet door.
 *
 * Werpt nooit — een inferentiefout of een hang wordt net zo goed een `ok:false`
 * met een leesbare reden, want voor de gebruiker is het gevolg hetzelfde.
 */
export async function runLocalOutputProof(
  session: {
    generate(messages: LocalChatMessage[], maxNewTokens: number): Promise<string>
  },
  opts?: ProofOptions,
): Promise<ProofOutcome> {
  const total = LOCAL_PROOF_TASKS.length
  // Grenzen ook hier hard, niet alleen in de config-laag: deze functie wordt ook
  // rechtstreeks aangeroepen (tests, toekomstige callers) en een drempel van 0
  // zou de poort betekenisloos maken.
  const minPassed = Math.min(total, Math.max(1, Math.round(opts?.minPassed ?? total)))
  const timeoutMs = Math.max(1, Math.round(opts?.timeoutMs ?? PROOF_TIMEOUT_MS))

  const results: ProofTaskResult[] = []
  const reasons: string[] = []
  let passed = 0
  let failed = 0

  for (const task of LOCAL_PROOF_TASKS) {
    let reason: string | null
    let raw = ''

    try {
      raw = await withTimeout(
        session.generate(
          [
            { role: 'system', content: task.system },
            { role: 'user', content: task.user },
          ],
          PROOF_MAX_TOKENS,
        ),
        timeoutMs,
        task.id,
      )
      reason = evaluateProofTask(task, raw)
    } catch (err) {
      console.error('[lokale-ai] proeftaak mislukt:', err)
      // Te traag en vastgelopen vragen om een ander antwoord: het eerste is in
      // beheer op te rekken, het tweede niet. De melding zegt daarom welk van
      // de twee het was, en bij een tijdslimiet ook hoe lang die stond.
      reason =
        err instanceof ProofTimeoutError
          ? `het model deed er langer dan ${Math.round(timeoutMs / 1000)} seconden over (die grens staat in beheer)`
          : 'het model liep vast tijdens het antwoorden'
    }

    results.push({ id: task.id, raw, reason })
    if (reason) {
      failed++
      reasons.push(describeFailure(task, reason, raw))
    } else {
      passed++
    }

    // Uitslag staat vast: genoeg geslaagd, of te veel gezakt om nog te halen.
    if (passed >= minPassed) return { ok: true, reasons: [], results }
    if (failed > total - minPassed) return { ok: false, reasons, results }
  }

  const ok = passed >= minPassed
  return { ok, reasons: ok ? [] : reasons, results }
}
