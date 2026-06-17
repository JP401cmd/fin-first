import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { probeIntegrations } from '@/lib/integrations/health-probe'

export async function POST(request: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    const reachable = results.filter((r) => r.ok === true).length
    const unreachable = results.filter((r) => r.ok === false).length
    const notProbeable = results.filter((r) => r.ok === null).length

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        reachable,
        unreachable,
        notProbeable,
      },
    })
  } catch (err) {
    console.error('Integraties health-probe error:', err)
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Health-probe mislukt',
      },
      { status: 500 }
    )
  }
}
