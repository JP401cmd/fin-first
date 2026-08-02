import { NextResponse } from 'next/server'
import { forbidden } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getDefaultFullPrompt } from '@/lib/ai/dna'

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const prompt = getDefaultFullPrompt('wil')
  return NextResponse.json({ prompt })
}
