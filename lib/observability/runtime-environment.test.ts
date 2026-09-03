import { describe, it, expect } from 'vitest'
import {
  resolveRuntimeEnvironment,
  shouldPersistErrorLog,
} from './runtime-environment'

/**
 * De dev/prod-guard op error-logging heeft twee faalrichtingen, en de tweede is
 * de ergste:
 *
 *  1. te ruim  → lokale `next dev`-crashes landen in de productie-`error_logs`
 *                en /beheer/errors verliest zijn waarde als productiesignaal;
 *  2. te krap  → de guard staat óók in productie/preview dicht en de foutinbox
 *                wordt blind. Dat is een ernstiger defect dan de ruis.
 *
 * Deze suite legt daarom bewust de default vast: **loggen tenzij aantoonbaar
 * lokaal**. Elke omgeving die niet herkenbaar een ontwikkelaarsmachine is,
 * persisteert.
 */

describe('resolveRuntimeEnvironment', () => {
  it('VERCEL_ENV is leidend boven NODE_ENV', () => {
    // Een preview-deploy draait een productie-BUILD maar is geen productie.
    expect(
      resolveRuntimeEnvironment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }),
    ).toBe('preview')
    expect(
      resolveRuntimeEnvironment({ VERCEL_ENV: 'production', NODE_ENV: 'production' }),
    ).toBe('production')
    // `vercel dev` draait lokaal, ondanks welke NODE_ENV dan ook.
    expect(
      resolveRuntimeEnvironment({ VERCEL_ENV: 'development', NODE_ENV: 'production' }),
    ).toBe('development')
  })

  it('zonder VERCEL_ENV valt hij terug op NODE_ENV (self-hosted `next start`)', () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'production' })).toBe('production')
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'development' })).toBe('development')
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'test' })).toBe('development')
    expect(resolveRuntimeEnvironment({})).toBe('development')
  })

  it('een lege of onbekende VERCEL_ENV telt als niet-gezet, niet als development', () => {
    expect(
      resolveRuntimeEnvironment({ VERCEL_ENV: '', NODE_ENV: 'production' }),
    ).toBe('production')
    expect(
      resolveRuntimeEnvironment({ VERCEL_ENV: '   ', NODE_ENV: 'production' }),
    ).toBe('production')
    // Een toekomstige platformwaarde mag de inbox niet blind maken.
    expect(
      resolveRuntimeEnvironment({ VERCEL_ENV: 'staging', NODE_ENV: 'production' }),
    ).toBe('production')
  })
})

describe('shouldPersistErrorLog', () => {
  it('productie en preview loggen altijd — de inbox mag nooit blind worden', () => {
    expect(shouldPersistErrorLog({ VERCEL_ENV: 'production' })).toBe(true)
    expect(shouldPersistErrorLog({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(shouldPersistErrorLog({ NODE_ENV: 'production' })).toBe(true)
    expect(shouldPersistErrorLog({ VERCEL_ENV: 'staging', NODE_ENV: 'production' })).toBe(true)
  })

  it('alleen een aantoonbaar lokale omgeving logt niet', () => {
    expect(shouldPersistErrorLog({ NODE_ENV: 'development' })).toBe(false)
    expect(shouldPersistErrorLog({ VERCEL_ENV: 'development', NODE_ENV: 'production' })).toBe(false)
    expect(shouldPersistErrorLog({})).toBe(false)
  })
})
