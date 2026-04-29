import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  ASSET_TYPE_LABELS,
  type Asset,
  type AssetType,
} from '@/lib/asset-data'
import {
  loadBudgetsData,
  type BudgetsPageData,
} from '@/lib/budgets-data-loader'
import {
  loadHoldingsData,
  type HoldingsPageData,
} from '@/lib/holdings-data-loader'
import { loadCoreData, type CorePageData } from '@/lib/core-data-loader'
import { AssetCategoryPage } from '@/components/core/asset-category-page'

// ── Type guards ──────────────────────────────────────────────

const VALID_ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[]

/**
 * Type-guard die ook `notFound()`-friendly werkt: alles wat niet exact in
 * de `ASSET_TYPE_LABELS`-keyset zit telt als een verkeerde URL en hoort een
 * 404 te krijgen — geen leeg scherm.
 */
function isValidAssetType(value: string): value is AssetType {
  return (VALID_ASSET_TYPES as string[]).includes(value)
}

// ── Page ─────────────────────────────────────────────────────

/**
 * Server-component voor `/core/assets/[type]`. Valideert de URL-parameter,
 * laadt de assets in deze categorie en delegeert aan de client-component
 * `<AssetCategoryPage />`.
 *
 * Geen module-eis — registratie zonder verdieping is een volwaardige
 * use-case (CLAUDE.md fundament-regel). De verdieping zelf valt terug op
 * een tip-strip wanneer de bijbehorende module uit staat.
 *
 * Errors van Supabase tonen we als editorial 404 in plaats van een lege
 * pagina — duidelijke feedback past bij krant-toon.
 */
export default async function AssetCategoryServerPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params

  if (!isValidAssetType(type)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  // Filter direct op asset_type + actieve items + huidige user. We sorteren
  // op `sort_order` zodat de categorie-pagina dezelfde volgorde aanhoudt als
  // de hoofdlijst op `/core/assets`.
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', user.id)
    .eq('asset_type', type)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    // Editorial fallback i.p.v. crash — gebruiker ziet een uitleg en route
    // is hervatbaar via terug-navigatie.
    return <AssetCategoryError type={type} detail={error.message} />
  }

  const assets = (data ?? []) as Asset[]

  // ── Verdieping-data prefetch ─────────────────────────────────
  // Voor `cash` en `investment` laden we óók de bijbehorende module-data
  // server-side. Zo kunnen de tabs `<BudgetsClient />` en `<HoldingsPage />`
  // direct met `initialData` renderen — geen client-fetch waterfall.
  //
  // Bij elke fout (module uit, RLS-mismatch, lege rijen) vangen we netjes
  // af met `null`: de tab-component handelt die fallback zelf met een
  // teaser of empty-state. We willen geen 500 op de categorie-pagina als
  // alleen de verdieping-bron faalt.
  let budgetsData: BudgetsPageData | null = null
  let holdingsData: HoldingsPageData | null = null
  let coreData: CorePageData | null = null

  if (type === 'cash') {
    // Voor de cash-categorie laden we ook de Kern-data zodat we de
    // kencijfers (geschat jaarinkomen, must-uitgaven) kunnen tonen
    // bovenaan de pagina.
    const [budgetsResult, coreResult] = await Promise.allSettled([
      loadBudgetsData(supabase),
      loadCoreData(supabase),
    ])
    if (budgetsResult.status === 'fulfilled') budgetsData = budgetsResult.value
    if (coreResult.status === 'fulfilled') coreData = coreResult.value
  } else if (type === 'investment') {
    try {
      holdingsData = await loadHoldingsData(supabase)
    } catch {
      holdingsData = null
    }
  }

  return (
    <AssetCategoryPage
      type={type}
      initialAssets={assets}
      initialBudgetsData={budgetsData ?? undefined}
      initialHoldingsData={holdingsData ?? undefined}
      initialCoreData={coreData ?? undefined}
    />
  )
}

// ── Editorial error-state ────────────────────────────────────

function AssetCategoryError({ type, detail }: { type: AssetType; detail: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {ASSET_TYPE_LABELS[type]}
      </p>
      <h1 className="mt-2 font-serif text-2xl font-semibold text-[var(--ink)]">
        We konden deze categorie niet laden.
      </h1>
      <p className="mt-3 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Vernieuw de pagina om het opnieuw te proberen, of ga terug naar de
        Kern voor het volledige overzicht.
      </p>
      <p className="mt-4 font-mono text-[11px] text-[var(--ink-4)]">{detail}</p>
    </div>
  )
}
