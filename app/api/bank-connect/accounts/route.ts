import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { mapWithConcurrency } from '@/lib/concurrency'
import { planInitialFetch } from '@/lib/truelayer/initial-fetch'
import { decryptIbanForLabel } from '@/lib/truelayer/cash-asset-backfill'
import { ibanTail } from '@/lib/truelayer/linked-account'
import {
  accountFollowsBudgets,
  isEligibleTargetAccount,
  loadOccupyingLinks,
  occupyingProviderLabel,
  toTargetAssetRow,
  TARGET_ACCOUNT_SELECT,
  TARGET_ASSET_SELECT,
  type TargetAccountOption,
  type TargetAccountRow,
  type TargetAssetRow,
} from '@/lib/truelayer/target-account'

/**
 * GET /api/bank-connect/accounts — de kandidaat-DOELREKENINGEN voor de
 * koppelwizard (fase 4, FR1/FR2/FR13).
 *
 * ## Waarom deze route bestaat
 *
 * De wizard (`app/(app)/core/cash/connect/page.tsx`) is een `'use client'`-
 * pagina en mag géén directe Supabase-read doen voor weergavedata: hij staat
 * niet op de grandfather-allowlist in `scripts/check-client-data-reads.mjs` en
 * `npm run check:client-reads` zou zo'n read terecht flaggen (ADR 0058). Lezen
 * gaat dus via deze route.
 *
 * ## Wat "kandidaat" betekent
 *
 * De koppeling landt altijd op een `bank_accounts`-rij: dat is de identiteitsrij
 * waar de callback op werkt (`external_account_id` → `iban_hash` → voorkeur) en
 * waar `transactions.account_id` naar wijst. Wélke rijen in aanmerking komen —
 * en waarom een rekening met budgetteren úit er juist wél bij hoort — staat in
 * `lib/truelayer/target-account.ts`. Die regel wordt door deze lijst én door de
 * grens in `auth-link` gelezen; stond hij op twee plekken, dan zou de lijst ooit
 * iets tonen dat de route weigert.
 *
 * **Bewust buiten deze fase:** een cash-bezit zónder companion-rij
 * (`bank_accounts`) is geen kandidaat — er is geen FK-doel voor
 * `bank_connections.target_bank_account_id`. Dat is geen gegevensverlies: om een
 * CSV op een rekening te kunnen importeren is een `bank_accounts`-rij nodig, dus
 * elke rekening MÉT historie heeft er per definitie een. Companion-loze
 * cash-bezittingen (bv. direct na onboarding) hebben nul transacties — daar is
 * "nieuwe rekening aanmaken" het juiste antwoord.
 */

/** Bovengrens op het aantal kandidaten dat we tonen én bevragen. Zie de noot bij de query. */
export const MAX_TARGET_ACCOUNTS = 50

