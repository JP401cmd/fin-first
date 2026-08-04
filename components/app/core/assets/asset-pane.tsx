'use client'

/**
 * Slide-in pane voor de individuele-bezitting detail-flow op
 * `/core/assets/[type]`. Twee modi (zie `event-pane.tsx` als blueprint):
 *
 *  - **view** (read-only): toont `<AssetDetailModal embedded />`. Footer-
 *     knoppen komen van `<ShellOverlay kind="pane">` zelf — primary
 *     "Bewerken", secondary "Herwaarderen". Verwijder-icon zit als
 *     header-action.
 *  - **edit** (form): toont `<AssetForm embedded onActionsChange={…} />`.
 *     De form publiceert save-state naar deze wrapper, die de primary CTA
 *     ("Opslaan"/"Toevoegen") in de footer toont en secondary "Annuleren".
 *     Herwaarderen blijft bereikbaar als header-action zodat de kern-actie
 *     in beide modi met één klik open is — UX-skill regel: kern-actie
 *     mag niet wegvallen achter een mode-switch.
 *
 * Data-loading gebeurt in één batch-fetch (valuations, mortgages, allAssets,
 * bankAccounts, connection, holdings) zodat de view- en edit-modi alle context
 * hebben die ze in de oude BottomSheet-flow (`asset-detail-flow.tsx`, verwijderd)
 * ook hadden.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShellOverlay, type PaneAction } from '@/components/app/shell/shell-overlay'
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
  ValuationModal as AssetValuationModal,
  type Valuation,
  type AssetEditActionsState,
} from '@/components/core/assets-client'

type AssetPaneMode = 'view' | 'edit'

interface MortgageRow {
  id: string
  name: string
  current_balance: number
  linked_asset_id: string | null
}

interface AssetPaneProps {
  /** Wanneer null is de pane gesloten. */
  asset: Asset | null
  /**
   * Auth-uid van de kijker, voor de eigenaar-guard op Bewerken/Verwijderen.
   * Optioneel omdat niet elke call-site 'm (nog) doorgeeft — zie `canMutate`
   * hieronder voor wat er dan gebeurt.
   */
  currentUserId?: string
  /** Sluit-callback. URL-state cleanup gebeurt in de parent. */
  onClose: () => void
  /** Aangeroepen na save / herwaardering / delete (router.refresh of loader). */
  onChanged?: () => void
}

