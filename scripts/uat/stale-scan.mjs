#!/usr/bin/env node
/**
 * TriFinity — UAT-staleness-detector
 * ============================================================================
 * Zero-dependency Node ESM script (spiegelt scripts/architecture/generate.mjs).
 * Kruist een set gewijzigde bestanden tegen het `assertion.source`-veld van
 * elk UAT-acceptatiecriterium in lib/uat/acceptance/<zone>.ts — dat veld wijst
 * letterlijk naar het bronbestand (+ functie) dat het criterium toetst. Zo
 * bepaalt de release-pijplijn GOEDKOOP en DETERMINISTISCH welke acceptatie-
 * criteria mogelijk verouderd zijn door deze release, zonder ook maar iets uit
 * te voeren (uitvoeren = de /uat live-run).
 *
 *   node scripts/uat/stale-scan.mjs                 (of: npm run uat:stale)
 *   node scripts/uat/stale-scan.mjs --base=master   (diff-basis, default master)
 *   node scripts/uat/stale-scan.mjs lib/format.ts … (expliciete bestandslijst)
 *
 * Output: mensvriendelijke samenvatting → stderr; machine-JSON → stdout:
 *   { affectedCriteria: [{zone, workflow, scenarioId, matchedFiles, confidence}],
 *     newSurfaces:      [{path}],
 *     anyImpact:        boolean }
 *
 * `confidence` is 'symbol' | 'file' | 'unlikely' — de triage draait op SYMBOOL-
 * niveau waar dat kan (git's functiecontext per hunk) en valt terug op
 * bestandsniveau waar dat niet kan. Zie computeImpact voor de volledige regel;
 * kort: er wordt niets onderdrukt, alleen gesorteerd.
 *
 * De detector rapporteert alleen FEITEN. Het OORDEEL (criterium nog geldig /
 * bijschaven / nieuw scenario) ligt bij de `uat-docs-keeper`-agent, die de
 * release-poort dispatcht wanneer anyImpact = true.
 *
 * Tekst-scan (geen TS-import) is bewust: CLI-vriendelijk en dependency-vrij,
 * net als generate.mjs. `source` is vrije tekst — de heuristiek is een TRIAGE,
 * geen bewijs; de guard-test (test/uat-stale-scan.test.ts) borgt de matching.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const ACCEPTANCE_DIR = join(ROOT, 'lib', 'uat', 'acceptance')

// ── pure kern (importeerbaar door de guard-test) ────────────────────────────

const PATH_RE =
  /(?:app|lib|components|scripts|supabase|hooks|test)\/[A-Za-z0-9_\-./()[\]]+?\.(?:tsx?|mjs|cjs|sql)/g

/**
 * Haal bronverwijzingen uit een vrije-tekst `source`-string, MÉT de symbolen.
 *
 * `source` schrijft een verwijzing als `pad/naar/bestand.ts#symbool`, en een
 * keten van symbolen in hetzelfde bestand met plussen:
 * `lib/budget-rollover.ts#computeRollover + getEffectiveLimit + getPreviousPeriod`.
 *
 * De ketenregex eist dat een vervolgsymbool NIET door een `/` wordt gevolgd.
 * Zonder die eis slurpt `lib/a.ts#foo + lib/b.ts#bar` het pad-fragment `lib` op
 * als symbool van a.ts — een symbool dat nooit bestaat en dus nooit matcht,
 * waardoor het criterium stil op "waarschijnlijk niet geraakt" zou belanden.
 * Dat is precies de fout-negatief die deze scanner niet mag maken.
 *
 * Een bestand zonder `#`-suffix krijgt een lege symbolenlijst: dat betekent
 * "bestandsniveau", en dat is bewust het ruime gedrag (zie computeImpact).
 */
