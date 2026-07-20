// ── Privacy-modus guard coverage — static scan (ADR 0043, FR-1.3) ───────────
//
// FR-1.3 (docs/requirements-lokale-categorisatie.md §4) requires a dynamic
// regression test that walks EVERY file with a `getModel(...)` call and
// confirms the privacy-gate is present where scope demands it — never a
// hardcoded route list that quietly rots as new AI routes appear.
//
// Scope A (ADR 0043 §Besluit 4, "aanvaard") — GEGROEID naar TWEE routes met
// ADR 0055 / docs/requirements-lokale-chat-overname.md (C2a): `profiles.
// privacy_mode` gates `/api/ai/categorize` ÉN `/api/ai/chat` (beide server-side
// 403, laag 3, decisive). Dit blijft geen Optie B (geen centrale, alle-routes-
// dekkende guard) — het is scope A die bewust van 1 naar 2 expliciet benoemde
// routes groeit. Alle overige getModel-consumenten blijven cloud-based,
// onaangeroerd door de toggle — zie requirements §2/§3.
//
// This module does two things:
//   1. Enumerates every real getModel-consumer file (an actual import of
//      `getModel` from '@/lib/ai/config', not a comment/string mention and
//      not the definition file itself).
//   2. Exposes an anchor check per gated route: does its source contain the
//      `privacy_mode_active` gate code BEFORE the getModel(...) call, i.e.
//      before any financial/transaction data reaches prompt construction?
//
// This is a coarse, source-level net — same spirit as ai-callsite-scan.ts
// (ADR 0035). It proves the guard's TEXTUAL presence and ordering, not that
// it's unreachable/dead code. Combine with the route-level unit/integration
// tests for exact behavioural coverage.

import * as fs from 'fs'
import * as path from 'path'

/**
 * The exact routes this (grown) scope-A guard must protect: categorize (ADR
 * 0043 §Besluit 4) + chat (ADR 0055 / C2a). Each must carry the
 * `privacy_mode_active` 403 anchor BEFORE its getModel(...) call. Adding a route
 * here is a conscious scope-A-grows decision, not a silent widening.
 */
export const PRIVACY_GATED_ROUTES = [
  'app/api/ai/categorize/route.ts',
  'app/api/ai/chat/route.ts',
] as const

/** The stable error code the gate returns — the anchor the scan looks for. */
export const PRIVACY_GATE_CODE = 'privacy_mode_active'

/** Directories walked for getModel-consumer files (repo-relative). */
const SCAN_DIRS = ['app', 'lib']

function walk(dir: string, onFile: (absPath: string) => void): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(abs, onFile)
    } else if (entry.isFile()) {
      onFile(abs)
    }
  }
}

/**
 * True if the source has a real `getModel` import from the canonical config
 * module — not a comment/string mention (e.g. "// ... getModel(supabase) ...").
 */
export function importsGetModel(source: string): boolean {
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@\/lib\/ai\/config['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (/\bgetModel\b/.test(m[1])) return true
  }
  return false
}

/** Repo-relative path (forward slashes) for an absolute path under root. */
function relOf(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

/**
 * Every file (repo-relative path) that genuinely imports+can-call `getModel`.
 * Excludes the definition file itself (`lib/ai/config.ts`) and test files —
 * a new entry here is a new AI-generation callsite and, per FR-1.3, a
 * conscious decision point: does scope A still hold, or does this callsite
 * need the privacy-gate too?
 */
export function collectGetModelConsumers(root: string = process.cwd()): string[] {
  const files: string[] = []
  for (const dir of SCAN_DIRS) {
    walk(path.join(root, dir), (abs) => {
      if (!abs.endsWith('.ts') && !abs.endsWith('.tsx')) return
      if (abs.endsWith('.test.ts') || abs.endsWith('.test.tsx')) return
      const rel = relOf(root, abs)
      if (rel === 'lib/ai/config.ts') return // the definition, not a consumer
      let src: string
      try {
        src = fs.readFileSync(abs, 'utf-8')
      } catch {
        return
      }
      if (importsGetModel(src)) files.push(rel)
    })
  }
  return files.sort()
}

/**
 * True if `source` (expected: the categorize route) contains the privacy-gate
 * anchor (`privacy_mode_active`) textually BEFORE its first `getModel(` call —
 * i.e. the 403 is returned before any transaction data reaches the model call
 * or prompt construction (FR-1.2: "vóórdat getModel() ... de promptopbouw
 * bereikt").
 */
export function hasPrivacyGateBeforeModelCall(source: string): boolean {
  const gateIdx = source.indexOf(PRIVACY_GATE_CODE)
  const callIdx = source.indexOf('getModel(')
  if (gateIdx === -1 || callIdx === -1) return false
  return gateIdx < callIdx
}
