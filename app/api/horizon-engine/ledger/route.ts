import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'

/**
 * Draait de grootboek-engine (v2) op de ECHTE data van de ingelogde gebruiker
 * (via de gedeelde `buildHorizonInput` — zelfde input-assemblage als /toekomst).
 * Levert het volledige grootboek (tabellen A–H) voor de transparantie-/
 * troubleshoot-pagina op `/beheer/horizon-tabellen-mij`. Alleen-lezen; raakt
 * geen data.
 *
 * NB: sinds de C5-uitfasering (commit 1417a4568) is v2 de enige FIRE-engine —
 * `runUnifiedProjection` (v1) bestaat niet meer. De oude v1↔v2-vergelijking is
 * daarmee komen te vervallen; deze route levert uitsluitend het v2-grootboek.
 *
 * STAP-5-DELETIEPUNT (FASE 6, horizon-kernel-migratie): deze route bedient alleen de
 * beheer-pagina `/beheer/horizon-tabellen-mij`, die is vervangen door
 * `/beheer/horizon-kernel`. Route + pagina + de gedeelde `horizon-tabellen`-modules
 * verdwijnen bij FASE 6 stap 5 (default-flip = stap 3).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const data = await loadHorizonData(supabase)
  const built = buildHorizonInput({
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
    horizonEngineV2: true,
  })

  if (!built) {
    return NextResponse.json({
      ok: false,
      reason: 'Onvoldoende data (geboortedatum of retirement-uitgaven ontbreken).',
    })
  }

  const result = runHorizonLedger(built.input, built.strategyOptions)

  return NextResponse.json({
    ok: true,
    strategy: built.input.strategyConfig.strategy,
    result,
  })
}
