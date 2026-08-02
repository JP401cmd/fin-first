import { NextResponse } from 'next/server'
import { forbidden, badRequest } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'

// ── POST — Run extraction without saving to the database ────────

export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { text, age, householdType, monthlyIncome, monthlyExpenses } = body

  if (!text || typeof text !== 'string') {
    return badRequest('Text is required')
  }

  const result = await extractFinancialData(supabase, text, {
    age: age ?? undefined,
    householdType: householdType ?? undefined,
    monthlyIncome: monthlyIncome ?? undefined,
    monthlyExpenses: monthlyExpenses ?? undefined,
  })

  return NextResponse.json(result)
}
