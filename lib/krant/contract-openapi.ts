// ── Van contract naar OpenAPI 3.1 (Krant 3A, ADR 0187) ──────────────────────
//
// Bouwt `docs/api/krant-v1.json` uit `lib/krant/contract.ts` met zod 4's
// `z.toJSONSchema` (JSON Schema 2020-12, de dialect van OpenAPI 3.1). Het
// gecommitte bestand is wat de broer-repo van de app leest (B17); het wordt
// geschreven door `npm run krant:openapi` en bewaakt door
// contract-openapi.test.ts (rood bij drift).
//
// Deterministisch: dezelfde schema's geven byte-hetzelfde JSON — geen
// tijdstempel, geen volgorde uit een Map of Set.
//
// PUUR: geen server-imports (de generator bundelt dit bestand met esbuild).

import { z } from 'zod'
import {
  KRANT_V1_CONTRACT_VERSIE,
  KRANT_V1_OPERATIES,
  foutSchema,
  type V1Operatie,
} from './contract'

type Json = Record<string, unknown>

function schema(s: z.ZodType, io: 'input' | 'output'): Json {
  const json = z.toJSONSchema(s, { io, target: 'draft-2020-12' }) as Json
  delete json.$schema
  return json
}

const FOUT_REF = { $ref: '#/components/schemas/Fout' }

function fout(beschrijving: string): Json {
  return { description: beschrijving, content: { 'application/json': { schema: FOUT_REF } } }
}

function queryParameters(query: z.ZodObject): Json[] {
  return Object.entries(query.shape).map(([naam, veld]) => {
    const optioneel = veld instanceof z.ZodOptional
    const binnen = optioneel ? (veld as z.ZodOptional<z.ZodType>).unwrap() : (veld as z.ZodType)
    return { name: naam, in: 'query', required: !optioneel, schema: schema(binnen, 'input') }
  })
}

function operatie(op: V1Operatie): Json {
  const responses: Json = {
    200: { description: 'OK', content: { 'application/json': { schema: schema(op.response, 'output') } } },
  }
  if (op.body || op.query) {
    responses[400] = fout(
      op.body
        ? 'Ongeldige invoer: schemafout (code validation_error) of geen geldige JSON (zonder code)'
        : 'Ongeldige queryparameter (bv. cursor of week); lees `error`, niet `code`',
    )
  }
  responses[401] = fout('Geen of ongeldige Bearer-token (code unauthorized)')
  responses[503] = fout('Inloggen tijdelijk niet te controleren (auth-server onbereikbaar); opnieuw proberen, niet uitloggen (code server_error)')
  const redenen = ['module nieuws ontbreekt', 'account geblokkeerd']
  if (op.methode !== 'get') redenen.push('het request draagt een Origin-header')
  if (op.extraWeigering) redenen.push(op.extraWeigering)
  responses[403] = fout(`Geen toegang: ${redenen.join('; ')} (code forbidden)`)
  responses[500] = fout('Serverfout; nooit details (code server_error)')

  return {
    operationId: op.operationId,
    summary: op.samenvatting,
    'x-fase': op.fase,
    ...(op.fase === 2 ? { description: 'Fase 2: gedefinieerd in het contract, de route volgt na de 1C-leesloader.' } : {}),
    ...(op.query ? { parameters: queryParameters(op.query) } : {}),
    ...(op.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: schema(op.body, 'input') } } } }
      : {}),
    responses,
  }
}

/** Het volledige OpenAPI-document van de Krant-API v1. */
export function bouwKrantOpenApi(): Json {
  const paths: Record<string, Json> = {}
  for (const op of KRANT_V1_OPERATIES) {
    paths[op.pad] = { ...(paths[op.pad] ?? {}), [op.methode]: operatie(op) }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'TriFinity Krant API',
      version: KRANT_V1_CONTRACT_VERSIE,
      description:
        'De native API van de Krant (ADR 0187). Authenticatie: Authorization: Bearer <Supabase access token>; geen cookies, geen CORS. ' +
        'Binnen v1 alleen toevoegingen; brekende wijzigingen gaan naar /api/v2. Gegenereerd uit lib/krant/contract.ts — niet met de hand bewerken.',
    },
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Fout: schema(foutSchema, 'output') },
    },
  }
}

/** Zoals het in docs/api/krant-v1.json staat: 2 spaties, LF, afsluitende newline. */
export function krantOpenApiJson(): string {
  return `${JSON.stringify(bouwKrantOpenApi(), null, 2)}\n`
}
