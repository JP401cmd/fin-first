'use server'

/**
 * Server Action — Quick-add wizard insert flow.
 *
 * Validates the 3-field wizard input, authenticates the user, and writes
 * a new asset, debt or asset+linked-debt pair via Supabase. Callable
 * directly from the client component (`QuickAddWizard`) — no REST route
 * required (see Phase 3 of the plan at
 * `~/.claude/plans/ok-we-gaan-een-precious-naur.md`).
 *
 * Three insert paths are handled via the `QuickAddInput` discriminated
 * union:
 *   - `asset`            — single asset insert
 *   - `debt`             — single debt insert (never sets `linked_asset_id`
 *                          via user input; see RLS note below)
 *   - `asset_with_debt`  — sequential asset insert → debt insert. If the
 *                          debt insert fails, the asset stays (partial
 *                          recovery) and the result carries `partial.assetId`
 *                          so the UI can offer a retry / "keep asset only"
 *                          dialog.
 *
 * Security notes:
 *   - RLS policies on `assets` / `debts` already scope by `auth.uid()`, but
 *     we defensively verify ownership of `linked_asset_id` before the debt
 *     insert to guarantee a user cannot link a debt to someone else's
 *     asset by injecting an arbitrary UUID through the `kind:'debt'` path.
 *   - Zod (in `lib/quick-add/validation.ts`) validates format plus één
 *     inhoudelijke invariant (een `dga_schuld` moet een deelneming dragen —
 *     `hasRequiredDeelnemingLink`); het kan géén eigenaarschap afdwingen — die
 *     check leeft hier.
 *
 * Cache invalidation: `/core` is the Mission Control page that reads the
 * aggregated totals; `/core/assets` and `/core/debts` are the detail lists.
 * All three are revalidated on success so server components pick up the
 * new row on the next navigation.
 */

import { revalidatePath } from 'next/cache'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { QuickAddInputSchema } from '@/lib/quick-add/validation'
import {
  buildAssetDraft,
  buildDebtDraft,
  type AssetDraft,
  type DebtDraft,
} from '@/lib/quick-add/build-drafts'
import type { QuickAddResult } from '@/lib/quick-add/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type InsertTable = 'assets' | 'debts'

/**
 * Fetch the next `sort_order` for a given table + user so newly created
 * rows land at the end of the list. Uses `maybeSingle()` so a user without
 * any rows yet resolves to `sort_order = 0`.
 *
 * Note: not transactional w.r.t. concurrent inserts — in the unlikely case
 * that two wizards submit in the same tick, both may receive the same
 * value. Acceptable for manual user flow (no uniqueness constraint on
 * `sort_order`); the existing `debt-form` / `assets-client` flows do not
 * guard either.
 */
async function nextSortOrder(
  supabase: SupabaseServerClient,
  table: InsertTable,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const current = typeof data?.sort_order === 'number' ? data.sort_order : -1
  return current + 1
}

/** Map a Supabase/Postgres error to a user-facing Dutch message. */
function toDutchMessage(error: PostgrestError, entity: 'bezitting' | 'schuld'): string {
  // 23505 = unique_violation. Most common cause in this flow is a
  // duplicate `(user_id, name, is_active)` or similar uniqueness guard.
  if (error.code === '23505') {
    return `Er bestaat al een ${entity} met deze naam. Kies een andere naam.`
  }
  // 42501 = insufficient_privilege (RLS). Also surfaced via PostgREST as
  // the string "violates row-level security policy".
  if (
    error.code === '42501' ||
    error.message?.toLowerCase().includes('row-level security')
  ) {
    return 'Je hebt geen toegang om dit op te slaan.'
  }
  // Network / timeout / fetch abort — PostgREST does not return an error
  // code for these; we fall back to the raw message if it looks useful,
  // otherwise a neutral retry-prompt.
  if (!error.code && !error.message) {
    return 'Verbinding verbroken — probeer opnieuw.'
  }
  return error.message || 'Opslaan mislukt — probeer opnieuw.'
}

/**
 * Verify the current user owns the asset referenced by `linked_asset_id`
 * before inserting a debt that points to it. RLS would already block a
 * write, but this gives a cleaner error path and prevents even reading
 * a row the user does not own.
 */