export function extractSourceRefs(source) {
  if (!source || typeof source !== 'string') return []
  const byFile = new Map()
  for (const m of source.matchAll(PATH_RE)) {
    const file = m[0].replace(/\\/g, '/')
    const rest = source.slice(m.index + m[0].length)
    const symbols = []
    const chain = rest.match(/^#([A-Za-z_$][\w$]*)((?:\s*\+\s*[A-Za-z_$][\w$]*(?![\w$/]))*)/)
    if (chain) {
      symbols.push(chain[1])
      if (chain[2]) for (const s of chain[2].matchAll(/[A-Za-z_$][\w$]*/g)) symbols.push(s[0])
    }
    const prev = byFile.get(file)
    if (prev) {
      // Zelfde bestand twee keer genoemd: symbolen samenvoegen. Noemt één van
      // de twee het bestand zónder symbool, dan wint bestandsniveau — die
      // verwijzing zegt immers "ergens in dit bestand".
      if (!symbols.length || !prev.length) byFile.set(file, [])
      else for (const s of symbols) if (!prev.includes(s)) prev.push(s)
    } else {
      byFile.set(file, symbols)
    }
  }
  return [...byFile.entries()].map(([file, symbols]) => ({ file, symbols }))
}

/**
 * Alleen de bestandspaden uit een `source`-string (zonder `#functie`-suffix).
 * Blijft bestaan als smalle publieke vorm naast extractSourceRefs.
 */
export function extractSourceFiles(source) {
  return extractSourceRefs(source).map((r) => r.file)
}

/**
 * Lees de symboolnaam uit de functiecontext die git achter een hunk-header zet
 * (`@@ -a,b +c,d @@ <context>`). Git kiest daarvoor de dichtstbijzijnde regel
 * bóven de hunk die op kolom 0 begint — voor TypeScript is dat in de praktijk
 * de omsluitende top-level declaratie.
 *
 * Geeft null als er niets herkenbaars staat; de aanroeper behandelt dat als
 * "onbekend" en valt terug op bestandsniveau.
 */
export function symbolFromFuncContext(context) {
  if (!context || typeof context !== 'string') return null
  const decl = context.match(
    /\b(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  )
  if (decl) return decl[1]
  // Objectmethode of los `naam(` / `naam:` / `naam =` op kolom 0.
  const bare = context.match(/^\s*([A-Za-z_$][\w$]*)\s*[(:=]/)
  return bare ? bare[1] : null
}

/**
 * Parse de criteria uit één acceptance-bestand via tekst-scan. Splitst op de
 * object-sleutel `workflow: '<...>'` (met aanhalingsteken, zodat proza in
 * commentaar niet mee-splitst) en leest per criterium workflow/scenarioId/source.
 */
export function extractCriteria(text, zone) {
  const out = []
  const markers = [...text.matchAll(/workflow\s*:\s*['"`]/g)].map((m) => m.index)
  for (let i = 0; i < markers.length; i++) {
    const slice = text.slice(markers[i], i + 1 < markers.length ? markers[i + 1] : text.length)
    const workflow = (slice.match(/workflow\s*:\s*['"`]([^'"`]+)['"`]/) || [])[1]
    if (!workflow) continue
    const scenarioId = (slice.match(/scenarioId\s*:\s*['"`]([^'"`]+)['"`]/) || [])[1] || null
    const sm = slice.match(/source\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/)
    const sourceStr = sm ? (sm[1] ?? sm[2] ?? sm[3] ?? '') : ''
    const sourceRefs = extractSourceRefs(sourceStr)
    out.push({ zone, workflow, scenarioId, sourceRefs, sourceFiles: sourceRefs.map((r) => r.file) })
  }
  return out
}

/**
 * Bereken de UAT-impact van een set gewijzigde bestanden.
 * - affectedCriteria: criteria waarvan een `source`-bestand in de diff zit.
 * - newSurfaces: nieuwe/gewijzigde app-pagina's of API-routes die door GEEN
 *   enkel criterium worden gedekt (mogelijk nieuw scenario nodig).
 *
 * ## Waarom er een `confidence` op elk criterium staat
 *
 * Bestandsniveau alléén is te grof. Een criterium dat `lib/format.ts#x` toetst
 * werd geraakt zodra ér iets in `lib/format.ts` veranderde — ook als dat een
 * heel andere functie was. In de praktijk gaf dat vijf vals alarm op zes
 * treffers, en vals alarm dat vaak genoeg terugkomt leert de lezer de melding
 * te negeren. Dát is het echte risico van een te ruime detector.
 *
 * De vierde parameter `changedSymbols` (bestand → gewijzigde symboolnamen,
 * afgeleid uit de functiecontext in git's hunk-headers) maakt de triage
 * tweetraps:
 *
 *   'symbol'   — een symbool uit `source` zit aantoonbaar in de diff. Kijk hier eerst.
 *   'file'     — het bestand is geraakt, maar we weten niet welk symbool
 *                (verwijzing zonder `#`, nieuw bestand, of git gaf geen context).
 *   'unlikely' — we kennen de gewijzigde symbolen én geen ervan is het symbool
 *                uit `source`. Waarschijnlijk niet verouderd.
 *
 * Cruciaal: 'unlikely' wordt wél gerapporteerd en telt gewoon mee in
 * `anyImpact`. Er valt niets stil weg. De winst zit in de SORTERING, niet in
 * het onderdrukken — een gemist verouderd criterium (fout-negatief) is hier
 * duurder dan een overbodige melding, want daarmee ship je een acceptatie-
 * criterium dat niet meer beschrijft wat de code doet.
 */
export function computeImpact(criteria, changedFiles, appSurfaces, changedSymbols) {
  const changed = new Set((changedFiles || []).map((f) => f.replace(/\\/g, '/')))
  const symbolsFor = (file) => {
    if (!changedSymbols) return null
    const v = changedSymbols instanceof Map ? changedSymbols.get(file) : changedSymbols[file]
    if (!v) return null
    const arr = v instanceof Set ? [...v] : v
    return arr.length ? arr : null
  }
  const referenced = new Set()
  const affectedCriteria = []
  for (const c of criteria) {
    const refs = c.sourceRefs || (c.sourceFiles || []).map((file) => ({ file, symbols: [] }))
    for (const r of refs) referenced.add(r.file)
    const hits = refs.filter((r) => changed.has(r.file))
    if (!hits.length) continue

    let symbolHit = false
    let allResolved = true
    for (const r of hits) {
      const cs = symbolsFor(r.file)
      // Geen symbool in `source`, of geen symboolinfo uit git: onbeslisbaar.
      // Dan blijft het bestandsniveau — bewust ruim, nooit 'unlikely'.
      if (!r.symbols.length || !cs) {
        allResolved = false
        continue
      }
      if (r.symbols.some((s) => cs.includes(s))) symbolHit = true
    }
    const confidence = symbolHit ? 'symbol' : allResolved ? 'unlikely' : 'file'

    affectedCriteria.push({
      zone: c.zone,
      workflow: c.workflow,
      scenarioId: c.scenarioId,
      matchedFiles: hits.map((r) => r.file),
      confidence,
    })
  }
  const newSurfaces = (appSurfaces || [])
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !referenced.has(f))
    .map((path) => ({ path }))
  return { affectedCriteria, newSurfaces, anyImpact: affectedCriteria.length > 0 || newSurfaces.length > 0 }
}

// ── CLI (alleen bij directe aanroep; niet bij import in de test) ─────────────

/** Zone-bronbestanden = <zone>.ts, exclusief types/-checks/.engine.test. */
export function isZoneAcceptanceFile(name) {
  return (
    name.endsWith('.ts') &&
    !name.endsWith('.engine.test.ts') &&
    !name.endsWith('-checks.ts') &&
    name !== 'types.ts'
  )
}

function loadAllCriteria() {
  let files = []
  try { files = readdirSync(ACCEPTANCE_DIR) } catch { return [] }
  const all = []
  for (const name of files.filter(isZoneAcceptanceFile)) {
    const zone = name.replace(/\.ts$/, '').toUpperCase()
    let text = ''
    try { text = readFileSync(join(ACCEPTANCE_DIR, name), 'utf8') } catch { continue }
    all.push(...extractCriteria(text, zone))
  }
  return all
}

function git(args) {
  // stderr expliciet dempen: op Windows roept elke diff een reeks
  // "LF will be replaced by CRLF"-waarschuwingen op die de samenvatting van
  // deze scanner volledig ondersneeuwt (en een PowerShell-aanroep met 2>&1
  // zelfs op exit 255 laat vallen). De uitkomst hangt er niet van af.
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

function getChangedFiles(base) {
  const argFiles = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  if (argFiles.length) return argFiles
  const set = new Set()
  const add = (out) => { for (const l of out.split('\n')) { const t = l.trim(); if (t) set.add(t) } }
  add(git(['diff', '--name-only', `${base}...HEAD`]))
  add(git(['diff', '--name-only']))
  add(git(['diff', '--name-only', '--cached']))
  for (const l of git(['status', '--porcelain']).split('\n')) {
    const m = l.match(/^\?\?\s+(.+)$/)
    if (m) set.add(m[1].trim())
  }
  return [...set]
}

/**
 * Bepaal per bestand welke SYMBOLEN in de diff zitten, uit de functiecontext
 * die git achter elke hunk-header zet. `-U0` houdt de hunks strak om de
 * werkelijke wijziging heen, zodat de context de omsluitende declaratie is.
 *
 * Geeft null als git niets opleverde (geen repo, of een expliciete
 * bestandslijst op de CLI): de aanroeper valt dan terug op bestandsniveau —
 * dezelfde ruime uitkomst als vóór deze verfijning.
 */
export function changedSymbolsByFile(runGit, base) {
  const map = new Map()
  let sawHunk = false
  const scan = (out) => {
    let current = null
    for (const line of (out || '').split('\n')) {
      if (line.startsWith('+++ b/')) {
        current = line.slice(6).trim()
        if (current === '/dev/null') current = null
        else if (!map.has(current)) map.set(current, new Set())
        continue
      }
      if (!line.startsWith('@@')) continue
      sawHunk = true
      const close = line.indexOf('@@', 2)
      if (close === -1 || !current) continue
      const symbol = symbolFromFuncContext(line.slice(close + 2))
      if (symbol) map.get(current).add(symbol)
    }
  }
  scan(runGit(['diff', '-U0', `${base}...HEAD`]))
  scan(runGit(['diff', '-U0']))
  scan(runGit(['diff', '-U0', '--cached']))
  return sawHunk ? map : null
}

function isAppSurface(f) {
  const p = f.replace(/\\/g, '/')
  return /^app\/.*\/page\.tsx$/.test(p) || /^app\/api\/.*\/route\.ts$/.test(p)
}

function main() {
  const baseFlag = process.argv.find((a) => a.startsWith('--base='))
  const base = baseFlag ? baseFlag.split('=')[1] : 'master'
  const changed = getChangedFiles(base)
  const criteria = loadAllCriteria()
  // Bij een expliciete bestandslijst op de CLI is er geen diff om symbolen uit
  // te lezen; dan blijft het bestandsniveau (ruim), wat het veilige gedrag is.
  const changedSymbols = changedSymbolsByFile(git, base)
  const impact = computeImpact(criteria, changed, changed.filter(isAppSurface), changedSymbols)

  process.stderr.write(`\nUAT-staleness — ${changed.length} gewijzigde bestand(en) t.o.v. ${base}\n`)
  if (!impact.anyImpact) {
    process.stderr.write('  ✓ Geen UAT-impact: geen acceptatiecriterium wijst naar gewijzigde code en geen nieuw gebruikersoppervlak.\n\n')
  } else {
    const likely = impact.affectedCriteria.filter((a) => a.confidence !== 'unlikely')
    const unlikely = impact.affectedCriteria.filter((a) => a.confidence === 'unlikely')
    const perZone = (list) => {
      const byZone = {}
      for (const a of list) (byZone[a.zone] ??= []).push(a.workflow)
      return Object.entries(byZone)
    }
    if (likely.length) {
      const exact = likely.filter((a) => a.confidence === 'symbol').length
      process.stderr.write(
        `  ⚠ ${likely.length} acceptatiecriteria mogelijk verouderd (${exact} met een geraakte functie):\n`,
      )
      for (const [zone, wfs] of perZone(likely)) process.stderr.write(`     ${zone}: ${wfs.join(', ')}\n`)
    }
    if (unlikely.length) {
      process.stderr.write(
        `  · ${unlikely.length} criteria wijzen naar een gewijzigd bestand, maar niet naar een gewijzigde functie — waarschijnlijk niet verouderd:\n`,
      )
      for (const [zone, wfs] of perZone(unlikely)) process.stderr.write(`     ${zone}: ${wfs.join(', ')}\n`)
    }
    if (impact.newSurfaces.length) {
      process.stderr.write(`  ⚠ ${impact.newSurfaces.length} nieuw/ongedekt gebruikersoppervlak:\n`)
      for (const s of impact.newSurfaces) process.stderr.write(`     ${s.path}\n`)
    }
    process.stderr.write('\n  → Dispatch `uat-docs-keeper`: werk de acceptatiecriteria/flows bij (NIET uitvoeren — dat is /uat).\n\n')
  }
  process.stdout.write(JSON.stringify(impact, null, 2) + '\n')
}

const invokedDirectly = (process.argv[1] || '').replace(/\\/g, '/').endsWith('scripts/uat/stale-scan.mjs')
if (invokedDirectly) main()
