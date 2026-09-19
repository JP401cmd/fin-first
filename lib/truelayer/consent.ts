/**
 * DE VERVALDATUM VAN DE BANKAUTORISATIE — één plek die 'm bij TrueLayer ophaalt.
 *
 * ## Waarom dit los van `client.ts` staat
 *
 * `getMe` in `client.ts` is transport: hij gooit bij een mislukte respons, net
 * als de andere Data-API-calls. Dit bestand is het BELEID eromheen: de
 * consent-datum is een verrijking van de koppelrij, geen voorwaarde om te
 * kunnen koppelen of synchroniseren. Een bank die `/me` traag of niet
 * beantwoordt mag dus nooit een geslaagde token-exchange of een sync laten
 * vallen — dan is de datum gewoon (nog) onbekend, en `null` is precies wat de
 * gezondheidsafleiding daarvoor als antwoord kent (`consentExpiresAt: null` =
 * geen oordeel op datum). De sync-route vult 'm bij een volgende ronde alsnog
 * aan (zelfherstel).
 *
 * ## Wat de datum is en wat niet
 *
 * `consent_expires_at` uit `GET /data/v1/me` is het moment waarop de
 * bankautorisatie (PSD2-consent, doorgaans 90 dagen, RTS-plafond 180) verloopt.
 * Het is dus de datum van de "Verloopt over Nd"-pil en de verloop-melding — en
 * uitdrukkelijk NIET `token_expires_at`, dat het 1-uurs toegangstoken is. Die
 * twee door elkaar halen was het defect achter ADR 0161: elke sync toonde
 * "verloopt over 1 dag" en na ~25 uur "verbinding kwijt".
 *
 * Bewust GEEN aanname (90 of 180 dagen vanaf autorisatie) als terugval: welke
 * van de twee geldt verschilt per bank, en een verzonnen datum leest voor de
 * gebruiker precies zo stellig als een echte. Onbekend is dan eerlijker.
 */

import { getMe } from './client'

/**
 * De consent-vervaldatum als ISO-string, of `null` als TrueLayer 'm niet
 * (leesbaar) meldt of de call mislukt. Gooit nooit.
 *
 * TrueLayer levert per toegangstoken precies één consent (`results[0]`); een
 * leeg antwoord of een onleesbare datum telt als onbekend, niet als verlopen —
 * dezelfde keuze als `daysUntil` in `lib/bank-connection-status.ts`.
 */
export async function fetchConsentExpiry(accessToken: string, dataUrl: string): Promise<string | null> {
  try {
    const me = await getMe(accessToken, dataUrl)
    const raw: unknown = me[0]?.consent_expires_at ?? null
    // Alleen een string is een datum. `getMe` valt bij een zod-mismatch terug op
    // de rauwe respons (zoals de andere Data-API-calls), en `new Date(getal)` is
    // een GELDIGE datum in 1970 — die zou als "consent verlopen" landen en
    // precies de herautorisatie-lus van ADR 0161 heropenen.
    if (typeof raw !== 'string' || !raw) return null
    const parsed = new Date(raw)
    if (!Number.isFinite(parsed.getTime())) return null
    return parsed.toISOString()
  } catch (err) {
    // Niet-fataal, wél zichtbaar in de serverlog: een structureel falende /me
    // laat élke koppeling zonder einddatum, en dat wil je terug kunnen vinden.
    console.warn('[truelayer/consent] consent_expires_at niet opgehaald:', err instanceof Error ? err.message : err)
    return null
  }
}
