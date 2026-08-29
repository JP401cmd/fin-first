import { createHash } from 'node:crypto'

/**
 * Gedeelde normalisator + SLEUTELLOZE groepeersleutel voor foutmeldingen.
 *
 * Waarom dit een eigen module is (ADR 0113): er zijn twee vragen over dezelfde
 * foutmelding, met een verschillende bedreiging eromheen.
 *
 *  1. "Is dit een NIEUWE soort fout sinds het vorige kwartier?" — de
 *     meldingen-sweep. Die slaat zijn sleutel op in `app_settings`, en die tabel
 *     is voor élke ingelogde gebruiker leesbaar. Daar is een kale hash een
 *     goedkoop orakel op interne foutmeldingen, dus daar hoort een HMAC met een
 *     server-only sleutel: {@link errorFingerprint} in `./fingerprint`.
 *  2. "Heb ik deze fout al afgehandeld?" — de resolutie-boekhouding achter
 *     `/beheer/errors`. Die sleutel leeft in `error_log_resolutions`, een tabel
 *     die alleen een superadmin leest (RLS `is_superadmin()`), niet in de
 *     AVG-export zit en geen eigen-rij SELECT kent. Een HMAC koopt daar niets,
 *     en kost wél: rotatie van `CRON_SECRET` zou élke afgevinkte groep wees
 *     maken. Vandaar hier een sleutelloze digest: {@link errorSignature}.
 *
 * ÉÉN normalisator, twee afgeleiden. Twee normalisatoren die uiteenlopen is
 * precies het defect dat deze splitsing voorkomt — `normalizeMessage` woont
 * daarom hier en wordt door `./fingerprint` geïmporteerd, niet gekopieerd.
 */

/** Volgorde telt: specifieke patronen vóór de generieke cijferregel. */
const MASKS: [RegExp, string][] = [
  // e-mailadressen (kunnen in een foutmelding belanden)
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>'],
  // uuid's
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  // ISO-tijdstempels
  [/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b/g, '<date>'],
  // URL's (incl. querystring)
  [/\bhttps?:\/\/\S+/gi, '<url>'],
  // lange hex-/base64-achtige tokens
  [/\b[0-9a-f]{16,}\b/gi, '<hex>'],
  [/\b[A-Za-z0-9_-]{24,}\b/g, '<token>'],
  // bedragen en losse getallen (ook 1.234,56 / 1,234.56)
  [/\b\d[\d.,]*\b/g, '<n>'],
]

/**
 * Normaliseert een foutmelding tot zijn vorm: variabele delen gemaskeerd,
 * witruimte genormaliseerd, afgekapt. Input voor beide afgeleiden hieronder —
 * de genormaliseerde tekst zelf wordt nooit opgeslagen of verstuurd.
 */
export function normalizeMessage(message: string | null | undefined): string {
  let out = (message ?? '').slice(0, 2000)
  for (const [re, token] of MASKS) out = out.replace(re, token)
  return out.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 300)
}

/** Gedeelde basis: `<context>|<genormaliseerde message>`, kleinletter. */
export function signatureBasis(
  context: string | null | undefined,
  message: string | null | undefined,
): string {
  return `${(context ?? '').trim().toLowerCase()}|${normalizeMessage(message)}`
}

/**
 * Stabiele, SLEUTELLOZE groepeersleutel over (context, genormaliseerde message).
 * 16 hex-tekens = 64 bit, ruim voldoende tegen botsingen bij het aantal
 * fouttypes dat één app produceert.
 *
 * Bewust géén HMAC (zie de moduletoelichting): deze sleutel wordt de primaire
 * sleutel van `error_log_resolutions` en moet een sleutelrotatie overleven.
 */
export function errorSignature(
  context: string | null | undefined,
  message: string | null | undefined,
): string {
  return createHash('sha256').update(signatureBasis(context, message)).digest('hex').slice(0, 16)
}

/** Vorm van een geldige signature — gebruikt door de zod-validatie op de route. */
export const ERROR_SIGNATURE_RE = /^[0-9a-f]{16}$/
