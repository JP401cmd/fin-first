import type { SupabaseClient } from '@supabase/supabase-js'
import { ASSET_TYPE_LABELS, projectPortfolio, type Asset } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, debtProjection, type Debt } from '@/lib/debt-data'
import { WEALTH_GROUPS, WEALTH_GROUP_LABELS, type WealthGroup } from '@/lib/wealth-composition'
import { section, formatCurrency } from './formatter'

/**
 * Grondslag van élk projectiebedrag in deze context, plus een expliciet
 * omreken-verbod voor het model.
 *
 * De hele AI-context is en blijft NOMINAAL (euro-weergave besluit D14): de
 * gebruikersvoorkeur `profiles.euro_view` bereikt het model nooit, en de contexten
 * kern/wil/belasting kennen sowieso geen kernelfactor — een half-gedeflateerde
 * context is erger dan een consequent nominale. Wat het model dan wél nodig heeft
 * is (a) te weten op welke grondslag het leest en (b) het verbod om zelf om te
 * rekenen. Zonder dat verbod verzint een taalmodel zijn eigen `(1 + i)^n` —
 * precies de consume-don't-recompute-overtreding die de euro-weergave opheft. Waar de omrekening zinvol én canoniek beschikbaar is,
 * staat ze al kant-en-klaar in de context (het FIRE-doel in `shared-context.ts`).
 *
 * Bewust één losse regel en géén eigen sectie/kop: dit is grondslag bij de
 * bestaande cijfers, geen nieuw onderwerp — en context-tekst kost tokens.
 */
const GRONDSLAG_PROJECTIEBEDRAGEN =
  "Alle projectiebedragen staan in toekomstige euro's (nominaal). Reken zelf nooit om naar huidige euro's — gebruik alleen bedragen die hier letterlijk staan."

/**
 * Horizon-specific context: assets, debts, projections.
 * Uses real Supabase data.
 */
export async function buildHorizonContext(supabase: SupabaseClient): Promise<string> {
  // Egress-trim: alleen de velden die deze context daadwerkelijk gebruikt —
  // breakdown-regels + projectPortfolio (current_value/expected_return/
  // monthly_contribution/depreciation_rate/purchase_value/is_active/asset_type)
  // en debtProjection (current_balance/interest_rate/monthly_payment/
  // repayment_type/end_date).
  const [assetsResult, debtsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('name, asset_type, current_value, expected_return, monthly_contribution, depreciation_rate, purchase_value, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('debts')
      .select('name, debt_type, current_balance, interest_rate, monthly_payment, repayment_type, end_date')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  const assets = (assetsResult.data ?? []) as Asset[]
  const debts = (debtsResult.data ?? []) as Debt[]

  if (assets.length === 0 && debts.length === 0) {
    return section('VERMOGEN & PROJECTIES', 'Nog geen assets of schulden geregistreerd.')
  }

  // Grondslag vóór de cijfers: het model leest 'm dan vóór het eerste bedrag.
  // Statisch — niet afhankelijk van de weergavevoorkeur van de gebruiker, want die
  // gaat bewust niet mee naar het model. De no-data-tak hierboven draagt 'm niet:
  // daar staat geen enkel projectiebedrag om een grondslag over te hebben.
  const parts: string[] = [GRONDSLAG_PROJECTIEBEDRAGEN]

  // Asset breakdown
  if (assets.length > 0) {
    const assetLines = assets.map((a) =>
      `${a.name} (${ASSET_TYPE_LABELS[a.asset_type]}): ${formatCurrency(Number(a.current_value))} | rendement ${a.expected_return}%/jr | bijdrage ${formatCurrency(Number(a.monthly_contribution))}/mnd`
    )
    parts.push(section('ASSETS', assetLines.join('\n')))
  }

  // Vermogenssamenstelling per groep (spaargeld / beleggingen / pensioen /
  // vastgoed / overig). Geeft Fin de spaargeld-vs-beleggingen-verhouding zodat
  // hij allocatie- en cash-drag-tips kan geven zonder zelf per asset te rekenen.
  if (assets.length > 0) {
    const groupTotals: Record<WealthGroup, number> = {
      spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
    }
    for (const a of assets) {
      groupTotals[WEALTH_GROUPS[a.asset_type]] += Number(a.current_value) || 0
    }
    const totalAssets = Object.values(groupTotals).reduce((s, v) => s + v, 0)
    if (totalAssets > 0) {
      const order: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']
      const compLines = order
        .filter((g) => groupTotals[g] > 0)
        .map((g) => `${WEALTH_GROUP_LABELS[g]}: ${formatCurrency(groupTotals[g])} (${Math.round((groupTotals[g] / totalAssets) * 100)}%)`)
      parts.push(section('VERMOGENSSAMENSTELLING', compLines.join('\n')))
    }
  }

  // Debt breakdown with projections
  if (debts.length > 0) {
    const debtLines = debts.map((d) => {
      const proj = debtProjection(d)
      const payoff = proj.isPayable
        ? `afbetaald in ${Math.floor(proj.monthsToPayoff / 12)}j ${proj.monthsToPayoff % 12}m | totale rente: ${formatCurrency(proj.totalInterest)}`
        : 'betaling dekt rente niet!'
      return `${d.name} (${DEBT_TYPE_LABELS[d.debt_type]}): ${formatCurrency(Number(d.current_balance))} @ ${d.interest_rate}% | ${formatCurrency(Number(d.monthly_payment))}/mnd | ${payoff}`
    })
    parts.push(section('SCHULDEN', debtLines.join('\n')))
  }

  // 5-year portfolio projection
  // euro-view: exempt — `projectPortfolio` is een EIGEN motor náást de horizon-kernel
  // (euro-weergave besluit D12) en draagt dus geen canonieke `inflationFactor`. Er komt
  // hier bewust geen tweede, reële variant bij: dat zou een deflator vereisen die deze
  // motor niet heeft. Het bedrag valt onder de grondslag-regel bovenaan deze context.
  if (assets.length > 0) {
    const projection = projectPortfolio(assets, 60)
    const proj5y = projection[projection.length - 1]
    if (proj5y) {
      parts.push(section('5-JAAR PROJECTIE', `Totale assets over 5 jaar (projectie): ${formatCurrency(proj5y.total)}`))
    }
  }

  return parts.join('\n')
}
