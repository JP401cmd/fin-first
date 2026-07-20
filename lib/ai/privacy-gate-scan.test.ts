// ── Privacy-modus guard coverage — vitest gate (ADR 0043, FR-1.3) ───────────
//
// Runs the static scan over the real source tree so:
//   1. The scope-A promise (only /api/ai/categorize is privacy-gated) is
//      verified against actual source, not documentation.
//   2. A NEW getModel-consumer file changes the pinned count and fails with
//      a message pointing at the decision that must be made consciously
//      (ADR 0043 / requirements §3), instead of silently widening or eroding
//      the guarantee.

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  collectGetModelConsumers,
  importsGetModel,
  hasPrivacyGateBeforeModelCall,
  PRIVACY_GATED_ROUTES,
  PRIVACY_GATE_CODE,
} from './privacy-gate-scan'

// Snapshot at the time this test was written (2026-07). See docs/adr/
// 0043-lokale-transactiecategorisatie-desktop-assistief.md §Besluit 4 and
// docs/requirements-lokale-categorisatie.md §3 (scope-beslismemo A vs. B).
const KNOWN_GETMODEL_CONSUMERS = [
  'app/api/admin/news-ingest/route.ts',
  'app/api/ai/categorize/route.ts',
  'app/api/ai/chat/route.ts',
  'app/api/ai/recommendations/initial/route.ts',
  'app/api/ai/recommendations/route.ts',
  'app/api/news-ingest/cron/route.ts',
  'app/api/news/route.ts',
  'app/api/onboarding/suggest-budgets/route.ts',
  'app/api/pension/parse/route.ts',
  'app/api/report/route.ts',
  'app/api/subscriptions/advice/route.ts',
  'app/api/subscriptions/analyse-ai/route.ts',
  'app/api/subscriptions/detect-ai/route.ts',
  'app/api/whatif/suggest/route.ts',
  'lib/aangifte/extract-aangifte-data.ts',
  'lib/ai/build-calculator.ts',
  'lib/ai/extract-financial-data.ts',
  'lib/ai/screen-publish-metadata.ts',
  'lib/briefing/redactie.ts',
].sort()

describe('privacy-gate scan — scope A coverage (ADR 0043 + 0055, FR-1.3 / FR-C2a.7)', () => {
  it.each(PRIVACY_GATED_ROUTES)('%s has the privacy-gate anchor BEFORE the getModel() call', (route) => {
    const abs = path.join(process.cwd(), ...route.split('/'))
    expect(fs.existsSync(abs), `missing: ${route}`).toBe(true)
    const src = fs.readFileSync(abs, 'utf-8')
    expect(src.includes(PRIVACY_GATE_CODE), `gate anchor "${PRIVACY_GATE_CODE}" not found in ${route}`).toBe(true)
    expect(
      hasPrivacyGateBeforeModelCall(src),
      `privacy-gate must return 403 BEFORE getModel() is called in ${route} (FR-1.2 / FR-C2a.6) — ` +
        'financial/transaction data must never reach prompt construction when privacy_mode is active.',
    ).toBe(true)
  })

  it(
    'pins the total getModel-consumer count — a NEW entry means a new AI-generation ' +
      'callsite exists that scope A (ADR 0043) does not gate. Decide consciously: does ' +
      'the privacy-gate (or at minimum the /mijn/privacy toggle copy, which claims a ' +
      'narrow promise) need to move? See docs/requirements-lokale-categorisatie.md §3 ' +
      '(scope A vs. B) before updating KNOWN_GETMODEL_CONSUMERS in this test.',
    () => {
      const found = collectGetModelConsumers().sort()
      expect(found).toEqual(KNOWN_GETMODEL_CONSUMERS)
    },
  )

  it('scope A: no getModel-consumer OTHER than the gated routes carries the privacy-gate anchor', () => {
    // Confirms the guard is narrow-by-design (scope A: categorize + chat), not
    // accidentally present elsewhere and not silently expected elsewhere either
    // — a future Option-B migration should change this test deliberately.
    const root = process.cwd()
    const gatedSet = new Set<string>(PRIVACY_GATED_ROUTES)
    const others = collectGetModelConsumers(root).filter((f) => !gatedSet.has(f))
    const gated = others.filter((rel) => {
      const src = fs.readFileSync(path.join(root, ...rel.split('/')), 'utf-8')
      return src.includes(PRIVACY_GATE_CODE)
    })
    expect(gated, `unexpected privacy-gate anchor outside scope A: ${gated.join(', ')}`).toEqual([])
  })
})

describe('detector primitives', () => {
  it('detects a real getModel import, not a comment/string mention', () => {
    expect(importsGetModel("import { getModel } from '@/lib/ai/config'")).toBe(true)
    expect(importsGetModel("import { getModel, AIConfigError } from '@/lib/ai/config'")).toBe(true)
    expect(importsGetModel('// een model-call (getModel(supabase) ...)')).toBe(false)
    expect(importsGetModel("import { checkTierGate } from '@/lib/require-tier'")).toBe(false)
  })

  it('hasPrivacyGateBeforeModelCall requires both the anchor and correct ordering', () => {
    expect(hasPrivacyGateBeforeModelCall('if (x) return 403 // privacy_mode_active\nconst m = await getModel(x)')).toBe(true)
    expect(hasPrivacyGateBeforeModelCall('const m = await getModel(x) // privacy_mode_active later')).toBe(false)
    expect(hasPrivacyGateBeforeModelCall('const m = await getModel(x)')).toBe(false)
    expect(hasPrivacyGateBeforeModelCall('// privacy_mode_active mentioned, no call')).toBe(false)
  })
})
