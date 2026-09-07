#!/usr/bin/env node
/**
 * TriFinity — Lokale-prompt-parity scanner
 * ============================================================================
 * Zero-dependency Node ESM script, gespiegeld op scripts/architecture/generate.mjs:
 * pure scan-functies → één object → writeFileSync naar een GECOMMITTE JSON, plus
 * een `--check`-modus die alleen staleness rapporteert (exit-code) zonder te
 * schrijven — symmetrisch met `arch:check`.
 *
 *   node scripts/ai-parity/scan.mjs           (of: npm run parity:scan)
 *   node scripts/ai-parity/scan.mjs --check   (of: npm run parity:check)
 *
 * Output (docs/ai-parity/):
 *   - parity.json   parity-rapport (commit dit → schone diffs; de beheerpagina
 *                   /beheer/kennisbank importeert het statisch)
 *
 * WAT HET METEN: de gecondenseerde lokale Fin-DNA (LOCAL_CHAT_DNA in
 * lib/ai/local/local-chat-prompt.ts) is een handmatig gecondenseerde afgeleide
 * van de cloud-bron-DNA (lib/ai/dna/base.ts + wil.ts). De GECOMMITTE baseline
 * staat in lib/ai/local/parity-manifest.json (per bron een sha256 + het
 * DNA-sub-budget). Deze scanner herhasht de bronnen LIVE en vergelijkt ze met de
 * opgeslagen sha256 → per-bron + overall `inSync`. Drift = een bron is gewijzigd
 * zonder dat de lokale DNA opnieuw is gecondenseerd/gebaselined (dat re-condense-
 * en-review-pad is de `lokale-prompt-parity`-skill, niet dit script).
 *
 * `--check` is de CI-poort, en is GELAAGD (zoals merkstem:check, ADR 0112):
 *   STALENESS (exit 1) — is het GECOMMITTE parity.json nog vers t.o.v. een verse
 *     herberekening? Zo niet (bron gewijzigd → andere live-hash/`inSync`), exit 1.
 *     Symmetrisch met arch:check; de scan-tijd (`generatedAt`) telt bewust NIET
 *     mee in de vergelijking (anders zou elke run "stale" lijken).
 *   DRIFT (waarschuwing → exit 1 na DRIFT_GRACE_DAYS) — een verse drift
 *     waarschuwt; een drift die langer dan één release blijft staan blokkeert.
 *     Zie DRIFT_GRACE_DAYS voor het waarom en de maatstaf.
 *
 * HASH-METHODE (moet exact gelijk zijn aan de baseline-generator van P1):
 * crypto.createHash('sha256').update(<RAW utf8 bestandsinhoud>).digest('hex') —
 * NIET de git-blob-hash. TOKEN-HEURISTIEK: Math.ceil(text.length / 4), dezelfde
 * heuristiek als lib/ai/local/knowledge-context.ts#estimateTokens.
 *
 * Elke stap is defensief: ontbreekt het manifest/bestand/patroon, dan degradeert
 * het script netjes (fallback + markering) i.p.v. te crashen.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve, sep } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT_DIR = join(ROOT, 'docs', 'ai-parity')
const DATA_FILE = join(OUT_DIR, 'parity.json')
const MANIFEST_FILE = join(ROOT, 'lib', 'ai', 'local', 'parity-manifest.json')
const PROMPT_FILE = join(ROOT, 'lib', 'ai', 'local', 'local-chat-prompt.ts')

// ── kleine fs-helpers (spiegel van generate.mjs) ─────────────────────────────
function read(file) {
  try {
    // CRLF→LF vóór alles: met autocrlf=true checkt git dezelfde blob op de ene
    // machine als LF en op de andere als CRLF uit. Zonder normalisatie is de
    // live-hash (en de token-telling) een functie van de LOKALE
    // regelinde-representatie en verklaart elke verse checkout het gecommitte
    // rapport onterecht stale — precies zo gevonden bij de release van 31 aug
    // 2026 (base.ts LF naast wil.ts CRLF in dezelfde boom).
    return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    return ''
  }
}
function rel(file) {
  return relative(ROOT, file).split(sep).join('/')
}
function warn(msg) {
  console.warn('  ! ' + msg)
}

// ── kern-heuristieken (moeten met de app-laag overeenkomen) ──────────────────
/**
 * sha256 van RAW utf8-inhoud — exact de methode waarmee P1 de baseline in
 * parity-manifest.json genereerde (node:crypto op de bestandsbytes, NIET de
 * git-blob-hash). Wijkt deze af, dan is de hele parity-vergelijking betekenisloos.
 */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Bepaal wat een opgeslagen baseline is ten opzichte van de bron.
 *
 * De checker hierboven hasht CRLF→LF genormaliseerd, maar de baselines in
 * parity-manifest.json zijn met de hand op de RAUWE bytes gegenereerd (de
 * `lokale-prompt-parity`-skill schreef daar een wegwerp-snippet voor). Op een
 * Windows-checkout kreeg elk CRLF-bestand daardoor een baseline die de checker
 * per constructie nooit kan reproduceren — permanente "drift" die niets met de
 * inhoud te maken heeft. Gemeten op 7 sep 2026: 4 van de 16 baselines.
 *
 * Dit onderscheid bestaat zodat `--rebaseline` alléén dát representatieprobleem
 * mag opruimen. Zou het blind alle hashes herschrijven, dan maakt het opruimen
 * van de valse positieven de ECHTE drift in dezelfde beweging stil — en juist
 * die moet zichtbaar blijven tot iemand de hercondensatie-afweging maakt.
 *
 * @returns 'in-sync' | 'crlf-artefact' | 'drift'
 */
