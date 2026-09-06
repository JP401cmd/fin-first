/**
 * HET HERSTELPAD, clientkant — één implementatie voor alle oppervlakken.
 *
 * "Verbinding kwijt" is op twee plekken zichtbaar: de rekeningkaart op
 * `/overzicht/budget` en de bankverbindings-sectie op de rekeningdetail. Beide
 * doen exact hetzelfde: een herautorisatie starten voor één bestaande koppeling en
 * de gebruiker naar zijn bank sturen. Twee `fetch`-blokken met elk hun eigen
 * foutafhandeling zouden binnen één release uiteenlopen — dat is de driftklasse
 * die fase 7 elders juist opruimt.
 *
 * Wat hier NIET in zit: navigeren. Deze functie levert de autorisatie-URL en de
 * aanroeper zet `window.location.href` — dan is de functie testbaar zonder
 * jsdom-navigatie te moeten mocken, en blijft "wanneer verlaten we de app" een
 * beslissing van het oppervlak.
 *
 * De server leidt de doelrekening, de intentie (`link_intent = 'herautoriseren'`)
 * én de bank af uit de koppeling; de client noemt alleen de koppeling. Zie de
 * module-docstring van `app/api/bank-connect/auth-link/route.ts`.
 */

/** Vaste NL-fallback: de UI toont nooit een rauwe fetch-/SDK-/databasestring. */
export const RELINK_GENERIC_ERROR = 'Opnieuw verbinden is niet gelukt — probeer het later opnieuw.'

/**
 * Foutcodes uit de gedeelde envelope (ADR 0044) waarvan de tekst NIET voor de
 * gebruiker geschreven is: `validation_error` levert een veldpad
 * (`relink_connection_account_id: ongeldige koppeling`) en `server_error` een
 * generieke technische afhandeling. Voor die twee wint {@link RELINK_GENERIC_ERROR};
 * de gecureerde teksten mogen wél door — juist dáár staat de uitweg in (409 "deze
 * rekening is al gekoppeld aan …, verbreek die eerst", 400 "deze koppeling heeft
 * geen rekening om te herstellen").
 */
const UNCURATED_ERROR_CODES = new Set(['validation_error', 'server_error'])

export type StartRelinkResult = { ok: true; authUrl: string } | { ok: false; message: string }

/**
 * Start een herautorisatie voor één koppeling.
 *
 * Foutmeldingen van de server worden dóórgegeven wanneer ze bruikbaar zijn — die
 * route levert bewust NL-teksten mét uitweg (400 "deze koppeling bestaat niet",
 * 409 "deze rekening is al gekoppeld aan …, verbreek die eerst"). Alleen bij een
 * generieke `server_error` of een onbruikbaar antwoord valt hij terug op
 * {@link RELINK_GENERIC_ERROR}; technische details gaan naar `console.error` en
 * nooit naar de UI (ADR 0044).
 */
export async function startBankRelink(connectionAccountId: string): Promise<StartRelinkResult> {
  try {
    const res = await fetch('/api/bank-connect/auth-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relink_connection_account_id: connectionAccountId }),
    })

    const data = (await res.json().catch(() => null)) as
      | { auth_url?: string; error?: string; code?: string }
      | null

    if (!res.ok || !data?.auth_url) {
      console.error('Bank-connect herkoppelen mislukt', {
        status: res.status,
        code: data?.code,
        error: data?.error,
      })
      const usable =
        typeof data?.error === 'string' &&
        data.error.trim().length > 0 &&
        !(typeof data.code === 'string' && UNCURATED_ERROR_CODES.has(data.code))
      return { ok: false, message: usable ? (data.error as string) : RELINK_GENERIC_ERROR }
    }

    return { ok: true, authUrl: data.auth_url }
  } catch (err) {
    // Netwerk-/parsefouten ("Failed to fetch") nooit rauw tonen.
    console.error('Bank-connect herkoppel-verzoek mislukt', err)
    return { ok: false, message: RELINK_GENERIC_ERROR }
  }
}
