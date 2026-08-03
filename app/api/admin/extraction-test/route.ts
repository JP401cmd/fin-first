import { NextResponse } from 'next/server'
import { forbidden, badRequest } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'

// ── POST — Run extraction without saving to the database ────────

export async function POST(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  // PRIVÉ-MODUS — bewust NÁ de superadmin-check: wie hier niets te zoeken heeft
  // krijgt "geen toegang", niet "privé-modus staat aan" (dat laatste zou een
  // instelling van een ander verklappen). Maar wél vóór de extractie zelf.
  // Waarom die volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating; (2) een geblokkeerde call mag geen
  // credits kosten; (3) er mag geen letter richting promptopbouw gaan. Dat dit
  // een testtool is maakt het niet vrijblijvend: de beheerder plakt hier vrije
  // tekst over een financiële situatie in, en de privé-keuze van diens eigen
  // account geldt onverkort.
  // De model-call zit hier niet in de route maar in extractFinancialData
  // (lib/ai/extract-financial-data.ts); de gate hoort dus vóór die aanroep.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Onbereikbaar in de praktijk — isSuperAdmin geeft zonder sessie al false —
    // maar nodig om `user.id` te mogen lezen zonder aanname.
    return forbidden()
  }
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'documenten')
  if (privacyGate) return privacyGate

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
