/**
 * POST /api/web-vitals — publiek, sessie-optioneel ontvangstpad van de eigen
 * web-vitals / RUM-collectie (feature 884). De client-reporter beacon't hier
 * één Core Web Vital per call naartoe; ingelogd of niet.
 *
 * Verdedigingslagen vóór de write, in volgorde:
 *   1. byte-grens vóór JSON.parse — Content-Type-agnostisch lezen via
 *      request.text() (patroon van app/api/check/submit): robuust ongeacht wat
 *      de client als Content-Type zet (sendBeacon-Blob of keepalive-fetch),
 *      niet afhankelijk van de header.
 *   2. Zod-validatie op de config-enums/grenzen (single source: lib/web-vitals/config).
 *   3. server-side route-scrub (AVG: nooit een herleidbaar id in de tabel).
 *
 * De `user_id` komt NOOIT uit de payload — uitsluitend uit de geverifieerde
 * sessie (getClaims, lokale JWT-verificatie, ADR 0052). Schrijven gaat via de
 * service-role: `web_vitals` heeft bewust geen insert-policy voor sessies.
 *
 * Datzelfde geldt voor `environment`: die wordt hier server-side uit VERCEL_ENV
 * afgeleid, zodat dev- en productiemetingen in de p75 gescheiden blijven en
 * niemand zijn metingen als 'production' kan laten tellen.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { badRequest, serverError } from '@/lib/api/respond'
import { scrubRoute } from '@/lib/web-vitals/scrub'
import {
  WEB_VITAL_METRICS,
  WEB_VITAL_RATINGS,
  WEB_VITAL_DEVICES,
  VIEWPORT_BUCKETS,
  MAX_METRIC_VALUE,
} from '@/lib/web-vitals/config'

// Node-runtime: we lezen de service-role-key en verifiëren de JWT server-side.
export const runtime = 'nodejs'

// DoS-houding (bewuste keuze — code-review M1 / security 🟠): dit publieke,
// sessie-optionele pad schrijft via de service-role (RLS-bypass) en heeft
// bewust GEEN DB-per-IP-rate-limit op het hot path — een DB-roundtrip per beacon
// zou de schrijflast verdubbelen en telemetrie mag nooit "fail closed". De
// verdediging per request is: byte-cap (hieronder) + strikt enum-schema + de
// client-side sample-rate. Flood-bescherming (het AANTAL requests) hoort op
// edge/WAF-niveau: configureer een rate-limit-regel voor POST /api/web-vitals op
// het platform (Vercel/Cloudflare) vóór livegang — dat is edge-state die geen
// diff toont. Ongebreidelde tabelgroei wordt begrensd door een retentie-/
// opschoonbeleid op web_vitals (follow-up, samen met feature 885).

// Ruime bovengrens voor één beacon-meting; houdt malafide payloads klein.
const MAX_BODY_BYTES = 4096

// Enums/grenzen komen uit de gedeelde config zodat zender en ontvanger nooit
// uiteenlopen (client-toegestaan == server-geaccepteerd).
const metricSchema = z.object({
  metric: z.enum(WEB_VITAL_METRICS),
  // .min(0) weigert NaN, .max() weigert Infinity — samen dekken ze wat het
  // (in Zod 4 deprecated) .finite() deed, zonder de deprecation-waarschuwing.
  value: z.number().min(0).max(MAX_METRIC_VALUE),
  rating: z.enum(WEB_VITAL_RATINGS).nullish(),
  route: z.string().min(1).max(512),
  navigationType: z.string().max(40).nullish(),
  device: z.enum(WEB_VITAL_DEVICES).nullish(),
  viewportBucket: z.enum(VIEWPORT_BUCKETS).nullish(),
  effectiveType: z.string().max(16).nullish(),
})

export async function POST(request: Request) {
  try {
    // 1) Byte-grens vóór parsing. Content-Type-agnostisch (sendBeacon = text/plain).
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      // respond.ts heeft geen 413-helper; platte envelope handmatig, zelfde vorm.
      return new Response(JSON.stringify({ error: 'Payload te groot' }), {
        status: 413,
        headers: { 'content-type': 'application/json' },
      })
    }

    // 2) Parsen.
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return badRequest('Ongeldige body')
    }

    // 3) Valideren tegen de config-enums/grenzen. Bij falen: niets wegschrijven.
    const parsed = metricSchema.safeParse(json)
    if (!parsed.success) {
      return badRequest('Ongeldige meting')
    }
    const m = parsed.data

    // 4) Optionele sessie: user_id uitsluitend uit de geverifieerde JWT, nooit
    //    uit de payload. Anonieme bezoekers loggen met user_id null.
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getClaims()
      userId = data?.claims?.sub ?? null
    } catch {
      // Geen/ongeldige sessie is geen fout voor dit pad — anoniem doorloggen.
      userId = null
    }

    // 5) Route server-side scrubben — de client-waarde niet vertrouwen (AVG).
    const route = scrubRoute(m.route)

    // 6) Insert via service-role (snake_case kolommen, spiegelt de WS1-DDL).
    const { error } = await getServiceClient()
      .from('web_vitals')
      .insert({
        user_id: userId,
        metric: m.metric,
        value: m.value,
        rating: m.rating ?? null,
        route,
        navigation_type: m.navigationType ?? null,
        device: m.device ?? null,
        viewport_bucket: m.viewportBucket ?? null,
        effective_type: m.effectiveType ?? null,
        // Server-side bepaald, net als user_id — bewust NIET in het zod-schema,
        // zodat een `environment` in de body domweg wordt weggestript en een
        // client zijn metingen nooit als 'production' kan laten meetellen.
        // Vercel zet 'production'|'preview'|'development'; lokaal is het leeg.
        environment: process.env.VERCEL_ENV ?? 'development',
      })
    if (error) {
      return serverError(error, 'web-vitals:POST')
    }

    // 7) Succes → 204 No Content; de beacon negeert de body toch.
    return new Response(null, { status: 204 })
  } catch (err) {
    // Nooit een rauwe error.message/stack naar de client (respond.ts logt server-side).
    return serverError(err, 'web-vitals:POST')
  }
}
