import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { runUnifiedProjection } from '@/lib/unified-projection'

/**
 * Draait de grootboek-engine v2 op de ECHTE data van de ingelogde gebruiker
 * (via de gedeelde `buildHorizonInput` — zelfde input-assemblage als /toekomst).
 * Levert het volledige grootboek (tabellen A–G) + een v1-vergelijking (FIRE-leeftijd
 * en benodigd vermogen) voor de transparantie/troubleshoot-pagina op /beheer.
 * Alleen-lezen; raakt geen data.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const data = await loadHorizonData(supabase)
  const sharedParams = {
    horizonInput: data.effectiveInput,
    lifeEvents: data.events,
    fireStrategy: data.fireStrategy,
    withdrawalStrategy: data.withdrawalStrategy,
    grossReturn: data.fireParams.grossReturn,
    inflation: data.fireParams.inflationRate,
    assets: data.assets,
    debts: data.debts,
    box3Method: data.box3Method,
    hasPartner: data.hasPartner,
    bankAccountCash: data.unlinkedCash,
    monthlySavingsOverride: data.monthlySavingsOverride,
    baseAnnualSavingsFromCashflow: data.baseAnnualSavingsFromCashflow,
    housingStrategy: data.housingStrategy,
    potRules: data.potRules,
  }
  // v2 bouwt de input met het nieuwe housing-model (huis in de ledger +
  // asset-liquidatie); v1 met het oude (filter + inkomen) — apart bouwen zodat de
  // vergelijking elke engine op zijn eigen housing-model toont (ADR 0015).
  const built = buildHorizonInput({ ...sharedParams, horizonEngineV2: true })
  const builtV1 = buildHorizonInput({ ...sharedParams, horizonEngineV2: false })

  if (!built) {
    return NextResponse.json({ ok: false, reason: 'Onvoldoende data (geboortedatum of retirement-uitgaven ontbreken).' })
  }

  const v2 = runHorizonLedger(built.input, built.strategyOptions)
  let v1: { fireAge: number | null; requiredFirePortfolio: number } | null = null
  try {
    const r1 = runUnifiedProjection((builtV1 ?? built).input)
    v1 = { fireAge: r1.fireAge, requiredFirePortfolio: Math.round(r1.requiredFirePortfolio) }
  } catch {
    v1 = null
  }

  return NextResponse.json({
    ok: true,
    strategy: built.input.strategyConfig.strategy,
    result: v2,
    v1,
  })
}
