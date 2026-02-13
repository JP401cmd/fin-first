import { generateObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { PERSONAS, type PersonaKey, makeBudgets } from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData } from '@/lib/seed-persona'
import {
  aiStep1Schema,
  aiStep2Schema,
  aiStep3Schema,
  aiStep4Schema,
  buildStep1Prompt,
  buildStep2Prompt,
  buildStep3Prompt,
  buildStep4Prompt,
  type AIPersonaOutput,
  type AIStep1Output,
  type AIStep2Output,
} from '@/lib/ai/schemas/onboarding-schema'
import type { PersonaData } from '@/lib/test-personas'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Check not already completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    return new Response(JSON.stringify({ error: 'Onboarding already completed' }), { status: 403 })
  }

  const body = await req.json()
  const { type } = body

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      let totalSteps = 6 // delete (3 batches) + insert (3 phases)
      if (type === 'ai') totalSteps = 9 // +3 for AI steps (step1, step2||4 parallel, step3)
      let currentStep = 0

      function progress(step: string, table: string, action: string, count?: number) {
        currentStep++
        const pct = Math.round((currentStep / totalSteps) * 100)
        send({ step, progress: pct, table, action, ...(count !== undefined ? { count } : {}) })
      }

      try {
        let persona: PersonaData
        let tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined

        if (type === 'persona') {
          // ── Persona path: use predefined data ──────────────
          const personaKey = body.persona as PersonaKey
          if (!personaKey || !PERSONAS[personaKey]) {
            send({ error: 'Ongeldige persona' })
            controller.close()
            return
          }
          persona = PERSONAS[personaKey]
        } else if (type === 'ai') {
          // ── AI path: generate from per-topic descriptions ──
          const descriptions = body.descriptions as { profile?: string; assets?: string; spending?: string; goals?: string } | undefined
          const profileDesc = (descriptions?.profile ?? '').trim()
          if (profileDesc.length < 20) {
            send({ error: 'Profielbeschrijving te kort. Vertel iets meer over jezelf.' })
            controller.close()
            return
          }
          const assetsDesc = (descriptions?.assets ?? '').trim()
          const spendingDesc = (descriptions?.spending ?? '').trim()
          const goalsDesc = (descriptions?.goals ?? '').trim()

          let model
          try {
            model = await getModel(supabase)
          } catch (err) {
            if (err instanceof AIConfigError) {
              send({ error: `AI niet geconfigureerd: ${err.message}` })
            } else {
              send({ error: 'AI model kon niet worden geladen.' })
            }
            controller.close()
            return
          }

          // Token usage tracker
          tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

          // ── Step 1: Use prefetched data or generate ────────
          let step1: AIStep1Output

          const prefetchedStep1 = body.prefetchedStep1 as unknown
          if (prefetchedStep1) {
            const parsed = aiStep1Schema.safeParse(prefetchedStep1)
            if (parsed.success) {
              step1 = parsed.data
              currentStep++
              send({ step: 'Profiel uit prefetch geladen', progress: Math.round((currentStep / totalSteps) * 100), table: 'ai', action: 'step1-done' })
            } else {
              // Fallback: prefetch data invalid, generate fresh
              console.warn('Prefetch validation failed, regenerating step 1:', parsed.error.message)
              send({ step: 'Profiel & bankrekeningen aanmaken...', progress: 2, table: 'ai', action: 'step1' })
              try {
                const result = await generateObject({
                  model,
                  schema: aiStep1Schema,
                  system: buildStep1Prompt(profileDesc),
                  prompt: 'Genereer profiel, budget-bedragen en bankrekeningen op basis van de beschrijving.',
                })
                step1 = result.object
                tokenUsage.inputTokens += result.usage.inputTokens ?? 0
                tokenUsage.outputTokens += result.usage.outputTokens ?? 0
                tokenUsage.totalTokens += (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
              } catch (err) {
                console.error('AI step 1 failed:', err)
                const message = err instanceof Error ? err.message : 'Onbekende fout'
                send({ error: `AI-generatie stap 1 mislukt: ${message}` })
                controller.close()
                return
              }
              currentStep++
              send({ step: 'Profiel & bankrekeningen aangemaakt', progress: Math.round((currentStep / totalSteps) * 100), table: 'ai', action: 'step1-done' })
            }
          } else {
            // No prefetch: generate step 1
            send({ step: 'Profiel & bankrekeningen aanmaken...', progress: 2, table: 'ai', action: 'step1' })
            try {
              const result = await generateObject({
                model,
                schema: aiStep1Schema,
                system: buildStep1Prompt(profileDesc),
                prompt: 'Genereer profiel, budget-bedragen en bankrekeningen op basis van de beschrijving.',
              })
              step1 = result.object
              tokenUsage.inputTokens += result.usage.inputTokens ?? 0
              tokenUsage.outputTokens += result.usage.outputTokens ?? 0
              tokenUsage.totalTokens += (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
            } catch (err) {
              console.error('AI step 1 failed:', err)
              const message = err instanceof Error ? err.message : 'Onbekende fout'
              send({ error: `AI-generatie stap 1 mislukt: ${message}` })
              controller.close()
              return
            }
            currentStep++
            send({ step: 'Profiel & bankrekeningen aangemaakt', progress: Math.round((currentStep / totalSteps) * 100), table: 'ai', action: 'step1-done' })
          }

          // ── Steps 2 + 4 in parallel ───────────────────────
          send({ step: 'Bezittingen, doelen & aanbevelingen genereren...', progress: Math.round((currentStep / totalSteps) * 100), table: 'ai', action: 'step2+4' })

          let step2: AIStep2Output
          let step4
          try {
            const [step2Result, step4Result] = await Promise.all([
              generateObject({
                model,
                schema: aiStep2Schema,
                system: buildStep2Prompt(assetsDesc, step1),
                prompt: 'Genereer bezittingen en schulden passend bij het profiel.',
              }),
              generateObject({
                model,
                schema: aiStep4Schema,
                system: buildStep4Prompt(goalsDesc, step1),
                prompt: 'Genereer doelen, levensgebeurtenissen, aanbevelingen met acties, en net_worth_snapshots.',
              }),
            ])

            step2 = step2Result.object
            step4 = step4Result.object

            tokenUsage.inputTokens += (step2Result.usage.inputTokens ?? 0) + (step4Result.usage.inputTokens ?? 0)
            tokenUsage.outputTokens += (step2Result.usage.outputTokens ?? 0) + (step4Result.usage.outputTokens ?? 0)
            tokenUsage.totalTokens += (step2Result.usage.inputTokens ?? 0) + (step2Result.usage.outputTokens ?? 0)
              + (step4Result.usage.inputTokens ?? 0) + (step4Result.usage.outputTokens ?? 0)
          } catch (err) {
            console.error('AI step 2+4 failed:', err)
            const message = err instanceof Error ? err.message : 'Onbekende fout'
            send({ error: `AI-generatie stap 2/4 mislukt: ${message}` })
            controller.close()
            return
          }

          currentStep++
          send({ step: 'Bezittingen & doelen verwerkt', progress: Math.round((currentStep / totalSteps) * 100), table: 'ai', action: 'step2+4-done' })

          // ── Step 3: Transacties (depends on step 1 + 2) ────
          let step3
          try {
            const result = await generateObject({
              model,
              schema: aiStep3Schema,
              system: buildStep3Prompt(spendingDesc, step1, step2),
              prompt: 'Genereer 6 maanden transactiehistorie. ~15-25 transacties per maand.',
            })
            step3 = result.object
            tokenUsage.inputTokens += result.usage.inputTokens ?? 0
            tokenUsage.outputTokens += result.usage.outputTokens ?? 0
            tokenUsage.totalTokens += (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
          } catch (err) {
            console.error('AI step 3 failed:', err)
            const message = err instanceof Error ? err.message : 'Onbekende fout'
            send({ error: `AI-generatie stap 3 mislukt: ${message}` })
            controller.close()
            return
          }

          currentStep++
          send({ step: 'Transactiehistorie gegenereerd', progress: Math.round((currentStep / totalSteps) * 100), table: 'ai', action: 'step3-done' })

          console.log('AI onboarding token usage:', tokenUsage)

          // ── Merge all 4 steps into one AIPersonaOutput ──────
          const aiOutput: AIPersonaOutput = {
            ...step1,
            ...step2,
            ...step3,
            ...step4,
          }

          // Convert AI output to PersonaData format
          persona = convertAIOutputToPersona(aiOutput)
        } else {
          send({ error: 'Ongeldig type. Gebruik "persona" of "ai".' })
          controller.close()
          return
        }

        // ── Phase 1: Delete existing data ────────────────────
        await deleteAllUserData(supabase, user.id, progress)

        // ── Phase 2: Insert persona data ─────────────────────
        const summary = await seedPersonaData(supabase, user.id, persona, progress)

        // ── Phase 3: Mark onboarding complete ──
        await supabase
          .from('profiles')
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq('id', user.id)

        send({ done: true, summary, ...(tokenUsage ? { tokenUsage } : {}) })
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

/**
 * Convert AI-generated output into a full PersonaData structure.
 * All profile data is now inferred by the AI from the free text description.
 */
function convertAIOutputToPersona(ai: AIPersonaOutput): PersonaData {
  const totalAssets = ai.assets.reduce((sum, a) => sum + a.current_value, 0)
  const totalDebts = ai.debts.reduce((sum, d) => sum + d.current_balance, 0)
  const totalIncome = ai.profile.net_monthly_salary + (ai.profile.partner_income || 0)

  // Convert array of { slug, amount } to Record<string, number>
  const budgetMap: Record<string, number> = {}
  for (const entry of ai.budget_amounts) {
    budgetMap[entry.slug] = entry.amount
  }

  return {
    meta: {
      name: ai.profile.full_name,
      subtitle: 'Persoonlijk profiel',
      description: 'Door AI gegenereerd op basis van je persoonlijke beschrijving.',
      color: 'teal',
      avatarColor: '#3CC8C8',
      netWorth: totalAssets - totalDebts,
      income: totalIncome,
      expenses: totalIncome - (budgetMap['sparen-schulden'] ?? 0) - (budgetMap['schulden-aflossingen-parent'] ?? 0),
    },
    profile: {
      full_name: ai.profile.full_name,
      date_of_birth: ai.profile.date_of_birth,
      household_type: ai.profile.household_type,
      temporal_balance: ai.profile.temporal_balance,
    },
    bank_accounts: ai.bank_accounts,
    assets: ai.assets,
    debts: ai.debts,
    budgets: makeBudgets(budgetMap),
    transactions: ai.transactions.map((t) => ({
      ...t,
      counterparty_iban: t.counterparty_iban === 'UNKNOWN' ? null : t.counterparty_iban,
    })),
    goals: ai.goals,
    life_events: ai.life_events.map((e) => ({
      ...e,
      target_age: e.target_age === 0 ? null : e.target_age,
      target_date: e.target_date === '' ? null : e.target_date,
    })),
    recommendations: ai.recommendations.map((r) => ({
      ...r,
      related_budget_slug: r.related_budget_slug === '' ? null : r.related_budget_slug,
      suggested_actions: [],
      actions: r.actions.map((a) => ({
        ...a,
        source: 'ai' as const,
        status: 'open' as const,
      })),
    })),
    net_worth_snapshots: ai.net_worth_snapshots,
  }
}
