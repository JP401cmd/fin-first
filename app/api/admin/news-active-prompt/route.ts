import { NextResponse } from 'next/server'
import { forbidden } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { NEWS_SYSTEM_PROMPT } from '@/lib/news-system-prompt'

// ── GET — Return the active (hardcoded) news system prompt ───────────
//
// This is different from the admin-editable prompt in app_settings.
// This shows what the AI actually receives as its system instruction.

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  return NextResponse.json({ prompt: NEWS_SYSTEM_PROMPT })
}
