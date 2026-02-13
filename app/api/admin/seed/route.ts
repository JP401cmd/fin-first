import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData } from '@/lib/seed-persona'


export async function POST(req: Request) {
  const supabase = await createClient()

  // Step 1: Verify superadmin
  if (!(await isSuperAdmin(supabase))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await req.json()
  const personaKey = body.persona as PersonaKey
  if (!personaKey || !PERSONAS[personaKey]) {
    return new Response(JSON.stringify({ error: 'Ongeldige persona' }), { status: 400 })
  }

  const persona = PERSONAS[personaKey]
  const userId = user.id

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      const totalSteps = 6 // delete (3 batches) + insert (3 phases)
      let currentStep = 0

      function progress(step: string, table: string, action: string, count?: number) {
        currentStep++
        const pct = Math.round((currentStep / totalSteps) * 100)
        send({ step, progress: pct, table, action, ...(count !== undefined ? { count } : {}) })
      }

      try {
        // Phase 1: Delete all user data
        await deleteAllUserData(supabase, userId, progress)

        // Phase 2+3: Insert persona data
        const summary = await seedPersonaData(supabase, userId, persona, progress)

        // Reset last_known_phase so activation FAB appears
        await supabase
          .from('profiles')
          .update({ last_known_phase: null })
          .eq('id', userId)

        // Done
        send({ done: true, summary })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Onbekende fout'
        send({ error: message })
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
