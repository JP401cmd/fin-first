/**
 * Horizon grootboek-engine — forward (V_op) + backward (V_nodig) + snijpunt.
 *
 * Tabel-georiënteerde FIRE-rekenmotor. Accepteert dezelfde `UnifiedProjectionInput`
 * als de huidige engine (drop-in), maar rekent intern als grootboek in REËLE
 * termen, **per individueel asset en per individuele schuld**.
 *
 * Model (twee passes — zoals het referentieprototype):
 *  - Pass 1: forward "werk tot AOW" → V_op (liquide). Backward V_nodig (retire-now).
 *    Snijpunt = FIRE.
 *  - Pass 2: forward "stop met werken op FIRE" → de getoonde lijn. Vanaf FIRE wordt
 *    onttrokken volgens de **onttrekkingsstrategie + eindstrategie** (deplete → ~€0,
 *    legacy → nalatenschap, perpetual → koopkracht, guardrails/vpw/bucket).
 *
 * Reëel: rendement (1+nom)/(1+infl)−1; uitgaven/sparen vlak reëel; de adapter
 * rekent terug naar nominaal (Route 2). Pure functie, geen Supabase.
 */

import type { AssetType } from '@/lib/asset-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { NL_AOW_AGE, NL_HOME_MAINTENANCE_PCT } from '@/lib/constants'
import { BOX3_PARAMS, classifyAsset, type Box3Category } from '@/lib/box3-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { applyWithdrawalStrategy, type WithdrawalContext } from '@/lib/withdrawal-strategy'
import {
  type HorizonStrategyOptions,
  DEFAULT_STRATEGY_OPTIONS,
  INVESTABLE_TYPES,
  allocateProRata,
  withdrawSequential,
  withdrawProRata,
} from './strategies'
import type {
  LedgerRow,
  LedgerEvent,
  AssetBeweging,
  SchuldBeweging,
  HorizonLedgerResult,
} from './types'

// Vermogensgroepen die NIET als liquide (besteedbaar) vermogen tellen.
const NON_LIQUID: Set<AssetType> = new Set(['eigen_huis', 'vehicle', 'physical'])

/**
 * Een asset is niet-liquide o.b.v. zijn type, TENZIJ het expliciet als besteedbaar
 * is gemarkeerd (`spendable`) — dat gebeurt bij housing-strategie `include_full`,
 * waar de woning volledig in de besteedbare FIRE-pot meetelt (ADR 0015). Zo loopt
 * een deplete/spend-down ook de woning af (laatst in de volgorde) i.p.v. dat 'ie
 * onbespeelbaar blijft groeien.
 */
function isNonLiquid(a: { type: AssetType; spendable?: boolean }): boolean {
  return NON_LIQUID.has(a.type) && !a.spendable
}

const ONDERHOUD_PCT = NL_HOME_MAINTENANCE_PCT
const BOX3_YEAR = 2026 as const

function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}

function vpwPct(remainingYears: number, realRate: number): number {
  if (remainingYears <= 1) return 1.0
  const r = Math.max(0.001, realRate)
  return r / (1 - Math.pow(1 + r, -remainingYears))
}

interface RunningAsset {
  id: string
  naam: string
  type: AssetType
  value: number
  realRet: number
  box3Cat: Box3Category
  /** True = tel als besteedbaar/liquide ondanks het type (include_full-woning). */
  spendable: boolean
}

interface RunningDebt {
  id: string
  naam: string
  balance: number
  rate: number
  annualPayment: number
  repayment: 'aflossingsvrij' | 'annuiteit' | 'lineair'
  isMortgage: boolean
  deductible: boolean
  flagged: boolean
}

interface ForwardResult {
  rows: LedgerRow[]
  /** Retire-now netto behoefte per jaar — bron voor backward V_nodig. */
  netNeed: number[]
}

