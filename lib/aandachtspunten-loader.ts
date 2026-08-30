/**
 * Server-side verzamelaar voor de generieke aandachtspunten-laag.
 *
 * `collectAandachtspunten(supabase)` voert drie producenten uit (belasting,
 * budget, schulden) met EXACT dezelfde pure rekenkern als de UI-surfaces:
 *
 *   tax    → consumeert `loadFiscaleKansen` — DEZELFDE kansen-loader als de
 *            belasting-hub en de optimizer (ADR 0086), plus een eigen
 *            bedrijfspensioen-demping als FILTER op die lijst.
 *   budget → spiegelt lib/ai/context/wil-context.ts (NIBUD-benchmark-assemblage).
 *   debt   → actieve schulden met betekenisvolle rente.
 *
 * Elke producent faalt ZACHT (try/catch → []), zodat één ontbrekende databron
 * (geen huishouden, RLS, lege budgetten) de hele laag niet sloopt. Het
 * resultaat wordt gemerged en op savings (desc) gesorteerd.
 *
 * Server-only: importeert de Supabase-server-client niet zelf maar krijgt een
 * client doorgegeven (zo blijft de functie testbaar/herbruikbaar voor zowel
 * server-component als API-route).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Aandachtspunt,
  taxOpportunitiesToAandachtspunten,
  budgetBenchmarksToAandachtspunten,
  debtsToAandachtspunten,
  assetsToAandachtspunten,
  filterActionedAandachtspunten,
  JAARRUIMTE_AANDACHTSPUNT_ID,
} from './aandachtspunten'
import { loadActionedAandachtspuntIds } from './aandachtspunten-actions'
import { loadFiscaleKansen } from './tax-opportunities-loader'
import { CURRENT_TAX_YEAR } from './box3-data'
import { loadHorizonRaw } from './horizon-data-loader'
import {
  getNibudHouseholdType,
  getNibudReferences,
  calculateBenchmarks,
} from './nibud/reference-data'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getCurrentMonthTx,
} from './server-data/base'
import { buildBudgetTypeMap } from './budget-utils'
import { buildBudgetSpendingMap, type SpendingTxRow } from './budget-spending'
import { getCurrentMonthSplits } from './budget-spending-fetch'
import type { Debt } from './debt-data'
import type { Asset } from './asset-data'

// ── Belasting-producent ──────────────────────────────────────

/**
 * Belasting-aandachtspunten = de gedeelde fiscale kansen, gefilterd.
 *
 * CONSUME, DON'T RECOMPUTE (ADR 0086): dit blok stelde vroeger zijn eigen
 * kansen samen — inclusief een eigen kopie van de bruto-formule
 * (netto × 12 / (1 − marginaal)) en een tweede `buildTaxOverview`-aanroep. Dat
 * was een derde afleiding van dezelfde kans naast de hub en de optimizer. Nu
 * komt de lijst kant-en-klaar uit `loadFiscaleKansen` (perspectief 'personal',
 * zoals voorheen) en doet deze producent nog exact één ding van zichzelf: de
 * bedrijfspensioen-demping, als FILTER op de geleverde lijst.
 */