export function classifyBaseline({ stored, headContent }) {
  if (!stored || typeof headContent !== 'string') return 'drift'
  const lf = headContent.replace(/\r\n/g, '\n')
  if (stored === sha256(lf)) return 'in-sync'
  if (stored === sha256(lf.replace(/\n/g, '\r\n'))) return 'crlf-artefact'
  return 'drift'
}

// ── drift-ondergrens (eigenaarsbesluit 7 sep 2026 — variant B) ───────────────
/**
 * `parity:check` is een STALENESS-poort: hij vergelijkt het gecommitte rapport
 * met een verse herberekening. `inSync` zit ín die signatuur, dus zolang beide
 * `false` zeggen is de poort groen — het rapport is vers, de drift blijft staan.
 * Zo stond op 7 sep 2026 een gecommitte parity.json met `inSync: false` terwijl
 * de pre-push-hook slaagde: er was app-breed geen enkele poort die op ECHTE
 * prompt-drift faalt.
 *
 * De eigenaar koos variant B mét harde ondergrens: drift WAARSCHUWT zolang ze
 * vers is en BLOKKEERT zodra ze langer dan één release blijft staan. Vanaf regel
 * één hard falen zou de push gijzelen tot de hercondensatie door de eigenaar-gate
 * is — de `lokale-prompt-parity`-skill shipt bewust niet automatisch en dat kan
 * dagen duren. Alleen waarschuwen leunt op precies de discipline die hier vijf
 * keer faalde. Dezelfde gelaagde lijn als `merkstem:check` (ADR 0112).
 *
 * MAATSTAF = kalenderdagen sinds de drift voor het eerst in het GECOMMITTE
 * rapport verscheen (`driftSince`). Een commit- of versietelling is hier geen
 * bruikbare proxy: `package.json#version` bewoog drie keer in de hele historie,
 * en een release is nu eens 5 en dan weer 46 commits. TriFinity shipt gemiddeld
 * elke één à twee dagen; veertien dagen is dus ruim één release — genoeg voor de
 * eigenaar-gate, te kort om drift een maand te laten liggen.
 */
const DRIFT_GRACE_DAYS = 14

/**
 * Stempelt `driftSince` op elke bron die uit sync staat, en draagt een bestaande
 * stempel uit het gecommitte rapport ONGEWIJZIGD over. Zonder dat overdragen zet
 * elke scan de klok terug en blijft drift eeuwig binnen de coulance — dan is de
 * ondergrens geen poort maar decoratie. Komt een bron weer in sync, dan valt de
 * stempel weg (drift die opnieuw ontstaat begint een nieuwe termijn).
 *
 * Muteert de verse artefacten ter plekke en geeft ze terug.
 *
 * @param {any[]} artefacts   verse artefacten (worden ter plekke aangevuld)
 * @param {any} committed     het gecommitte parity-rapport (of null)
 * @param {string} nowIso     stempel voor nieuw geconstateerde drift
 * @returns {any[]}
 */