export function runHorizonLedger(
  input: UnifiedProjectionInput,
  optsOverride?: Partial<HorizonStrategyOptions>,
): HorizonLedgerResult {
  const opts: HorizonStrategyOptions = { ...DEFAULT_STRATEGY_OPTIONS, ...optsOverride }
  const inflation = input.inflationRate
  const aowAge = input.forcedFireAge != null ? Math.round(input.forcedFireAge) : NL_AOW_AGE
  const startAge = Math.round(input.currentAge)
  const strategy = input.strategyConfig.strategy
  const endAge =
    strategy === 'perpetual' ? Math.max(input.strategyConfig.endAge, 100) : input.strategyConfig.endAge
  const withdrawalType = input.withdrawalStrategy.strategy
  const box3Params = BOX3_PARAMS[BOX3_YEAR]
  const box3Vrij = input.hasPartner ? box3Params.heffingsvrijPartner : box3Params.heffingsvrijSingle
  const realRetAvg = realReturn(input.grossReturn, inflation)
  const annualSavings = Math.max(0, input.annualSavings)
  const grossAnnualIncome = Math.max(0, input.monthlyIncome) * 12
  // Assets die ondanks hun (niet-liquide) type tóch als besteedbaar meetellen —
  // de include_full-woning (ADR 0015). Zie isNonLiquid.
  const spendableIds = new Set(input.spendableAssetIds ?? [])

  // ── Fresh running-state per pass (assets/debts worden gemuteerd) ──
  function buildAssets(): RunningAsset[] {
    const out: RunningAsset[] = []
    for (const a of input.assets) {
      if (a.is_active === false) continue
      const incl = (a.net_worth_inclusion_pct ?? 100) / 100
      const value = (a.current_value ?? 0) * incl
      let nom = (a.expected_return ?? 0) / 100
      if (a.depreciation_rate && a.depreciation_rate > 0) nom = -(a.depreciation_rate / 100)
      nom += input.returnDeltaByAssetType?.[a.asset_type] ?? input.returnDelta ?? 0
      out.push({
        id: a.id,
        naam: a.name,
        type: a.asset_type,
        value,
        realRet: realReturn(nom, inflation),
        box3Cat: classifyAsset(a).category,
        spendable: spendableIds.has(a.id),
      })
    }
    if (input.bankAccountCash && input.bankAccountCash > 0) {
      out.push({ id: 'bank-cash', naam: 'Bankrekeningen (los)', type: 'cash', value: input.bankAccountCash, realRet: realReturn(0, inflation), box3Cat: 'spaargeld', spendable: false })
    }
    return out
  }
  function buildDebts(): RunningDebt[] {
    return input.debts
      .filter((d) => d.is_active !== false)
      .map((d) => ({
        id: d.id,
        naam: d.name,
        balance: (d.current_balance ?? 0) * ((d.net_worth_inclusion_pct ?? 100) / 100),
        rate: (d.interest_rate ?? 0) / 100,
        annualPayment: (d.monthly_payment ?? 0) * 12,
        repayment: (d.repayment_type ?? 'annuiteit') as RunningDebt['repayment'],
        isMortgage: d.debt_type === 'mortgage',
        deductible: d.is_tax_deductible === true,
        flagged: d.include_aflossing_in_savings === true,
      }))
  }

  // ── Forward pass ──────────────────────────────────────────────────────────
  function runForward(stopWorkAtAge: number | null): ForwardResult {
    const assets = buildAssets()
    const debts = buildDebts()

    const investableIds = assets.filter((a) => INVESTABLE_TYPES.includes(a.type)).map((a) => a.id)
    const liquidIds = assets.filter((a) => !isNonLiquid(a)).map((a) => a.id)
    // Surplus-doel (pot-regel "verdeling bij toename"): specifieke types indien gezet,
    // anders investable → liquide → eerste asset.
    let surplusTargets =
      opts.surplusTargetTypes && opts.surplusTargetTypes.length
        ? assets.filter((a) => opts.surplusTargetTypes!.includes(a.type)).map((a) => a.id)
        : []
    if (surplusTargets.length === 0) {
      surplusTargets = investableIds.length ? investableIds : liquidIds.length ? liquidIds : assets.length ? [assets[0].id] : []
    }
    const firstInvestId = investableIds[0] ?? surplusTargets[0]
    const firstCashId = assets.find((a) => a.type === 'cash')?.id ?? surplusTargets[0]
    const orderIdsFor = (types: AssetType[]): string[] => {
      const ids: string[] = []
      for (const t of types) for (const a of assets) if (a.type === t) ids.push(a.id)
      for (const a of assets) if (!ids.includes(a.id)) ids.push(a.id)
      return ids
    }
    // Onttrekkingsvolgorde (decumulatie) + aparte tekort-volgorde (opbouwfase).
    const withdrawalOrderIds = orderIdsFor(opts.withdrawalOrder)
    const deficitOrderIds = orderIdsFor(opts.deficitOrder ?? opts.withdrawalOrder)

    const stopAt = stopWorkAtAge ?? aowAge
    const rows: LedgerRow[] = []
    const netNeed: number[] = []
    let decumStartAge: number | null = null
    let decumStartLiquide = 0
    let prevWithdrawal = 0

    for (let age = startAge; age <= endAge; age++) {
      const jaar = age - startAge
      const werkt = age < stopAt
      const beginById: Record<string, number> = {}
      for (const a of assets) beginById[a.id] = a.value

      // 1. Marktschok
      const shock = oneTimeShock(input.cashflows, age)
      if (shock !== 0) for (const a of assets) if (INVESTABLE_TYPES.includes(a.type)) a.value *= 1 + shock

      // 2. Rendement (reëel) per asset
      const rendById: Record<string, number> = {}
      for (const a of assets) {
        const r = a.value * a.realRet
        rendById[a.id] = r
        a.value += r
      }

      // 2b. Box 3-drag per asset (na heffingsvrij)
      const box3ById: Record<string, number> = {}
      let box3Value = 0
      for (const a of assets) if (a.box3Cat) box3Value += Math.max(0, a.value)
      const taxable = box3Value > box3Vrij ? (box3Value - box3Vrij) / box3Value : 0
      if (taxable > 0) {
        for (const a of assets) {
          if (!a.box3Cat) continue
          const forfait = a.box3Cat === 'spaargeld' ? box3Params.forfaitSpaargeld : box3Params.forfaitBeleggingen
          const rate = input.box3Method === 'werkelijk' ? Math.max(0, a.realRet) * box3Params.tarief : forfait * box3Params.tarief
          const drag = Math.max(0, a.value) * rate * taxable
          box3ById[a.id] = drag
          a.value -= drag
        }
      }

      // 3. Schuldschema
      const schuldenRow: SchuldBeweging[] = []
      let schuldlasten = 0
      let flaggedAflossing = 0
      for (const d of debts) {
        const begin = d.balance
        const rente = begin * d.rate
        let aflossing = 0
        if (d.repayment !== 'aflossingsvrij' && begin > 0) aflossing = Math.max(0, Math.min(d.annualPayment, begin + rente) - rente)
        aflossing = Math.min(aflossing, begin)
        d.balance = Math.max(0, begin - aflossing)
        schuldlasten += rente + aflossing
        if (d.flagged) flaggedAflossing += aflossing
        schuldenRow.push({ id: d.id, naam: d.naam, begin, rente, aflossing, extraAflossing: 0, eind: d.balance })
      }
      const eigenHuisWaarde = assets.filter((a) => a.type === 'eigen_huis').reduce((s, a) => s + Math.max(0, a.value), 0)
      const onderhoud = eigenHuisWaarde > 0 ? eigenHuisWaarde * ONDERHOUD_PCT : 0
      const woonkosten = schuldlasten + onderhoud

      // 4. Cashflows
      const rec = activeRecurring(input.cashflows, age, inflation, startAge)
      const one = oneTimeFlows(input.cashflows, age)
      const recurringIncome = rec.income
      const eventsUitgave = rec.expense + one.expense
      const eventsInkomen = one.income

      // 5. Inkomen (display) — bruto; loonheffing/HRA zitten al in de spaarquote.
      const salaris = werkt ? grossAnnualIncome : 0

      // 6. Eenmalig inkomen wordt belegd (instroom) vóór onttrekking
      const instroomById: Record<string, number> = {}
      const uitstroomById: Record<string, number> = {}
      if (eventsInkomen > 0) {
        const alloc = allocateProRata(snapshot(assets), surplusTargets, eventsInkomen)
        for (const [id, v] of Object.entries(alloc)) {
          instroomById[id] = (instroomById[id] ?? 0) + v
          const a = assets.find((x) => x.id === id)
          if (a) a.value += v
        }
      }

      // 6b. Asset-liquidatie (bv. eigen-huis-downsize): verkoop het asset BINNEN
      // het grootboek i.p.v. het uit de pot te filteren + de verkoop als inkomen
      // in te spuiten. Het niet-liquide asset (huiswaarde, na groei dit jaar)
      // verlaat het grootboek; de gekoppelde hypotheek wordt afgelost (saldo → 0,
      // woonlast stopt vanaf volgend jaar); de netto-opbrengst stroomt naar
      // liquide. Netto vermogen blijft daardoor continu (alleen −verkoopkosten),
      // alléén de liquiditeit verspringt. Zie ADR 0015.
      for (const liq of input.assetLiquidations ?? []) {
        if (Math.round(liq.age) !== age) continue
        const asset = assets.find((a) => a.id === liq.assetId)
        if (!asset || asset.value <= 0) continue
        const marktwaarde = asset.value
        const verkoopprijs = marktwaarde * liq.salePricePct
        let afgelost = 0
        for (const debtId of liq.payoffDebtIds) {
          const d = debts.find((x) => x.id === debtId)
          if (!d || d.balance <= 0) continue
          afgelost += d.balance
          const drow = schuldenRow.find((s) => s.id === d.id)
          if (drow) {
            drow.extraAflossing += d.balance
            drow.eind = 0
          }
          d.balance = 0
        }
        const opbrengstNetto = verkoopprijs * (1 - liq.salesCostsPct) - afgelost
        // Het asset verlaat het grootboek (uitstroom = volledige marktwaarde).
        uitstroomById[asset.id] = (uitstroomById[asset.id] ?? 0) + marktwaarde
        asset.value = 0
        // Netto-opbrengst → liquide (zelfde verdeel-doelen als surplus/eenmalig
        // inkomen). Onderwater (negatief) → onttrek het tekort in de tekort-volgorde.
        if (opbrengstNetto > 0) {
          const alloc = allocateProRata(snapshot(assets), surplusTargets, opbrengstNetto)
          for (const [id, v] of Object.entries(alloc)) {
            instroomById[id] = (instroomById[id] ?? 0) + v
            const a = assets.find((x) => x.id === id)
            if (a) a.value += v
          }
        } else if (opbrengstNetto < 0) {
          withdrawFrom(assets, deficitOrderIds, opts.shortfall, -opbrengstNetto, uitstroomById)
        }
      }

      let leefuitgaven: number
      let cashflowNetto: number

      if (werkt) {
        // ── Accumulatie ──
        leefuitgaven = Math.max(0, salaris - woonkosten - annualSavings)
        const surplus = annualSavings - flaggedAflossing + (recurringIncome - rec.expense) - one.expense
        cashflowNetto = surplus + eventsInkomen
        if (surplus > 0) {
          let rem = surplus
          if (opts.surplus === 'aflossen-eerst') {
            const byRate = [...debts].sort((a, b) => b.rate - a.rate)
            for (const d of byRate) {
              if (rem <= 0 || d.balance <= 0) continue
              const extra = Math.min(rem, d.balance * 0.1, d.balance)
              d.balance -= extra
              rem -= extra
              const drow = schuldenRow.find((s) => s.id === d.id)
              if (drow) {
                drow.extraAflossing += extra
                drow.eind = d.balance
              }
            }
          }
          const alloc = allocateSurplus(snapshot(assets), rem, opts, surplusTargets, firstInvestId, firstCashId)
          for (const [id, v] of Object.entries(alloc)) {
            instroomById[id] = (instroomById[id] ?? 0) + v
            const a = assets.find((x) => x.id === id)
            if (a) a.value += v
          }
        } else if (surplus < 0) {
          withdrawFrom(assets, deficitOrderIds, opts.shortfall, -surplus, uitstroomById)
        }
      } else {
        // ── Decumulatie: onttrekking volgens strategie ──
        if (decumStartAge === null) {
          decumStartAge = age
          decumStartLiquide = liquidValue(assets)
        }
        leefuitgaven = input.yearlyExpenses
        const baseExpenses = leefuitgaven + woonkosten + rec.expense + one.expense
        const ctx: WithdrawalContext = {
          baseExpenses,
          recurringIncome,
          currentPortfolio: liquidValue(assets),
          startPortfolio: decumStartLiquide,
          previousWithdrawal: prevWithdrawal,
          // Werkelijk gewogen reëel rendement van de LIQUIDE portefeuille (cash/crypto
          // drukken dit onder grossReturn) — zodat de deplete-annuïteit niet te veel
          // onttrekt en de lijn correct op ~€0 eindigt i.p.v. vroegtijdig leeg.
          yearReturn: liquidRealReturn(assets),
          yearsIntoRetirement: age - decumStartAge,
          currentAge: age,
          endAge,
          endStrategy: strategy,
          legacyAmount: input.strategyConfig.legacyAmount,
          // Grootboek-model: het surplus bóven de leefbehoefte wordt NIET
          // geconsumeerd/herbelegd. Voor legacy daarom need-only onttrekken zodat
          // het residu naar de nalatenschap groeit — de spend-down-annuïteit zou
          // het surplus uit de assets laten verdampen → nalatenschap onhaalbaar.
          // (v1 consumeert de annuïteit wél; vandaar deze opt-in i.p.v. een
          // gedragswijziging in de gedeelde functie.) Zie ADR 0014.
          legacyPreserveOnly: true,
          inflation: 0, // reëel: geen inflatie in de annuïteit
        }
        const withdrawal = applyWithdrawalStrategy(input.withdrawalStrategy, ctx)
        prevWithdrawal = withdrawal
        withdrawFrom(assets, withdrawalOrderIds, opts.shortfall, withdrawal, uitstroomById)
        cashflowNetto = recurringIncome + eventsInkomen - withdrawal
      }

      // 7. Totalen + bracketing
      const totaalAssets = assets.reduce((s, a) => s + a.value, 0)
      const totaalSchuld = debts.reduce((s, d) => s + d.balance, 0)
      const liquideVermogen = liquidValue(assets)
      const box3Grondslag = Math.max(0, box3Value - box3Vrij)
      const box3Total = Object.values(box3ById).reduce((s, v) => s + v, 0)

      const assetsRow: AssetBeweging[] = assets.map((a) => ({
        id: a.id,
        naam: a.naam,
        type: a.type,
        begin: beginById[a.id] ?? 0,
        rendement: rendById[a.id] ?? 0,
        instroom: instroomById[a.id] ?? 0,
        uitstroom: uitstroomById[a.id] ?? 0,
        box3: box3ById[a.id] ?? 0,
        eind: a.value,
      }))

      rows.push({
        jaar,
        leeftijd: age,
        fase: 'opbouw',
        werkt,
        salaris,
        aowEnPensioen: recurringIncome,
        overigInkomen: eventsInkomen,
        box3Grondslag,
        box3: box3Total,
        woonkosten,
        leefuitgaven,
        eventsUitgave,
        totaleUitgaven: leefuitgaven + woonkosten + eventsUitgave,
        cashflowNetto,
        assets: assetsRow,
        schulden: schuldenRow,
        totaalAssets,
        totaalSchuld,
        nettoVermogen: totaalAssets - totaalSchuld,
        liquideVermogen,
        vNodig: 0,
        dekking: 0,
        events: collectEvents(input.cashflows, age),
      })

      netNeed.push(Math.max(0, input.yearlyExpenses + woonkosten + eventsUitgave - recurringIncome - eventsInkomen))
    }

    return { rows, netNeed }
  }

  // ── V_nodig (backward referentielijn) ──
  const pass1 = runForward(null)
  const vNodig = backwardVnodig(pass1.rows, pass1.netNeed, realRetAvg, strategy, input.strategyConfig.legacyAmount, liquidSumStart(input), withdrawalType)

  // ── FIRE via forward doel-zoektocht (zelf-consistent) ──
  // FIRE = vroegste leeftijd waarop "stop met werken + onttrek volgens de
  // strategie" het einddoel haalt: deplete → niet vroegtijdig leeg (eindigt ~€0),
  // perpetual → koopkracht behouden, legacy → nalatenschap intact. De getoonde
  // lijn ÍS die run, dus de grafiek en de FIRE-leeftijd kloppen per constructie.
  let fireAge: number | null = null
  let displayRows = pass1.rows
  if (input.forcedFireAge != null) {
    fireAge = Math.round(input.forcedFireAge)
    displayRows = runForward(fireAge).rows
  } else {
    for (let f = startAge; f <= endAge; f++) {
      const run = runForward(f)
      if (meetsStrategyTarget(run.rows, f, endAge, strategy, input.strategyConfig.legacyAmount)) {
        fireAge = f
        displayRows = run.rows
        break
      }
    }
  }

  const fireIdx = fireAge != null ? displayRows.findIndex((r) => r.leeftijd === fireAge) : -1
  for (let i = 0; i < displayRows.length; i++) {
    displayRows[i].vNodig = vNodig[i]
    displayRows[i].dekking = displayRows[i].liquideVermogen - vNodig[i]
  }
  const fa = fireAge ?? Number.POSITIVE_INFINITY
  for (const r of displayRows) {
    r.fase = r.leeftijd < fa ? 'opbouw' : r.leeftijd < aowAge ? 'overbrugging' : 'onttrekking'
  }

  return {
    rows: displayRows,
    vNodig,
    fireAge,
    fireAgeFractional: fireAge,
    fireReachable: fireAge != null,
    requiredFirePortfolioAtFire: fireIdx >= 0 ? vNodig[fireIdx] : 0,
    liquideAtFire: fireIdx >= 0 ? displayRows[fireIdx].liquideVermogen : 0,
    displayEndAge: endAge,
    strategy,
    inflationRate: inflation,
  }
}

