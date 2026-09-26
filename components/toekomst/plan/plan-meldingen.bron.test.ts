/**
 * Bron-grendels op de meldingen boven de grafiek (blok I) na de verhuizing naar
 * `plan-meldingen.tsx` (fase 1, ADR 0179, kaart §5.1):
 * - tekort-lening (JSX-deel): gate op display, aria-live altijd gemount, geen inline copy
 * - bridge.status-compat: elke tekort-status die de bridge uitzendt heeft een blok
 * - nu-stoppen (statusblokken): één tekort-blok voor alle ankers, zonder AOW-belofte
 *
 * De detector, de copy-memo en `useDeficitNotice` blijven in de ouder; die helften
 * blijven op de ouder gepind.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-meldingen.tsx'))

describe('plan-meldingen — tekort-lening volgt de meldingen-conventie', () => {
  it("gated de zichtbare melding op display === 'expanded'", () => {
    expect(source).toContain("deficitLoanNotice && deficitDisplay === 'expanded'")
  })

  it('houdt de éérste aria-live-regio (tekort-lening) altijd gemount en kondigt minimaliseren sr-only aan', () => {
    const start = source.indexOf('<section role="status" aria-live="polite">')
    expect(start).toBeGreaterThan(-1)
    const regio = source.slice(start, source.indexOf('</section>', start))
    expect(regio).toContain("deficitDisplay === 'minimized'")
    expect(regio).toContain('className="sr-only"')
    expect(regio).toContain('stip naast de informatie-knop')
  })

  it('toont de minimaliseer-knop alleen waar de keuze onthouden wordt', () => {
    expect(source).toContain('{canMinimizeDeficit && (')
    expect(source).toContain('onClick={minimizeDeficitNotice}')
    expect(source).toContain('aria-label="Minimaliseren"')
  })

  it('schrijft de uitleg niet inline uit (die woont in deficit-loan-copy.ts)', () => {
    for (const zin of [
      'De leenperiode loopt van leeftijd',
      'Op het diepste punt staat er',
      'beweegt mee met je woonstrategie',
    ]) {
      expect(source).not.toContain(zin)
    }
  })

  it('rekent de tekort-lening niet zelf uit', () => {
    expect(source).not.toContain('detectDeficitLoanFromRows(')
    expect(source).not.toContain('buildDeficitLoanCopy(')
    expect(source).not.toContain('useDeficitNotice(')
  })
})

describe('plan-meldingen — statusblokken (nu-stoppen, bridge.status-compat)', () => {
  it('kent een blok voor elke tekort-status die de bridge voor een live anker uitzendt', () => {
    const uiStatussen = new Set([...source.matchAll(/kernelStatus\s*===\s*'([a-z_]+)'/g)].map((m) => m[1]))
    for (const s of ['anchor_shortfall', 'pension_shortfall', 'stop_now_shortfall']) {
      expect(uiStatussen.has(s), `geen blok voor '${s}'`).toBe(true)
    }
  })

  it('ÉÉN tekort-blok: de drie statussen in dezelfde conditie', () => {
    const start = source.indexOf("kernelStatus === 'anchor_shortfall'")
    const regel = source.slice(start, source.indexOf('\n', start))
    expect(regel).toContain("'pension_shortfall'")
    expect(regel).toContain("'stop_now_shortfall'")
  })

  it('dat blok noemt de AOW niet — het tekort kan er ook ná vallen', () => {
    const start = source.indexOf("kernelStatus === 'anchor_shortfall'")
    const blok = source.slice(start, start + 900)
    const jsx = blok.slice(0, blok.indexOf('</div>'))
    expect(jsx).not.toMatch(/AOW/)
    expect(jsx).toContain('ankerZin(ankerReach, ankerStop')
  })

  it("`reached_now` zegt onder een vast anker de bereik-zin, niet 'je kunt nu al stoppen'", () => {
    const start = source.indexOf("kernelStatus === 'reached_now'")
    expect(start).toBeGreaterThan(-1)
    const blok = source.slice(start, start + 1400)
    expect(blok).toContain('isFixedAnchorMode')
    expect(blok).toContain('ankerZin(')
  })
})