export function carryDriftSince(artefacts, committed, nowIso) {
  const eerder = new Map()
  for (const a of Array.isArray(committed?.artefacts) ? committed.artefacts : []) {
    for (const s of Array.isArray(a?.sources) ? a.sources : []) {
      if (s?.inSync === false && typeof s?.driftSince === 'string' && s.driftSince) {
        eerder.set(`${a?.id ?? ''}|${s?.file ?? ''}`, s.driftSince)
      }
    }
  }
  for (const a of Array.isArray(artefacts) ? artefacts : []) {
    for (const s of Array.isArray(a?.sources) ? a.sources : []) {
      if (s.inSync) delete s.driftSince
      else s.driftSince = eerder.get(`${a?.id ?? ''}|${s?.file ?? ''}`) || nowIso
    }
  }
  return artefacts
}

/**
 * Deelt de gedrifte bronnen van een rapport in twee bakken: binnen de coulance
 * (waarschuwing) en erbuiten (blokkeert). Puur, zodat de ondergrens testbaar is
 * zonder werkboom en zonder de klok van de CI-machine.
 *
 * Een bron zónder leesbare stempel telt als 0 dagen: nooit vastgelegde drift
 * waarschuwt, blokkeert niet — de eerstvolgende scan stempelt hem alsnog. Zo kan
 * een ontbrekend veld nooit een push blokkeren die er niets aan kan doen.
 *
 * @param {{ report?: any, now?: Date | string, graceDays?: number }} [opts]
 * @returns {{ warn: any[], block: any[], graceDays: number }}
 */
export function driftGraceVerdict({ report, now = new Date(), graceDays = DRIFT_GRACE_DAYS } = {}) {
  const nu = now instanceof Date ? now.getTime() : Date.parse(String(now))
  const warn = []
  const block = []
  for (const a of Array.isArray(report?.artefacts) ? report.artefacts : []) {
    for (const s of Array.isArray(a?.sources) ? a.sources : []) {
      if (s?.inSync !== false) continue
      const stempel = typeof s?.driftSince === 'string' ? s.driftSince : ''
      const sinds = Date.parse(stempel)
      const dagen =
        Number.isNaN(sinds) || Number.isNaN(nu) ? 0 : Math.floor((nu - sinds) / 86_400_000)
      const entry = {
        artefact: typeof a?.id === 'string' ? a.id : '',
        label: typeof a?.label === 'string' ? a.label : (a?.id ?? ''),
        file: typeof s?.file === 'string' ? s.file : '',
        driftSince: stempel,
        dagen,
      }
      if (dagen > graceDays) block.push(entry)
      else warn.push(entry)
    }
  }
  return { warn, block, graceDays }
}

/**
 * Grove token-schatting (chars/4) — dezelfde heuristiek als
 * lib/ai/local/knowledge-context.ts#estimateTokens. Single source is die functie;
 * hier bewust her-geïmplementeerd omdat dit een zero-dependency .mjs-script is dat
 * geen TS-module importeert (net als generate.mjs zijn eigen scanners bezit).
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

/**
 * Extraheer de inhoud van `export const <CONSTANT> = \`...\`` uit een bronbestand —
 * de template-literal tussen de backticks. Faalt de extractie (hernoemd/
 * herstructureerd), dan retourneert dit `null` en valt de caller terug op de
 * manifest-baseline (geen crash).
 *
 * Was hardgecodeerd op LOCAL_CHAT_DNA; nu geparametriseerd omdat er meerdere
 * gecondenseerde artefacten naast elkaar bestaan (chat, briefing, rapport, …) die
 * elk hun eigen sub-budget en bron-hashes hebben.
 *
 * ESCAPES. De eerdere versie ging ervan uit dat een DNA-tekst geen backticks
 * bevat en stopte non-greedy bij de eerstvolgende backtick. Dat klopt niet meer:
 * de chat-DNA draagt sinds het fin-actie-contract een ` ```fin-actie `-fence, en
 * die staat als `\\``-escape in de literal. Zonder deze afhandeling zou de tekst
 * dáár afgekapt worden en de tokenschatting te laag uitvallen — precies het cijfer
 * waarop de sub-budget-poort besluit. We matchen daarom tot de eerste ONGE-escapete
 * backtick en draaien de escapes terug, zodat we de tokens tellen van wat het
 * MODEL ziet (drie tekens ```), niet van de broncode-notatie (zes tekens \\`\\`\\`).
 */
