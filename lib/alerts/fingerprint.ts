import { createHmac } from 'node:crypto'
import { normalizeMessage, signatureBasis } from '@/lib/alerts/error-signature'

/**
 * Fingerprinting van foutmeldingen: "is dit een NIEUWE soort fout, of dezelfde
 * fout voor de zoveelste keer?" — de kern van meldingen zónder meldingsstorm.
 *
 * Twee harde eisen sturen het ontwerp:
 *  1. **Stabiel onder variabele delen.** Ids, bedragen, tijdstempels en paden
 *     verschillen per voorval maar duiden dezelfde fout; die maskeren we weg
 *     vóór het hashen, anders is élk voorval "nieuw".
 *  2. **Niets van de inhoud verlaat de app.** De hash gaat naar `app_settings`
 *     (leesbaar voor elke ingelogde gebruiker) en de melding gaat naar een
 *     kanaal buiten onze stack. Een hash is eenrichting; `message`/`stack`/`url`
 *     komen daar dus nooit terecht — zie `lib/alerts/sweep.ts`.
 *
 * De NORMALISATOR zelf woont niet meer hier maar in `./error-signature`, omdat
 * de resolutie-boekhouding van `/beheer/errors` dezelfde normalisatie nodig
 * heeft met een ándere (sleutelloze) afgeleide — ADR 0113. Eén normalisator,
 * twee afgeleiden; hij wordt hier geïmporteerd en her-geëxporteerd zodat elke
 * bestaande import blijft werken.
 */
export { normalizeMessage }

/**
 * Sleutel voor de fingerprint-HMAC. Server-only; valt in dev terug op een
 * constante (daar is `CRON_SECRET` leeg en draait de sweep toch niet echt).
 */
function fingerprintKey(): string {
  return process.env.CRON_SECRET || 'trifinity-dev-fingerprint-key'
}

/**
 * Stabiele, korte fingerprint over (context, genormaliseerde message).
 * 16 hex-tekens = 64 bit; ruim voldoende tegen botsingen bij het aantal
 * fouttypes dat één app produceert, en kort genoeg om leesbaar op te slaan.
 *
 * HMAC, geen kale hash: de fingerprints worden opgeslagen in `app_settings`, en
 * die tabel is voor élke ingelogde gebruiker leesbaar. Omdat `normalizeMessage`
 * juist alle variabele delen wegmaskeert is de zoekruimte klein — een kale
 * SHA-256 zou dus een goedkoop orakel zijn waarmee je interne foutmeldingen kunt
 * raden en verifiëren. Met een server-only sleutel is dat dicht. Rotatie van de
 * sleutel maakt oude fingerprints onbruikbaar; die verlopen vanzelf via de TTL
 * en kosten hooguit één extra melding per fouttype.
 */
export function errorFingerprint(
  context: string | null | undefined,
  message: string | null | undefined,
): string {
  return createHmac('sha256', fingerprintKey())
    .update(signatureBasis(context, message))
    .digest('hex')
    .slice(0, 16)
}

/**
 * Onze eigen context-tags. `error_logs.context` is NIET altijd door onszelf
 * gezet: `/api/log-error` neemt de waarde ongefilterd van de client over (200
 * tekens vrije tekst). Alles wat niet aantoonbaar van ons is, verlaat het pand
 * dus niet.
 */
const EIGEN_TAGS = new Set([
  'window.onerror',
  'unhandledrejection',
  'global-error',
  'error-boundary',
])
/** `onRequestError:<routeType>` uit lib/observability/request-error.ts. */
const ONREQUEST_TAG = /^onrequesterror:[a-z-]{1,20}$/

/**
 * Maakt een `context`-waarde veilig om in een melding te tonen.
 *
 * ALLOWLIST, geen knijpfilter. Een eerdere versie hield alleen het alfabet
 * `[a-z0-9:._-]` over en kapte op 40 tekens — dat verwijdert leestekens, geen
 * persoonsgegevens: `NL91ABNA0417164300` bleef volledig intact en
 * `jan.smit@trifinity.nl` werd `jan.smit-trifinity.nl`. Elke ingelogde
 * gebruiker had daarmee via één POST naar `/api/log-error` leesbare tekst in
 * het externe meldingskanaal kunnen krijgen.
 *
 * De melding verliest hier niets van betekenis mee: de tag bestond om ÓNZE
 * categorieën te tonen, en de details staan achter de deeplink op
 * `/beheer/errors`.
 */
export function safeContextTag(context: string | null | undefined): string {
  const raw = (context ?? '').trim().toLowerCase()
  if (EIGEN_TAGS.has(raw)) return raw
  if (ONREQUEST_TAG.test(raw)) return raw
  return 'onbekend'
}
