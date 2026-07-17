import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entity_id')
  const entityType = searchParams.get('entity_type') || 'asset'
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(Number(limitParam), 1000) : 1000

  let query = supabase
    .from('valuations')
    .select('*')
    .eq('user_id', user.id)
    .eq('entity_type', entityType)
    .order('valuation_date', { ascending: false })
    .limit(limit)

  if (entityId) {
    query = query.eq('entity_id', entityId)
  }

  const { data, error } = await query

  if (error) {
    return serverError(error, 'valuations:GET')
  }

  return NextResponse.json({ valuations: data, count: data?.length || 0 })
}
