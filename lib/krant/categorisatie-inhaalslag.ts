// ── Categorisatie-inhaalslag (puur) ─────────────────────────────────
//
// Zolang de ochtendhartslag vers is (lib/krant/ochtend-hartslag.ts), slaat de
// news-ingest-cron de categorisatie over en bewaart hij de rij met category
// null. Een Claude-sessie haalt die rijen in met exact de cron-prompt
// (`CATEGORISATIE_SYSTEM_PROMPT` + `bouwCategorisatiePrompt`) en exact de
// cron-invoer (bron_kop, bron_fragment geknipt op
// CATEGORISATIE_FRAGMENT_MAX_TEKENS, source_name). Dezelfde velden worden
// geschreven: category, summary, potential_impact.
//
// Verschil met de duiding: de categorisatie kent geen controlepoort. De
// grens is de schema-toets (vaste categorielijst, niet-lege strings met een
// maximumlengte), plus — omdat hier een agent met bestandstoegang schrijft —
// de geheim-toets en een verbod op links. Een rij die intussen wél een
// categorie kreeg, wordt niet overschreven.
//
// Sinds de review van 29 sep categoriseert de cron gewoon zelf (de live
// /nieuws-editie leest de summary). Deze inhaalslag is voor rijen die door een
// storing zonder categorie bleven.

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CATEGORISATIE_SYSTEM_PROMPT, bouwCategorisatiePrompt, categorizedArticleSchema } from '@/lib/news-enrich'
import { knipTekens } from '@/lib/news-html'
import { CATEGORISATIE_FRAGMENT_MAX_TEKENS } from '@/lib/news-ingest'
import { bevatGeheim } from './geheim-toets'

export const CATEGORISATIE_INHAALSLAG_VERSIE = 1

/** Kolommen die de inhaalslag leest. */
export const CATEGORISATIE_KOLOMMEN = 'id, bron_kop, bron_fragment, source_name, category'

export interface CategorisatieRij {
  id: string
  bron_kop: string | null
  bron_fragment: string | null
  source_name: string | null
  category: string | null
}

/** Eén artikel in de uitvoer: het cron-item zonder index. */
export const categorisatieItemSchema = categorizedArticleSchema.shape.items.element
  .omit({ index: true })
  .extend({
    // Lengtegrenzen (security-run 29 sep): 2–3 zinnen en een korte impact.
    summary: z.string().trim().min(1).max(600),
    potentialImpact: z.string().trim().min(1).max(300),
  })
  .strict()

/** Een samenvatting of impact noemt nooit een link: die komt nooit uit de cron-prompt en is een phishingpad. */
const LINK = /https?:\/\/|www\./i

export type CategorisatieItem = z.infer<typeof categorisatieItemSchema>

export interface CategorisatieBatchArtikel {
  id: string
  prompt: string
  /** sha256 van precies de invoer die de prompt draagt; wijzigt hij, dan wordt er niet geschreven. */
  invoerSha256: string
}

export interface CategorisatieBatch {
  versie: number
  soort: 'categorisatie'
  gemaakt: string
  systemPrompt: string
  schema: unknown
  artikelen: CategorisatieBatchArtikel[]
}

/** De invoer zoals de cron hem aan `categorizeArticles` geeft. */
function invoer(rij: CategorisatieRij) {
  return {
    title: rij.bron_kop ?? '',
    summary: knipTekens(rij.bron_fragment ?? '', CATEGORISATIE_FRAGMENT_MAX_TEKENS),
    sourceName: rij.source_name ?? '',
  }
}

function invoerSha(rij: CategorisatieRij): string {
  const i = invoer(rij)
  return createHash('sha256').update(JSON.stringify([i.title, i.summary, i.sourceName]), 'utf8').digest('hex')
}

export function bouwCategorisatieBatch(rijen: readonly CategorisatieRij[], nu: Date): CategorisatieBatch {
  return {
    versie: CATEGORISATIE_INHAALSLAG_VERSIE,
    soort: 'categorisatie',
    gemaakt: nu.toISOString(),
    systemPrompt: CATEGORISATIE_SYSTEM_PROMPT,
    schema: z.toJSONSchema(categorisatieItemSchema),
    artikelen: rijen.map((r) => ({ id: r.id, prompt: bouwCategorisatiePrompt([invoer(r)]), invoerSha256: invoerSha(r) })),
  }
}

export type CategorisatieOordeel =
  | { id: string; uitkomst: 'gecategoriseerd'; item: CategorisatieItem }
  | { id: string; uitkomst: 'afgewezen'; code: 'schema' | 'geheim' | 'link' }
  | { id: string; uitkomst: 'overgeslagen'; reden: 'geen-uitvoer' | 'verdwenen' | 'al-gecategoriseerd' | 'invoer-gewijzigd' }

/** Beoordeel één uitvoer tegen de ACTUELE rij. */
export function beoordeelCategorisatie(
  artikel: CategorisatieBatchArtikel,
  rij: CategorisatieRij | null,
  uitvoer: unknown,
  /** Zie lib/krant/geheim-toets.ts; het script geeft `geheimenUitEnv(process.env)` mee. */
  geheimen: readonly string[] = [],
): CategorisatieOordeel {
  const id = artikel.id
  if (uitvoer === null || uitvoer === undefined) return { id, uitkomst: 'overgeslagen', reden: 'geen-uitvoer' }
  if (bevatGeheim(uitvoer, geheimen)) return { id, uitkomst: 'afgewezen', code: 'geheim' }
  if (!rij) return { id, uitkomst: 'overgeslagen', reden: 'verdwenen' }
  if (rij.category !== null) return { id, uitkomst: 'overgeslagen', reden: 'al-gecategoriseerd' }
  if (invoerSha(rij) !== artikel.invoerSha256) return { id, uitkomst: 'overgeslagen', reden: 'invoer-gewijzigd' }
  const p = categorisatieItemSchema.safeParse(uitvoer)
  if (!p.success) return { id, uitkomst: 'afgewezen', code: 'schema' }
  if (LINK.test(p.data.summary) || LINK.test(p.data.potentialImpact)) return { id, uitkomst: 'afgewezen', code: 'link' }
  return { id, uitkomst: 'gecategoriseerd', item: p.data }
}

/** De kolommen die de cron zou schrijven. */
export function categorisatieVelden(item: CategorisatieItem) {
  return { category: item.category, summary: item.summary, potential_impact: item.potentialImpact }
}

export function telCategorisatieOordelen(oordelen: readonly CategorisatieOordeel[]): Record<string, number> {
  const telling: Record<string, number> = {}
  for (const o of oordelen) {
    const sleutel = o.uitkomst === 'gecategoriseerd' ? o.uitkomst : o.uitkomst === 'afgewezen' ? `afgewezen:${o.code}` : `overgeslagen:${o.reden}`
    telling[sleutel] = (telling[sleutel] ?? 0) + 1
  }
  return telling
}
