import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDefaultBudgets } from '@/lib/budget-data'
import {
  buildTemplateAmounts,
  type BudgetTemplateId,
} from '@/lib/budget-templates/onboarding-presets'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'

/**
 * POST /api/budgetteren/setup — Eerste-keer setup van de Budgetteren-app.
 *
 * Body: { selectedCashAssetIds: string[], templateChoice: BudgetTemplateId | 'empty' }
 *
 * Wat deze route doet:
 *  1. Markeer de gekozen cash-assets met `has_budget_tracking = true`
 *     (en zet alle andere cash-assets op `false` zodat de selectie absoluut is).
 *  2. Seed de budgetten:
 *     - `'empty'`: alleen de 6 parent-budgetten zonder amounts (lege start).
 *     - template: parents + children met amounts uit `buildTemplateAmounts()`.
 *  3. Schrijft de feature-visit-marker `budgetteren_setup_completed` zodat
 *     de gate verdwijnt bij volgende render.
 *  4. Revalideert de relevante pagina-paths.
 *
 * Bestaande budgets worden vervangen (delete-first + insert) — symmetrisch
 * met de fallback-flow in `app/api/onboarding/save-own-data/route.ts`. De
 * gebruiker komt hier alleen vóór er ooit een setup is geweest, dus die
 * cleanup zou normaal geen impact mogen hebben.
 */

const bodySchema = z.object({
  selectedCashAssetIds: z.array(z.string().uuid()).min(1),
  templateChoice: z.enum(['minimalistisch', 'nibud', 'uitgebreid', 'empty']),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let parsed
  try {
    const raw = await req.json()
    parsed = bodySchema.safeParse(raw)
  } catch {
    return Response.json({ error: 'Ongeldige body' }, { status: 400 })
  }
  if (!parsed.success) {
    return Response.json(
      { error: 'Ongeldige invoer', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { selectedCashAssetIds, templateChoice } = parsed.data

  try {
    // ── 1. Tracking-flags op cash-assets ───────────────────────
    // Eerst alle cash-assets van de user op false, dan de gekozen op true.
    // Twee aparte updates omdat Supabase geen single-call "set A and unset others"
    // ondersteunt zonder een RPC.
    const { error: clearErr } = await supabase
      .from('assets')
      .update({ has_budget_tracking: false })
      .eq('user_id', user.id)
      .eq('asset_type', 'cash')
    if (clearErr) throw new Error(`Cash-assets bijwerken mislukt: ${clearErr.message}`)

    const { error: markErr } = await supabase
      .from('assets')
      .update({ has_budget_tracking: true })
      .eq('user_id', user.id)
      .in('id', selectedCashAssetIds)
    if (markErr) throw new Error(`Cash-rekeningen markeren mislukt: ${markErr.message}`)

    // ── 2. Budgetten seeden ────────────────────────────────────
    // Net-inkomen uit het profiel voor template-amounts. Bij 'empty'-keuze
    // hebben we het inkomen niet nodig.
    const { data: profile } = await supabase
      .from('profiles')
      .select('net_monthly_income')
      .eq('id', user.id)
      .single()
    const netIncome = Number(profile?.net_monthly_income ?? 0)

    // Voor zekerheid: bestaande budgets opruimen. Geen schade bij first-time
    // users (geen rijen), nodig bij hersetup waarbij de gate opnieuw verschijnt.
    await supabase.from('budgets').delete().eq('user_id', user.id)

    const defaults = getDefaultBudgets()
    const amounts =
      templateChoice === 'empty'
        ? null
        : buildTemplateAmounts(netIncome, templateChoice as BudgetTemplateId)

    // Parent-budgetten — altijd seeden zodat de UI structuur heeft. Bij 'empty'
    // gebruiken we 0 als limit; bij template tellen we children-amounts op.
    const parentRows = defaults.map((parent) => {
      const childAmounts = (parent.children ?? []).map((c) =>
        amounts ? (amounts[c.slug] ?? c.default_limit) : 0,
      )
      const parentLimit = childAmounts.reduce((a, b) => a + b, 0)
      return {
        user_id: user.id,
        parent_id: null as string | null,
        name: parent.name,
        slug: parent.slug,
        icon: parent.icon,
        description: parent.description,
        default_limit: parentLimit,
        budget_type: parent.budget_type,
        interval: 'monthly' as const,
        rollover_type: 'reset' as const,
        limit_type: 'soft' as const,
        alert_threshold: 80,
        max_single_transaction_amount: Math.max(parentLimit, 1000),
        is_essential: parent.is_essential,
        priority_score: parent.priority_score,
        is_inflation_indexed: false,
        sort_order: parent.sort_order,
      }
    })

    const { data: insertedParents, error: parentErr } = await supabase
      .from('budgets')
      .insert(parentRows)
      .select('id, slug')
    if (parentErr) throw new Error(`Parent-budgetten aanmaken mislukt: ${parentErr.message}`)

    // Children alleen bij gekozen template — bij 'empty' blijven de parents
    // leeg en voegt de gebruiker zelf children toe via de plan-editor.
    if (amounts) {
      const parentSlugToId = new Map<string, string>()
      for (const p of insertedParents ?? []) {
        parentSlugToId.set(p.slug, p.id)
      }
      const childRows: typeof parentRows = []
      for (const parent of defaults) {
        if (!parent.children) continue
        const parentId = parentSlugToId.get(parent.slug)
        if (!parentId) continue
        for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i]
          const amount = amounts[child.slug] ?? child.default_limit
          childRows.push({
            user_id: user.id,
            parent_id: parentId,
            name: child.name,
            slug: child.slug,
            icon: child.icon,
            description: child.description,
            default_limit: amount,
            budget_type: parent.budget_type,
            interval: 'monthly',
            rollover_type: 'reset',
            limit_type: 'soft',
            alert_threshold: 80,
            max_single_transaction_amount: Math.max(amount * 2, 200),
            is_essential: parent.is_essential,
            priority_score: parent.priority_score,
            is_inflation_indexed: false,
            sort_order: i,
          })
        }
      }
      if (childRows.length > 0) {
        const { error: childErr } = await supabase.from('budgets').insert(childRows)
        if (childErr) throw new Error(`Child-budgetten aanmaken mislukt: ${childErr.message}`)
      }
    }

    // ── 3. Feature-visit-marker ────────────────────────────────
    // Best-effort: faalt deze, dan blijft de gate staan tot een retry — geen
    // dataverlies. Upsert met onConflict om duplicates bij retry te slikken.
    await supabase
      .from('user_feature_visits')
      .upsert(
        { user_id: user.id, feature_slug: APP_SETUP_SLUGS.budgetteren },
        { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
      )
      .then(
        () => undefined,
        () => undefined,
      )

    // ── 4. Cache-invalidatie ───────────────────────────────────
    revalidatePath('/core/assets/cash')
    revalidatePath('/core/budgets')
    revalidatePath('/core')

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[budgetteren-setup] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
