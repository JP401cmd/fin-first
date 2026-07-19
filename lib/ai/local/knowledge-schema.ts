import { z } from 'zod'

/**
 * Zod-schema's voor de kennisbank lokale AI (fase K1) — SINGLE SOURCE van de
 * validatie. Los van de route (`app/api/admin/local-knowledge/route.ts`) zodat
 * ook de startset-tests er direct tegen kunnen valideren zonder een niet-handler
 * export uit een Next-route-bestand te forceren.
 */

// Categorie is vrije tekst (geen enum): de curatie in knowledge-starter-set.ts
// en de groepering in de beheer-UI zijn de single source voor welke labels
// daadwerkelijk gebruikt worden. `.default(...)` vangt items op die vóór de
// K1.1-uitbreiding zijn opgeslagen (nog zonder categorie/verloopvelden).
const DEFAULT_CATEGORIE = 'Algemeen'

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
  // Groepeer-veld voor het beheerscherm — vrije tekst, curatie bepaalt de set.
  categorie: z.string().trim().min(1).max(60).default(DEFAULT_CATEGORIE),
  // Verloop-tracking: wanneer voor het laatst inhoudelijk gecontroleerd, en
  // (optioneel) een curatie-datum waarop het item — vaak omdat het aan
  // wetgeving hangt die structureel kan wijzigen — herzien moet worden.
  // Beide zijn ISO-datumstrings; leeg/null = geen bekende controledatum
  // (evergreen begrip, bv. "wat is diversificatie").
  laatstGecontroleerd: z.string().max(40).default(''),
  controleerVoor: z.string().max(40).nullable().default(null),
})

export const LocalKnowledgePutSchema = z.object({
  items: z.array(LocalKnowledgeItemSchema).max(500),
})