function extractConstantText(source, constant) {
  const m = source.match(new RegExp('export const ' + constant + ' = `((?:\\\\.|[^\\\\`])*)`'))
  if (!m) return null
  // Alleen de escapes terugdraaien die in een template-literal betekenisdragend
  // zijn (backtick, backslash, dollar). `\n` e.d. laten we met rust: de DNA-teksten
  // gebruiken echte regelovergangen, geen escape-sequenties.
  return m[1].replace(/\\([`\\$])/g, '$1')
}

// ── manifest (de opgeslagen baseline) ────────────────────────────────────────
function readManifest() {
  const raw = read(MANIFEST_FILE)
  if (!raw) {
    warn(`parity-manifest ontbreekt of is leeg: ${rel(MANIFEST_FILE)}`)
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    warn(`parity-manifest is geen geldige JSON: ${rel(MANIFEST_FILE)}`)
    return null
  }
}

// ── het parity-rapport samenstellen ──────────────────────────────────────────
/**
 * Bouw het parity-object. Pure functie: leest van schijf, muteert niets. De
 * scan-tijd (`generatedAt`) wordt hier gezet maar telt niet mee in de
 * staleness-signatuur (zie signature()).
 */
/**
 * Normaliseer de artefactenlijst uit het manifest.
 *
 * Er zijn inmiddels meerdere gecondenseerde prompt-artefacten (chat, en per
 * lokale functie die er een nodig heeft). Een ouder manifest kent alleen de
 * platte chat-vorm (dnaSubBudget/dnaEstimatedTokens/sources); die vertalen we
 * hier naar één artefact, zodat het script op beide vormen werkt.
 */
function readArtefacts(manifest) {
  if (Array.isArray(manifest.artefacts) && manifest.artefacts.length > 0) {
    return manifest.artefacts
  }
  return [
    {
      id: 'chat',
      label: 'Lokale chat-DNA',
      constant: 'LOCAL_CHAT_DNA',
      file: rel(PROMPT_FILE),
      subBudget: manifest.dnaSubBudget,
      estimatedTokens: manifest.dnaEstimatedTokens,
      sources: Array.isArray(manifest.sources) ? manifest.sources : [],
    },
  ]
}

/** Herhash één artefact live en meet zijn tokenverbruik tegen het sub-budget. */
function buildArtefact(a) {
  const id = typeof a?.id === 'string' ? a.id : ''
  const constant = typeof a?.constant === 'string' ? a.constant : ''
  const file = typeof a?.file === 'string' ? a.file : ''
  const subBudget = typeof a?.subBudget === 'number' ? a.subBudget : 0
  const baseline = typeof a?.estimatedTokens === 'number' ? a.estimatedTokens : 0

  // Per bron: herhash LIVE en vergelijk met de opgeslagen sha256.
  const sources = (Array.isArray(a?.sources) ? a.sources : [])
    .map((s) => {
      const srcFile = typeof s?.file === 'string' ? s.file : ''
      if (!srcFile) return null
      const storedSha256 = typeof s?.sha256 === 'string' ? s.sha256 : ''
      const raw = read(join(ROOT, srcFile))
      const liveSha256 = raw ? sha256(raw) : ''
      // Ontbreekt het bronbestand (lege raw → lege live-hash), dan is dat per
      // definitie drift: we kunnen de baseline niet bevestigen.
      const inSync = Boolean(storedSha256) && storedSha256 === liveSha256
      return { file: srcFile, storedSha256, liveSha256, inSync }
    })
    .filter(Boolean)

  // Live tokenschatting van de gecondenseerde tekst; bij extractie-falen de
  // manifest-baseline met een expliciete markering (geen stille aanname).
  const text = constant && file ? extractConstantText(read(join(ROOT, file)), constant) : null
  let estimatedTokens
  let tokenSource
  if (text != null) {
    estimatedTokens = estimateTokens(text)
    tokenSource = 'live'
  } else {
    estimatedTokens = baseline
    tokenSource = 'manifest-fallback'
    warn(`${constant || id} niet gevonden in ${file || '?'} — val terug op manifest-baseline`)
  }

  return {
    id,
    label: typeof a?.label === 'string' ? a.label : id,
    constant,
    file,
    subBudget,
    estimatedTokens,
    tokenSource,
    // Een artefact dat over zijn eigen sub-budget groeit, verdringt in het
    // contextvenster van 8192 tokens de gegevens waar het over moet praten.
    // Dat is een aparte faalmodus dan drift en verdient een eigen signaal.
    withinBudget: subBudget > 0 ? estimatedTokens <= subBudget : true,
    inSync: sources.length > 0 && sources.every((s) => s.inSync),
    sources,
  }
}

/** Het GECOMMITTE rapport, defensief gelezen (ontbrekend/kapot → null). */
function readCommitted() {
  if (!existsSync(DATA_FILE)) return null
  try {
    return JSON.parse(read(DATA_FILE) || 'null')
  } catch {
    return null
  }
}

function buildParity() {
  const now = new Date()
  const manifest = readManifest() || {}
  const artefacts = readArtefacts(manifest).map(buildArtefact)

  // Draag de drift-stempels van het gecommitte rapport over vóór het rapport
  // wordt samengesteld: `driftSince` moet de EERSTE constatering bewaren, niet
  // die van de laatste scan (zie carryDriftSince).
  carryDriftSince(artefacts, readCommitted(), now.toISOString())

  // Overall in-sync: elk artefact moet kloppen én er moet er minstens één zijn
  // (een leeg manifest is geen "alles in sync").
  const inSync = artefacts.length > 0 && artefacts.every((a) => a.inSync)
  const budgetsOk = artefacts.every((a) => a.withinBudget)

  // De chat-DNA blijft ook op het TOPNIVEAU staan. Niet uit gemakzucht: de
  // beheerpagina (/beheer/kennisbank) en de UAT-criteria lezen die velden
  // rechtstreeks. Ze verhuizen mee zodra die consumenten de artefactenlijst
  // gebruiken; tot die tijd is dit een bewuste, additieve uitbreiding.
  const primary = artefacts.find((a) => a.id === 'chat') || artefacts[0] || null

  return {
    generatedAt: now.toISOString(),
    manifestGeneratedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : '',
    inSync,
    budgetsOk,
    dnaSubBudget: primary ? primary.subBudget : 0,
    dnaEstimatedTokens: primary ? primary.estimatedTokens : 0,
    // 'live' = uit de bron geëxtraheerd; 'manifest-fallback' = extractie faalde.
    dnaTokenSource: primary ? primary.tokenSource : 'manifest-fallback',
    sources: primary ? primary.sources : [],
    artefacts,
  }
}

// ── staleness-signatuur (voor --check) ───────────────────────────────────────
/**
 * Canonieke, deterministische vorm van het parity-rapport ZONDER de scan-tijd —
 * gebruikt om een gecommit rapport te vergelijken met een verse herberekening.
 * Defensief opgebouwd zodat een oud/afwijkend gecommit rapport niet crasht.
 */
function signature(data) {
  const d = data && typeof data === 'object' ? data : {}
  const sources = Array.isArray(d.sources) ? d.sources : []
  const artefacts = Array.isArray(d.artefacts) ? d.artefacts : []
  // `driftSince` staat hier BEWUST niet in: het is een datumstempel, geen
  // structureel feit. Zou hij meetellen, dan verklaarde de eerste stempel het
  // gecommitte rapport meteen stale en zou elke scan een diff opleveren. De
  // ondergrens leest de stempel rechtstreeks uit het gecommitte rapport.
  const sig = (list) =>
    list.map((s) => ({
      file: typeof s?.file === 'string' ? s.file : '',
      storedSha256: typeof s?.storedSha256 === 'string' ? s.storedSha256 : '',
      liveSha256: typeof s?.liveSha256 === 'string' ? s.liveSha256 : '',
      inSync: Boolean(s?.inSync),
    }))

  return JSON.stringify({
    inSync: Boolean(d.inSync),
    budgetsOk: Boolean(d.budgetsOk),
    dnaSubBudget: typeof d.dnaSubBudget === 'number' ? d.dnaSubBudget : 0,
    dnaEstimatedTokens: typeof d.dnaEstimatedTokens === 'number' ? d.dnaEstimatedTokens : 0,
    dnaTokenSource: typeof d.dnaTokenSource === 'string' ? d.dnaTokenSource : '',
    manifestGeneratedAt: typeof d.manifestGeneratedAt === 'string' ? d.manifestGeneratedAt : '',
    sources: sig(sources),
    artefacts: artefacts.map((a) => ({
      id: typeof a?.id === 'string' ? a.id : '',
      constant: typeof a?.constant === 'string' ? a.constant : '',
      subBudget: typeof a?.subBudget === 'number' ? a.subBudget : 0,
      estimatedTokens: typeof a?.estimatedTokens === 'number' ? a.estimatedTokens : 0,
      tokenSource: typeof a?.tokenSource === 'string' ? a.tokenSource : '',
      withinBudget: Boolean(a?.withinBudget),
      inSync: Boolean(a?.inSync),
      sources: sig(Array.isArray(a?.sources) ? a.sources : []),
    })),
  })
}

// ── uitvoer ──────────────────────────────────────────────────────────────────
function printSummary(data) {
  const badge = data.inSync ? 'IN SYNC ✓' : 'DRIFT ✗'
  console.log(`\n  Lokale-prompt-parity — ${badge}${data.budgetsOk ? '' : '  (SUB-BUDGET OVERSCHREDEN ✗)'}`)
  for (const a of data.artefacts) {
    const over = a.withinBudget ? '' : '  ← boven budget'
    console.log(
      `\n  ${a.inSync ? '✓' : '✗'} ${a.label} — ${a.estimatedTokens}/${a.subBudget} tokens (${a.tokenSource})${over}`,
    )
    for (const s of a.sources) {
      const sinds = !s.inSync && s.driftSince ? `  — drift sinds ${s.driftSince.slice(0, 10)}` : ''
      console.log(`      ${s.inSync ? '✓' : '✗'} ${s.file}${sinds}`)
    }
  }
  console.log(`\n  ✓ ${rel(DATA_FILE)}\n`)
}

function runScan() {
  console.log('TriFinity lokale-prompt-parity — scannen...')
  const data = buildParity()
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
  printSummary(data)
}

// ── versheidscheck (CI-poort): het gecommitte parity.json mag niet stale zijn ─
// De gecommitte parity.json wordt door niets in CI/hooks vers gehouden. Deze
// --check-modus herberekent het rapport in-memory en vergelijkt de signatuur
// (zonder scan-tijd) met de gecommitte snapshot. Dit vangt exact het gat: een
// bron-DNA (base.ts/wil.ts) die wijzigt zonder een verse `npm run parity:scan`.
function checkFresh() {
  if (!existsSync(DATA_FILE)) {
    console.error(
      'parity:check — docs/ai-parity/parity.json ontbreekt. Draai `npm run parity:scan` en commit het resultaat.',
    )
    process.exit(1)
  }
  const committed = readCommitted()
  const fresh = buildParity()

  // ── laag 1 (waarschuwing): drift die er is, maar nog binnen de coulance ────
  // Bewust vóór de staleness-uitgang: is het rapport óók stale, dan wil je de
  // drift nog steeds op je scherm zien in plaats van pas na de volgende scan.
  const { warn: coulance, block: verlopen, graceDays } = driftGraceVerdict({ report: committed })
  if (coulance.length > 0) {
    console.warn(
      `\nparity:check — WAARSCHUWING: ${coulance.length} bron(nen) in drift; de lokale DNA is niet opnieuw gecondenseerd.`,
    )
    for (const d of coulance) {
      console.warn(
        `  • ${d.label} · ${d.file} — ${d.dagen} dag(en) in drift (blokkeert na ${graceDays})`,
      )
    }
    console.warn(
      '  Loop de hercondensatie-afweging langs de `lokale-prompt-parity`-skill (eigenaar-gate)\n' +
        '  en draai daarna `npm run parity:rebaseline -- --accept-drift`.',
    )
  }

  if (signature(committed) === signature(fresh)) {
    // ── laag 2 (hard): drift die een release heeft overleefd ─────────────────
    if (verlopen.length > 0) {
      console.error(
        `\nparity:check — GEBLOKKEERD: ${verlopen.length} bron(nen) staan langer dan ${graceDays} dagen in drift.\n`,
      )
      for (const d of verlopen) {
        console.error(
          `  • ${d.label} · ${d.file} — drift sinds ${d.driftSince.slice(0, 10)} (${d.dagen} dagen)`,
        )
      }
      console.error(
        '\n  De lokale DNA is een afgeleide van de cloud-bron-DNA; blijft die afwijken, dan\n' +
          '  antwoordt Fin on-device anders dan in de cloud. Hercondenseer via de\n' +
          '  `lokale-prompt-parity`-skill (met eigenaar-gate) en draai daarna\n' +
          '  `npm run parity:rebaseline -- --accept-drift`.\n',
      )
      process.exit(1)
    }
    console.log(
      `\nparity:check — parity-rapport is vers (structureel gelijk). ✓${
        coulance.length ? '  (drift: waarschuwing, zie boven)' : ''
      }\n`,
    )
    return
  }
  console.error('\nparity:check — docs/ai-parity/parity.json is STALE.\n')
  const c = JSON.parse(signature(committed))
  const f = JSON.parse(signature(fresh))
  if (c.inSync !== f.inSync) console.error(`  • inSync: gecommit ${c.inSync} → nu ${f.inSync}`)
  if (c.dnaEstimatedTokens !== f.dnaEstimatedTokens)
    console.error(`  • dnaEstimatedTokens: gecommit ${c.dnaEstimatedTokens} → nu ${f.dnaEstimatedTokens}`)
  // Loop óók de artefact-bronnen langs, niet alleen de top-level `sources`.
  // Stond hier eerder alleen `c.sources`, dan noemde de diagnose uitsluitend de
  // chat-bronnen en bleef een verschil onder briefing/rapport/aanbevelingen/
  // nieuws/rekenhulp onzichtbaar — je las "STALE" met één oorzaak terwijl er
  // meer speelden, en concludeerde ten onrechte dat het niet aan je eigen
  // wijziging lag. Ook een gewijzigde STORED-hash (een rebaseline) hoort hier
  // genoemd te worden, niet alleen een gewijzigde live-hash.
  const paren = [
    ...c.sources.map((s) => ['(top-level)', s]),
    ...c.artefacts.flatMap((a) => (a.sources ?? []).map((s) => [a.id, s])),
  ]
  const versGeindexeerd = new Map([
    ...f.sources.map((s) => [`(top-level)|${s.file}`, s]),
    ...f.artefacts.flatMap((a) => (a.sources ?? []).map((s) => [`${a.id}|${s.file}`, s])),
  ])
  for (const [label, cs] of paren) {
    const vers = versGeindexeerd.get(`${label}|${cs.file}`)
    if (!vers) continue
    if (cs.liveSha256 !== vers.liveSha256) {
      console.error(`  • ${label} · ${cs.file}: live-hash gewijzigd (bron is aangepast)`)
    }
    if (cs.storedSha256 !== vers.storedSha256) {
      console.error(`  • ${label} · ${cs.file}: baseline gewijzigd (manifest is gerebaselined)`)
    }
  }
  console.error('\nDraai `npm run parity:scan` en commit het bijgewerkte docs/ai-parity/parity.json.\n')
  process.exit(1)
}

// ── rebaseline: repareer de representatie, nooit stilzwijgend de inhoud ──────
// De baselines werden met de hand gegenereerd (skill-stap 3, "wegwerp-snippet")
// en dus op rauwe bytes; de checker normaliseert CRLF→LF. Deze modus laat
// generator en checker per constructie dezelfde methode gebruiken.
//
// Bewust vanuit HEAD en niet vanaf schijf: de werkboom is gedeeld met parallelle
// sessies, en een rebaseline vanaf schijf zou hun ONGECOMMITTE wijziging als
// nieuwe waarheid vastleggen. Een baseline hoort een gecommitte staat te zijn.
function headContent(file) {
  try {
    return execFileSync('git', ['show', `HEAD:${file}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 24,
    })
  } catch {
    return null
  }
}

