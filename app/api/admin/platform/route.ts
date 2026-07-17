import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { parsePlatformStatus } from '@/lib/platform-status'
import { logAdminAction } from '@/lib/admin-audit'

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'platform_status')
    .maybeSingle()

  return NextResponse.json(parsePlatformStatus(data?.value as string | undefined))
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const body = await req.json().catch(() => ({}))
  // Normaliseer via parse: dwingt het schema af, vult ontbrekende velden, en
  // voorkomt dat AI per ongeluk uit gaat door een corrupt veld.
  const status = parsePlatformStatus(JSON.stringify(body))

  const { error } = await supabase.from('app_settings').upsert(
    {
      key: 'platform_status',
      value: JSON.stringify(status),
      updated_at: new Date().toISOString(),
      updated_by: user?.id,
    },
    { onConflict: 'key' },
  )

  if (error) {
    return serverError(error, 'admin-platform:PUT')
  }

  if (user) {
    await logAdminAction(supabase, {
      actorId: user.id,
      actorEmail: user.email,
      action: 'config.update',
      targetLabel: 'platform_status',
      detail: {
        maintenance: status.maintenance.enabled,
        announcement: status.announcement.enabled,
        ai: status.killSwitches.ai,
      },
    })
  }

  return NextResponse.json({ success: true, status })
}
