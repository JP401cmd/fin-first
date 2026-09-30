// ── Het contract van de Krant-API v1 (Krant 3A, ADR 0187) ───────────────────
//
// De BRON van de native API: elke request- en responsvorm onder
// `/api/v1/krant/**` staat hier als zod-schema. Daaruit volgt
//   · de validatie in de routes (`parseBody` op de body-schema's);
//   · het gepubliceerde contract `docs/api/krant-v1.json` (OpenAPI 3.1, via
//     `npm run krant:openapi`; contract-openapi.test.ts wordt rood bij drift);
//   · de routetests, die elke respons tegen het responsschema parsen.
//
// Versiebeleid: binnen v1 alleen TOEVOEGEN (een nieuw optioneel veld, een
// nieuwe route). Iets weghalen, hernoemen of strenger maken = `/api/v2`. Een
// app die te oud is voor wat de server nodig heeft, stopt op `minAppVersie`.
//
// Fase 1 (nu gebouwd): config, profiel (GET/PUT), feedback. Fase 2 (na de
// 1C-leesloader) is hier AL gedefinieerd maar heeft nog geen route:
// tijdlijn, archief, gelezen en — besluit eigenaar 29-09, afwijkend van het
// advies — de oude leesstatus `/api/news/read` als `news-read`.
// contract.test.ts ("operaties ↔ routes") pint dat precies de fase-1-operaties een route hebben.
//
// PUUR: alleen zod en de pure profielmodules — geen server-imports, zodat een
// client of een generator dit bestand zonder Next/Supabase kan laden.

import { z } from 'zod'
import { nieuwsprofielV1Schema } from './profiel'
import { PROFIEL_VELDEN } from './profiel-velden'

// ── Versies ──────────────────────────────────────────────────────────────────

/** Versie van dit contract (semver). Verhoog de minor bij elke toevoeging. */
export const KRANT_V1_CONTRACT_VERSIE = '1.0.0'

/**
 * De oudste app-versie die deze server nog bedient. Ophogen dwingt een update
 * af: de app vergelijkt zijn eigen versie met deze waarde uit `GET config`.
 */
export const KRANT_V1_MIN_APP_VERSIE = '1.0.0'

const semver = z.string().regex(/^\d+\.\d+\.\d+$/)

// ── Gedeeld ──────────────────────────────────────────────────────────────────

/** De foutvorm van élke route (ADR 0044, lib/api/respond.ts): plat, `code` optioneel. */
export const foutSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
})

const tijdstip = z.iso.datetime({ offset: true })

const succesSchema = z.strictObject({ success: z.literal(true) })

// ── GET /api/v1/krant/config ─────────────────────────────────────────────────

export const configResponseSchema = z.strictObject({
  contractVersie: semver,
  minAppVersie: semver,
})

// ── GET/PUT /api/v1/krant/profiel ────────────────────────────────────────────

export const HERKOMST_WAARDEN = ['zelf', 'afgeleid'] as const

/** Per profielveld: zelf ingevuld of afgeleid uit de eigen data. Een ontbrekend veld is nooit gezet. */
export const herkomstSchema = z.partialRecord(z.enum(PROFIEL_VELDEN), z.enum(HERKOMST_WAARDEN))

export const profielResponseSchema = z.strictObject({
  /** De dertien velden in banden; `null` = weet ik niet. */
  profiel: nieuwsprofielV1Schema,
  herkomst: herkomstSchema,
  /** Wanneer de weekrun het profiel voor het laatst afleidde; null = nog nooit. */
  afgeleidAt: tijdstip.nullable(),
})

/**
 * PUT: zet de meegegeven profielvelden (de rest blijft staan) en markeert ze
 * als `zelf` — de afleiding overschrijft ze daarna niet meer. `null` = bewust
 * "weet ik niet". STRIKT: een onbekende sleutel is een 400, dus ook
 * `krant_variant`, `afgeleid_at`, `tijdlijn_vernieuwd_at`, `herkomst` of
 * `versie` — die schrijft de lezer nooit (kolomgrant migratie 20261004120000).
 */