/**
 * Haalt een retire-at-FIRE-run het einddoel van de strategie?
 *  - niet vroegtijdig leeg (liquide > €1 vóór de eindleeftijd) voor álle strategieën;
 *  - perpetual: eindvermogen ≥ vermogen op FIRE (koopkracht behouden);
 *  - legacy: eindvermogen ≥ nalatenschapsbedrag;
 *  - deplete/pensioen: niet vroegtijdig leeg volstaat (de annuïteit eindigt ~€0).
 */
function meetsStrategyTarget(rows: LedgerRow[], fireAge: number, endAge: number, strategy: string, legacyAmount: number): boolean {
  const ret = rows.filter((r) => r.leeftijd >= fireAge)
  if (ret.length === 0) return false
  const endLiquide = ret[ret.length - 1].liquideVermogen

  if (strategy === 'perpetual' || strategy === 'legacy') {
    // Mag tussendoor niet leeg raken; eindvermogen moet het doel halen.
    let minMid = Number.POSITIVE_INFINITY
    for (let i = 0; i < ret.length - 1; i++) minMid = Math.min(minMid, ret[i].liquideVermogen)
    if (minMid <= 1) return false
    const target = strategy === 'perpetual' ? ret[0].liquideVermogen * 0.99 : legacyAmount - Math.max(1, legacyAmount * 0.02)
    return endLiquide >= target
  }

  // deplete / pensioen: niet vroegtijdig leeg vóór de terminale 2 jaar (de
  // annuïteit-onttrekking in het laatste jaar trekt het restant in één keer leeg).
  let minEarly = Number.POSITIVE_INFINITY
  for (const r of ret) if (r.leeftijd <= endAge - 2) minEarly = Math.min(minEarly, r.liquideVermogen)
  return minEarly > 1
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function snapshot(assets: RunningAsset[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const a of assets) m[a.id] = a.value
  return m
}

function liquidValue(assets: RunningAsset[]): number {
  return assets.filter((a) => !isNonLiquid(a)).reduce((s, a) => s + Math.max(0, a.value), 0)
}

/** Waarde-gewogen reëel rendement van de liquide portefeuille (voor de annuïteit). */
function liquidRealReturn(assets: RunningAsset[]): number {
  let val = 0
  let wr = 0
  for (const a of assets) {
    if (isNonLiquid(a)) continue
    const v = Math.max(0, a.value)
    val += v
    wr += v * a.realRet
  }
  return val > 0 ? wr / val : 0
}

function withdrawFrom(
  assets: RunningAsset[],
  orderIds: string[],
  shortfall: 'sequentieel' | 'pro-rata',
  need: number,
  uitstroomById: Record<string, number>,
): void {
  if (need <= 0) return
  const values = snapshot(assets)
  const res = shortfall === 'pro-rata' ? withdrawProRata(values, orderIds, need) : withdrawSequential(values, orderIds, need)
  for (const [id, v] of Object.entries(res.taken)) {
    uitstroomById[id] = (uitstroomById[id] ?? 0) + v
    const a = assets.find((x) => x.id === id)
    if (a) a.value -= v
  }
}

function liquidSumStart(input: UnifiedProjectionInput): number {
  const spendable = new Set(input.spendableAssetIds ?? [])
  let s = 0
  for (const a of input.assets) {
    if (a.is_active === false) continue
    if (NON_LIQUID.has(a.asset_type) && !spendable.has(a.id)) continue
    s += (a.current_value ?? 0) * ((a.net_worth_inclusion_pct ?? 100) / 100)
  }
  s += input.bankAccountCash ?? 0
  return s
}

function allocateSurplus(
  valueById: Record<string, number>,
  surplus: number,
  opts: HorizonStrategyOptions,
  surplusTargets: string[],
  firstInvestId: string | undefined,
  firstCashId: string | undefined,
): Record<string, number> {
  if (surplus <= 0) return {}
  if (opts.surplus === 'vast') {
    const toBel = Math.min(opts.vastJaarbedrag, surplus)
    const rest = surplus - toBel
    const out: Record<string, number> = {}
    if (toBel > 0 && firstInvestId) out[firstInvestId] = toBel
    if (rest > 0 && firstCashId) out[firstCashId] = (out[firstCashId] ?? 0) + rest
    return out
  }
  // pro-rata / alles-beleggen / aflossen-eerst (restant) → naar de surplus-doelen
  // (default = investable; bij een pot-regel = de gekozen groep).
  return allocateProRata(valueById, surplusTargets, surplus)
}

/**
 * Terugkerende kasstromen voor een projectiejaar, als JAARbedrag in REËLE termen.
 *
 * `SimCashflow.amount` is voor recurring een MAANDbedrag (conventie van
 * `lifeEventsToCashflows`/`computeAowMonthly`; v1 `recurringYearly` doet × maanden).
 * Daarom × 12. In reële termen:
 *  - geïndexeerd (AOW, pensioen, huur): houdt koopkracht → **vlak reëel** (× 12);
 *  - niet-geïndexeerd: nominaal vlak → **erodeert** met inflatie t.o.v. nu.
 */
function activeRecurring(
  cashflows: SimCashflow[],
  age: number,
  inflation: number,
  startAge: number,
): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const cf of cashflows) {
    if (cf.type !== 'recurring') continue
    if (age < cf.fromAge) continue
    if (cf.toAge != null && age >= cf.toAge) continue
    const realFactor = cf.indexed ? 1 : 1 / Math.pow(1 + inflation, Math.max(0, age - startAge))
    const jaarbedrag = cf.amount * 12 * realFactor
    if (cf.direction === 'income') income += jaarbedrag
    else expense += jaarbedrag
  }
  return { income, expense }
}

