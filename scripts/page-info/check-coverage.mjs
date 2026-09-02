#!/usr/bin/env node
/**
 * check-coverage — detector voor de info-knoppen (PageInfoButton/PAGE_INFO).
 *
 * Goedkope, statische scan over app/(app)/** en components/** die drie dingen
 * signaleert:
 *   1. missing    — een `getPageInfo('key'[, 'fallback'])`/`infoKey="key"` die
 *                    naar een key wijst die niet in PAGE_INFO bestaat.
 *   2. orphaned   — een PAGE_INFO-key waar geen enkele call site (meer) naar
 *                    verwijst.
 *   3. inlineLiterals — een `<PageInfoButton>`-aanroep waarvan de `content`-
 *                    prop niet via `getPageInfo(...)` loopt (omzeilt de
 *                    centrale bron).
 *
 * Zoals bij `check-heading-levels.mjs`: dit BEWIJST geen volledige dekking —
 * een key die alleen via een berekende (niet-literale) string wordt
 * doorgegeven, blijft onzichtbaar voor deze scan. Bedoeld als lichtgewicht
 * signaal voor de release-pijplijn en de `info-knoppen-actueel`-skill, niet
 * als sluitend bewijs.
 *
 * Bekende blinde vlek: een key die uitsluitend bereikt wordt via de
 * `getPageInfo(pathname, 'fallback')`-route — waarbij de PRIMAIRE key nooit
 * als losse letterlijke string ergens anders voorkomt — meldt hier als
 * "orphaned" terwijl hij prima live is (bv. `/toekomst/whatif`, bereikt via
 * de runtime-pathname-match in `whatif-header.tsx`, met `/horizon/whatif`
 * als enige letterlijke fallback). Controleer een gemelde orphan dus altijd
 * met de hand vóór je 'm verwijdert.
 *
 * Exit 0 = geen treffers. Exit 1 = missing of inlineLiterals gevonden.
 * `orphaned` alleen is een waarschuwing (exit blijft 0) — een key die je
 * bewust achterhoudt voor hergebruik is geen fout, maar wordt wel getoond.
 * Draai met `--json` voor machine-leesbare output.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app/(app)', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])
const CONTENT_FILE = 'lib/page-info-content.ts'

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      if (entry.endsWith('.test.tsx') || entry.endsWith('.test.ts')) continue
      out.push(full)
    }
  }
  return out
}

function loadPageInfoKeys() {
  const src = readFileSync(join(ROOT, CONTENT_FILE), 'utf8')
  const bodyMatch = src.match(/export const PAGE_INFO: Record<string, PageInfoContent> = \{([\s\S]*?)\n\}/)
  if (!bodyMatch) return []
  const body = bodyMatch[1]
  const keys = []
  const keyRe = /^\s*'([^']+)':\s*\{/gm
  let m
  while ((m = keyRe.exec(body))) keys.push(m[1])
  return keys
}

function scanFile(path, referenced, buttonSites) {
  const rel = relative(ROOT, path).split(sep).join('/')
  const src = readFileSync(path, 'utf8')

  // Literal keys referenced via getPageInfo('key') or getPageInfo(x, 'fallback')
  for (const m of src.matchAll(/getPageInfo\(\s*'([^']+)'/g)) referenced.add(m[1])
  for (const m of src.matchAll(/getPageInfo\([^,()]+,\s*'([^']+)'\s*\)/g)) referenced.add(m[1])
  // Literal keys threaded via an `infoKey="..."` prop (BelastingBoxPageHeader,
  // ToekomstSubpageShell) — these resolve to getPageInfo(infoKey) internally.
  for (const m of src.matchAll(/infoKey=["']([^"']+)["']/g)) referenced.add(m[1])

  // <PageInfoButton ...> (and its infoContent-threading wrappers PhaseIntro/
  // RegimeKaart/TipsActiesPage) call sites: flag only a genuine inline-literal
  // bypass — an object literal written directly in JSX (`content={{ ... }}`
  // or `infoContent={{ ... }}` — this is exactly where the six phase-modal
  // literals used to live before this migration). A bare identifier
  // (`content={pageInfoText}`) or a `getPageInfo(...)` call is fine even
  // though it isn't visible in this same tag: TypeScript already enforces the
  // `PageInfoContent` shape at the call site, and the identifier is
  // presumptively fed by `getPageInfo()` elsewhere in the file (this is the
  // app's `const pageInfoText = getPageInfo(pathname, 'fallback')` pattern
  // for embedded/reused client components).
  const tagRe = /<(?:PageInfoButton|PhaseIntro|RegimeKaart|TipsActiesPage)\b([\s\S]*?)(?:\/>|>)/g
  let tm
  while ((tm = tagRe.exec(src))) {
    const attrs = tm[1]
    const contentMatch = attrs.match(/(?:content|infoContent)=\{(\{[\s\S]*?\})\}/)
    if (!contentMatch) continue // no inline object literal — not this detector's concern
    const line = src.slice(0, tm.index).split('\n').length
    buttonSites.push({ file: rel, line, snippet: contentMatch[1].trim().slice(0, 80) })
  }
}

function main() {
  const asJson = process.argv.includes('--json')
  const pageInfoKeys = new Set(loadPageInfoKeys())
  const referenced = new Set()
  const inlineLiterals = []

  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  for (const f of files) scanFile(f, referenced, inlineLiterals)

  const missing = [...referenced].filter((k) => !pageInfoKeys.has(k)).sort()
  const orphaned = [...pageInfoKeys].filter((k) => !referenced.has(k)).sort()

  const result = { missing, orphaned, inlineLiterals }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else if (missing.length === 0 && orphaned.length === 0 && inlineLiterals.length === 0) {
    console.log('info-knoppen actueel, geen wijziging nodig.')
  } else {
    if (missing.length) {
      console.log(`Missing (referenced, geen PAGE_INFO-entry): ${missing.length}`)
      for (const k of missing) console.log(`  - ${k}`)
    }
    if (orphaned.length) {
      console.log(`Orphaned (PAGE_INFO-entry zonder verwijzing): ${orphaned.length}`)
      for (const k of orphaned) console.log(`  - ${k}`)
    }
    if (inlineLiterals.length) {
      console.log(`Inline-literal bypass (content omzeilt getPageInfo): ${inlineLiterals.length}`)
      for (const s of inlineLiterals) console.log(`  - ${s.file}:${s.line} — ${s.snippet}`)
    }
  }

  process.exit(missing.length > 0 || inlineLiterals.length > 0 ? 1 : 0)
}

main()
