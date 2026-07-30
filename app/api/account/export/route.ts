import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { EXPORT_SESSION_TABLES } from '@/lib/user-data-tables'
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
 * is de volledige alles-in-één variant. Enkele operationele/afgeschermde tabellen
 * (logs, net_worth_history) vallen buiten de zelf-service-export en zitten in de
 * superadmin-inzage-export (/api/admin/user-export, service-role, audit-gelogd).
 */
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
    const results = await Promise.all(
      EXPORT_SESSION_TABLES.map(async (table) => {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', claims.sub)
        // RLS-afscherming of een ontbrekende tabel levert een lege set, geen 500:
        // een export mag niet breken op één tabel. De echte fout is server-side
        // niet nodig (leeg = leeg voor de gebruiker).
        //
        // `shapeExportRows` maakt van de ruwe `select('*')` een geldige AVG-vorm:
        // het rekeningnummer ontsleuteld en leesbaar, de crypto-kolommen
        // (`iban_encrypted`/`iban_hash`) en de bank-/exchange-/broker-tokens eruit.
        // Zie `lib/account-export-shape.ts` voor waarom die er niet in horen.
        const rows = error ? [] : ((data ?? []) as ExportRow[])
        return [table, shapeExportRows(table, rows, decryptField)] as const
      }),
    )
    for (const [table, rows] of results) {
      tables[table] = rows
    }

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: claims.sub,
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
