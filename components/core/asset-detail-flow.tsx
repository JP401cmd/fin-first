'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/app/toast-provider'
import { ASSET_CLIENT_COLUMNS, type Asset } from '@/lib/asset-data'
import {
  loadConnectionForAsset,
  type AssetConnectionSummary,
} from '@/lib/connections-data'
import {
  loadBrokerConnectionForAsset,
  type BrokerConnectionRow,
} from '@/lib/broker-connections-data'
import {
  loadCryptoHoldingsForAsset,
  type CryptoHoldingRow,
} from '@/lib/crypto-holdings-data'
import {
  loadInvestmentHoldingsForAsset,
  type InvestmentHoldingRow,
} from '@/lib/investment-holdings-data'
import {
  AssetDetailModal,
  AssetForm,
  ValuationModal,
  type Valuation,
} from './assets-client'

interface AssetDetailFlowProps {
  /** Geselecteerde asset of `null` als de flow gesloten moet zijn. */
  asset: Asset | null
  /** Sluit-callback. */
  onClose: () => void
  /**
   * Callback die wordt aangeroepen na succesvolle save (edit, revalue, delete).
   * Parent kan hier `router.refresh()` of een eigen reload triggeren.
   */
  onAfterSave?: () => void
}

type ModalStep = 'detail' | 'edit' | 'revalue'

interface MortgageRow {
  id: string
  name: string
  current_balance: number
  linked_asset_id: string | null
}

/**
 * @deprecated Vervangen door `<AssetPane>` in
 * `components/app/core/assets/asset-pane.tsx` (mei 2026). De pane biedt
 * dezelfde view/edit/herwaarder-flow maar als slide-in pane (driewegregel
 * `kind="pane"`) i.p.v. een BottomSheet, met view-mode + edit-mode in één
 * overlay en behoud van Herwaarderen-actie in beide modi. Deze file blijft
 * bestaan zolang er nog externe verwijzingen zijn, maar nieuwe call-sites
 * moeten direct `<AssetPane>` gebruiken.
 *
 * Volledige asset detail-flow zoals op `/core/assets`. Hergebruikt de drie
 * modals uit `assets-client.tsx` (`AssetDetailModal`, `AssetForm`,
 * `ValuationModal`) zodat de gebruiker op de categoriepagina dezelfde rijke
 * detail-ervaring krijgt — bewerken, herwaarderen en verwijderen — als op de
 * totaaloverzichtpagina.
 *
 * Data-loading gebeurt server-on-demand wanneer een asset wordt geselecteerd:
 * valuations, gekoppelde hypotheek (voor `eigen_huis`/`real_estate`),
 * dailyExpenses (voor de freedom-time badge), gekoppelde bankrekeningen en
 * `budgetingActive`. Eén batch-fetch per modal-open zodat we geen overhead
 * hebben op pagina-load.
 */
