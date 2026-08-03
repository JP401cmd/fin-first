import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { unauthorized, serverError } from '@/lib/api/respond'
import {
  cashflowSettingsCacheKey,
  readCashflowSettingsCache,
  writeCashflowSettingsCache,
} from '@/lib/cashflow-settings-cache'

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
 * Read-route, dus auth via `getAuthClaims` (ADR 0052, lokale JWT-verificatie
 * zonder `/auth/v1/user`-roundtrip). Geen body → geen zod. Foutvorm via
 * lib/api/respond.ts (ADR 0044).
 *
 * SINGLE SOURCE: dezelfde `loadCashflowSettingsData` die de pagina eerder
 * server-side aanriep — geen tweede afleiding, dus geen drift. `lib/box1-income.ts`
 * blijft die loader ook direct gebruiken.
 *
 * TTL-cache (lib/cashflow-settings-cache.ts): per gebruiker, kort. Bij een hit
 * gaat `loadCoreData` NIET aan. Dat lost het herhaalde bezoek op, niet het
 * eerste — en bewust server-side, want een browser-cache overleeft een
 * uitlog/inlog in hetzelfde tabblad (zie de kop van die module).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims?.sub) {
      return unauthorized()
    }

    const key = cashflowSettingsCacheKey(claims.sub)
    const cached = readCashflowSettingsCache(key)
    if (cached.hit) {
      return NextResponse.json(cached.data)
    }

    const data = await loadCashflowSettingsData(supabase)
    // `null` = geen sessie volgens de loader zelf. De claims-check hierboven ving
    // dat al af; belandt de code hier tóch, dan is 401 het eerlijke antwoord —
    // niet een lege bundel die het blok als "alles op nul" zou renderen.
    if (!data) {
      return unauthorized()
    }

    writeCashflowSettingsCache(key, data)
    return NextResponse.json(data)
  } catch (err) {
    return serverError(err, 'cashflow-settings:GET')
  }
}
