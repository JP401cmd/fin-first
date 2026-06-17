import { redirect } from 'next/navigation'
import type { CheckReportData } from '@/lib/check/types'
import { RapportView } from '@/components/check/rapport/RapportView'
import { SAMPLE_REPORT } from '@/components/check/rapport/sample-report'

/**
 * Publieke rapport-render `/check/rapport?token=<uuid>`.
 *
 * Server-component:
 *   1. leest `token` uit de querystring;
 *   2. haalt de versleutelde `report_snapshot` (eigenlijk: de afgeleide
 *      CheckReportData) uit `lead_intakes` via de service-client;
 *   3. valideert (bestaat, niet verlopen) en geeft door aan de client-render.
 *
 * Bij ontbrekend/ongeldig/verlopen token → redirect `/check?expired=1`.
 *
 * Preview-pad (`?preview=1`, of géén token in dev): rendert de sample-fixture
 * zodat de visuele port te valideren is zónder werkende backend/DB.
 *
 * NB: `report_snapshot` is per migratie (ADR 0022) PLAIN jsonb met afgeleide
 * getallen/labels (géén ruwe PII). De `intake_encrypted`-blob blijft versleuteld
 * en wordt hier NIET gelezen. Mocht een toekomstige variant het rapport tóch
 * versleuteld opslaan, dan ontsleutelt deze route via `decryptField`.
 */

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const EXPIRED_REDIRECT = '/check?expired=1'

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Haalt het rapport op voor een token; null bij ontbreken/fout/verloop. */
async function loadReportForToken(
  token: string,
): Promise<CheckReportData | null> {
  // Lazy imports: de service-client + crypto raken env-vars aan die in de
  // preview/dev zonder backend ontbreken. Door ze pas in dit pad te laden,
  // crasht het preview-pad nooit op een ontbrekende SUPABASE_SERVICE_ROLE_KEY.
  let getServiceClient: typeof import('@/lib/supabase/service').getServiceClient
  let decryptField: typeof import('@/lib/crypto/field-encryption').decryptField
  try {
    ;({ getServiceClient } = await import('@/lib/supabase/service'))
    ;({ decryptField } = await import('@/lib/crypto/field-encryption'))
  } catch {
    return null
  }

  let supabase
  try {
    supabase = getServiceClient()
  } catch {
    // Ontbrekende env-vars → behandel als "niet beschikbaar".
    return null
  }

  interface LeadIntakeRow {
    report_snapshot: unknown
    intake_encrypted: string | null
    expires_at: string | null
    converted_user_id: string | null
  }

  let row: LeadIntakeRow | null = null

  try {
    const { data, error } = await supabase
      .from('lead_intakes')
      .select('report_snapshot, intake_encrypted, expires_at, converted_user_id')
      .eq('token', token)
      .maybeSingle()
    // Tabel bestaat mogelijk (nog) niet als runtime-data → error i.p.v. crash.
    if (error) return null
    row = (data as unknown as LeadIntakeRow | null) ?? null
  } catch {
    return null
  }

  if (!row) return null

  // Verlopen + niet-geconverteerd → niet meer tonen.
  if (row.expires_at && !row.converted_user_id) {
    const expires = new Date(row.expires_at).getTime()
    if (Number.isFinite(expires) && expires < Date.now()) {
      return null
    }
  }

  // Primaire bron: plain `report_snapshot` (afgeleide DTO, ADR 0022).
  if (row.report_snapshot && typeof row.report_snapshot === 'object') {
    return row.report_snapshot as CheckReportData
  }

  // Fallback: een toekomstige variant kan het rapport versleuteld in
  // `intake_encrypted` meedragen — ontsleutel en parse defensief.
  if (row.intake_encrypted) {
    try {
      const plain = decryptField(row.intake_encrypted)
      if (plain) {
        const parsed = JSON.parse(plain)
        if (parsed && typeof parsed === 'object' && 'masthead' in parsed) {
          return parsed as CheckReportData
        }
      }
    } catch {
      return null
    }
  }

  return null
}

export default async function CheckRapportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const token = firstParam(params.token)
  const preview = firstParam(params.preview) === '1'

  // Preview-pad: expliciet ?preview=1, of geen token tijdens lokale dev.
  if (preview || (!token && process.env.NODE_ENV !== 'production')) {
    return <RapportView report={SAMPLE_REPORT} />
  }

  if (!token) {
    redirect(EXPIRED_REDIRECT)
  }

  const report = await loadReportForToken(token)
  if (!report) {
    redirect(EXPIRED_REDIRECT)
  }

  // Token doordragen naar de CTA-href, zodat /signup de lead kan koppelen.
  const reportWithToken: CheckReportData = {
    ...report,
    cta: {
      ...report.cta,
      signupHref: `/signup?check=${encodeURIComponent(token)}`,
    },
  }

  return <RapportView report={reportWithToken} />
}
