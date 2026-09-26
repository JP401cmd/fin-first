import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { readSourceLF } from './read-source'

/**
 * Test-hulp voor bron-scan-tests die niet aan één bestandsnaam mogen hangen.
 *
 * Een bron-scan op `horizon-client.tsx` breekt zodra dat bestand wordt
 * opgeknipt, ook als het gedrag gelijk blijft. Deze helper vraagt het
 * andersom: welke modules rendert een ROUTE (de `page.tsx`/`layout.tsx` van
 * een Next-route plus alles wat die via `import`/`export … from`/`import()`
 * binnenhalen)? Een invariant die daarop toetst ("deze route leest ?whatif",
 * "dit blok staat nog op /toekomst") overleeft een verhuizing van code naar
 * een ander bestand, zolang de route het nog steeds laadt.
 *
 * Bewust beperkt tot `app/` en `components/`: daar wonen de render- en
 * leesplekken; `lib/` volgen maakt de graaf tien keer zo groot zonder dat er
 * JSX of `useSearchParams` in staat. Testbestanden worden nooit gevolgd.
 */

const ROOT = process.cwd()

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function toRel(abs: string): string {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

/**
 * De `page.tsx`/`layout.tsx`-bestanden onder `routeDir` (bv. `app/(app)/toekomst`).
 *
 * @param opts.exactRoute  alleen de bestanden die de route ZELF bedienen: direct in
 *   `routeDir` of in een route-groep `(naam)/` daaronder (groepen voegen geen
 *   URL-segment toe). Zonder deze optie: alle subroutes erbij.
 */
export function routeEntryFiles(routeDir: string, opts: { exactRoute?: boolean } = {}): string[] {
  const abs = path.join(ROOT, routeDir)
  return walk(abs)
    .filter((f) => /[\\/](page|layout)\.tsx$/.test(f))
    .filter((f) => {
      if (!opts.exactRoute) return true
      const rel = path.relative(abs, f).replace(/\\/g, '/')
      return /^(\([^/]+\)\/)*(page|layout)\.tsx$/.test(rel)
    })
    .map(toRel)
    .sort()
}

function resolveSpecifier(fromAbs: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromAbs), spec)
  else return null
  const candidates = [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Alle modules (repo-relatief, `/`-gescheiden) die vanuit `entries` bereikbaar
 * zijn binnen `app/` en `components/`, de entries zelf inbegrepen.
 */
export function reachableModules(entries: readonly string[]): string[] {
  const seen = new Set<string>()
  const stack = entries.map((e) => path.join(ROOT, e))
  while (stack.length > 0) {
    const abs = stack.pop()!
    if (seen.has(abs)) continue
    seen.add(abs)
    const src = readSourceLF(abs)
    for (const m of src.matchAll(IMPORT_RE)) {
      const target = resolveSpecifier(abs, m[1] ?? m[2])
      if (!target) continue
      const rel = toRel(target)
      if (!/^(app|components)\//.test(rel)) continue
      if (/\.test\.tsx?$/.test(rel)) continue
      stack.push(target)
    }
  }
  return [...seen].map(toRel).sort()
}

/** Bron van een repo-relatief pad, LF-genormaliseerd. */
export function readRel(rel: string): string {
  return readSourceLF(path.join(ROOT, rel))
}

/**
 * Bron zonder commentaar, zodat een scan niet op uitleg-tekst matcht.
 * Blokcommentaar (ook JSX `{/* … *\/}`) en regelcommentaar dat na witruimte of
 * aan het regelbegin start — `https://…` in een string blijft dus staan.
 */
export function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[ \t])\/\/.*$/gm, '$1')
}
