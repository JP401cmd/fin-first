/**
 * Marktcheck-pil houdt haar label zolang de datawaarde er staat (B-025) — pin op
 * het verplaatste bestand `canvas-pills.tsx`.
 *
 * Nieuwe kopie van de assertion in `lib/fire-surface-consistency.test.ts`
 * ("de Marktcheck-pil houdt haar label…"), die nu nog `horizon-client.tsx` leest;
 * de integrator schrapt die daar bij het inpluggen van blok J.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const src = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'canvas', 'canvas-pills.tsx'))

describe('canvas-pills — Marktcheck-pil (B-025)', () => {
  it('draagt data-pill-keep onder exact de conditie waaronder de badge rendert', () => {
    expect(src).toMatch(
      /data-pill-keep=\{mcExpanded && \(mcPending \|\| mcFailed \|\| Boolean\(mcMarge\)\) \? '' : undefined\}/,
    )
  })

  it('valt niet terug op de machteloze class-truc', () => {
    expect(src).not.toMatch(/mcExpanded && !mcPending && mcMarge \? 'inline' : 'hidden sm:inline'/)
  })

  it('de doellijn-pil houdt label en delta samen zolang de delta er is', () => {
    expect(src).toContain("data-pill-keep={hasScenario && scenarioFireDeltaLabel ? '' : undefined}")
  })
})
