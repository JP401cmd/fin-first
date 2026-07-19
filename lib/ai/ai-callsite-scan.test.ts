// ── AI-callsite guardrail — vitest gate (ADR 0035) ──────────────────
//
// Runs the static sanitize-scan over the real source tree so a new
// unsanitized AI generation callsite fails CI, and unit-tests the pure
// detector against synthetic snippets.

import { describe, it, expect } from 'vitest'
import {
  scanAiCallsites,
  importsGenerationFn,
  importsLocalGeneration,
  importsSanitizeHelper,
  collectScannedFiles,
  AI_CALLSITE_ALLOWLIST,
} from './ai-callsite-scan'
import * as fs from 'fs'
import * as path from 'path'

describe('scanAiCallsites — every generation callsite sanitizes its input', () => {
  it('finds no unsanitized, non-allowlisted callsites', () => {
    const violations = scanAiCallsites()
    expect(
      violations,
      `Unsanitized AI callsite(s): ${violations.map((v) => v.file).join(', ')}`,
    ).toEqual([])
  })

  it('scans a non-trivial set of files (scope intact)', () => {
    expect(collectScannedFiles().length).toBeGreaterThan(10)
  })
})

describe('detector primitives', () => {
  it('detects a generation-fn import from the ai package', () => {
    expect(importsGenerationFn("import { generateObject } from 'ai'")).toBe(true)
    expect(importsGenerationFn("import { streamText, stepCountIs } from 'ai'")).toBe(true)
    expect(importsGenerationFn("import { tool } from 'ai'")).toBe(false)
    expect(importsGenerationFn("import { getModel } from '@/lib/ai/config'")).toBe(false)
  })

  it('detects the sanitize helper import', () => {
    expect(importsSanitizeHelper("import { sanitizeForAI } from '@/lib/ai/sanitize'")).toBe(true)
    expect(
      importsSanitizeHelper("import { sanitizeTransactions, type SanitizeOptions } from '@/lib/ai/sanitize'"),
    ).toBe(true)
    expect(importsSanitizeHelper("import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'")).toBe(false)
  })

  it('detects the on-device generation entrypoints from the litert-runtime', () => {
    // Categorisatie (loadModelSession) én de lokale chat (createChatSession).
    expect(importsLocalGeneration("import { loadModelSession } from './litert-runtime'")).toBe(true)
    expect(importsLocalGeneration("import { createChatSession } from '@/lib/ai/local/litert-runtime'")).toBe(true)
    expect(importsGenerationFn("import { createChatSession } from '@/lib/ai/local/litert-runtime'")).toBe(true)
    // Alleen de cache-helpers importeren is GEEN generatie-callsite.
    expect(importsLocalGeneration("import { isModelCached } from './litert-runtime'")).toBe(false)
  })

  it('would flag a dummy callsite that imports a generation fn but not sanitize', () => {
    const dummy = "import { generateObject } from 'ai'\nconst prompt = user.description"
    expect(importsGenerationFn(dummy) && !importsSanitizeHelper(dummy)).toBe(true)
  })
})

describe('allowlist integrity', () => {
  it('every allowlist entry still exists and is still a generation callsite', () => {
    const root = process.cwd()
    for (const entry of AI_CALLSITE_ALLOWLIST) {
      const abs = path.join(root, ...entry.file.split('/'))
      expect(fs.existsSync(abs), `missing: ${entry.file}`).toBe(true)
      const src = fs.readFileSync(abs, 'utf-8')
      expect(importsGenerationFn(src), `not a generation callsite anymore: ${entry.file}`).toBe(true)
      expect(entry.reason.trim().length).toBeGreaterThan(10)
    }
  })
})
