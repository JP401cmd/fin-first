import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * De wipe vóór de persona-seed krijgt de service-role mee (kaart "Accountreset
 * laat vragenlijstantwoorden staan"): RLS staat de eigenaar terecht niet toe
 * afgeronde vragenlijst-sessies, feedback, user_reports, net_worth_history en
 * de bucket-prefix zelf te wissen — zonder `{ service }` is die stap in
 * `deleteAllUserData` een stille no-op en houdt een hergeseed account de
 * vrije-tekstantwoorden van vóór de reset. Zelfde patroon als
 * `app/api/onboarding/reset/route.ts`; géén fullErase (reseed, geen verwijdering).
 * Bron-scan in de stijl van `app/api/admin/seed/route.test.ts`: de route streamt
 * en heeft geen gedrags-harnas; het gedrag zelf is bewezen in
 * `app/api/activate/route.test.ts`.
 */
describe('onboarding seed — de wipe krijgt de service-client mee', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readSourceLF(routePath)
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('importeert getServiceClient en geeft { service } door aan deleteAllUserData', () => {
    expect(codeOnly).toMatch(/import \{ getServiceClient \} from '@\/lib\/supabase\/service'/)
    expect(codeOnly).toMatch(/deleteAllUserData\(supabase, user\.id, progress, \{ service \}\)/)
    expect(codeOnly).not.toMatch(/fullErase/)
  })

  it('de env-guard staat vóór de aanroep (best-effort zonder service-key, zoals onboarding/reset)', () => {
    const guardIdx = codeOnly.indexOf('SUPABASE_SERVICE_ROLE_KEY')
    const wipeIdx = codeOnly.indexOf('deleteAllUserData(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(wipeIdx)
  })
})

describe('onboarding seed — foutpad lekt geen rauwe fouttekst de stream in (ADR 0044)', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const codeOnly = readSourceLF(routePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('stuurt de generieke tekst en logt onder tag onboarding-seed:POST', () => {
    expect(codeOnly).not.toMatch(/send\(\{ error: message \}\)/)
    expect(codeOnly).toMatch(/send\(\{ error: 'Er ging iets mis\. Probeer het later opnieuw\.' \}\)/)
    expect(codeOnly).toMatch(/\[onboarding-seed:POST\]/)
  })
})
