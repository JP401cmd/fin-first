import { NextResponse } from 'next/server'
import { z } from 'zod'
import { badRequest } from '@/lib/api/respond'

/**
 * /api/auth/password-check — server-proxy voor de HaveIBeenPwned "Pwned
 * Passwords" range-API (ADR 0057). Onderdeel van de eigen, gratis
 * leaked-password-protection (Supabase's native variant vereist het Pro-plan).
 *
 * PRIVACY (k-anonimiteit): de client stuurt UITSLUITEND de eerste 5 hex-tekens
 * van de SHA-1 van het wachtwoord (de prefix). Deze route ziet dus nooit het
 * plaintext-wachtwoord én nooit de volledige hash — alleen de prefix, precies
 * zoals HIBP zelf werkt. De suffix-match gebeurt lokaal in de browser.
 *
 * Reden voor een eigen proxy i.p.v. de browser direct naar HIBP: CSP/one-origin-
 * hygiëne, centrale fail-open + timeout, en de app-conventie dat externe calls
 * server-side lopen (blauwdruk: `lib/nibud/api-client.ts`).
 *
 * PUBLIEK: signup gebeurt uitgelogd, dus GÉÉN sessie-gate (`unauthorized()`).
 * Wel strak gevalideerd: exact 5 hex-tekens, anders 400 (platte error-envelope).
 * De publieke prefix-proxy is laag-risico qua misbruik: HIBP is zelf een publieke,
 * key-loze API en de prefix onthult niets over een specifiek wachtwoord.
 *
 * FAIL-OPEN: bij élke upstream-storing (timeout, non-200, throw) geven we een
 * lege 200-body terug i.p.v. een 5xx, zodat de client-check fail-open gaat
 * (behandelt "geen suffix in de lijst" als "niet gelekt"). Een beveiligingscheck
 * mag de registratie/wijziging nooit blokkeren bij een externe storing.
 */

// Exact 5 hex-tekens; hoofd-/kleine letters toegestaan (client stuurt uppercase).
const PrefixSchema = z.object({
  prefix: z.string().regex(/^[0-9A-Fa-f]{5}$/),
})

const HIBP_TIMEOUT_MS = 2500

/** Lege, client-veilige 200 zodat de client fail-open gaat. */
function failOpenResponse(): NextResponse {
  return new NextResponse('', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = PrefixSchema.safeParse({ prefix: url.searchParams.get('prefix') ?? undefined })
  if (!parsed.success) {
    // Echte client-fout: platte error-envelope (ADR 0044), geen upstream-call.
    return badRequest('Ongeldige prefix — verwacht exact 5 hex-tekens', 'validation_error')
  }
  const prefix = parsed.data.prefix.toUpperCase()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS)
  try {
    const upstream = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Add-Padding: HIBP voegt fake-suffixen (count 0) toe zodat de responsgrootte
      // niets over de treffer verraadt. De client filtert count-0-regels eruit.
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
      // Prefix-respons is cachebaar (verandert nauwelijks) → 24h revalidate.
      next: { revalidate: 86400 },
    })

    if (!upstream.ok) {
      // Upstream-fout: NIET als 5xx doorgeven (dat zou de check hard breken) —
      // fail-open met lege 200-body.
      return failOpenResponse()
    }

    const text = await upstream.text()
    return new NextResponse(text, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    // Timeout (abort) of netwerk-throw: server-side loggen met grep-bare tag,
    // geen rauwe upstream-details naar de client (AVG/security), fail-open.
    console.error('[auth:password-check] upstream-fout', err instanceof Error ? err.message : String(err))
    return failOpenResponse()
  } finally {
    clearTimeout(timeout)
  }
}