// BEKENDE BEPERKING (opvolgactie, zie aandachtspunt `bruto-box1-grondslag-meervoudig`):
// deze producent degradeert alles-of-niets. Vóór ADR 0086 zat er een try/catch om
// alléén de Box 3-read, zodat een falende huishoud-/RLS-read de jaarruimte-tip
// liet staan. Nu deelt de hele producent één `loadFiscaleKansen`-aanroep; elke
// throw daarbinnen laat `safe()` hieronder een lege lijst teruggeven, waardoor
// ÁLLE fiscale aandachtspunten stil verdwijnen uit /overzicht, de briefing, de
// totaalplan-rapportage én de Fin-contexten. Herstellen vraagt een nullable
// Box 3-tak in de loader (`standing` wordt dan optioneel), wat door de
// optimizer-keten rimpelt — bewust apart gehouden van deze plak.
async function collectTaxAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const [horizonData, kansen] = await Promise.all([
    loadHorizonRaw(supabase),
    loadFiscaleKansen(supabase, 'personal', CURRENT_TAX_YEAR),
  ])

  // Demping: werknemer mét bedrijfspensioen + ONBEKENDE factor A.
  // Bij onbekende factor A rekent de loader met 0 → de jaarruimte komt op de
  // bovengrens (te hoog), wat een misleidende "benut je jaarruimte"-tip geeft
  // voor iemand die al pensioen opbouwt. Bedrijfspensioen-signaal: een actief
  // life_event met event_type 'pension' én metadata.pensioenType 'bedrijf'
  // (de events-bundel is al op is_active=true gefilterd in de loader). Bij een
  // EXPLICIETE factor A (incl. 0 voor zzp → isKnown=true) of geen
  // bedrijfspensioen blijft de tip ongewijzigd. De box1-hub toont de kans wél
  // (daar beheert de gebruiker 'm); deze demping zit bewust alléén hier.
  //
  // AANNAME BIJGESTELD 26-08-2026 (bevinding H23): "daar beheert de gebruiker
  // 'm" klopte niet — de jaarruimtekaart toonde het bovengrens-bedrag zónder
  // enige onzekerheids-markering en zei zelfs "berekend met je opgeslagen factor
  // A". Dat is nu opgelost aan de KAART-kant (badge + bereik + eerlijke footer,
  // via de prop `factorAKnown`), niet hier: deze demping blijft een filter op de
  // TIPS-lijst, waar geen ruimte is voor een bereik of een badge.
  //
  // BEKENDE GRENS van dit signaal (aparte kaart): een `assets`-rij met
  // asset_type='retirement' telt NIET mee — alleen de pensioen-strategie-wizard
  // zet het life_event. Wie zijn pensioenbezit invoerde maar de wizard nooit
  // doorliep, krijgt de tip dus ongedempt.
  //
  // Het is met opzet een FILTER en geen herberekening: we onderdrukken de
  // geleverde kans, we bouwen 'm niet met andere aannames opnieuw op.
  const hasBedrijfspensioen = horizonData.events.some(
    (ev) =>
      ev.event_type === 'pension' &&
      (ev.metadata as { pensioenType?: unknown } | undefined)?.pensioenType === 'bedrijf',
  )
  const dampenJaarruimte = !horizonData.pensioenFactorAKnown && hasBedrijfspensioen

  // Filter ná de conversie: de `tax:`-namespacing woont in
  // `taxOpportunitiesToAandachtspunten` en hoort hier niet nog eens opgebouwd
  // te worden (één prefix-bron).
  const punten = taxOpportunitiesToAandachtspunten(kansen.taxOpportunities)
  return dampenJaarruimte
    ? punten.filter((a) => a.id !== JAARRUIMTE_AANDACHTSPUNT_ID)
    : punten
}

// ── Budget-producent ─────────────────────────────────────────

/**
 * Bouw de NIBUD-benchmark-overschrijdingen op — spiegelt de assemblage in
 * lib/ai/context/wil-context.ts: spending per slug uit deze-maand-transacties,
 * household-type uit profile. Het DAGTARIEF komt uit de canonieke bundel, niet
 * uit deze-maand-transacties (zie hieronder).
 */
async function collectBudgetAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Gedeelde basisdata-laag: profiel/budgetten/huidige-maand-transacties draaien
  // als ÉÉN query per tabel per request (gedeeld met dashboard/lever/shell). De
  // huidige-maand-tx heeft exact hetzelfde localMonthBounds-venster als voorheen.
  const [profileRes, budgetsRes, txRes, horizonData] = await Promise.all([
    getOwnProfile(supabase),
    getBudgets(supabase),
    getCurrentMonthTx(supabase),
    // `loadHorizonRaw` is request-gecachet en al opgehaald door de schuld-/
    // bezit-producent — dit kost geen extra query.
    loadHorizonRaw(supabase),
  ])

  // Split-regels bij DEZELFDE maandrijen, expliciet meegegeven zodat er geen
  // tweede maand-fetch ontstaat; zonder split-ouders draait er geen query.
  const monthSpendingTx = (txRes.data ?? []) as unknown as SpendingTxRow[]
  const monthSplits = await getCurrentMonthSplits(supabase, monthSpendingTx)

  const profile = profileRes.data
  if (!profile) return []
  const budgets = budgetsRes.data ?? []

  // CANONIEKE bestedingssom (lib/budget-spending.ts) i.p.v. een eigen lus. Het
  // transfer-filter stond hier al, maar de RICHTING en de SPLIT-regels
  // ontbraken: een inkomst op een uitgaven-budget telde als besteding (en blies
  // dus de NIBUD-overschrijding op), en een gesplitste transactie telde op haar
  // ouder in plaats van op de budgetten van haar deelregels. De richting per
  // budget komt uit `buildBudgetTypeMap` (child erft van parent), zodat een
  // slug-kind hetzelfde teken-oordeel krijgt als op de budgetten-pagina.
  const spendingByBudget = buildBudgetSpendingMap(
    monthSpendingTx,
    monthSplits,
    buildBudgetTypeMap(
      budgets.map((b) => ({
        id: b.id,
        parent_id: b.parent_id ?? null,
        budget_type: (b.budget_type as string | null) ?? 'expense',
      })),
    ),
  )

  // CONSUMEER het canonieke 12-mnd rolling dagtarief uit de bundel — dezelfde
  // waarde als de schuld- en bezit-producent hieronder, zodat de belofte "een
  // dagtarief over alle aandachtspunt-rijen" ook voor de budget-rijen geldt.
  // Was: `(totalMonthlyExpenses * 12) / 365` over de LOSSE HUIDIGE KALENDERMAAND
  // met een profielschatting als terugval — een derde grondslag, die vroeg in de
  // maand naar ~0 zakte en dezelfde overschrijding dan een absurd aantal
  // vrijheidsdagen gaf, naast een schuldrij die met het rolling tarief rekende.
  const dailyExpense = horizonData.dailyExpenseRate

  const householdType = getNibudHouseholdType(profile)
  const references = await getNibudReferences(supabase, householdType)
  if (references.length === 0) return []

  // Spending per slug — som van child-budget-spend per slug (wil-context-patroon).
  const spendingBySlug: Record<string, number> = {}
  for (const child of budgets.filter((b) => b.slug)) {
    const spent = spendingByBudget[child.id] ?? 0
    if (spent > 0 && child.slug) {
      spendingBySlug[child.slug] = (spendingBySlug[child.slug] ?? 0) + spent
    }
  }

  const benchmarks = calculateBenchmarks(references, spendingBySlug, dailyExpense)
  const aboveNorm = benchmarks.filter((b) => b.delta > 0 && b.freedom_days_potential > 0)
  return budgetBenchmarksToAandachtspunten(aboveNorm)
}