/** Parallelle historie-queries. Begrensd, zodat één GET de verbindingspool niet leegtrekt. */
const HISTORY_QUERY_CONCURRENCY = 5

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  try {
    // Zelfde "vandaag" als de sync-route (`new Date().toISOString()`, UTC) zodat
    // het startpunt dat de wizard aankondigt en het startpunt dat de sync
    // gebruikt niet op een tijdzonegrens uit elkaar lopen.
    const today = new Date().toISOString().split('T')[0]

    // Eigen rijen, expliciet gefilterd — zie de eigenaarschapsnoot bij
    // `loadTargetAccount`: de SELECT-policy op `bank_accounts` laat óók
    // huishoud-gedeelde partnerrijen door, en die zijn géén geldige doelrekening.
    const { data: accountRows, error: accountsError } = await supabase
      .from('bank_accounts')
      .select(TARGET_ACCOUNT_SELECT)
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      // Harde bovengrens, want het aantal rijen is niet door ons bepaald: de
      // INSERT-policy op `bank_accounts` staat een sessie toe er willekeurig veel
      // aan te maken, en de historie-lus hieronder doet twee queries per rekening.
      // Een keuzelijst boven de vijftig is als UI toch onbruikbaar; deze grens
      // houdt hem ook als leesronde begrensd. De ordening is deterministisch, dus
      // de afkap is stabiel in plaats van willekeurig.
      .limit(MAX_TARGET_ACCOUNTS)

    if (accountsError) return serverError(accountsError, 'bankconnect-accounts:GET')

    const rows = (accountRows ?? []) as unknown as TargetAccountRow[]
    if (rows.length === 0) return NextResponse.json({ accounts: [] })

    // ── Het cash-bezit achter de rekening ────────────────────────────────────
    // Twee vlaggen, twee betekenissen: `assets.is_active` = bestaat de bezitting
    // nog, `assets.has_budget_tracking` = volgt ze de budgetten. Ze horen bij
    // elkaar gelezen te worden, want de companion-rij spiegelt de tweede.
    const assetIds = [...new Set(rows.map((r) => r.linked_asset_id).filter((v): v is string => !!v))]
    const assets = new Map<string, TargetAssetRow>()

    if (assetIds.length > 0) {
      const { data: assetRows, error: assetsError } = await supabase
        .from('assets')
        .select(TARGET_ASSET_SELECT)
        .eq('user_id', user.id)
        .in('id', assetIds)

      if (assetsError) return serverError(assetsError, 'bankconnect-accounts:GET')

      for (const a of (assetRows ?? []) as unknown as { id: string; is_active: boolean | null; has_budget_tracking: boolean | null }[]) {
        assets.set(a.id, toTargetAssetRow(a))
      }
    }

    const candidates = rows.filter((row) =>
      isEligibleTargetAccount(row, row.linked_asset_id ? assets.get(row.linked_asset_id) : null),
    )

    if (candidates.length === 0) return NextResponse.json({ accounts: [] })

    // ── Actieve koppelingen: welke rekening is al bezet? (FR5) ───────────────
    // Sinds fase 6 is dit géén toelichting meer maar het kiesbaarheidsfeit: de
    // wizard schakelt zo'n optie uit en `auth-link`/`relink` antwoorden met 409.
    // Daarom via dezelfde ene query als die twee routes (`loadOccupyingLinks`) en
    // niet via een eigen variant hier — een lijst die iets aanbiedt dat de route
    // weigert is precies het defect dat fase 4 wegnam.
    //
    // Ongefilterd op de kandidaten (geen `.in(...)`): het aantal koppelrijen per
    // gebruiker is klein en begrensd door het aantal echte bankrekeningen, en het
    // scheelt een tweede definitie van dezelfde regel.
    const occupyingLinks = await loadOccupyingLinks(supabase, user.id)

    // ── Historie per rekening ────────────────────────────────────────────────
    // Twee gerichte queries per rekening in plaats van één brede: PostgREST kan
    // niet per groep aggregeren, en álle transactiedatums van de gebruiker
    // ophalen om ze hier te groeperen is bij 37.000 rijen geen leesronde meer.
    // De eerste query levert de telling (Content-Range) én de oudste datum in
    // één keer; de tweede alleen de nieuwste. Parallel, maar met een begrensde
    // pool: het aantal kandidaten is niet door ons bepaald (zie MAX_TARGET_ACCOUNTS),
    // en een ongebounde fan-out zou de gedeelde verbindingspool raken — dus van
    // álle gebruikers, niet alleen van deze.
    //
    // `user_id` staat er om dezelfde reden bij als in `ExistingHashScope`: de
    // SELECT-policy op `transactions` laat huishoud-gedeelde partnerrijen door,
    // dus zonder die filter zou de teller andermans boekingen meenemen — en het
    // startpunt van de eerste ophaal met een partnerdatum bepalen.
    const stats = await mapWithConcurrency(candidates, HISTORY_QUERY_CONCURRENCY, async (account) => {
      const [oldest, newest] = await Promise.all([
        supabase
          .from('transactions')
          .select('date', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('account_id', account.id)
          .order('date', { ascending: true })
          .limit(1),
        supabase
          .from('transactions')
          .select('date')
          .eq('user_id', user.id)
          .eq('account_id', account.id)
          .order('date', { ascending: false })
          .limit(1),
      ])

      // Bewust gooien en niet degraderen: een mislukte leesronde die als "0
      // transacties" terugkomt zou de wizard een volledige historische ophaal
      // laten aankondigen op een rekening die al vol staat.
      if (oldest.error) throw oldest.error
      if (newest.error) throw newest.error

      const oldestDate = ((oldest.data ?? []) as { date: string }[])[0]?.date ?? null
      const newestDate = ((newest.data ?? []) as { date: string }[])[0]?.date ?? null

      return { id: account.id, count: oldest.count ?? 0, oldestDate, newestDate }
    })

    const statsById = new Map(stats.map((s) => [s.id, s]))

    const accounts: TargetAccountOption[] = candidates.map((account) => {
      const asset = account.linked_asset_id ? assets.get(account.linked_asset_id) ?? null : null
      const stat = statsById.get(account.id)
      const newestDate = stat?.newestDate ?? null
      const plan = planInitialFetch({ today, newestExistingDate: newestDate })
      // `iban_encrypted` ontsleutelen i.p.v. de plaintext kolom lezen: Stage B
      // dropt `bank_accounts.iban`, en dán zou deze GET 500'en en de wizard stil
      // degraderen naar "alleen een nieuwe rekening aanmaken" — de gebruiker kan
      // zijn bestaande rekening dan niet meer kiezen zonder dat iets meldt waarom.
      // `decryptIbanForLabel` slikt een onleesbare legacy-ciphertext: het staartje
      // is cosmetisch (naast `name` en `bank_name`), dus één rommelige rij mag de
      // hele keuzelijst niet laten vallen.
      const iban = decryptIbanForLabel(account.iban_encrypted)

      return {
        id: account.id,
        name: account.name,
        bank_name: account.bank_name,
        iban_tail: ibanTail(iban),
        transaction_count: stat?.count ?? 0,
        oldest_transaction_date: stat?.oldestDate ?? null,
        newest_transaction_date: newestDate,
        budget_tracking: accountFollowsBudgets(account, asset),
        linked_provider_name: occupyingProviderLabel(occupyingLinks.get(account.id)),
        fetch_plan: { mode: plan.mode, start_date: plan.startDate },
      }
    })

    return NextResponse.json({ accounts })
  } catch (err) {
    return serverError(err, 'bankconnect-accounts:GET')
  }
}
