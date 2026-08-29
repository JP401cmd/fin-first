import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { summarizeNewsFeedback, type NewsFeedbackRow } from '@/lib/news-feedback-summary'

/**
 * GET /api/admin/news-feedback — het ALLEEN-LEZEN aggregaat achter de
 * feedbacksectie op `/beheer/nieuws` (ADR 0113).
 *
 * WAAROM SERVICE-ROLE EN GEEN SUPERADMIN-POLICY (besluit C2). ADR 0006 somt
 * zijn uitzonderingen op de "geen brede beheer-policies"-regel LETTERLIJK op:
 * `feedback`, `error_logs`, `mail_log`, `job_runs`, `ai_usage` — operationele
 * tabellen zonder persoonlijke financiën. `news_feedback` staat daar niet bij en
 * hoort daar ook niet: hij zit in `ALL_USER_SCOPED_TABLES` én in de AVG-export
 * van de gebruiker. Een superadmin-SELECT-policy erop zou de uitzonderingslijst
 * van dat ADR uitbreiden — dat is een ADR-amendement, geen implementatiekeuze.
 * De service-role-route vraagt niets van het ADR en laat de eigen-rij-RLS
 * ongemoeid.
 *
 * De prijs van service-role is dat RLS hier géén tweede slot is. Daarom:
 *  - `isSuperAdmin()` op de INGELOGDE client (niet de service-client) vóór er
 *    ook maar iets gelezen wordt;
 *  - `logAdminAction` bij elke geslaagde inzage, zoals de supportview;
 *  - de service-client leest een expliciete kolomlijst, nooit `select('*')`.
 *
 * PRIVACY. `user_id` wordt wél gelezen — de demotieregel van `/api/news` is per
 * gebruiker, dus zonder die sleutel kun je het effect niet eerlijk weergeven —
 * maar verlaat de server nooit: `summarizeNewsFeedback` geeft er uitsluitend
 * TELLINGEN van terug. Beheer ziet "welke categorieën dempen mensen", niet "wie
 * dempte wat".
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Leesvenster. 1000 = de PostgREST-cap uit `supabase/config.toml`
 * (`max_rows = 1000`); een client-`.limit()` daarboven is een no-op, dus een
 * hoger getal zou alleen maar suggereren dat we meer lezen dan we doen.
 * `truncated` komt daarom uit een aparte head-count, niet uit `rows.length`.
 */
const MAX_ROWS = 1000

const COLUMNS = 'user_id, article_id, headline, category, verdict, created_at'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  try {
    const service = getServiceClient()
    const [page, total] = await Promise.all([
      service
        .from('news_feedback')
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
      service.from('news_feedback').select('id', { count: 'exact', head: true }),
    ])

    if (page.error) return serverError(page.error, 'admin-news-feedback:GET')

    const rows = (page.data ?? []) as unknown as NewsFeedbackRow[]
    const summary = summarizeNewsFeedback(rows)

    await logAdminAction(service, {
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: 'news-feedback.read',
      detail: { rows: rows.length },
    })

    return NextResponse.json(
      { summary, truncated: (total.count ?? rows.length) > rows.length },
      // Aggregaat over lezersgedrag: niet in een browser-/bfcache laten staan.
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return serverError(err, 'admin-news-feedback:GET')
  }
}
