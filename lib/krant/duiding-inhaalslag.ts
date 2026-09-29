// ── Handmatige duiding-inhaalslag: de pure kern ─────────────────────────────
//
// Soms loopt de duidingswachtrij achter (na een DUIDING_VERSIE-bump, na een
// providerstoring). De cron duidt nieuwste eerst, hoogstens 60 per dag, dus een
// afgesloten week komt als laatste. Deze module laat een Claude-sessie die
// achterstand inhalen, zonder de poort te omzeilen:
//
//   1. EXPORT — per wachtend artikel exact de prompt die de cron zou sturen
//      (`buildDuidingSystemPrompt` + `buildDuidingPrompt`), met de hash van de
//      grondslag. Geen tweede prompt, geen eigen grondslag.
//   2. De sessie schrijft per artikel een duiding in het modelschema
//      (`duidingModelSchema`), of null ("sla over").
//   3. BEOORDELEN — dezelfde zod-parse die generateObject doet, dan dezelfde
//      `controleerDuiding` met dezelfde meta (`bereidDuidingVoor`), tegen de
//      ACTUELE rij. Is de grondslag intussen veranderd (backfill), dan wordt de
//      duiding niet gebruikt.
//   4. SCHRIJVEN — alleen 'geduid', via `schrijfDuidingUitkomst` (geconditioneerd
//      op een wachtende status, dus veilig naast de cron). Een afwijzing wordt
//      NIET geschreven: de rij blijft 'wacht' en de cron of een volgende
//      inhaalslag probeert het opnieuw. Een handmatige fout mag geen artikel
//      definitief afwijzen.
//
// Herkomst: `meta.model = HANDMATIG_MODEL_ID`, zodat de meting en beheer een
// handmatige duiding van een cron-duiding kunnen onderscheiden.
//
// PUUR: geen IO. Het script scripts/krant/duiding-inhaalslag.ts doet de
// lezingen en schrijfacties.

import { z } from 'zod'
import { duidingModelSchema, DUIDING_VERSIE, HANDMATIG_MODEL_ID } from './duiding-schema'
import { controleerDuiding } from './duiding-controles'
import { bevatGeheim } from './geheim-toets'
import {
  bereidDuidingVoor,
  buildDuidingPrompt,
  buildDuidingSystemPrompt,
  type WachtendArtikel,
} from './duiding'

/** De modelnaam in `meta.model` van een handmatige duiding (canoniek in duiding-schema). */
export { HANDMATIG_MODEL_ID }

export const INHAALSLAG_VERSIE = 1

export interface InhaalslagBatchArtikel {
  id: string
  /** De user-prompt, exact zoals de cron hem zou sturen. */
  prompt: string
  /** sha256 van de grondslag op het moment van export. */
  grondslagSha256: string
}

export interface InhaalslagBatch {
  versie: typeof INHAALSLAG_VERSIE
  duidingVersie: number
  gemaakt: string
  /** De systeemprompt van de duiding, één keer voor alle artikelen. */
  systemPrompt: string
  /** Het JSON-schema waar elke duiding aan moet voldoen (afgeleid van `duidingModelSchema`). */
  schema: unknown
  artikelen: InhaalslagBatchArtikel[]
  /** Artikelen zonder eigen grondslag: niet te duiden, blijven 'wacht'. */
  zonderGrondslag: string[]
}

/** Bouw de batch die de sessie duidt. */
export function bouwInhaalslagBatch(artikelen: readonly WachtendArtikel[], nu: Date): InhaalslagBatch {
  const batch: InhaalslagBatch = {
    versie: INHAALSLAG_VERSIE,
    duidingVersie: DUIDING_VERSIE,
    gemaakt: nu.toISOString(),
    systemPrompt: buildDuidingSystemPrompt(),
    schema: z.toJSONSchema(duidingModelSchema),
    artikelen: [],
    zonderGrondslag: [],
  }
  for (const a of artikelen) {
    const voorbereiding = bereidDuidingVoor(a, HANDMATIG_MODEL_ID)
    if (!voorbereiding) {
      batch.zonderGrondslag.push(a.id)
      continue
    }
    batch.artikelen.push({
      id: a.id,
      prompt: buildDuidingPrompt(a, voorbereiding.tekst),
      grondslagSha256: voorbereiding.meta.grondslagSha256,
    })
  }
  return batch
}

export type HandmatigOordeel =
  | { id: string; uitkomst: 'geduid'; duiding: unknown; fout: string | null }
  | { id: string; uitkomst: 'afgewezen'; code: string }
  | { id: string; uitkomst: 'overgeslagen'; reden: 'geen-uitvoer' | 'niet-meer-wachtend' | 'grondslag-gewijzigd' | 'geen-grondslag' }

/**
 * Beoordeel één handmatige duiding tegen de ACTUELE rij. `rij` null = de rij
 * wacht niet meer (de cron was sneller, of hij is teruggetrokken).
 */
export function beoordeelHandmatig(
  batchArtikel: InhaalslagBatchArtikel,
  rij: WachtendArtikel | null,
  uitvoer: unknown,
  /** Zie lib/krant/geheim-toets.ts; het script geeft `geheimenUitEnv(process.env)` mee. */
  geheimen: readonly string[] = [],
): HandmatigOordeel {
  const id = batchArtikel.id
  if (uitvoer === null || uitvoer === undefined) return { id, uitkomst: 'overgeslagen', reden: 'geen-uitvoer' }
  if (bevatGeheim(uitvoer, geheimen)) return { id, uitkomst: 'afgewezen', code: 'geheim' }
  if (!rij) return { id, uitkomst: 'overgeslagen', reden: 'niet-meer-wachtend' }
  const voorbereiding = bereidDuidingVoor(rij, HANDMATIG_MODEL_ID)
  if (!voorbereiding) return { id, uitkomst: 'overgeslagen', reden: 'geen-grondslag' }
  if (voorbereiding.meta.grondslagSha256 !== batchArtikel.grondslagSha256) {
    return { id, uitkomst: 'overgeslagen', reden: 'grondslag-gewijzigd' }
  }
  // Dezelfde validatie als generateObject aan de modelkant doet: schema-fout
  // = afgewezen met code 'schema' (en dan wordt er niets geschreven).
  const geparsed = duidingModelSchema.safeParse(uitvoer)
  if (!geparsed.success) return { id, uitkomst: 'afgewezen', code: 'schema' }
  const oordeel = controleerDuiding(geparsed.data, voorbereiding.controleBron, voorbereiding.meta)
  if (!oordeel.ok) return { id, uitkomst: 'afgewezen', code: oordeel.code }
  return { id, uitkomst: 'geduid', duiding: oordeel.duiding, fout: oordeel.fout }
}

/** De velden die bij een geslaagde handmatige duiding worden geschreven (zelfde vorm als de cron). */
export function geduidVelden(oordeel: Extract<HandmatigOordeel, { uitkomst: 'geduid' }>): Record<string, unknown> {
  return {
    duiding: oordeel.duiding,
    duiding_status: 'geduid',
    duiding_versie: DUIDING_VERSIE,
    duiding_fout: oordeel.fout,
  }
}

/** Telling voor het rapport. */
export function telOordelen(oordelen: readonly HandmatigOordeel[]): Record<string, number> {
  const t: Record<string, number> = {}
  for (const o of oordelen) {
    const sleutel = o.uitkomst === 'afgewezen' ? `afgewezen:${o.code}` : o.uitkomst === 'overgeslagen' ? `overgeslagen:${o.reden}` : 'geduid'
    t[sleutel] = (t[sleutel] ?? 0) + 1
  }
  return t
}
