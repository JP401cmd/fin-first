// POST /api/integrations/wallets
//
// Creates a new wallet-address row, linked 1-on-1 to the caller-supplied
// `linkedAssetId` (R1 contract). Then triggers an inline initial sync so the
// user immediately sees the balance + EUR value on the koppelingen page.
// Duplicates per (user, chain, address) are rejected via the table's UNIQUE
// constraint; an asset that already has a wallet-coupling is rejected via
// the unique index on linked_asset_id.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidWalletAddress, normalizeWalletAddress } from '@/lib/integrations/wallet-validation'
import { syncWalletBalance } from '@/lib/integrations/wallet-sync'
import { classifyWalletError } from '@/lib/integrations/blockchair-client'
import { validateLinkedAsset } from '@/lib/integrations/linked-asset'
import type { WalletChain } from '@/lib/connections-data'

const MAX_LABEL_LEN = 60
const SUPPORTED_CHAINS: WalletChain[] = ['bitcoin', 'ethereum', 'polygon', 'arbitrum', 'base', 'solana']

const CHAIN_FORMAT_HINT: Record<WalletChain, string> = {
  bitcoin: 'Verwacht: 1…, 3… of bc1…',
  ethereum: 'Verwacht: 0x gevolgd door 40 hex-tekens.',
  polygon: 'Verwacht: 0x gevolgd door 40 hex-tekens (EVM).',
  arbitrum: 'Verwacht: 0x gevolgd door 40 hex-tekens (EVM).',
  base: 'Verwacht: 0x gevolgd door 40 hex-tekens (EVM).',
  solana: 'Verwacht: base58-string van 32-44 tekens.',
}

interface CreateBody {
  chain?: unknown
  address?: unknown
  label?: unknown
  linkedAssetId?: unknown
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  const chainRaw = safeString(body.chain) as WalletChain
  if (!SUPPORTED_CHAINS.includes(chainRaw)) {
    return NextResponse.json({ error: 'Kies een ondersteunde chain.' }, { status: 400 })
  }

  const addressRaw = safeString(body.address)
  if (!isValidWalletAddress(chainRaw, addressRaw)) {
    return NextResponse.json({
      error: `Ongeldig adres voor deze chain. ${CHAIN_FORMAT_HINT[chainRaw]}`,
    }, { status: 400 })
  }
  const address = normalizeWalletAddress(chainRaw, addressRaw)
  const label = safeString(body.label).slice(0, MAX_LABEL_LEN) || null

  const linkCheck = await validateLinkedAsset(supabase, user.id, body.linkedAssetId)
  if (!linkCheck.ok) {
    return NextResponse.json({ error: linkCheck.message }, { status: linkCheck.status })
  }

  const { data: inserted, error } = await supabase
    .from('wallet_addresses')
    .insert({
      user_id: user.id,
      chain: chainRaw,
      address,
      label,
      linked_asset_id: linkCheck.assetId,
    })
    .select('id, chain, address, label, linked_asset_id, last_synced_at, last_balance_native, last_balance_eur, last_sync_error, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      const msg = error.message?.toLowerCase().includes('linked_asset')
        ? 'Dit asset heeft al een wallet-koppeling. Ontkoppel de bestaande eerst.'
        : 'Dit adres is al gekoppeld op deze chain.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: 'Kon de koppeling niet opslaan.' }, { status: 500 })
  }

  // ── Initial sync (best-effort) ───────────────────────────────────
  // Failure does NOT roll back the insert — the user can hit "Synchroniseer
  // nu" later. The error is recorded on the row + audit log so the badge
  // immediately reflects the situation.
  const startedAt = new Date().toISOString()
  let syncMessage: string | null = null
  try {
    const outcome = await syncWalletBalance({
      supabase,
      wallet: {
        id: inserted.id as string,
        user_id: user.id,
        chain: inserted.chain as WalletChain,
        address: inserted.address as string,
        label: (inserted.label as string | null) ?? null,
        linked_asset_id: inserted.linked_asset_id as string,
      },
    })
    await supabase
      .from('wallet_addresses')
      .update({ last_synced_at: startedAt, last_sync_error: null })
      .eq('id', inserted.id)
      .eq('user_id', user.id)
    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'wallet',
      source_ref_id: inserted.id,
      run_at: startedAt,
      status: 'success',
      items_synced: 1,
    })
    return NextResponse.json({
      wallet: {
        id: inserted.id,
        chain: inserted.chain,
        address: inserted.address,
        label: inserted.label,
        linkedAssetId: inserted.linked_asset_id,
        lastSyncedAt: startedAt,
        lastBalanceNative: outcome.nativeBalance,
        lastBalanceEur: outcome.eurBalance,
        lastSyncError: null,
        createdAt: inserted.created_at,
      },
    }, { status: 201 })
  } catch (err) {
    const { message } = classifyWalletError(err)
    syncMessage = message
    await supabase
      .from('wallet_addresses')
      .update({ last_sync_error: message })
      .eq('id', inserted.id)
      .eq('user_id', user.id)
    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'wallet',
      source_ref_id: inserted.id,
      run_at: startedAt,
      status: 'error',
      items_synced: 0,
      error_message: message,
    })
    return NextResponse.json({
      wallet: {
        id: inserted.id,
        chain: inserted.chain,
        address: inserted.address,
        label: inserted.label,
        linkedAssetId: inserted.linked_asset_id,
        lastSyncedAt: null,
        lastBalanceNative: null,
        lastBalanceEur: null,
        lastSyncError: syncMessage,
        createdAt: inserted.created_at,
      },
    }, { status: 201 })
  }
}
