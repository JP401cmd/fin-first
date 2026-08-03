import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * GET /api/overzicht/cashflow-settings
 *
 * Levert `CashflowSettingsData` — de props-bundel van het instellingen-blok
 * (inkomen, uitgaven, spaarquote) onderaan /overzicht/cashflow.
 *
 * WAAROM DEZE ROUTE BESTAAT (perf Task 2.2, stap 5). Het blok is `ssr:false` en
 * staat onder de vouw, maar zijn data werd wél in het hub-request geladen:
 * `loadCashflowSettingsData` → `loadCoreData` is ~25 queries in twee seriële
 * golven, en die stonden in de `Promise.all` die de héle pagina ophield — voor
 * een component die pas ná chunk-load rendert. De data komt nu hierlangs, pas
 * wanneer het blok in beeld scrollt.
 *
 * DATAPAD (ADR 0058): dit is de "lazy client-read die écht niet in de
 * loader-bundel past" — dus via een API-route, niet via de browser-client.
 * Read-route, dus auth via `getAuthClaims` (ADR 0052): dat verifieert de JWT
 * lokaal tegen de JWKS en houdt de 401-tak dus roundtrip-vrij. Op het
 * doorlaat-pad doet `loadCashflowSettingsData` intern alsnog een
 * `getCachedUser()` → `auth.getUser()`, dus daar is de winst nul — de reden om
 * `getAuthClaims` te gebruiken is uniformiteit met de andere read-routes, niet
 * een besparing die deze route niet maakt. Geen body → geen zod. Foutvorm via
 * lib/api/respond.ts (ADR 0044).
 *
 * `!claims?.sub` (en niet `!claims`) is bewust strenger dan de zusterroute: een
 * token zonder `sub` heeft geen bruikbare identiteit, en de loader zou dan
 * op een lege user-scope draaien.
 *
 * SINGLE SOURCE: dezelfde `loadCashflowSettingsData` die de pagina eerder
 * server-side aanriep — geen tweede afleiding, dus geen drift. `lib/box1-income.ts`
 * blijft die loader ook direct gebruiken.
 *
 * GEEN TTL-CACHE, BEWUST (review T2.2). De eerste opzet had er één, spiegel van
 * lib/cashflow-status-cache.ts. Dat is hier fout: het blok dat deze route voedt
 * is een INVOERSCHERM — het schrijft `net_monthly_income`,
 * `estimated_monthly_expenses`, `income_source` en `expenses_source` weg via
 * `PUT /api/parameters` (cashflow-instellingen-blok.tsx). Een cache vóór precies
 * die velden geeft: bedrag aanpassen → wegnavigeren → binnen het venster terug →
 * remount → verse fetch → cache-hit → het OUDE bedrag. Dat leest als "mijn
 * wijziging is niet bewaard". De optimistische lokale state dekt dat binnen één
 * mount af, maar juist niet over de remount heen — en de remount is wat de
 * lazy-fetch nieuw introduceert. De zustercache mag dit hebben (statuskleuren
 * zijn cosmetisch); een invoerveld is een andere klasse. De winst van stap 2.2
 * zit al volledig in het LAZY zijn van de read (~25 queries van het hub-request
 * af); de TTL voegde daar niets aan toe en kostte correctheid.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims?.sub) {
      return unauthorized()
    }

    const data = await loadCashflowSettingsData(supabase)
    // `null` = geen sessie volgens de loader zelf. De claims-check hierboven ving
    // dat al af; belandt de code hier tóch, dan is 401 het eerlijke antwoord —
    // niet een lege bundel die het blok als "alles op nul" zou renderen.
    if (!data) {
      return unauthorized()
    }

    return NextResponse.json(data, {
      // Inkomens- en uitgavenbedragen: nergens laten hangen. De route is al
      // dynamisch en er is geen concreet lekpad, maar dit is de goedkoopste
      // vorm van die garantie — en het sluit meteen uit dat een browser- of
      // proxy-cache de rol overneemt die hierboven bewust is weggehaald.
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    return serverError(err, 'cashflow-settings:GET')
  }
}
