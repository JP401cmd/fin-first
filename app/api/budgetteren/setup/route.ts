import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  BUDGET_PARENT_META,
  parentSeed,
  type SeedBudget,
} from '@/lib/budget-data'
import {
  buildTemplateSeed,
  type BudgetTemplateId,
} from '@/lib/budget-templates/onboarding-presets'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import { syncBudgetingActive } from '@/lib/budgeting-active'

/**
 * POST /api/budgetteren/setup — Eerste-keer setup van de Budgetteren-app.
 *
 * Body: { selectedCashAssetIds: string[], templateChoice: BudgetTemplateId | 'empty' }
 *
 * Wat deze route doet:
 *  1. Markeer de gekozen cash-assets met `has_budget_tracking = true`
 *     (en zet alle andere cash-assets op `false` zodat de selectie absoluut is).
 *  2. Seed de budgetten uit één canonieke bron, zodat de picker-preview exact
 *     overeenkomt met het resultaat:
 *     - `'empty'`: alleen de 8 canonieke hoofdbudgetten (limit 0, geen children).
 *     - template: de volledige hiërarchie uit `buildTemplateSeed(template, netIncome)`
 *       (parents + children, met allocatie-amounts uit het inkomen).
 *  3. Schrijft de feature-visit-marker `budgetteren_setup_completed` zodat
 *     de gate verdwijnt bij volgende render.
 *  4. Revalideert de relevante pagina-paths.
 *
 * Bestaande budgets worden vervangen (delete-first + insert) — symmetrisch
 * met de fallback-flow in `app/api/onboarding/save-own-data/route.ts`. De
 * gebruiker komt hier alleen vóór er ooit een setup is geweest, dus die
 * cleanup zou normaal geen impact mogen hebben.
 */

/**
 * Lege-start seed: de 8 canonieke hoofdbudgetten (limit 0, geen children),
 * uit dezelfde bron (`BUDGET_PARENT_META`) als de template-seed.
 */
function buildEmptySeed(): SeedBudget[] {
  return Object.keys(BUDGET_PARENT_META)
    .sort((a, b) => BUDGET_PARENT_META[a].sort_order - BUDGET_PARENT_META[b].sort_order)
    .map((slug) => parentSeed(slug, 0))
}

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

    // Eén canonieke seed-boom — `'empty'` levert alleen de 8 hoofdbudgetten,
    // een template levert de volledige hiërarchie (parents + children) met
    // allocatie-amounts. De preview in de picker komt hierdoor overeen met het
    // resultaat: wat je ziet, is wat er wordt aangemaakt.
    const seed: SeedBudget[] =
      templateChoice === 'empty'
        ? buildEmptySeed()
        : buildTemplateSeed(templateChoice as BudgetTemplateId, netIncome)

    // Parent-budgetten — altijd seeden zodat de UI structuur heeft. De
    // parent-limit komt rechtstreeks uit de seed (bij 'empty' is dat 0).
    const parentRows = seed.map((parent) => ({
      user_id: user.id,
      parent_id: null as string | null,
      name: parent.name,
      slug: parent.slug,
      icon: parent.icon,
      description: parent.description,
      default_limit: parent.default_limit,
      budget_type: parent.budget_type,
      interval: 'monthly' as const,
      rollover_type: 'reset' as const,
      limit_type: 'soft' as const,
      alert_threshold: 80,
      max_single_transaction_amount: Math.max(parent.default_limit, 1000),
      is_essential: parent.is_essential,
      priority_score: parent.priority_score,
      is_inflation_indexed: false,
      sort_order: parent.sort_order,
    }))

    const { data: insertedParents, error: parentErr } = await supabase
      .from('budgets')
      .insert(parentRows)
      .select('id, slug')
    if (parentErr) throw new Error(`Parent-budgetten aanmaken mislukt: ${parentErr.message}`)

    // Children seeden — bij 'empty' heeft geen enkele parent children, dus
    // dit blijft dan leeg en voegt de gebruiker zelf children toe.
    const parentSlugToId = new Map<string, string>()
    for (const p of insertedParents ?? []) {
      parentSlugToId.set(p.slug, p.id)
    }
    const childRows: typeof parentRows = []
    for (const parent of seed) {
      if (!parent.children || parent.children.length === 0) continue
      const parentId = parentSlugToId.get(parent.slug)
      if (!parentId) continue
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i]
        const amount = child.default_limit
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

    // ── 3. Globale gate aanzetten ──────────────────────────────
    // Sync profiles.budgeting_active — de gate die alle budget-surfaces lezen.
    // Zonder deze stap blijft budgetteren "uit" ondanks de tracking-vlaggen uit
    // stap 1 (bug: vinkje moest handmatig uit/aan in de bewerken-modal). Bewust
    // ná het seeden: faalt het seeden, dan blijft de gate uit en kan de
    // gebruiker de setup gewoon opnieuw doorlopen (delete-first maakt dat veilig).
    await syncBudgetingActive(supabase, user.id)

    // ── 4. Feature-visit-marker ────────────────────────────────
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

    // ── 5. Cache-invalidatie ───────────────────────────────────
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
