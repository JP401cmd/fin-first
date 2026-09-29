import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { KRANT_V1_CONTRACT_VERSIE, KRANT_V1_OPERATIES } from './contract'
import { bouwKrantOpenApi, krantOpenApiJson } from './contract-openapi'

/**
 * Drifttest (Krant 3A, ADR 0187): het gecommitte `docs/api/krant-v1.json` is
 * byte-gelijk aan wat lib/krant/contract.ts nu oplevert. De app-repo leest dat
 * bestand; loopt het achter, dan bouwt de app tegen een contract dat de server
 * niet meer spreekt.
 *
 * ROOD? Draai `npm run krant:openapi` en commit docs/api/krant-v1.json mee. Was
 * de wijziging brekend (iets weg, hernoemd of strenger), dan hoort hij niet in
 * v1 maar in /api/v2 — zie de kop van lib/krant/contract.ts.
 */

type Doc = {
  openapi: string
  info: { version: string }
  paths: Record<string, Record<string, { 'x-fase': number; operationId: string }>>
}

describe('docs/api/krant-v1.json', () => {
  it('is in sync met lib/krant/contract.ts (anders: npm run krant:openapi)', () => {
    const gecommit = readSourceLF('docs/api/krant-v1.json')
    expect(gecommit, 'docs/api/krant-v1.json loopt achter — draai `npm run krant:openapi`').toBe(krantOpenApiJson())
  })

  it('is deterministisch', () => {
    expect(krantOpenApiJson()).toBe(krantOpenApiJson())
  })

  it('is OpenAPI 3.1 met de contractversie en elke operatie, fase gemarkeerd', () => {
    const doc = bouwKrantOpenApi() as Doc
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info.version).toBe(KRANT_V1_CONTRACT_VERSIE)
    for (const op of KRANT_V1_OPERATIES) {
      const uit = doc.paths[op.pad]?.[op.methode]
      expect(uit?.operationId).toBe(op.operationId)
      expect(uit?.['x-fase']).toBe(op.fase)
    }
  })

  it('bevat geen $schema-sleutels of verwijzingen naar interne paden', () => {
    const json = krantOpenApiJson()
    expect(json).not.toContain('"$schema"')
    // "Supabase access token" in de beschrijving is publiek en bedoeld; interne paden en sleutels niet.
    expect(json).not.toMatch(/service_role|getServiceClient|lib\/supabase|SUPABASE_/i)
  })
})
