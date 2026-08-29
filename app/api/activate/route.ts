import { createClient } from '@/lib/supabase/server'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData } from '@/lib/seed-persona'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * De hele handler-body staat in één try/catch (bevinding L6, 24 aug 2026).
 *
 * `deleteAllUserData()`/`seedPersonaData()` gooien bij élke mislukte insert of
 * delete een kale `Error` — dáár correct, want die functies verwachten een
 * vangende caller, precies zoals zusterroute `app/api/admin/seed/route.ts` doet.
 * Zonder deze guard propageerde zo'n throw naar Next.js' eigen foutafhandeling
 * en kreeg de client een 500 met een VOLLEDIG LEGE body — buiten de platte
 * error-envelope van ADR 0044 (`lib/api/respond.ts`) om, dus zonder iets om te
 * tonen en zonder grep-bare tag in de logs. `serverError()` logt de echte fout
 * server-side onder `activate:POST` en stuurt alleen de generieke tekst terug.
 * Vastgelegd in `route.test.ts`.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return unauthorized()
    }

    // Verify last_known_phase is NULL (prevent double activation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_known_phase')
      .eq('id', user.id)
      .single()

    if (profile && profile.last_known_phase !== null) {
      return Response.json({ error: 'Already activated' }, { status: 400 })
    }

    // Check if this is a test user with a linked persona seed
    const personaKey = user.user_metadata?.test_persona_key as string | undefined
    if (personaKey && PERSONAS[personaKey as PersonaKey]) {
      const persona = PERSONAS[personaKey as PersonaKey]

      // Seed persona data (replaces any onboarding data)
      const noop = () => {}
      await deleteAllUserData(supabase, user.id, noop)
      await seedPersonaData(supabase, user.id, persona, noop)
      await supabase.from('profiles').update({ is_demo_user: true }).eq('id', user.id)
    }

    // Fetch financial data to compute current phase (after potential seeding)
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const dateStr = threeMonthsAgo.toISOString().split('T')[0]

    const [assetsRes, debtsRes, txRes] = await Promise.all([
      supabase.from('assets').select('current_value').eq('user_id', user.id).eq('is_active', true),
      supabase.from('debts').select('current_balance, debt_type').eq('user_id', user.id).eq('is_active', true),
      supabase.from('transactions').select('amount, is_income').eq('user_id', user.id).gte('date', dateStr),
    ])

    const { phase } = computeFeatureAccess({
      assets: assetsRes.data ?? [],
      debts: debtsRes.data ?? [],
      transactions: txRes.data ?? [],
      activeSubscriptions: [],
      userFeaturePrefs: null,
    })

    const { error } = await supabase
      .from('profiles')
      .update({ last_known_phase: phase })
      .eq('id', user.id)

    if (error) {
      return serverError(error, 'activate:POST')
    }

    return Response.json({ success: true, phase, seeded: !!personaKey })
  } catch (err) {
    return serverError(err, 'activate:POST')
  }
}
