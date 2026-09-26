/**
 * Security 🟢-4 (C3 punt 11): `profileError` gaat via de katern-layout als prop naar de
 * browser (RSC-payload). Hij droeg de rauwe PostgREST-`code` en -`message` — schema- en
 * policy-details die de client niet hoort te zien. De client leest alleen of er een fout
 * was (`PlanGegevensmelding` toont een eigen tekst); de echte fout logt de loader
 * server-side (`[horizon-data-loader] Profile query failed: …`), in de geest van
 * `serverError` (lib/api/respond.ts).
 */
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { PROFIEL_FOUT_CLIENT, profielFoutVoorClient } from './raw-data-loader'

describe('profielFoutVoorClient', () => {
  it('geen fout → null', () => {
    expect(profielFoutVoorClient(null)).toBeNull()
  })

  it('een PostgREST-fout → de generieke tekst, zonder code of message', () => {
    const uit = profielFoutVoorClient({ code: '42501', message: 'permission denied for table profiles' })
    expect(uit).toBe(PROFIEL_FOUT_CLIENT)
    expect(uit).not.toMatch(/42501|permission|profiles/)
  })
})

describe('raw-data-loader — de fout zelf blijft op de server', () => {
  const src = readSourceLF('lib/horizon/raw-data-loader.ts')

  it('profileError komt uit profielFoutVoorClient, niet uit een eigen template', () => {
    expect(src).toMatch(/profileError: profielFoutVoorClient\(profileResult\.error\)/)
    expect(src).not.toMatch(/profileError:[^\n]*profileResult\.error\.(code|message)/)
  })

  it('de echte fout wordt server-side gelogd met een grep-bare tag', () => {
    expect(src).toMatch(/console\.error\(\s*`\[horizon-data-loader\] Profile query failed:/)
  })
})
