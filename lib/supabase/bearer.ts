import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { resolveActiveModules } from '@/lib/modules/resolve'
import type { NextResponse } from 'next/server'

/**
 * Bearer-auth voor de native API (`/api/v1/**`, Krant 3A, ADR 0187).
 *
 * Het web authenticeert via cookies (`lib/supabase/server.ts`, onaangeroerd);
 * een native app stuurt `Authorization: Bearer <access-token>` en heeft géén
 * cookies. Deze helper is de ÉNE plek waar dat token een Supabase-client wordt.
 *
 * Drie harde regels:
 *   1. De client is een ANON-client met het token van de lezer als globale
 *      header — PostgREST ziet dus `auth.uid()` = de lezer en RLS blijft de
 *      beveiligingsgrens (own-row). Nooit de service-role: die zou RLS
 *      omzeilen, en een fout in één route lekt dan alle lezers
 *      (bron-scan: app/api/v1/service-role.gate.test.ts).
 *   2. Cookies worden NIET gelezen. Een request met alleen een sessiecookie
 *      krijgt 401: onder v1 bestaat geen ambient credential, dus ook geen CSRF.
 *   3. Verificatie per modus, zoals ADR 0052 het voor het web regelt:
 *        lezen    → `getClaims(jwt)` — lokale verificatie tegen de JWKS, geen
 *                   roundtrip (een ingetrokken sessie leeft tot `exp`, ≤ 1 uur);
 *        muteren  → `getUser(jwt)` — roundtrip naar de auth-server, die een
 *                   uitgelogde/ingetrokken sessie direct weigert.
 *
 * FOUTINDELING (gemeten tegen auth-js 2.110.7, ongemockt):
 *   - Een token dat geen leesbare JWT is (header of payload geen JSON-object,
 *     een alg buiten ES256/RS256/HS256) laat auth-js GOOIEN. Dat vangen we
 *     vóór auth-js af in `leesBearerToken`: 401, geen log — anders schrijft
 *     elke onzin-request een error_logs-rij met aanvallerstekst.
 *   - Een onbereikbare JWKS/auth-server RETOURNEERT een
 *     `AuthRetryableFetchError` (geen throw). Dat is niet de schuld van de
 *     lezer: 503, zodat de app opnieuw probeert in plaats van uit te loggen.
 *   - Elke andere auth-fout (verlopen, ingetrokken, verkeerde handtekening) → 401.
 *   - Een throw ná de voorvalidatie is onverwacht → 500 (gelogd).
 *
 * Daarna de modulepoort: de Krant-API is er voor wie module `nieuws` heeft
 * (`resolveActiveModules` op de eigen `profiles`-rij), en niet voor een
 * geblokkeerd account (`blocked_at`, zoals app/(app)/layout.tsx). Een
 * ontbrekende rij is hier FAIL-CLOSED (403), anders dan de shell (die valt
 * terug op alle modules): een geverifieerd token zonder profiel is een
 * anomalie, geen lezer. NB: dit is een PRODUCTpoort; de toegangsgrens tot data
 * is RLS.
 */

/** Hoe lang een Authorization-header maximaal mag zijn (een Supabase-JWT is ~1 kB). */
export const MAX_AUTH_HEADER = 4096

/** Scheme is hoofdletterongevoelig (RFC 7235); het token is een compacte JWS. */
const BEARER = /^bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i

/** De algoritmen die Supabase Auth tekent (asymmetrisch ES256/RS256, legacy HS256). */
const TOEGESTANE_ALG: ReadonlySet<string> = new Set(['ES256', 'RS256', 'HS256'])

/** De module die de Krant-API vereist. */
export const V1_MODULE = 'nieuws' as const

export type BearerResultaat =
  | { ok: true; client: SupabaseClient; userId: string }
  | { ok: false; response: NextResponse }

