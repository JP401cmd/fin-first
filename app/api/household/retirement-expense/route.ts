import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * Huishoud-brede "uitgave na pensioen" — aanpasbaar door BEIDE partners.
 *
 * GET  → de opgeslagen methode + eigen bedrag + aspiraties (questionnaire-antwoorden).
 * PUT  → opslaan via de SECURITY DEFINER RPC `set_household_retirement_expense`
 *        (leden-scoped; de households UPDATE-RLS is owner-only, de RPC staat elk
 *        lid van het huishouden toe deze drie kolommen te zetten).
 *
 * Default (geen rij/`null` methode) = `auto_shared`: gedeelde vaste lasten tellen
 * één keer mee. Andere methodes: `sum_partners` (som van beide individuen) en
 * `custom_amount` (zelf samengesteld via de vragen-flow).
 */

const METHODS = ['auto_shared', 'sum_partners', 'custom_amount'] as const
type Method = (typeof METHODS)[number]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })

  const { data: hh } = await supabase
    .from('households')
    .select('retirement_expense_method, retirement_expense_custom_amount, retirement_aspirations')
    .eq('id', membership.household_id)
    .maybeSingle()

  return NextResponse.json({
    householdId: membership.household_id,
    method: (hh?.retirement_expense_method ?? 'auto_shared') as Method,
    customAmount: hh?.retirement_expense_custom_amount ?? null,
    aspirations: hh?.retirement_aspirations ?? null,
  })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await request.json().catch(() => ({}))
  const method = body.method as string | undefined
  if (!method || !METHODS.includes(method as Method)) {
    return NextResponse.json({ error: 'Ongeldige methode' }, { status: 400 })
  }

  // Eigen bedrag alleen bij custom_amount; anders bewust null zodat de projectie
  // op de berekende kandidaat terugvalt.
  const customAmount =
    method === 'custom_amount' && typeof body.customAmount === 'number' && body.customAmount > 0
      ? Math.round(body.customAmount)
      : null
  const aspirations = body.aspirations ?? null

  const { data, error } = await supabase.rpc('set_household_retirement_expense', {
    p_method: method,
    p_amount: customAmount,
    p_aspirations: aspirations,
  })
  if (error) return serverError(error, 'household-retirement-expense:PUT')

  const result = data as { success?: boolean; error?: string } | null
  if (!result?.success) {
    return NextResponse.json({ error: result?.error ?? 'Opslaan mislukt' }, { status: 400 })
  }
  return NextResponse.json({ success: true, method, customAmount, aspirations })
}

// De UI kan zowel PUT als POST gebruiken — alias zodat 405 niet voorkomt.
export async function POST(request: NextRequest) {
  return PUT(request)
}