async function assertAssetOwned(
  supabase: SupabaseServerClient,
  assetId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('assets')
    .select('id')
    .eq('id', assetId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}

/**
 * Check whether an active asset/debt with the same name already exists
 * for this user. Returns `true` if a duplicate is found. Pre-insert
 * guard so the UI can surface a friendly error without waiting for the
 * DB constraint (which may or may not exist depending on schema).
 */
async function hasDuplicateName(
  supabase: SupabaseServerClient,
  table: InsertTable,
  userId: string,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false
  // Case-insensitive match — "Spaarrekening" and "spaarrekening" collide.
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .ilike('name', trimmed)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * Insert a fully-built asset draft and return its new id.
 * `sort_order` is resolved just-in-time via `nextSortOrder`.
 */
async function insertAsset(
  supabase: SupabaseServerClient,
  draft: AssetDraft,
  userId: string,
): Promise<{ id: string } | { error: PostgrestError }> {
  const sort_order = await nextSortOrder(supabase, 'assets', userId)
  const row = { ...draft, user_id: userId, sort_order }
  const { data, error } = await supabase
    .from('assets')
    .insert(row)
    .select('id')
    .single()
  if (error || !data) {
    return { error: error ?? ({ message: 'Onbekende fout' } as PostgrestError) }
  }
  return { id: data.id as string }
}

/**
 * Insert a fully-built debt draft and return its new id.
 * `sort_order` is resolved just-in-time via `nextSortOrder`.
 */
async function insertDebt(
  supabase: SupabaseServerClient,
  draft: DebtDraft,
  userId: string,
): Promise<{ id: string } | { error: PostgrestError }> {
  const sort_order = await nextSortOrder(supabase, 'debts', userId)
  const row = { ...draft, user_id: userId, sort_order }
  const { data, error } = await supabase
    .from('debts')
    .insert(row)
    .select('id')
    .single()
  if (error || !data) {
    return { error: error ?? ({ message: 'Onbekende fout' } as PostgrestError) }
  }
  return { id: data.id as string }
}

/**
 * Main Server Action — called directly from the wizard's save handler.
 *
 * Returns a `QuickAddResult` discriminated union so the client can
 * pattern-match on `ok` / `code` without parsing error strings. Never
 * throws for expected failures; unexpected exceptions are caught and
 * mapped to `{ ok: false, code: 'SERVER' }`.
 */
export async function quickAdd(raw: unknown): Promise<QuickAddResult> {
  // 1. Validate input (shared with client-side per-field validation).
  const parsed = QuickAddInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: parsed.error.issues[0]?.message ?? 'Ongeldige invoer',
    }
  }
  const input = parsed.data

  // 2. Authenticate. `createClient()` is async because it awaits `cookies()`.
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, code: 'AUTH', message: 'Niet ingelogd' }
  }

  try {
    // 3. Debt-only path.
    //
    // De invariant "een `dga_schuld` hangt altijd aan een deelneming" is hier al
    // afgedwongen: `QuickAddInputSchema` (stap 1) keurt dit pad af zonder
    // `linked_asset_id` en die tekst komt als `code:'VALIDATION'` terug. Dat is
    // de server-side afdwinging naast de blokkerende wizard-validatie — de
    // client-check alleen was omzeilbaar met een directe Server-Action-call.
    if (input.kind === 'debt') {
      // Defensive: the wizard never sets `linked_asset_id` via this kind
      // (it uses `kind:'asset_with_debt'` so the server can set it after
      // the asset insert), but future re-use might. Require ownership.
      if (input.debt.linked_asset_id) {
        const owned = await assertAssetOwned(
          supabase,
          input.debt.linked_asset_id,
          user.id,
        )
        if (!owned) {
          return {
            ok: false,
            code: 'VALIDATION',
            message: 'Je hebt geen toegang tot de gekoppelde bezitting.',
          }
        }
      }

      if (await hasDuplicateName(supabase, 'debts', user.id, input.debt.name)) {
        return {
          ok: false,
          code: 'VALIDATION',
          message: 'Er bestaat al een schuld met deze naam. Kies een andere naam.',
        }
      }

      const result = await insertDebt(
        supabase,
        buildDebtDraft(input.debt),
        user.id,
      )
      if ('error' in result) {
        return {
          ok: false,
          code: 'DEBT_FAILED',
          message: toDutchMessage(result.error, 'schuld'),
        }
      }

      revalidatePath('/core')
      revalidatePath('/core/debts')
      return { ok: true, debtId: result.id }
    }

    // 4. Asset path (single or with linked debt).
    // Both `kind:'asset'` and `kind:'asset_with_debt'` start with an
    // asset insert. The debt insert is conditional on `kind`.
    if (await hasDuplicateName(supabase, 'assets', user.id, input.asset.name)) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'Er bestaat al een bezitting met deze naam. Kies een andere naam.',
      }
    }

    const assetResult = await insertAsset(
      supabase,
      buildAssetDraft(input.asset),
      user.id,
    )
    if ('error' in assetResult) {
      return {
        ok: false,
        code: 'ASSET_FAILED',
        message: toDutchMessage(assetResult.error, 'bezitting'),
      }
    }
    const assetId = assetResult.id

    if (input.kind === 'asset') {
      revalidatePath('/core')
      revalidatePath('/core/assets')
      return { ok: true, assetId }
    }

    // 5. `asset_with_debt` — insert debt with server-set `linked_asset_id`.
    // We intentionally do NOT expose `linked_asset_id` to the wizard input
    // for this kind (see `DebtQuickInputWithoutLink` in validation.ts)
    // so there is nothing to verify here beyond our own insert.
    if (
      await hasDuplicateName(supabase, 'debts', user.id, input.debt.name)
    ) {
      // Asset is already saved — surface as partial so the UI can recover.
      revalidatePath('/core')
      revalidatePath('/core/assets')
      return {
        ok: false,
        code: 'DEBT_FAILED',
        message: 'Er bestaat al een schuld met deze naam. Kies een andere naam.',
        partial: { assetId },
      }
    }

    const debtDraft = buildDebtDraft({ ...input.debt, linked_asset_id: assetId })
    const debtResult = await insertDebt(supabase, debtDraft, user.id)
    if ('error' in debtResult) {
      // Asset succeeded, debt failed: revalidate the asset side anyway
      // so the user sees their saved asset if they dismiss the retry.
      revalidatePath('/core')
      revalidatePath('/core/assets')
      return {
        ok: false,
        code: 'DEBT_FAILED',
        message: toDutchMessage(debtResult.error, 'schuld'),
        partial: { assetId },
      }
    }

    revalidatePath('/core')
    revalidatePath('/core/assets')
    revalidatePath('/core/debts')
    return { ok: true, assetId, debtId: debtResult.id }
  } catch (err) {
    // Unexpected failure (network abort, library bug, etc.). Never
    // surface raw stack traces to the client.
    return {
      ok: false,
      code: 'SERVER',
      message: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}