export const profielPutBodySchema = nieuwsprofielV1Schema
  .omit({ versie: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Geef minstens één profielveld' })
  // De refine is voor JSON Schema onzichtbaar; minProperties zegt hetzelfde in het gepubliceerde contract.
  .meta({ minProperties: 1 })

export type ProfielPutBody = z.infer<typeof profielPutBodySchema>

// ── POST /api/v1/krant/feedback ──────────────────────────────────────────────

/**
 * Spiegelt `POST /api/news/feedback` (tabel `news_feedback`): één oordeel per
 * artikel per lezer. De tijdlijn kent (nog) geen eigen feedbackvorm; dit is de
 * vorm die de matcher al leest (demotedCategories), dus geen tweede bron.
 */
export const feedbackBodySchema = z.strictObject({
  articleId: z.string().min(1).max(200),
  verdict: z.enum(['less', 'more']),
  headline: z.string().max(500).optional(),
  category: z.string().max(80).optional(),
})

export type FeedbackBody = z.infer<typeof feedbackBodySchema>

export const feedbackResponseSchema = succesSchema

// ── Fase 2 — gedefinieerd, nog geen route ────────────────────────────────────

/** Berichten per tijdlijnpagina — gelijk aan TIJDLIJN_PAGINA (contract.test.ts pint dat). */
export const V1_TIJDLIJN_PAGINA = 20

/** ISO-week zoals de tijdlijn hem schrijft (2026-W40) — gelijk aan WEEK_KEY in tijdlijn-lezen.ts. */
export const V1_WEEK_KEY = /^\d{4}-W\d{2}$/

/** De vormen van `TijdlijnVorm` (lib/krant/tijdlijn-lezen.ts): de matchervormen plus 'ai' (door de AI-laag toegevoegd) en 'ai-oud' (uit de oude AI-Krant). */
export const TIJDLIJN_VORMEN = ['direct', 'gevoeligheid', 'relevant', 'raakt', 'ai', 'ai-oud'] as const

export const tijdlijnQuerySchema = z.strictObject({
  /** Opaak, uit `volgende` van de vorige pagina. */
  cursor: z.string().min(1).max(200).optional(),
  /** Alleen deze archiefweek. */
  week: z.string().regex(V1_WEEK_KEY).optional(),
})

/** Eén bericht — de vorm van `TijdlijnBericht` (lib/krant/tijdlijn-lezen.ts). */
export const tijdlijnBerichtSchema = z.strictObject({
  id: z.string(),
  verversingId: z.string(),
  createdAt: z.string(),
  weekKey: z.string(),
  positie: z.number().int().min(0),
  vorm: z.enum(TIJDLIJN_VORMEN),
  kop: z.string().nullable(),
  /** De regel voor jou; leeg bij vorm 'ai' (geen matcherregel). */
  tekst: z.string(),
  /** Krant 1E: de toelichting van het model (label "met AI"); null = geen. */
  aiTekst: z.string().nullable(),
  /** Krant 1E: het model koos dit bericht (label "door AI toegevoegd"). */
  aiToegevoegd: z.boolean(),
  /** "Waarom zie ik dit?" — leesbare zinnen uit de catalogus, nooit de codes van de matcher. */
  waarom: z.array(z.string()),
  watMist: z.array(z.string()),
  deadline: z.unknown(),
  titel: z.string().nullable(),
  rubriek: z.string().nullable(),
  bron: z.string().nullable(),
  url: z.string().nullable(),
  gepubliceerd: z.string().nullable(),
  /** ADR 0191 regel 3: zonder echte publicatiedatum wanneer wij het zagen. */
  gezienOp: z.string().nullable(),
  samenvatting: z.string().nullable(),
})

export const tijdlijnResponseSchema = z.strictObject({
  pagina: z.strictObject({
    berichten: z.array(tijdlijnBerichtSchema).max(V1_TIJDLIJN_PAGINA),
    volgende: z.string().nullable(),
  }),
})

export const archiefResponseSchema = z.strictObject({
  archief: z.array(z.strictObject({ weekKey: z.string().regex(V1_WEEK_KEY), aantal: z.number().int().min(0) })),
})

/** POST gelezen: geen body — het tijdstip is altijd de servertijd (`tijdlijn_gelezen_tot`). */
export const gelezenResponseSchema = z.strictObject({ gelezenTot: tijdstip })

/** De oude leesstatus (`app_settings`, key `news_read:<user>`), gespiegeld uit /api/news/read. */
export const newsReadResponseSchema = z.strictObject({ readIds: z.array(z.string()).max(200) })

export const newsReadBodySchema = z.strictObject({ articleId: z.string().min(1).max(200) })

export const newsReadPostResponseSchema = succesSchema

// ── De operaties ─────────────────────────────────────────────────────────────

export type V1Methode = 'get' | 'put' | 'post'

export interface V1Operatie {
  operationId: string
  pad: string
  methode: V1Methode
  /** 1 = gebouwd; 2 = gedefinieerd, route volgt na de 1C-leesloader. */
  fase: 1 | 2
  samenvatting: string
  /** Een extra reden voor 403 naast module/Origin/blokkade, voor de OpenAPI. */
  extraWeigering?: string
  query?: z.ZodObject
  body?: z.ZodType
  response: z.ZodType
}

export const KRANT_V1_OPERATIES: readonly V1Operatie[] = [
  {
    operationId: 'getConfig',
    pad: '/api/v1/krant/config',
    methode: 'get',
    fase: 1,
    samenvatting: 'Contractversie en de oudste app-versie die de server nog bedient.',
    response: configResponseSchema,
  },
  {
    operationId: 'getProfiel',
    pad: '/api/v1/krant/profiel',
    methode: 'get',
    fase: 1,
    samenvatting: 'Het eigen nieuwsprofiel in banden, met per veld de herkomst.',
    response: profielResponseSchema,
  },
  {
    operationId: 'putProfiel',
    pad: '/api/v1/krant/profiel',
    methode: 'put',
    fase: 1,
    samenvatting: 'Zet de meegegeven profielvelden en markeer ze als zelf ingevuld.',
    extraWeigering: 'je leest de tijdlijn niet (alleen tijdlijnlezers schrijven hun profiel)',
    body: profielPutBodySchema,
    response: profielResponseSchema,
  },
  {
    operationId: 'postFeedback',
    pad: '/api/v1/krant/feedback',
    methode: 'post',
    fase: 1,
    samenvatting: 'Minder of meer hierover: één oordeel per artikel.',
    body: feedbackBodySchema,
    response: feedbackResponseSchema,
  },
  {
    operationId: 'getTijdlijn',
    pad: '/api/v1/krant/tijdlijn',
    methode: 'get',
    fase: 2,
    samenvatting: 'Een pagina van de eigen tijdlijn (20 berichten, cursor), of één archiefweek.',
    query: tijdlijnQuerySchema,
    response: tijdlijnResponseSchema,
  },
  {
    operationId: 'getArchief',
    pad: '/api/v1/krant/archief',
    methode: 'get',
    fase: 2,
    samenvatting: 'De weken met berichten, nieuwste eerst.',
    response: archiefResponseSchema,
  },
  {
    operationId: 'postGelezen',
    pad: '/api/v1/krant/gelezen',
    methode: 'post',
    fase: 2,
    samenvatting: 'Tot hier gelezen: zet tijdlijn_gelezen_tot op de servertijd.',
    response: gelezenResponseSchema,
  },
  {
    operationId: 'getNewsRead',
    pad: '/api/v1/krant/news-read',
    methode: 'get',
    fase: 2,
    samenvatting: 'De oude leesstatus: welke artikelen zijn gelezen.',
    response: newsReadResponseSchema,
  },
  {
    operationId: 'postNewsRead',
    pad: '/api/v1/krant/news-read',
    methode: 'post',
    fase: 2,
    samenvatting: 'De oude leesstatus: markeer een artikel als gelezen.',
    body: newsReadBodySchema,
    response: newsReadPostResponseSchema,
  },
]
