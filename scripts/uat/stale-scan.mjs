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
 *   { affectedCriteria: [{zone, workflow, scenarioId, matchedFiles}],
 *     newSurfaces:      [{path}],
 *     anyImpact:        boolean }
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

/**
 * Haal repo-relatieve bronbestanden uit een vrije-tekst `source`-string.
 * Herkent paden onder bekende top-mappen die eindigen op een code-extensie;
 * een `#functie`-suffix valt er vanzelf buiten (# staat niet in de klasse).
 */
export function extractSourceFiles(source) {
  if (!source || typeof source !== 'string') return []
  const re = /(?:app|lib|components|scripts|supabase|hooks|test)\/[A-Za-z0-9_\-./()[\]]+?\.(?:tsx?|mjs|cjs|sql)/g
  const found = source.match(re) || []
  return [...new Set(found.map((p) => p.replace(/\\/g, '/')))]
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
    out.push({ zone, workflow, scenarioId, sourceFiles: extractSourceFiles(sourceStr) })
  }
  return out
}

/**
 * Bereken de UAT-impact van een set gewijzigde bestanden.
 * - affectedCriteria: criteria waarvan een `source`-bestand in de diff zit.
 * - newSurfaces: nieuwe/gewijzigde app-pagina's of API-routes die door GEEN
 *   enkel criterium worden gedekt (mogelijk nieuw scenario nodig).
 */
export function computeImpact(criteria, changedFiles, appSurfaces) {
  const changed = new Set((changedFiles || []).map((f) => f.replace(/\\/g, '/')))
  const referenced = new Set()
  const affectedCriteria = []
  for (const c of criteria) {
    for (const f of c.sourceFiles) referenced.add(f)
    const matchedFiles = c.sourceFiles.filter((f) => changed.has(f))
    if (matchedFiles.length) {
      affectedCriteria.push({ zone: c.zone, workflow: c.workflow, scenarioId: c.scenarioId, matchedFiles })
    }
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
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }) } catch { return '' }
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

function isAppSurface(f) {
  const p = f.replace(/\\/g, '/')
  return /^app\/.*\/page\.tsx$/.test(p) || /^app\/api\/.*\/route\.ts$/.test(p)
}

function main() {
  const baseFlag = process.argv.find((a) => a.startsWith('--base='))
  const base = baseFlag ? baseFlag.split('=')[1] : 'master'
  const changed = getChangedFiles(base)
  const criteria = loadAllCriteria()
  const impact = computeImpact(criteria, changed, changed.filter(isAppSurface))

  process.stderr.write(`\nUAT-staleness — ${changed.length} gewijzigde bestand(en) t.o.v. ${base}\n`)
  if (!impact.anyImpact) {
    process.stderr.write('  ✓ Geen UAT-impact: geen acceptatiecriterium wijst naar gewijzigde code en geen nieuw gebruikersoppervlak.\n\n')
  } else {
    if (impact.affectedCriteria.length) {
      const byZone = {}
      for (const a of impact.affectedCriteria) (byZone[a.zone] ??= []).push(a.workflow)
      process.stderr.write(`  ⚠ ${impact.affectedCriteria.length} acceptatiecriteria wijzen naar gewijzigde bestanden:\n`)
      for (const [zone, wfs] of Object.entries(byZone)) process.stderr.write(`     ${zone}: ${wfs.join(', ')}\n`)
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
