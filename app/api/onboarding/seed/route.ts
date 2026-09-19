import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData, countSeedSteps } from '@/lib/seed-persona'
import { unauthorized, forbidden } from '@/lib/api/respond'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // Check not already completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    return forbidden('Onboarding already completed')
  }

  const body = await req.json()
  const { type } = body

  if (type !== 'persona') {
    return new Response(JSON.stringify({ error: 'Ongeldig type. Gebruik "persona".' }), { status: 400 })
  }

  const personaKey = body.persona as PersonaKey
  if (!personaKey || !PERSONAS[personaKey]) {
    return new Response(JSON.stringify({ error: 'Ongeldige persona' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      // Dynamisch: 5 delete-stappen + 4 vaste insert-stappen + evt. 2 conditionele
      // (balance_snapshots / appSettings). Nooit hardcoden — dan driftte de balk >100%.
      const totalSteps = countSeedSteps(PERSONAS[personaKey])
      let currentStep = 0

      function progress(step: string, table: string, action: string, count?: number) {
        currentStep++
        // Clamp als extra vangnet: mocht een nieuwe onProgress-aanroep ooit vergeten
        // worden mee te tellen in countSeedSteps, dan toont de balk nooit >100%.
        const pct = Math.min(100, Math.round((currentStep / totalSteps) * 100))
        send({ step, progress: pct, table, action, ...(count !== undefined ? { count } : {}) })
      }

      try {
        const persona = PERSONAS[personaKey]

        // Phase 1: Delete existing data.
        // Service-role voor de RLS-afgeschermde persoonlijke tabellen (afgeronde
        // vragenlijst-sessies, feedback, user_reports, net_worth_history) en de
        // bucket-prefix, die de sessie-client niet kan wissen — zonder
        // `{ service }` is die stap een stille no-op. Best-effort zonder
        // service-key (dev). Zelfde patroon als app/api/onboarding/reset; géén
        // fullErase (reseed, geen accountverwijdering).
        const hasServiceKey =
          !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
        const service = hasServiceKey ? getServiceClient() : undefined
        await deleteAllUserData(supabase, user.id, progress, { service })

        // Phase 2: Insert persona data
        const summary = await seedPersonaData(supabase, user.id, persona, progress)

        // Phase 3: Mark onboarding complete + set as demo user
        await supabase
          .from('profiles')
          .update({
            onboarding_completed: true,
            is_demo_user: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)

        send({ done: true, summary })
      } catch (err) {
        // Geen rauwe error.message de stream in (AVG/ADR 0044): log server-side
        // met tag, stuur een generieke tekst naar de client — spiegel van
        // app/api/admin/seed. serverError() geeft een NextResponse terug en is
        // hier binnen de ReadableStream niet bruikbaar.
        console.error(`[onboarding-seed:POST] ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? (err.stack ?? '') : '')
        send({ error: 'Er ging iets mis. Probeer het later opnieuw.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
