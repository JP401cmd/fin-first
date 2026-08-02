import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { decryptField } from '@/lib/crypto/field-encryption'

/**
 * GET /api/own-accounts/ibans — de IBANs van je eigen `bank_accounts`, ontsleuteld.
 *
 * ## Waarom deze route moet bestaan
 *
 * De veldencryptie-sleutels (`ENCRYPTION_KEY_V1`, `IBAN_INDEX_KEY_V1`) zijn
 * server-only. `decryptField` kán dus per definitie niet in een `'use client'`-
 * bestand draaien. Elk client-pad dat vandaag `bank_accounts.iban` (plaintext)
 * leest heeft daarom een serverhop nodig zodra die kolom verdwijnt — een
 * kolomwissel ter plekke is er niet. Dit is die ene hop, gedeeld door álle
 * client-lezers, in plaats van vier keer hetzelfde.
 *
 * ## Geen nieuwe blootstelling
 *
 * Deze route levert exact de rijen die dezelfde gebruiker vandaag al rechtstreeks
 * uit de browser leest (`supabase.from('bank_accounts').select('iban')`), via
 * dezelfde RLS-poort: de anon server-client mét de sessie van de aanroeper, nooit
 * de service-role. Géén van de vervangen client-reads had een `user_id`-filter,
 * en deze route heeft er dus ook geen — zie de noot bij de query. De verzameling
 * is daarmee identiek aan wat de client-read teruggaf. De veldencryptie beschermt
 * tegen een gestolen DB-dump, niet tegen de eigenaar zelf.
 *
 * ## `unreadable` is geen detail — het is de veiligheidsklep
 *
 * Elke consument van deze route gebruikt de IBAN als **match-identifier** voor
 * eigen-rekening-verschuivingen (transfer-koppeling, importcategorisatie). Valt
 * één IBAN stil weg, dan telt een interne overboeking mee als échte inkomst én
 * uitgave en is de spaarquote corrupt — zónder dat er ergens een fout verschijnt.
 * Daarom geven we het aantal onleesbare rijen expliciet terug in plaats van ze
 * geruisloos over te slaan, en logt de server ze altijd.
 *
 * Consumenten kiezen bewust hun kant (zie `lib/own-accounts-ibans.ts`):
 *  - identifier-gebruik → `fetchOwnAccountIbansStrict()`, gooit bij `unreadable > 0`;
 *  - alleen weergave (IBAN-staartje naast een naam) → `fetchOwnAccountIbans()`,
 *    die de leesbare rijen gewoon toont.
 *
 * Niet-ontsleutelbare rijen horen nul te zijn: alle 15 gevulde rijen op remote
 * dragen het `v1:`-prefix met een geldige tag. Slaat de teller ooit aan, dan is
 * dat een sleutel-/rotatieprobleem en géén datakwestie om weg te degraderen.
 *
 * ## `is_active` filtert de route bewust NIET
 *
 * De consumenten filteren verschillend (de importpagina en de categorisatie
 * alleen op actieve rekeningen, de transfer-koppeling op een expliciete
 * id-lijst). De vlag gaat mee in de payload zodat elke consument exact het
 * filter houdt dat hij vóór deze omzetting had; hier filteren zou stilletjes
 * gedrag veranderen.
 */

/** Eén rij: de rekening-id, de ontsleutelde IBAN en de actief-vlag. */
export interface OwnAccountIbanRow {
  id: string
  iban: string
  is_active: boolean
}

export interface OwnAccountIbansResponse {
  accounts: OwnAccountIbanRow[]
  /** Aantal rijen met een gevulde maar niet-ontsleutelbare `iban_encrypted`. */
  unreadable: number
}

export async function GET() {
  try {
    const supabase = await createClient()
    // Pure read-GET → `getAuthClaims` i.p.v. `auth.getUser()` (ADR 0052): de JWT
    // wordt lokaal geverifieerd, wat de auth-server-roundtrip per request scheelt op
    // een route die in het client-pad van /overzicht/cashflow zit. RLS blijft de
    // echte autorisatiegrens (de query hieronder loopt over de RLS-client), en de
    // identiteit wordt hier verder nergens gebruikt — alleen de aanwezigheid ervan.
    // Geaccepteerd: een server-side ingetrokken sessie kan tot de JWT-expiry (max.
    // 1 uur) nog uitsluitend de EIGEN rijen lezen; schrijven kan niet.
    const claims = await getAuthClaims(supabase)
    if (!claims) return unauthorized()

    // GEEN `.eq('user_id', claims.sub)` — en dat is een bewuste, geverifieerde keuze.
    //
    // De SELECT-policy op `bank_accounts` is NIET eigen-rij maar huishoud-verbreed:
    //   (auth.uid() = user_id)
    //   OR (ownership = 'shared' AND household_id = user_household_id())
    // (`20260719090108_perf_rls_initplan_consolidatie.sql`). Geen van de
    // client-reads die deze route vervangt had een `user_id`-filter, dus de
    // gedeelde rekening van je partner telde altijd al mee als "eigen rekening".
    //
    // Zou deze route wél op `user_id` filteren, dan verdween die rekening stil uit
    // de identifier-set en werd elke overboeking naar de gedeelde huishoudrekening
    // voortaan als échte uitgave én échte inkomst geboekt — precies de corruptie
    // die deze hele omzetting moet voorkomen, en onzichtbaar omdat er niets faalt.
    // RLS is hier dus de grens, niet een extra filter. Voeg 'm niet "voor de
    // zekerheid" toe.
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('id, iban_encrypted, is_active')
      .not('iban_encrypted', 'is', null)

    // Bewust een 500 en geen lege lijst: een mislukte leesronde die als "geen
    // eigen IBANs" terugkomt is precies het stille faalpad dat de spaarquote
    // corrumpeert. Direct doorgeven i.p.v. `throw` — een Supabase
    // `PostgrestError` is een plain object en zou via de `instanceof Error`-tak
    // van `serverError` als "[object Object]" in de log belanden.
    if (error) return serverError(error, 'own-accounts-ibans:GET')

    const rows = (data ?? []) as { id: string; iban_encrypted: string | null; is_active: boolean | null }[]

    const accounts: OwnAccountIbanRow[] = []
    let unreadable = 0

    for (const row of rows) {
      let iban: string | null
      try {
        iban = decryptField(row.iban_encrypted)
      } catch {
        unreadable++
        continue
      }
      // `decryptField(null)` gooit niet maar geeft `null`. Die rijen filtert de
      // query er al uit; deze guard dekt de lege string die na ontsleuteling
      // overblijft (zie de twee `iban = ''`-rijen uit de onboarding-opruiming —
      // die zijn nooit versleuteld, en een lege IBAN is geen identifier).
      if (!iban || !iban.trim()) continue
      accounts.push({ id: row.id, iban, is_active: row.is_active !== false })
    }

    if (unreadable > 0) {
      console.error(
        `[own-accounts:ibans] ${unreadable} bankrekening(en) met een onleesbare iban_encrypted — ` +
        `consumenten die de IBAN als match-identifier gebruiken weigeren deze respons`,
      )
    }

    return NextResponse.json({ accounts, unreadable } satisfies OwnAccountIbansResponse)
  } catch (err) {
    return serverError(err, 'own-accounts-ibans:GET')
  }
}