function oneTimeFlows(cashflows: SimCashflow[], age: number): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const cf of cashflows) {
    if (cf.type !== 'one_time') continue
    if (Math.round(cf.fromAge) !== age) continue
    if (cf.portfolioPct != null) continue
    if (cf.direction === 'income') income += cf.amount
    else expense += cf.amount
  }
  return { income, expense }
}

function oneTimeShock(cashflows: SimCashflow[], age: number): number {
  let pct = 0
  for (const cf of cashflows) if (cf.type === 'one_time' && cf.portfolioPct != null && Math.round(cf.fromAge) === age) pct += cf.portfolioPct
  return pct
}

function collectEvents(cashflows: SimCashflow[], age: number): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const cf of cashflows) {
    const hit = cf.type === 'one_time' ? Math.round(cf.fromAge) === age : age === cf.fromAge
    if (!hit) continue
    out.push({ id: cf.id, naam: cf.name, bedrag: cf.amount, richting: cf.direction })
  }
  return out
}

function backwardVnodig(
  rows: LedgerRow[],
  netNeed: number[],
  realRetAvg: number,
  strategy: string,
  legacyAmount: number,
  initialLiquide: number,
  withdrawalType: string,
): number[] {
  const n = rows.length
  const v = new Array<number>(n).fill(0)
  const rOnttrek = 0.6 * realRetAvg

  if (withdrawalType === 'vpw') {
    for (let i = 0; i < n; i++) {
      const remaining = rows[n - 1].leeftijd - rows[i].leeftijd + 1
      const pct = vpwPct(remaining, rOnttrek)
      v[i] = pct > 0 ? netNeed[i] / pct : 0
    }
    return v
  }

  let endVal = 0
  if (strategy === 'perpetual') endVal = initialLiquide
  else if (strategy === 'legacy') endVal = legacyAmount
  v[n - 1] = endVal
  for (let i = n - 2; i >= 0; i--) v[i] = (v[i + 1] + netNeed[i]) / (1 + rOnttrek)
  return v
}
