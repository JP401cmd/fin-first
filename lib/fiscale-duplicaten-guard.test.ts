import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { DGA_LENING_DREMPEL } from '@/lib/box2-data'

/**
 * Guard-suite voor de opruimronde "Fiscale duplicaten & afwijkende defaults".
 * Borgt dat de gedupliceerde fiscale constanten uit de consumenten zijn
 * verdwenen en dat ze uitsluitend via een import uit de canonieke bron komen.
 * Voorkomt dat de drift ooit terugkeert.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')

describe('AOW-bedragen — canonieke waarden per 1-7-2026 (SVB)', () => {
  it('constants.ts draagt de bijgewerkte SVB-bedragen', () => {
    expect(NL_AOW_MONTHLY).toBe(1581.55)
    expect(NL_AOW_MONTHLY_SAMENWONEND).toBe(1084.13)
  })

  it('geen losse 1558/1072-literals meer in horizon-data.ts', () => {
    const src = read('lib/horizon-data.ts')
    expect(src).not.toMatch(/\b1558\b/)
    expect(src).not.toMatch(/\b1072\b/)
  })

  it('geen losse 1558-literal meer in onboarding-horizon.tsx', () => {
    const src = read('components/onboarding/onboarding-horizon.tsx')
    expect(src).not.toMatch(/\b1558\b/)
    expect(src).not.toMatch(/\b1072\b/)
  })
})

describe('DGA-leningdrempel — één canonieke bron', () => {
  it('DGA_LENING_DREMPEL is de wettelijke €500.000-drempel', () => {
    expect(DGA_LENING_DREMPEL).toBe(500_000)
  })

  it('assets-client.tsx importeert de drempel i.p.v. een eigen 500.000-literal', () => {
    const src = read('components/core/assets-client.tsx')
    expect(src).toContain('DGA_LENING_DREMPEL')
    expect(src).not.toMatch(/\b500_?000\b/)
  })

  it('debt-form.tsx importeert de drempel i.p.v. een eigen 500.000-literal', () => {
    const src = read('components/app/core/debts/debt-form.tsx')
    expect(src).toContain('DGA_LENING_DREMPEL')
    expect(src).not.toMatch(/\b500_?000\b/)
  })
})

describe('box2-gecombineerde-druk — geen lokale tarief-literals', () => {
  it('importeert BOX2_PARAMS/VPB_PARAMS/BOX1_PARAMS en dupliceert geen tarieven', () => {
    const src = read('components/overview/belasting/box2-gecombineerde-druk.tsx')
    expect(src).toContain('BOX2_PARAMS')
    expect(src).toContain('VPB_PARAMS')
    expect(src).toContain('BOX1_PARAMS')
    // De oude lokale literals mogen niet meer als toewijzing bestaan.
    expect(src).not.toMatch(/=\s*0\.245\b/)
    expect(src).not.toMatch(/=\s*0\.31\b/)
    expect(src).not.toMatch(/=\s*0\.495\b/)
    expect(src).not.toMatch(/=\s*0\.258\b/)
  })
})