// ── Schuld-producent ─────────────────────────────────────────

/** Laad actieve schulden + dag-uitgaven en zet ze om naar aandachtspunten. */
async function collectDebtAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const horizonData = await loadHorizonRaw(supabase)
  // CONSUMEER het canonieke 12-mnd rolling dagtarief. Was
  // `dailyExpenseRate(effectiveInput.monthlyExpenses) : 100`: de EFFECTIVE
  // grondslag + een verzonnen €100/dag. De fiscale aandachtspunt-producent
  // (`lib/tax-opportunities-loader.ts`) leest dezelfde bundelwaarde, dus schuld-,
  // bezit- én fiscale rijen in dezelfde briefinglijst rekenen nu met één
  // dagtarief (vervolg KRUIS-20).
  const dailyExpenses = horizonData.dailyExpenseRate

  // Gedeelde actieve-schulden-fetch (adapter gebruikt alleen id/name/
  // current_balance/interest_rate/is_active — een subset van select('*')).
  const { data } = await getActiveDebts(supabase)
  const debts = (data ?? []) as Debt[]
  return debtsToAandachtspunten(debts, dailyExpenses)
}

// ── Asset-producent ──────────────────────────────────────────

/**
 * Laad actieve assets + maanduitgaven + inflatie en zet overtollig spaargeld
 * om naar een cash-drag-aandachtspunt. Géén dag-uitgaven-fallback: bij
 * ontbrekende uitgaven kan geen betekenisvolle noodbuffer worden bepaald, dus
 * geeft de adapter dan bewust niets terug (i.p.v. een verzonnen buffer).
 */
async function collectAssetAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const horizonData = await loadHorizonRaw(supabase)
  // Zelfde canonieke bundelwaarde als de schuld-producent hierboven — één
  // dagtarief over alle aandachtspunt-rijen (vervolg KRUIS-20).
  const dailyExpenses = horizonData.dailyExpenseRate
  const inflationRate = horizonData.fireParams?.inflationRate ?? 0

  // Gedeelde actieve-assets-fetch (adapter gebruikt alleen asset_type/
  // current_value/is_active — een subset van select('*')).
  const { data } = await getActiveAssets(supabase)
  const assets = (data ?? []) as Asset[]
  return assetsToAandachtspunten(assets, dailyExpenses, inflationRate)
}

// ── Verzamelaar ──────────────────────────────────────────────

/**
 * Verzamel alle aandachtspunten over de drie domeinen. Faalt zacht per
 * producent en sorteert het resultaat op besparing (desc).
 */
export async function collectAandachtspunten(
  supabase: SupabaseClient,
): Promise<Aandachtspunt[]> {
  const safe = async (fn: () => Promise<Aandachtspunt[]>): Promise<Aandachtspunt[]> => {
    try {
      return await fn()
    } catch {
      return []
    }
  }

  const [tax, budget, debt, asset] = await Promise.all([
    safe(() => collectTaxAandachtspunten(supabase)),
    safe(() => collectBudgetAandachtspunten(supabase)),
    safe(() => collectDebtAandachtspunten(supabase)),
    safe(() => collectAssetAandachtspunten(supabase)),
  ])

  const sorted = [...tax, ...budget, ...debt, ...asset].sort((a, b) => b.savings - a.savings)

  // Kruis tegen de acties van de gebruiker: een aandachtspunt waarvoor al een
  // OPEN actie op de lijst staat — óf een recent AFGERONDE actie (≤9 mnd, zie
  // collectActionedIds) — hoort niet ook nog als suggestie op te duiken (zelfde
  // metadata.aandachtspunt_id). De actie-set komt uit de gedeelde, faal-zachte
  // `loadActionedAandachtspuntIds` (nu óók door de AI-context-builders
  // geconsumeerd zodat de suppressie op élk oppervlak identiek is).
  const actionedIds = await loadActionedAandachtspuntIds(supabase)

  return filterActionedAandachtspunten(sorted, actionedIds)
}