export function AssetPane({ asset, currentUserId, onClose, onChanged }: AssetPaneProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addToast } = useToast()

  const [mode, setMode] = useState<AssetPaneMode>('view')
  const [revaluationOpen, setRevaluationOpen] = useState(false)
  const [editActions, setEditActions] = useState<AssetEditActionsState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Context-data — geladen on-demand bij mode='view' / 'edit'.
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(asset)
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [mortgages, setMortgages] = useState<MortgageRow[]>([])
  const [allAssets, setAllAssets] = useState<Asset[]>([])
  const [linkedBankAccounts, setLinkedBankAccounts] = useState<
    Map<string, { id: string; linked_asset_id: string }>
  >(new Map())
  const [dailyExpenses, setDailyExpenses] = useState(0)
  const [budgetingActive, setBudgetingActive] = useState(true)
  const [connection, setConnection] = useState<AssetConnectionSummary | null>(null)
  const [brokerConnection, setBrokerConnection] = useState<BrokerConnectionRow | null>(null)
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldingRow[]>([])
  const [investmentHoldings, setInvestmentHoldings] = useState<InvestmentHoldingRow[]>([])

  // Sync extern asset → interne state. Bij wisseling van asset-id lezen we
  // de URL-modifier-key `edit` om de initiële pane-state te zetten: de
  // bewerk-knop op `<VermogenAssetCard>` zet `?asset=<id>&edit=1` zodat één
  // klik direct in edit-mode landt. Herwaardering loopt NIET via deze pane —
  // de actie-knop op de kaart opent direct de ValuationModal in de caller.
  // We reageren alleen op asset-id-wisseling — een nieuwe object-identity
  // met dezelfde id (na server-refresh) mag de mode niet resetten.
  useEffect(() => {
    setCurrentAsset(asset)
    if (asset) {
      // De deeplink mag de eigenaar-guard NIET omzeilen. `canMutate` verderop
      // verbergt alleen de Bewerken-ingang; `?edit=1` zet de mode rechtstreeks
      // en landt dus buiten die ingang om alsnog in een werkend formulier — op
      // een rij die RLS daarna stil weigert (0 rijen, geen fout). Dat is exact
      // de "stil verkeerd"-klasse die deze pane voor verwijderen dichtzette.
      // Zelfde conditie als `canMutate`, hier noodgedwongen herhaald omdat die
      // pas ná de vroege return berekend kan worden.
      const mayEdit = !currentUserId || asset.user_id === currentUserId
      const wantsEdit = searchParams.get('edit') === '1'
      setMode(wantsEdit && mayEdit ? 'edit' : 'view')
      setEditActions(null)
      setRevaluationOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id])

  useEffect(() => {
    if (mode !== 'edit') setEditActions(null)
  }, [mode])

  // Stabiele callback voor child — anders nieuwe identity per render.
  const handleEditActionsChange = useCallback((next: AssetEditActionsState) => {
    setEditActions(next)
  }, [])

  // Eén batch-fetch wanneer een asset wordt geselecteerd. Cache in
  // Supabase + React voorkomt onnodige hits bij mode-switches.
  const loadFlowData = useCallback(async (assetId: string, assetType: string) => {
    const supabase = createClient()
    const connectionPromise: Promise<AssetConnectionSummary | null> =
      assetType === 'crypto' || assetType === 'investment'
        ? loadConnectionForAsset(supabase, assetId).catch(() => null)
        : Promise.resolve(null)
    // Broker-koppeling (Trading 212) is investment-only — voor andere types
    // resolvet de promise direct met `null` (geen extra Supabase-roundtrip).
    const brokerPromise: Promise<BrokerConnectionRow | null> =
      assetType === 'investment'
        ? loadBrokerConnectionForAsset(supabase, assetId).catch(() => null)
        : Promise.resolve(null)
    const cryptoPromise: Promise<CryptoHoldingRow[]> =
      assetType === 'crypto'
        ? loadCryptoHoldingsForAsset(supabase, assetId).catch(() => [])
        : Promise.resolve([])
    const investmentPromise: Promise<InvestmentHoldingRow[]> =
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
      brokerResult,
      cryptoResult,
      investmentResult,
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
      brokerPromise,
      cryptoPromise,
      investmentPromise,
    ])

    setConnection(connectionResult)
    setBrokerConnection(brokerResult)
    setCryptoHoldings(cryptoResult)
    setInvestmentHoldings(investmentResult)
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

    // Daily-expense schatting voor freedom-time badge (jaarlijkse essentiële
    // budgetten / 365).
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

  useEffect(() => {
    if (!currentAsset) return
    void loadFlowData(currentAsset.id, currentAsset.asset_type).catch(() => {
      // Niet kritiek — pane toont met placeholder-data
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

  // Verwijderen loopt via `DELETE /api/assets/[id]` (ADR 0058: muteren gaat via
  // een API-route). De oude client-update deed `.update({ is_active: false })`
  // zonder `user_id`-filter en zonder `.select()`; op een huishoud-gedeelde rij
  // van de partner blokkeerde RLS de schrijfactie, maar 0 geraakte rijen levert
  // `error: null` — succes-toast, pane dicht, niets gebeurd. De route geeft daar
  // nu een eerlijke 404 op.
  const handleDelete = useCallback(async () => {
    if (!currentAsset) return
    setDeleting(true)
    const finishSuccessfully = () => {
      setConfirmDelete(false)
      onClose()
      onChanged?.()
      router.refresh()
    }
    try {
      const res = await fetch(`/api/assets/${currentAsset.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        // Met de eigenaar-guard op de knop betekent 404 nog maar één ding: de
        // bezitting bestond al niet meer (dubbele klik, ander tabblad). Dat is
        // geen fout voor de gebruiker — opruimen en neutraal melden.
        if (res.status === 404) {
          addToast({
            type: 'info',
            title: `${currentAsset.name} was al verwijderd`,
            message: 'Je overzicht is bijgewerkt.',
          })
          finishSuccessfully()
          return
        }
        // Tekst komt uit de server-veilige error-envelope (ADR 0044), nooit uit
        // een rauwe driver-/DB-melding.
        addToast({
          type: 'error',
          title: 'Verwijderen mislukt',
          message: typeof data?.error === 'string' ? data.error : 'Probeer het later opnieuw.',
        })
        return
      }
      addToast({
        type: 'success',
        title: `${currentAsset.name} verwijderd`,
        message: 'Je kunt deze bezitting later weer toevoegen.',
      })
      finishSuccessfully()
    } catch {
      // Alleen netwerk-/parse-fouten komen hier; geen `e.message` in de UI.
      addToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        message: 'Geen verbinding met de server. Probeer het opnieuw.',
      })
    } finally {
      setDeleting(false)
    }
  }, [currentAsset, addToast, onClose, onChanged, router])

  if (!currentAsset) return null

  // Eigenaar-guard voor de destructieve/mutatie-affordances. De conditie zit
  // bewust op `user_id` en niet op provenance: `deriveProvenance` geeft
  // 'gezamenlijk' voor élk `ownership === 'shared'`-item ongeacht eigenaar,
  // terwijl de UPDATE-policy op `assets` strikt eigen-rij is
  // (`auth.uid() = user_id`). Een gedeelde bezitting van de partner is dus wél
  // 'gezamenlijk' en tóch niet te bewerken of te verwijderen — een knop die per
  // definitie nooit kan slagen is een kapotte affordance.
  //
  // Zonder `currentUserId` valt de guard bewust OPEN: call-sites die de uid nog
  // niet doorgeven zouden anders de knop voor élke solo-gebruiker verbergen, en
  // dat is een grotere regressie dan de kapotte affordance. De route blijft in
  // dat geval het vangnet met een eerlijke 404.
  const canMutate = !currentUserId || currentAsset.user_id === currentUserId

  const mortgageForAsset = mortgages.find((m) => m.linked_asset_id === currentAsset.id)
  const mortgageProp = mortgageForAsset
    ? { name: mortgageForAsset.name, balance: Number(mortgageForAsset.current_balance) }
    : null

  const isOpen = currentAsset !== null
  const title = mode === 'view' ? currentAsset.name : `${currentAsset.name} — bewerken`

  // Footer-acties per mode. Herwaarderen blijft in beide modi bereikbaar
  // (view: secondary footer-knop, edit: header-action icon).
  const primaryAction: PaneAction | undefined =
    mode === 'edit' && editActions
      ? {
          label: editActions.isEditing ? 'Opslaan' : 'Toevoegen',
          onClick: editActions.save,
          disabled: !editActions.canSave,
          loading: editActions.saving,
        }
      : mode === 'view' && canMutate
        ? {
            label: 'Bewerken',
            onClick: () => setMode('edit'),
          }
        : undefined

  const secondaryAction: PaneAction | undefined =
    mode === 'edit'
      ? {
          label: 'Annuleren',
          onClick: () => setMode('view'),
        }
      : {
          label: 'Herwaarderen',
          onClick: () => setRevaluationOpen(true),
        }

  // Header-actions slot — herwaarderen-icon in edit-mode (zodat het in
  // beide modi bereikbaar is) en delete-icon in view-mode. Het delete-icon
  // verdwijnt zodra de rij niet van de kijker is (zie `canMutate`).
  const headerActions =
    mode === 'edit' ? (
      <button
        type="button"
        onClick={() => setRevaluationOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
        aria-label="Herwaarderen"
        title="Herwaarderen"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    ) : canMutate ? (
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-negative hover:bg-negative/10"
        aria-label="Bezitting verwijderen"
        title="Verwijderen"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    ) : undefined

  return (
    <>
      <ShellOverlay
        open={isOpen}
        onClose={onClose}
        kind="pane"
        title={title}
        actions={headerActions}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      >
        {mode === 'view' && (
          <AssetDetailModal
            asset={currentAsset}
            valuations={valuations}
            mortgage={mortgageProp}
            dailyExpenses={dailyExpenses}
            allAssets={allAssets}
            cryptoHoldings={cryptoHoldings}
            investmentHoldings={investmentHoldings}
            onClose={onClose}
            onEdit={() => setMode('edit')}
            onRevalue={() => setRevaluationOpen(true)}
            onDelete={() => setConfirmDelete(true)}
            embedded
          />
        )}
        {mode === 'edit' && (
          <AssetForm
            asset={currentAsset}
            linkedBankAccounts={linkedBankAccounts}
            budgetingActive={budgetingActive}
            initialConnection={connection}
            initialBrokerConnection={brokerConnection}
            onClose={() => setMode('view')}
            onSaved={() => {
              setMode('view')
              void reloadAsset().then(() => {
                onChanged?.()
                router.refresh()
              })
            }}
            embedded
            onActionsChange={handleEditActionsChange}
          />
        )}
      </ShellOverlay>

      {/* Herwaardering — sibling sheet (driewegregel). */}
      {revaluationOpen && (
        <AssetValuationModal
          entityId={currentAsset.id}
          entityType="asset"
          entityName={currentAsset.name}
          entitySubtype={currentAsset.asset_type}
          netWorthInclusionPct={currentAsset.net_worth_inclusion_pct ?? 100}
          currentValue={Number(currentAsset.current_value)}
          onClose={() => setRevaluationOpen(false)}
          onSaved={() => {
            setRevaluationOpen(false)
            void reloadAsset().then(() => {
              onChanged?.()
              router.refresh()
            })
            setMode('view')
          }}
        />
      )}

      {/* Delete-confirm. */}
      <ShellOverlay
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kind="confirm"
        title="Bezitting verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            <strong className="text-[var(--ink)]">{currentAsset.name}</strong> wordt
            uit je actieve bezittingen verwijderd. Je kunt deze later weer toevoegen.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="border border-negative bg-negative px-4 py-3 text-sm font-semibold text-white hover:bg-negative/90 disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              {deleting ? 'Verwijderen…' : 'Verwijderen'}
            </button>
          </div>
        </div>
      </ShellOverlay>
    </>
  )
}
