#!/usr/bin/env node
/**
 * check-coverage — detector voor de begrippenlijst (`lib/glossary-data.ts`).
 *
 * Zusje van `scripts/page-info/check-coverage.mjs` (zelfde vorm, ander
 * bronbestand). Goedkope, statische scan over app/(app)/** en components/**
 * die twee dingen signaleert:
 *   1. missing  — een `<GlossaryTerm term="…">` of een `terms: […]`-chip in
 *                 `lib/page-info-content.ts` die naar een sleutel wijst die
 *                 niet in GLOSSARY_ENTRIES bestaat. Precies de bugklasse die
 *                 de noodreserve/noodfonds-naammismatch veroorzaakte.
 *   2. orphaned — een GLOSSARY_ENTRIES-sleutel zonder enige call site. Dat is
 *                 GEEN harde fout: nieuw jargon mag eerst als entry landen
 *                 vóórdat de koppeling (inline of chip) elders wordt gelegd —
 *                 zie UR3-13 §8 (F1 "glossary sluitend" vs. F2 "koppelingen").
 *                 Wordt getoond, niet geblokkeerd — net als bij page-info.
 *
 * BEWIJST GEEN volledige dekking (zelfde disclaimer als de page-info-scan):
 * een sleutel die alleen via een berekende (niet-literale) string wordt
 * doorgegeven, blijft onzichtbaar. Lichtgewicht signaal, geen sluitend bewijs.
 *
 * Exit 0 = geen `missing`. Exit 1 = missing gevonden. `orphaned` alleen is
 * een waarschuwing (exit blijft 0). Draai met `--json` voor machine-leesbare
 * output.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app/(app)', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])
const GLOSSARY_FILE = 'lib/glossary-data.ts'
const PAGE_INFO_FILE = 'lib/page-info-content.ts'

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

function loadGlossaryKeys() {
  const src = readFileSync(join(ROOT, GLOSSARY_FILE), 'utf8')
  const bodyMatch = src.match(/export const GLOSSARY_ENTRIES: Record<string, GlossaryEntry> = \{([\s\S]*?)\n\}/)
  if (!bodyMatch) return []
  const body = bodyMatch[1]
  const keys = []
  // Zowel bare identifiers (vrijheidstijd, Monte_Carlo) als quoted keys
  // ('eindstrategie_nu-stoppen') komen voor als top-level entry.
  const keyRe = /^\s{2}(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*)):\s*\{/gm
  let m
  while ((m = keyRe.exec(body))) keys.push(m[1] ?? m[2])
  return keys
}

function scanFile(path, referenced) {
  const src = readFileSync(path, 'utf8')
  // Per <GlossaryTerm …>-tag: een `explanation="…"` prop op dezelfde tag is
  // een bewuste bypass van de glossary-lookup (`text = explanation ?? GLOSSARY[term]`
  // in glossary-term.tsx) — zo'n `term` hoeft dus GEEN GLOSSARY_ENTRIES-entry
  // te hebben. Zonder deze uitzondering meldt de JSDoc-voorbeeldregel in
  // glossary-term.tsx zelf (`term="custom" explanation="…"`) als valse missing.
  for (const m of src.matchAll(/<GlossaryTerm\b([\s\S]*?)(?:\/>|>)/g)) {
    const attrs = m[1]
    const termMatch = attrs.match(/\bterm=\{?["']([^"']+)["']\}?/)
    if (!termMatch) continue
    if (/\bexplanation=/.test(attrs)) continue
    referenced.add(termMatch[1])
  }
}

function loadPageInfoTermRefs() {
  const src = readFileSync(join(ROOT, PAGE_INFO_FILE), 'utf8')
  const refs = new Set()
  for (const arrMatch of src.matchAll(/terms:\s*\[([^\]]*)\]/g)) {
    for (const m of arrMatch[1].matchAll(/'([^']+)'/g)) refs.add(m[1])
  }
  return refs
}

function main() {
  const asJson = process.argv.includes('--json')
  const glossaryKeys = new Set(loadGlossaryKeys())
  const referenced = new Set()

  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  for (const f of files) scanFile(f, referenced)
  for (const key of loadPageInfoTermRefs()) referenced.add(key)

  const missing = [...referenced].filter((k) => !glossaryKeys.has(k)).sort()
  const orphaned = [...glossaryKeys].filter((k) => !referenced.has(k)).sort()

  const result = { missing, orphaned }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else if (missing.length === 0 && orphaned.length === 0) {
    console.log('begrippenlijst dekt alle call sites en heeft geen ongebruikte entries.')
  } else {
    if (missing.length) {
      console.log(`Missing (verwezen, geen GLOSSARY_ENTRIES-entry): ${missing.length}`)
      for (const k of missing) console.log(`  - ${k}`)
    }
    if (orphaned.length) {
      console.log(`Orphaned (entry zonder call site — waarschuwing, geen blocker): ${orphaned.length}`)
      for (const k of orphaned) console.log(`  - ${k}`)
    }
  }

  process.exit(missing.length > 0 ? 1 : 0)
}

main()
