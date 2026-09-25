import { NextResponse } from 'next/server'
import { forbidden } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { probeIntegrations, summarizeProbes } from '@/lib/integrations/health-probe'

export async function POST(request: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  try {
    let ids: string[] | undefined
    try {
      const body = await request.json() as { ids?: unknown }
      if (Array.isArray(body.ids) && body.ids.every((id) => typeof id === 'string')) {
        ids = body.ids as string[]
      }
    } catch {
      // body is leeg of geen geldige JSON → probe alles
    }

    const results = await probeIntegrations(ids)

    // Dezelfde telling als de dagelijkse cron-rij (`summarizeProbes`), zodat de
    // beheerpagina en het meldkanaal niet uiteen kunnen lopen over de vraag wat
    // een storing is. Een begrensde dienst (HTTP 429) is bereikbaar.
    const { ok: reachable, failed: unreachable, rateLimited, notProbeable } =
      summarizeProbes(results)

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        reachable,
        unreachable,
        rateLimited,
        notProbeable,
      },
    })
  } catch (err) {
    console.error('Integraties health-probe error:', err)
    return NextResponse.json(
      {
        success: false,
        // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
        message: err instanceof Error ? err.message : 'Health-probe mislukt',
      },
      { status: 500 }
    )
  }
}