export function AssetDetailFlow({
  asset,
  onClose,
  onAfterSave,
}: AssetDetailFlowProps) {
  const router = useRouter()
  const { addToast } = useToast()

  const [modalStep, setModalStep] = useState<ModalStep>('detail')
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(asset)
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [mortgages, setMortgages] = useState<MortgageRow[]>([])
  const [allAssets, setAllAssets] = useState<Asset[]>([])
  const [linkedBankAccounts, setLinkedBankAccounts] = useState<
    Map<string, { id: string; linked_asset_id: string }>
  >(new Map())
  const [dailyExpenses, setDailyExpenses] = useState(0)
  const [budgetingActive, setBudgetingActive] = useState(true)
  // Externe-koppeling state (R2). Alleen relevant voor crypto-assets — andere
  // types tonen de sectie niet, dus de fetch is voor hen geen overhead. We
  // initialiseren op `undefined` om "nog niet geladen" te onderscheiden van
  // "geladen, maar geen koppeling" (`null`).
  const [connection, setConnection] = useState<AssetConnectionSummary | null | undefined>(undefined)
  // Broker-koppeling (Trading 212) — investment-only, anders altijd `null`.
  const [brokerConnection, setBrokerConnection] = useState<BrokerConnectionRow | null>(null)
  // Typed holding-rijen (R5). Alleen geladen voor crypto/investment assets
  // — voor andere types blijven beide arrays leeg en rendert de modal de
  // sectie niet. `null` = nog niet geladen, `[]` = geladen maar geen
  // holdings (legitiem voor handmatig ingevoerde bezittingen).
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldingRow[] | null>(null)
  const [investmentHoldings, setInvestmentHoldings] = useState<InvestmentHoldingRow[] | null>(null)

  // Sync extern selectedAsset → interne state. Reset stap naar 'detail' bij
  // wisseling van asset of bij heropenen.
  useEffect(() => {
    setCurrentAsset(asset)
    if (asset) {
      setModalStep('detail')
    }
  }, [asset])

  const loadFlowData = useCallback(async (assetId: string, assetType: string) => {
    const supabase = createClient()
    // Connection-fetch loopt parallel maar alleen voor crypto/investment —
    // voor andere types houdt het oude gedrag stand (geen extra
    // Supabase-roundtrip).
    const connectionPromise: Promise<AssetConnectionSummary | null> =
      assetType === 'crypto' || assetType === 'investment'
        ? loadConnectionForAsset(supabase, assetId).catch(() => null)
        : Promise.resolve(null)
    // Broker-koppeling (Trading 212) is investment-only — voor andere types
    // resolvet de promise direct met `null` (geen extra Supabase-roundtrip).
    const brokerConnectionPromise: Promise<BrokerConnectionRow | null> =
      assetType === 'investment'
        ? loadBrokerConnectionForAsset(supabase, assetId).catch(() => null)
        : Promise.resolve(null)
    // Typed-holdings fetches per asset — net als de connection-fetch parallel
    // en type-gated. Bij andere asset-types resolven beide direct met `[]`
    // zodat de modal weet dat er geen sectie te tonen is.
    const cryptoHoldingsPromise: Promise<CryptoHoldingRow[]> =
      assetType === 'crypto'
        ? loadCryptoHoldingsForAsset(supabase, assetId).catch(() => [])
        : Promise.resolve([])
    const investmentHoldingsPromise: Promise<InvestmentHoldingRow[]> =
      assetType === 'investment'
        ? loadInvestmentHoldingsForAsset(supabase, assetId).catch(() => [])
        : Promise.resolve([])
    const [
      valuationsRes,
      mortgagesRes,
      allAssetsRes,
      bankAccountsRes,
      profileRes,
      essentialBudgetsRes,
      childBudgetsRes,
      connectionResult,
      brokerConnectionResult,
      cryptoHoldingsResult,
      investmentHoldingsResult,
    ] = await Promise.all([
      supabase
        .from('valuations')
        .select('*')
        .eq('entity_id', assetId)
        .eq('entity_type', 'asset')
        .order('valuation_date', { ascending: false }),
      supabase
        .from('debts')
        .select('id, name, current_balance, linked_asset_id')
        .eq('debt_type', 'mortgage')
        .eq('is_active', true),
      // Expliciete kolomlijst i.p.v. `select('*')`: `assets` heeft een
      // huishoud-gedeelde SELECT-policy, dus `*` levert bij een gedeelde
      // bezitting óók `account_number_hash`/`account_number_encrypted` van de
      // PARTNER in deze bundel. Zie ASSET_CLIENT_COLUMNS. Deze lijst voedt
      // `allAssets` (context/vergelijking) — die heeft geen rekeningnummer nodig.
      supabase.from('assets').select(ASSET_CLIENT_COLUMNS).eq('is_active', true),
      supabase
        .from('bank_accounts')
        .select('id, linked_asset_id')
        .eq('is_active', true)
        .not('linked_asset_id', 'is', null),
      supabase
        .from('profiles')
        .select('budgeting_active, estimated_monthly_expenses')
        .single(),
      supabase
        .from('budgets')
        .select('id, default_limit, interval')
        .eq('is_essential', true)
        .eq('budget_type', 'expense')
        .is('parent_id', null),
      supabase
        .from('budgets')
        .select('id, parent_id, default_limit, is_essential, interval, budget_type')
        .not('parent_id', 'is', null),
      connectionPromise,
      brokerConnectionPromise,
      cryptoHoldingsPromise,
      investmentHoldingsPromise,
    ])

    setConnection(connectionResult)
    setBrokerConnection(brokerConnectionResult)
    setCryptoHoldings(cryptoHoldingsResult)
    setInvestmentHoldings(investmentHoldingsResult)
    setValuations((valuationsRes.data ?? []) as Valuation[])
    setMortgages((mortgagesRes.data ?? []) as MortgageRow[])
    setAllAssets((allAssetsRes.data ?? []) as Asset[])

    const bankMap = new Map<string, { id: string; linked_asset_id: string }>()
    for (const row of bankAccountsRes.data ?? []) {
      if (row.linked_asset_id) {
        bankMap.set(row.linked_asset_id, {
          id: row.id,
          linked_asset_id: row.linked_asset_id,
        })
      }
    }
    setLinkedBankAccounts(bankMap)

    const profile = profileRes.data
    setBudgetingActive(profile?.budgeting_active !== false)

    // Daily-expenses: jaarlijkse essentiële budgetten / 365. Fallback op
    // profiel-schatting als budgetten ontbreken. Dit is een lichte
    // benadering — voor de freedom-badge volstaat ruwe nauwkeurigheid.
    const essentialBudgets = essentialBudgetsRes.data ?? []
    const childBudgets = (childBudgetsRes.data ?? []) as Array<{
      parent_id: string | null
      default_limit: number
      is_essential: boolean
      interval: string
      budget_type: string
    }>
    let yearlyEssential = 0
    for (const parent of essentialBudgets) {
      const kids = childBudgets.filter((c) => c.parent_id === parent.id)
      const limit =
        kids.length > 0
          ? kids.reduce((s, c) => s + Number(c.default_limit), 0)
          : Number(parent.default_limit)
      const annual =
        parent.interval === 'monthly'
          ? limit * 12
          : parent.interval === 'quarterly'
            ? limit * 4
            : limit
      yearlyEssential += annual
    }
    if (yearlyEssential > 0) {
      setDailyExpenses(yearlyEssential / 365)
    } else if (profile?.estimated_monthly_expenses) {
      setDailyExpenses((Number(profile.estimated_monthly_expenses) * 12) / 365)
    } else {
      setDailyExpenses(0)
    }
  }, [])

  // Laad context-data zodra een asset wordt geselecteerd. Eén batch per
  // modal-open — de cache binnen Supabase + React voorkomt onnodige hits.
  useEffect(() => {
    if (!currentAsset) return
    void loadFlowData(currentAsset.id, currentAsset.asset_type).catch(() => {
      // Niet kritiek — modal toont met placeholder-data
    })
  }, [currentAsset, loadFlowData])

  const reloadAsset = useCallback(async () => {
    if (!currentAsset) return
    const supabase = createClient()
    // Kale `ASSET_CLIENT_COLUMNS` — óók zónder `account_number`. Deze rij voedt
    // `<AssetForm asset={currentAsset}>`, en die vorm haalt het rekeningnummer
    // sinds de kolom-versmalling zélf op (één rij, één kolom, alleen bij een
    // cash-bezit) en laat de kolom uit zijn save-payload zolang hij 'm niet
    // kent. Het plaintext nummer reist dus niet langer mee voor elk type.
    const { data } = await supabase
      .from('assets')
      .select(ASSET_CLIENT_COLUMNS)
      .eq('id', currentAsset.id)
      .single()
    if (data) setCurrentAsset(data as Asset)
  }, [currentAsset])

  const handleDelete = useCallback(async () => {
    if (!currentAsset) return
    const supabase = createClient()
    const { error } = await supabase
      .from('assets')
      .update({ is_active: false })
      .eq('id', currentAsset.id)
    if (error) {
      addToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        message: error.message,
      })
      return
    }
    addToast({
      type: 'success',
      title: `${currentAsset.name} verwijderd`,
      message: 'Je kunt deze bezitting later weer toevoegen.',
    })
    onClose()
    onAfterSave?.()
    router.refresh()
  }, [addToast, currentAsset, onAfterSave, onClose, router])

  if (!currentAsset) return null

  const mortgageForAsset = mortgages.find(
    (m) => m.linked_asset_id === currentAsset.id,
  )
  const mortgageProp = mortgageForAsset
    ? { name: mortgageForAsset.name, balance: Number(mortgageForAsset.current_balance) }
    : null

  if (modalStep === 'edit') {
    return (
      <AssetForm
        asset={currentAsset}
        linkedBankAccounts={linkedBankAccounts}
        budgetingActive={budgetingActive}
        initialConnection={connection ?? null}
        initialBrokerConnection={brokerConnection}
        onClose={() => setModalStep('detail')}
        onSaved={() => {
          setModalStep('detail')
          void reloadAsset().then(() => {
            onAfterSave?.()
            router.refresh()
          })
        }}
      />
    )
  }

  if (modalStep === 'revalue') {
    return (
      <ValuationModal
        entityId={currentAsset.id}
        entityType="asset"
        entityName={currentAsset.name}
        entitySubtype={currentAsset.asset_type}
        netWorthInclusionPct={currentAsset.net_worth_inclusion_pct ?? 100}
        currentValue={Number(currentAsset.current_value)}
        onClose={() => setModalStep('detail')}
        onSaved={() => {
          setModalStep('detail')
          void reloadAsset().then(() => {
            onAfterSave?.()
            router.refresh()
          })
        }}
      />
    )
  }

  return (
    <AssetDetailModal
      asset={currentAsset}
      valuations={valuations}
      mortgage={mortgageProp}
      dailyExpenses={dailyExpenses}
      allAssets={allAssets}
      cryptoHoldings={cryptoHoldings ?? undefined}
      investmentHoldings={investmentHoldings ?? undefined}
      onClose={onClose}
      onEdit={() => setModalStep('edit')}
      onRevalue={() => setModalStep('revalue')}
      onDelete={handleDelete}
    />
  )
}
