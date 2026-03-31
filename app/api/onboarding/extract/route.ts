import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'

// ── Validation Schema ──────────────────────────────────────────────

const bodySchema = z.object({
  text: z.string().min(1).max(500),
  age: z.number().int().min(18).max(120).optional(),
  householdType: z.string().optional(),
  monthlyIncome: z.number().positive().optional(),
  monthlyExpenses: z.number().positive().optional(),
})

// ── POST — Run extraction for onboarding review ────────────────────
// Authenticated (not admin-only) so the onboarding flow can call it
// before saving. Returns structured extraction results for user review.

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = await req.json()
  const parsed = bodySchema.safeParse(raw)

  if (!parsed.success) {
    return Response.json({ error: 'Ongeldige invoer' }, { status: 400 })
  }

  try {
    const result = await extractFinancialData(supabase, parsed.data.text, {
      age: parsed.data.age,
      householdType: parsed.data.householdType,
      monthlyIncome: parsed.data.monthlyIncome,
      monthlyExpenses: parsed.data.monthlyExpenses,
    })

    return Response.json(result)
  } catch (err) {
    console.error('[onboarding/extract] Extraction error:', err)
    return Response.json({ error: 'Extractie mislukt' }, { status: 500 })
  }
}
