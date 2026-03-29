import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateModules, ALL_MODULES, type ModuleId } from '@/lib/module-registry'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('active_modules')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const activeModules = (profile?.active_modules as ModuleId[] | null) ?? []

  return NextResponse.json({ activeModules })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { modules?: unknown }

  if (!Array.isArray(body.modules)) {
    return NextResponse.json({ error: 'Invalid payload: modules must be an array' }, { status: 400 })
  }

  // Strip unknown module IDs — only accept values present in the catalog
  const knownModules = new Set<string>(ALL_MODULES)
  const sanitized = body.modules.filter(
    (m): m is ModuleId => typeof m === 'string' && knownModules.has(m),
  )

  // Validate dependency rules (hard requires, requiresOneOf, foundational minimum)
  const { valid, errors } = validateModules(sanitized)
  if (!valid) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active_modules: sanitized })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ activeModules: sanitized })
}
