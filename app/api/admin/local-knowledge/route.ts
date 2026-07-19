import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { parseLocalKnowledge } from '@/lib/ai/local/knowledge-context'
import { LocalKnowledgePutSchema } from '@/lib/ai/local/knowledge-schema'

/**
 * Beheer-API voor de kennisbank lokale AI (fase K1).
 *
 * Opslag: de volledige itemlijst als JSON in `app_settings.local_knowledge`
 * (géén eigen tabel — <20 items, spiegelt het coach_config-patroon). Toegang:
 * superadmin-gate op de ingelogde client; alle DB-toegang via `getServiceClient`
 * (service-role, ADR 0006 — beheer leest/schrijft nooit via de anon client).
 *
 * De kennisbank bevat UITLEG en begrippen, nooit cijfers/tarieven — die harde
 * inhoudsregel is redactioneel (beheer-UI + review), niet technisch afgedwongen.
 * Deze route is puur CRUD-opslag; de injectie in de lokale chat komt in C1b.
 */

const SETTINGS_KEY = 'local_knowledge'

/** Ingelogd-én-superadmin poort; 401 als niet ingelogd, 403 als geen superadmin. */
type GateResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

async function gateSuperAdmin(): Promise<GateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (!(await isSuperAdmin(supabase))) return { ok: false, response: forbidden() }
  return { ok: true, userId: user.id }
}

/** GET — de volledige kennisbank, op opgeslagen volgorde. */
export async function GET() {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const service = getServiceClient()
  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) return serverError(error, 'admin-local-knowledge:GET')

  return NextResponse.json({ items: parseLocalKnowledge(data?.value) })
}

/** PUT — sla de volledige kennisbank op (client stuurt de hele lijst). */
export async function PUT(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(LocalKnowledgePutSchema, req)
  if (!parsed.ok) return parsed.response

  const service = getServiceClient()
  const { error } = await service.from('app_settings').upsert(
    {
      key: SETTINGS_KEY,
      value: JSON.stringify(parsed.data.items),
      updated_at: new Date().toISOString(),
      updated_by: gate.userId,
    },
    { onConflict: 'key' },
  )

  if (error) return serverError(error, 'admin-local-knowledge:PUT')

  return NextResponse.json({ success: true })
}
