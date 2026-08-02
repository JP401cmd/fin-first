import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData, countSeedSteps, assertSeedSchema, SeedSchemaError } from '@/lib/seed-persona'
import { unauthorized, forbidden, badRequest } from '@/lib/api/respond'


export async function POST(req: Request) {
  const supabase = await createClient()

  // Step 1: Verify superadmin
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const body = await req.json()
  const personaKey = body.persona as PersonaKey
  if (!personaKey || !PERSONAS[personaKey]) {
    return badRequest('Ongeldige persona')
  }

  const persona = PERSONAS[personaKey]
  const userId = user.id

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      // Dynamisch: 5 delete-stappen + 4 vaste insert-stappen + evt. 2 conditionele
      // (balance_snapshots / appSettings). Nooit hardcoden — dan driftte de balk >100%.
      const totalSteps = countSeedSteps(persona)
      let currentStep = 0

      function progress(step: string, table: string, action: string, count?: number) {
        currentStep++
        // Clamp als extra vangnet: mocht een nieuwe onProgress-aanroep ooit vergeten
        // worden mee te tellen in countSeedSteps, dan toont de balk nooit >100%.
        const pct = Math.min(100, Math.round((currentStep / totalSteps) * 100))
        send({ step, progress: pct, table, action, ...(count !== undefined ? { count } : {}) })
      }

      try {
        // Fail-safe preflight: valideer het schema vóór de destructieve wipe.
        // Zonder dit wist een seed eerst álle data en faalt daarna op een
        // ontbrekende kolom (schema-drift), waardoor het account leeg-maar-niet-
        // hersteld achterblijft. Bij drift: meld het en STOP — niets gewist.
        try {
          await assertSeedSchema(supabase, userId, persona)
        } catch (preErr) {
          if (preErr instanceof SeedSchemaError) {
            console.error(`[admin-seed:POST] schema-preflight afgebroken: ${preErr.message}`)
            send({ error: preErr.message })
            return // finally sluit de stream; deleteAllUserData is NIET aangeroepen
          }
          throw preErr
        }

        // Phase 1: Delete all user data
        await deleteAllUserData(supabase, userId, progress)

        // Phase 2+3: Insert persona data
        const summary = await seedPersonaData(supabase, userId, persona, progress)

        // Reset last_known_phase so activation FAB appears + markeer als
        // demo. De demo-vlag is de levenscyclus-marker: elke persona-seed
        // zet 'm aan (net als /api/onboarding/seed en /api/activate), en
        // save-own-data wist demo-restanten en zet 'm weer uit. Zonder deze
        // markering liet een admin-seed op het eigen account persona-data
        // achter die her-onboarding nooit opruimde (13 jul 2026).
        await supabase
          .from('profiles')
          .update({ last_known_phase: null, is_demo_user: true })
          .eq('id', userId)

        // Done
        send({ done: true, summary })
      } catch (err) {
        // Geen rauwe error.message de stream in (AVG/ADR 0044): log server-side
        // met tag, stuur een generieke tekst naar de client. serverError() geeft
        // een NextResponse terug en is hier binnen de ReadableStream niet bruikbaar.
        console.error(`[admin-seed:POST] ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? (err.stack ?? '') : '')
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
