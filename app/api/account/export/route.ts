import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { EXPORT_SESSION_TABLES, EXPORT_SERVICE_TABLES, EXPORT_OWN_READ_EXTRA_TABLES } from '@/lib/user-data-tables'
import { decryptField } from '@/lib/crypto/field-encryption'
import { shapeExportRows, shapeExportRow, type ExportRow } from '@/lib/account-export-shape'

/**
 * GET /api/account/export — [Arch F3] Recht 3 (dataportabiliteit, AVG art. 20).
 *
 * Eén machine-leesbare JSON met álle eigen rijen die de gebruiker onder RLS kan
 * lezen: `{ exported_at, user_id, tables: { <tabel>: [...] } }`. Draait op de
 * SESSIE-client (eigen rijen) — geen service-role nodig voor de gebruikers-
 * variant. De tabellenlijst is dezelfde single source als de wipe
 * (lib/user-data-tables.ts) zodat "wat kan ik downloaden" niet wegdrijft van
 * "wat wordt gewist".
 *
 * De CSV-per-type-export (/api/export) blijft bestaan voor Excel-gebruikers; dit
 * is de volledige alles-in-één variant.
 *
 * Sinds ADR 0146 is dit de ENIGE route voor een inzageverzoek — beheer heeft geen
 * export van andermans data meer. Daarom leest deze route ook de persoonlijke
 * tabellen zónder eigen-rij leesrecht ({@link EXPORT_SERVICE_TABLES}:
 * net_worth_history, feedback, user_reports) die voorheen alleen in de
 * admin-export zaten. Dat gaat via de service-role, strikt op de vers
 * geverifieerde eigen id (`getUser()`, niet de JWT-claims — service-role-pad).
 */
/**
 * Kindtabellen zónder eigen `user_id` vallen buiten de generieke
 * `.eq('user_id', …)` hierboven en zouden stil uit de export wegblijven. Die
 * hangen we als embed aan hun ouder. De RLS op het kind scoped de embed al op
 * de eigen ouderrij.
 *
 * `questionnaire_responses` — de vrije-tekstantwoorden op vragenlijsten in de
 * chat bij Fin; bereikbaar via `questionnaire_sessions.id`. Wissen gaat via de
 * FK-cascade vanaf de sessie.
 */
const EXPORT_EMBEDS: Record<string, string> = {
  questionnaire_sessions: '*, questionnaire_responses(*)',
}

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  try {
    const tables: Record<string, unknown> = {}

    // Profiel (eigen rij).
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', claims.sub)
      .maybeSingle()
    // Óók het profiel door de exportvorm. `profiles` heeft vandaag geen
    // geheim-achtige kolom, maar dit is de plek waar de eerste er anders
    // ongemerkt doorheen glipt — één vorm voor élke tabel in de export.
    tables.profiles = shapeExportRow('profiles', (profile ?? null) as ExportRow | null, decryptField)

    // Alle user-scoped tabellen die de gebruiker onder RLS kan lezen. Parallel,
    // maar begrensd: het zijn eigen-rij-selects op geïndexeerde user_id-kolommen.
    // Plus de eigen-rij-leesbare tabellen zonder wis-recht (het
    // toestemmingsbewijs, ADR 0155) — zelfde pad, zelfde vorm.
    const results = await Promise.all(
      [...EXPORT_SESSION_TABLES, ...EXPORT_OWN_READ_EXTRA_TABLES].map(async (table) => {
        const { data, error } = await supabase
          .from(table)
          .select(EXPORT_EMBEDS[table] ?? '*')
          .eq('user_id', claims.sub)
        // RLS-afscherming of een ontbrekende tabel levert een lege set, geen 500:
        // een export mag niet breken op één tabel. De echte fout is server-side
        // niet nodig (leeg = leeg voor de gebruiker).
        //
        // `shapeExportRows` maakt van de ruwe `select('*')` een geldige AVG-vorm:
        // het rekeningnummer ontsleuteld en leesbaar, de crypto-kolommen
        // (`iban_encrypted`/`iban_hash`) en de bank-/exchange-/broker-tokens eruit.
        // Zie `lib/account-export-shape.ts` voor waarom die er niet in horen.
        // Via `unknown`: een dynamische select-string laat supabase-js het rijtype
        // niet afleiden; de vorm is hier sowieso generiek (ExportRow).
        const rows = error ? [] : ((data ?? []) as unknown as ExportRow[])
        return [table, shapeExportRows(table, rows, decryptField)] as const
      }),
    )
    for (const [table, rows] of results) {
      tables[table] = rows
    }

    // Persoonlijke tabellen zonder eigen-rij SELECT: service-role, maar alléén
    // op de vers geverifieerde eigen id. Faalt de verificatie, dan blijven deze
    // tabellen weg (de rest van de export gaat door) — nooit een claim-id aan de
    // service-client geven.
    const onvolledig: string[] = []
    const {
      data: { user: verified },
    } = await supabase.auth.getUser()
    if (!verified || verified.id !== claims.sub) {
      onvolledig.push(...EXPORT_SERVICE_TABLES)
    } else {
      const service = getServiceClient()
      const serviceResults = await Promise.all(
        EXPORT_SERVICE_TABLES.map(async (table) => {
          const { data, error } = await service.from(table).select('*').eq('user_id', verified.id)
          if (error) onvolledig.push(table)
          const rows = error ? [] : ((data ?? []) as unknown as ExportRow[])
          return [table, shapeExportRows(table, rows, decryptField)] as const
        }),
      )
      for (const [table, rows] of serviceResults) {
        tables[table] = rows
      }
    }

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: claims.sub,
      // AVG: een inzage-export die stil gaten heeft is erger dan één die ze
      // benoemt. Leeg = volledig voor de tabellen zonder eigen-rij leesrecht.
      ...(onvolledig.length > 0 ? { onvolledig } : {}),
      tables,
    }

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="trifinity-mijn-gegevens-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (err) {
    return serverError(err, 'account-export:GET')
  }
}