/** Eén JWT-deel als JSON-object, of null. Nooit een throw. */
function jsonObject(deel: string): Record<string, unknown> | null {
  try {
    const waarde: unknown = JSON.parse(Buffer.from(deel, 'base64url').toString('utf8'))
    return waarde !== null && typeof waarde === 'object' && !Array.isArray(waarde) ? (waarde as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Het token uit de header, of null bij een ontbrekende/afwijkende header of
 * een token dat geen leesbare JWT is (header en payload JSON-objecten, `alg`
 * uit de toegestane set). Puur. De handtekening toetst auth-js daarna.
 */
export function leesBearerToken(header: string | null): string | null {
  if (!header || header.length > MAX_AUTH_HEADER) return null
  const m = BEARER.exec(header.trim())
  if (!m) return null
  const [kop, payload] = m[1].split('.')
  const kopJson = jsonObject(kop)
  if (!kopJson || typeof kopJson.alg !== 'string' || !TOEGESTANE_ALG.has(kopJson.alg)) return null
  if (!jsonObject(payload)) return null
  return m[1]
}

/** Een anon-client die als de lezer praat — geen sessie-opslag, geen refresh, geen URL-detectie. */
export function maakBearerClient(jwt: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Alleen een echte, niet-anonieme gebruikerssessie telt (niet de anon-key, niet een anonieme login). */
function isGebruiker(sub: unknown, role: unknown, isAnonymous: unknown): sub is string {
  return typeof sub === 'string' && sub.length > 0 && role === 'authenticated' && isAnonymous !== true
}

type Verificatie = { soort: 'gebruiker'; userId: string } | { soort: 'ongeldig' } | { soort: 'onbereikbaar'; error: unknown }

/** De WebCrypto-fouten die een token met een sleutel die er niet bij past oplevert (geen netwerk- of serverfout). */
const CRYPTO_WEIGERINGEN: ReadonlySet<string> = new Set(['DataError', 'NotSupportedError', 'InvalidAccessError'])

function isCryptoWeigering(err: unknown): boolean {
  return typeof err === 'object' && err !== null && CRYPTO_WEIGERINGEN.has((err as { name?: unknown }).name as string)
}

async function verifieer(client: SupabaseClient, jwt: string, muteren: boolean): Promise<Verificatie> {
  if (muteren) {
    const { data, error } = await client.auth.getUser(jwt)
    if (error) return isAuthRetryableFetchError(error) ? { soort: 'onbereikbaar', error } : { soort: 'ongeldig' }
    const user = data?.user
    return user && isGebruiker(user.id, user.role, user.is_anonymous) ? { soort: 'gebruiker', userId: user.id } : { soort: 'ongeldig' }
  }
  let uitkomst: Awaited<ReturnType<SupabaseClient['auth']['getClaims']>>
  try {
    uitkomst = await client.auth.getClaims(jwt)
  } catch (err) {
    // auth-js retourneert de meeste fouten, maar WebCrypto GOOIT bij een
    // alg/kty-mismatch (een RS256-kop op een EC-sleutel uit de JWKS). Dat is
    // een onleesbare token: 401 zonder log, geen storing (security 0.92.27, G1).
    if (isCryptoWeigering(err)) return { soort: 'ongeldig' }
    throw err
  }
  const { data, error } = uitkomst
  if (error) return isAuthRetryableFetchError(error) ? { soort: 'onbereikbaar', error } : { soort: 'ongeldig' }
  const claims = data?.claims
  return claims && isGebruiker(claims.sub, claims.role, claims.is_anonymous)
    ? { soort: 'gebruiker', userId: claims.sub }
    : { soort: 'ongeldig' }
}

/**
 * Verifieer de Bearer-token van dit request en eis module `nieuws`.
 *
 *   const auth = await vereisBearer(request, { muteren: false })
 *   if (!auth.ok) return auth.response
 *   // auth.client (RLS als de lezer), auth.userId
 *
 * Een mutatie met een `Origin`-header weigeren we ook hier (403), niet alleen
 * in de proxy: een native app stuurt die header niet, een browser wel. Twee
 * lagen, zoals bij de dev-only-paden.
 */
export async function vereisBearer(request: Request, { muteren }: { muteren: boolean }): Promise<BearerResultaat> {
  if (muteren && request.headers.has('origin')) return { ok: false, response: forbidden() }

  const jwt = leesBearerToken(request.headers.get('authorization'))
  if (!jwt) return { ok: false, response: unauthorized() }

  const client = maakBearerClient(jwt)
  try {
    const v = await verifieer(client, jwt, muteren)
    if (v.soort === 'onbereikbaar') {
      return {
        ok: false,
        response: serverError(v.error, 'krant-v1:bearer', 'Inloggen is even niet te controleren. Probeer het zo opnieuw.', 503),
      }
    }
    if (v.soort === 'ongeldig') return { ok: false, response: unauthorized() }

    const { data: profiel, error } = await client
      .from('profiles')
      .select('active_modules, blocked_at')
      .eq('id', v.userId)
      .maybeSingle()
    if (error) return { ok: false, response: serverError(error, 'krant-v1:bearer') }
    if (!profiel || profiel.blocked_at) return { ok: false, response: forbidden() }
    if (!resolveActiveModules(profiel).includes(V1_MODULE)) return { ok: false, response: forbidden() }

    return { ok: true, client, userId: v.userId }
  } catch (err) {
    // Na de voorvalidatie hoort auth-js niet meer te gooien: onverwacht → 500.
    return { ok: false, response: serverError(err, 'krant-v1:bearer') }
  }
}