function runRebaseline({ acceptDrift = false } = {}) {
  const manifest = JSON.parse(read(MANIFEST_FILE) || 'null')
  if (!manifest) {
    console.error('parity:rebaseline — lib/ai/local/parity-manifest.json ontbreekt of is onleesbaar.')
    process.exit(1)
  }

  const groups = [
    { label: '(top-level)', sources: manifest.sources },
    ...(manifest.artefacts ?? []).map((a) => ({ label: a.id, sources: a.sources })),
  ]

  const cache = new Map()
  const drift = []
  let genormaliseerd = 0
  let geaccepteerd = 0
  let inSync = 0

  for (const group of groups) {
    for (const s of group.sources ?? []) {
      if (!s?.file) continue
      if (!cache.has(s.file)) cache.set(s.file, headContent(s.file))
      const head = cache.get(s.file)
      const verdict = classifyBaseline({ stored: s.sha256, headContent: head })

      if (verdict === 'in-sync') {
        inSync++
      } else if (verdict === 'crlf-artefact') {
        s.sha256 = sha256(head.replace(/\r\n/g, '\n'))
        genormaliseerd++
        console.log(`  ~ ${group.label} · ${s.file} — regelinde-artefact genormaliseerd`)
      } else if (acceptDrift && typeof head === 'string') {
        s.sha256 = sha256(head.replace(/\r\n/g, '\n'))
        geaccepteerd++
        console.log(`  + ${group.label} · ${s.file} — ECHTE drift geaccepteerd (--accept-drift)`)
      } else {
        drift.push(`${group.label} · ${s.file}`)
      }
    }
  }

  // Herbereken de token-schatting per artefact. Die waarde is de FALLBACK die
  // `buildArtefact` gebruikt zodra de live-extractie faalt (hernoemde constante,
  // herstructurering); loopt hij achter, dan rapporteert het script bij zo'n
  // storing een stille onwaarheid. De skill vraagt hier expliciet om.
  //
  // Bewust van SCHIJF en niet uit HEAD — anders dan de bron-hashes hierboven.
  // Een baseline hoort een gecommitte staat te zijn (daarom HEAD), maar de
  // token-schatting beschrijft het artefact zoals het nu geschreven is, en dat
  // is juist de nog-ongecommitte hercondensatie waar deze run over gaat.
  let hermeten = 0
  for (const a of manifest.artefacts ?? []) {
    if (!a?.constant || !a?.file) continue
    const tekst = extractConstantText(read(join(ROOT, a.file)), a.constant)
    if (tekst == null) {
      warn(`token-schatting van '${a.id}' niet hermeten — constante ${a.constant} niet gevonden`)
      continue
    }
    const vers = estimateTokens(tekst)
    if (vers !== a.estimatedTokens) {
      console.log(`  # ${a.id} · tokenschatting ${a.estimatedTokens} → ${vers} (budget ${a.subBudget})`)
      a.estimatedTokens = vers
      hermeten++
    }
  }

  // Alleen schrijven als er daadwerkelijk iets wijzigt: een no-op-run mag geen
  // mtime-ruis of formatteringsdiff opleveren. `generatedAt` schuift mee, zodat
  // het manifest zelf vertelt wanneer de baselines voor het laatst bepaald zijn
  // (de SKILL vraagt daarom, en de rebaseline is nu het enige gereedschap dat ze
  // mag zetten).
  const gewijzigd = genormaliseerd + geaccepteerd + hermeten
  if (gewijzigd > 0) {
    manifest.generatedAt = new Date().toISOString()
    writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n')
  }

  console.log(
    `\nparity:rebaseline — ${inSync} in sync · ${genormaliseerd} genormaliseerd${
      acceptDrift ? ` · ${geaccepteerd} drift geaccepteerd` : ''
    } · ${drift.length} onaangeroerd\n`,
  )
  if (drift.length > 0) {
    console.log('  Echte inhoudelijke drift — NIET aangeraakt:')
    for (const d of drift) console.log(`    ✗ ${d}`)
    console.log(
      '\n  Dit is geen regelinde-kwestie: de bron is inhoudelijk gewijzigd sinds het\n' +
        '  artefact werd gecondenseerd. Loop de hercondensatie-afweging langs de\n' +
        '  `lokale-prompt-parity`-skill (met eigenaar-gate) en draai daarna\n' +
        '  `npm run parity:rebaseline -- --accept-drift`.\n',
    )
  }
  if (gewijzigd > 0) {
    console.log(`  ✓ ${rel(MANIFEST_FILE)}\n`)
    console.log('  Draai nu `npm run parity:scan` om het rapport bij te werken.\n')
  } else {
    console.log(`  = ${rel(MANIFEST_FILE)} ongewijzigd — niets te normaliseren.\n`)
  }
}

// Alleen draaien wanneer dit script zélf de entry point is. Zonder deze guard
// voert een `import` uit een test runScan() uit en overschrijft die het
// gecommitte parity.json met de staat van de werkboom — inclusief ongecommit
// werk van een parallelle sessie. Precies zo misgegaan op 7 sep 2026.
const isEntryPoint =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  if (process.argv.includes('--check')) checkFresh()
  else if (process.argv.includes('--rebaseline'))
    runRebaseline({ acceptDrift: process.argv.includes('--accept-drift') })
  else runScan()
}
