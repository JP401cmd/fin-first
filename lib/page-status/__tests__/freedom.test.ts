// lib/page-status/__tests__/freedom.test.ts
//
// Unit-tests voor de informatieve vrijheids-/pensioenbanner-builder
// (lib/page-status/freedom.ts). Puur, geen IO.

import { describe, it, expect } from 'vitest'
import { resolveFreedomBanner } from '../freedom'

describe('resolveFreedomBanner', () => {
  it('null wanneer nog niet financieel vrij', () => {
    expect(
      resolveFreedomBanner({ freedomPct: 80, currentAge: 40, fireAge: 55 }),
    ).toBeNull()
  })

  it('vrij (freedomPct 100, vóór AOW) → kind freedom, status neutral, framing free', () => {
    const info = resolveFreedomBanner({
      freedomPct: 100,
      currentAge: 45,
      fireAge: 45,
      strategy: 'deplete',
    })
    expect(info).not.toBeNull()
    expect(info!.kind).toBe('freedom')
    expect(info!.status).toBe('neutral')
    expect(info!.route).toBe('/overzicht')
    expect(info!.title).toBe('Financieel vrij')
    expect(info!.reason).toMatch(/financieel vrij/i)
    expect(info!.will.onderwerp.length).toBeGreaterThan(0)
  })

  it('pensioen-strategie → titel "Met pensioen"', () => {
    const info = resolveFreedomBanner({
      freedomPct: 100,
      currentAge: 67,
      fireAge: 67,
      strategy: 'pensioen',
    })
    expect(info).not.toBeNull()
    expect(info!.title).toBe('Met pensioen')
    expect(info!.reason).toMatch(/pensioen/i)
  })

  it('vrij via leeftijd voorbij fireAge → banner verschijnt', () => {
    const info = resolveFreedomBanner({
      freedomPct: 20,
      currentAge: 70,
      fireAge: 60,
      strategy: 'deplete',
      aowAge: 67,
    })
    expect(info).not.toBeNull()
    // 70 > AOW 67 → pensioen-framing.
    expect(info!.title).toBe('Met pensioen')
  })
})
