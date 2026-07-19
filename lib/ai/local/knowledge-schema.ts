import { z } from 'zod'

/**
 * Zod-schema's voor de kennisbank lokale AI (fase K1) — SINGLE SOURCE van de
 * validatie. Los van de route (`app/api/admin/local-knowledge/route.ts`) zodat
 * ook de startset-tests er direct tegen kunnen valideren zonder een niet-handler
 * export uit een Next-route-bestand te forceren.
 */

// Eén kennisitem. `.trim()` vóór `.min(1)`: randspaties zijn geldig ná
// normalisatie, maar een puur-witruimte veld is leeg en wordt afgekeurd.
export const LocalKnowledgeItemSchema = z.object({
  id: z.string().uuid(),
  titel: z.string().trim().min(1).max(200),
  tekst: z.string().trim().min(1).max(8000),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  actief: z.boolean(),
  volgorde: z.number().int(),
  bijgewerkt: z.string().min(1).max(40),
})

export const LocalKnowledgePutSchema = z.object({
  items: z.array(LocalKnowledgeItemSchema).max(500),
})
