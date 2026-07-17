import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data, error } = await supabase
    .from('aow_leeftijd')
    .select('*')
    .order('birth_date_from', { ascending: true })

  if (error) {
    return serverError(error, 'admin-aow-leeftijd:GET')
  }

  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source } = body

  if (!birth_date_from || !birth_date_through || aow_years == null) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('aow_leeftijd')
    .insert({
      birth_date_from,
      birth_date_through,
      aow_years,
      aow_months: aow_months ?? 0,
      is_definitive: is_definitive ?? false,
      source: source ?? 'SVB',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return serverError(error, 'admin-aow-leeftijd:POST')
  }

  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('aow_leeftijd')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return serverError(error, 'admin-aow-leeftijd:PUT')
  }

  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  }

  const { error } = await supabase
    .from('aow_leeftijd')
    .delete()
    .eq('id', id)

  if (error) {
    return serverError(error, 'admin-aow-leeftijd:DELETE')
  }

  return NextResponse.json({ success: true })
}
