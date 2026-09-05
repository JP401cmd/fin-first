import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BANK_CONNECT_HREF,
  BANK_CONNECT_PROVIDER,
  BANK_CONNECT_SAFETY_LONG,
  BANK_CONNECT_SAFETY_SHORT,
  BANK_CONNECT_VERBODEN_FRAGMENTEN,
} from './bank-connect-copy'

const ROOT = process.cwd()

/**
 * De oppervlakken die de uitnodiging tot koppelen dragen. Ze moeten de
 * constante consumeren — niet een eigen formulering. Precies dat uiteenlopen
 * (vijf varianten op vijf plekken, vijf plekken zonder zin) was de bevinding.
 */
const CONSUMENTEN = [
  'lib/coach-suggestions.ts',
  'app/api/next-steps/route.ts',
  'components/app/app-setup/configs/budgetteren.config.tsx',
  'components/overview/transacties/transactie-tijdlijn.tsx',
  'components/app/cash-account-view.tsx',
  'components/overview/koppel-rekening-banner.tsx',
  'components/app/budget-koppel-nudge.tsx',
  'app/(app)/mijn/koppelingen/koppelingen-client.tsx',
  'app/(app)/core/cash/connect/page.tsx',
]

describe('bank-connect-copy — één veiligheidszin voor alle uitnodigingen', () => {
  it('noemt in beide lengtes waar je inlogt en wat wij niet kunnen', () => {
    for (const zin of [BANK_CONNECT_SAFETY_SHORT, BANK_CONNECT_SAFETY_LONG]) {
      expect(zin).toMatch(/eigen bank/)
      expect(zin).toMatch(/wachtwoord/)
      expect(zin).toMatch(/meelezen/)
      expect(zin).toMatch(/nooit betalen/)
    }
  })

  it('belooft niets wat de koppeling niet waarmaakt', () => {
    for (const zin of [BANK_CONNECT_SAFETY_SHORT, BANK_CONNECT_SAFETY_LONG]) {
      const lower = zin.toLowerCase()
      for (const verboden of BANK_CONNECT_VERBODEN_FRAGMENTEN) {
        expect(lower).not.toContain(verboden)
      }
    }
  })

  it('houdt de korte zin kort genoeg voor een knop-onderregel', () => {
    expect(BANK_CONNECT_SAFETY_SHORT.length).toBeLessThanOrEqual(140)
    expect(BANK_CONNECT_SAFETY_LONG.length).toBeGreaterThan(
      BANK_CONNECT_SAFETY_SHORT.length,
    )
  })

  it('noemt de gereguleerde partij alleen in de lange variant', () => {
    expect(BANK_CONNECT_SAFETY_LONG).toContain(BANK_CONNECT_PROVIDER)
    expect(BANK_CONNECT_SAFETY_LONG).toMatch(/PSD2/)
  })

  it('wijst naar de koppelpagina', () => {
    expect(BANK_CONNECT_HREF).toBe('/core/cash/connect')
  })

  it('wordt door elk uitnodigings-oppervlak geconsumeerd', () => {
    for (const bestand of CONSUMENTEN) {
      const bron = readFileSync(join(ROOT, bestand), 'utf8')
      expect(
        /BANK_CONNECT_SAFETY_(SHORT|LONG)/.test(bron),
        `${bestand} formuleert de veiligheidszin zelf in plaats van 'm te consumeren`,
      ).toBe(true)
    }
  })
})
