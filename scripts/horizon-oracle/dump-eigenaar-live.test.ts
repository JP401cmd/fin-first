// @vitest-environment node
/**
 * End-to-end verificatie-dump (stap 1 van de app↔Excel-check; zie README §Re-run).
 *
 * OPT-IN: draait alléén met EIGENAAR_LIVE=1 — raakt de echte DB en hoort nooit in
 * een gewone suite-run. Uitvoer bevat echte financiële gegevens en landt daarom
 * standaard BUITEN de repo (os.tmpdir; override via DUMP_OUT).
 *
 * Laadt de ECHTE eigenaar-data (jpsmit@jps-holding.nl) via de service-role-client
 * en gebruikt EXACT hetzelfde laadpad als het beheer-scherm /beheer/horizon-kernel
 * (lib/horizon-kernel-report/load-input.ts). Omdat de service-client RLS passeert
 * (en `.single()` op profiles dan alle rijen ziet), zijn de queries 1:1 gerepliceerd
 * met een expliciete owner-scope i.p.v. RLS. Verder GEEN afwijking van het laadpad:
 * dezelfde selects, dezelfde num()-coercies (net_monthly_income/estimated_monthly_
 * expenses), en expected_return/inflation_rate BEWUST ONgecoerced (zoals load-input),
 * zodat de dump elke numeric-string-verrassing trouw blootlegt.
 *
 * Draai (PowerShell):
 *   $env:EIGENAAR_LIVE='1'; npx vitest run scripts/horizon-oracle/dump-eigenaar-live.test.ts
 *
 * Service-role-key komt UITSLUITEND uit .env.local (nooit hardcoden — S1-precedent).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { resolveFireParams } from '@/lib/fire-params'
import { parseHousingStrategy } from '@/lib/housing-strategy'
import { computeYearlyMustExpenses } from '@/lib/budget-utils'
import { formatCurrency } from '@/lib/format'
import {
  buildKernelInputFromAppWithNotices,
  type KernelAdapterInput,
  type KernelAdapterProfile,
} from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { HORIZON_MONTHS } from '@/lib/horizon-kernel/types'

// Owner user id — opgelost uit auth.users WHERE email='jpsmit@jps-holding.nl'
// (discovery-fase). Geen geheim; de e-mail is de bron van waarheid.
const OWNER_ID = 'bb5b9d40-83e9-4fe7-8abf-36962547e213'
const OWNER_EMAIL = 'jpsmit@jps-holding.nl'

// Echte financiële gegevens → standaard buiten de repo (nooit per ongeluk committen).
const OUT_DIR = process.env.DUMP_OUT ?? join(tmpdir(), 'trifinity-eigenaar-live')

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return out
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function pct(v: unknown): string {
  const n = Number(v ?? 0)
  return `${(n * 100).toFixed(2)}%`
}

describe.skipIf(process.env.EIGENAAR_LIVE !== '1')('eigenaar-live dump', () => {
  it('laadt echte data, bouwt KernelInput en solvet FIRE', async () => {
    const env = loadEnvLocal()
    const url = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    expect(url, 'NEXT_PUBLIC_SUPABASE_URL in .env.local').toBeTruthy()
    expect(serviceKey, 'SUPABASE_SERVICE_ROLE_KEY in .env.local').toBeTruthy()

    const supabase: SupabaseClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ── Queries: 1:1 uit load-input.ts, met expliciete owner-scope ──────────────
    const [profileResult, assetsResult, debtsResult, eventsResult, aowResult, budgetsResult] =
      await Promise.all([
        supabase
          .from('profiles')
          .select(
            'date_of_birth, household_type, number_of_children, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source, expected_return, inflation_rate, marginaal_tarief, box3_method, fire_end_strategy, fire_end_age, fire_legacy_amount, retirement_expense_method, retirement_expense_custom_amount, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, housing_strategy_config, pot_rules, feature_preferences',
          )
          .eq('id', OWNER_ID)
          .single(),
        supabase.from('assets').select('*').eq('user_id', OWNER_ID).eq('is_active', true).limit(500),
        supabase.from('debts').select('*').eq('user_id', OWNER_ID).eq('is_active', true).limit(200),
        supabase
          .from('life_events')
          .select('*')
          .eq('user_id', OWNER_ID)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('aow_leeftijd').select('*'),
        supabase
          .from('budgets')
          .select('id, name, default_limit, interval, budget_type, is_essential, parent_id')
          .eq('user_id', OWNER_ID)
          .eq('is_archived', false),
      ])

    if (profileResult.error) throw new Error(`profiles: ${profileResult.error.message}`)
    const profileRaw = (profileResult.data ?? {}) as Record<string, unknown>
    if (!profileRaw.date_of_birth) throw new Error('geen geboortedatum')

    const assets = (assetsResult.data ?? []) as Asset[]
    const debts = (debtsResult.data ?? []) as Debt[]
    const events = (eventsResult.data ?? []) as LifeEvent[]
    const aowRows = (aowResult.data ?? []) as unknown as AowLeeftijdRow[]

    // Jaarlijkse essentiële uitgaven (zelfde subset-logica als load-input).
    const allBudgets = (budgetsResult.data ?? []) as Array<{
      id: string
      name: string | null
      default_limit: number | string | null
      interval: string | null
      budget_type: string | null
      is_essential: boolean | null
      parent_id: string | null
    }>
    const essentialBudgets = allBudgets.filter(
      (b) => b.is_essential && b.budget_type === 'expense' && b.parent_id === null,
    )
    const children = allBudgets.filter(
      (b) => b.parent_id !== null && !['archive', 'income', 'savings'].includes(b.budget_type ?? ''),
    )
    let yearlyEssential = 0
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = computeYearlyMustExpenses(essentialBudgets as any, children as any)
      yearlyEssential = num(res.yearlyMustExpenses)
    } catch {
      yearlyEssential = 0
    }

    // KernelAdapterProfile — EXACT als load-input (num() alleen op inkomen/uitgaven).
    const adapterProfile: KernelAdapterProfile = {
      date_of_birth: profileRaw.date_of_birth as string,
      net_monthly_income: num(profileRaw.net_monthly_income),
      estimated_monthly_expenses: num(profileRaw.estimated_monthly_expenses),
      yearly_essential_expenses: yearlyEssential > 0 ? yearlyEssential : undefined,
      expected_return: profileRaw.expected_return as number | null,
      inflation_rate: profileRaw.inflation_rate as number | null,
      box3_method: profileRaw.box3_method as string | null,
      marginaal_tarief: profileRaw.marginaal_tarief as number | null,
      fire_end_strategy: profileRaw.fire_end_strategy as string | null,
      fire_end_age: profileRaw.fire_end_age as number | null,
      fire_legacy_amount: profileRaw.fire_legacy_amount as number | string | null,
      feature_preferences: profileRaw.feature_preferences as Record<string, unknown> | null,
      withdrawal_strategy: profileRaw.withdrawal_strategy as string | null,
      guardrail_floor: profileRaw.guardrail_floor as number | null,
      guardrail_ceiling: profileRaw.guardrail_ceiling as number | null,
      guardrail_cut_step: profileRaw.guardrail_cut_step as number | null,
      guardrail_raise_step: profileRaw.guardrail_raise_step as number | null,
      housing_strategy_config: profileRaw.housing_strategy_config,
      pot_rules: profileRaw.pot_rules,
      retirement_expense_method: profileRaw.retirement_expense_method as string | null,
      retirement_custom_amount: profileRaw.retirement_expense_custom_amount as number | null,
    }

    const adapterInput: KernelAdapterInput = {
      profile: adapterProfile,
      assets,
      debts,
      lifeEvents: events,
      aowRows,
    }

    // ── Bouw KernelInput + solve ────────────────────────────────────────────────
    const { input: kernelInput, notices } = buildKernelInputFromAppWithNotices(adapterInput)
    const solve = solveFire(kernelInput)

    // ── Prognose I/J jaarsamples (leeftijd start..100) ──────────────────────────
    const start = kernelInput.startLeeftijd
    const samples: Array<{ age: number; month: number; I: number | ''; J: number | '' }> = []
    for (let m = 0; m < HORIZON_MONTHS; m += 12) {
      const row = solve.projection.prognose[m]
      if (!row) break
      const beyond = (row as { beyondHorizon?: boolean }).beyondHorizon === true
      samples.push({
        age: start + m / 12,
        month: m,
        I: beyond ? '' : (row as { nettoVermogen: number }).nettoVermogen,
        J: beyond ? '' : (row as { nettoLiquide: number }).nettoLiquide,
      })
    }

    const fireAgeYears = Math.floor(solve.fireAge)
    const fireAgeMonths = Math.round((solve.fireAge - fireAgeYears) * 12)

    // ── Raw-invoer-samenvatting (herkomst per veld) ─────────────────────────────
    const fireParams = resolveFireParams(adapterProfile)
    const housing = parseHousingStrategy(profileRaw.housing_strategy_config)
    const rawSummary = {
      persoon: {
        geboortedatum: String(profileRaw.date_of_birth),
        huishoudtype: String(profileRaw.household_type ?? 'solo'),
        kinderen: num(profileRaw.number_of_children),
        startLeeftijd: kernelInput.startLeeftijd,
        geboortejaar: kernelInput.persoon.geboortejaar,
        startjaar: kernelInput.persoon.startjaar,
        aowLeeftijd: kernelInput.persoon.aowLeeftijd,
      },
      inkomenUitgaven: {
        nettoMaandinkomen_bron: 'profiles.net_monthly_income',
        nettoMaandinkomen: num(profileRaw.net_monthly_income),
        nettoJaarinkomen: kernelInput.inkomenUitgaven.nettoJaarinkomen,
        maanduitgaven: num(profileRaw.estimated_monthly_expenses),
        nettoJaaruitgaven: kernelInput.inkomenUitgaven.nettoJaaruitgaven,
        uitgaveNaPensioenPerJaar: kernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar,
        jaarEssentieel: yearlyEssential,
        retirementMethod: String(profileRaw.retirement_expense_method ?? '—'),
      },
      parameters: {
        expected_return_raw: profileRaw.expected_return,
        expected_return_type: typeof profileRaw.expected_return,
        inflation_rate_raw: profileRaw.inflation_rate,
        inflation_rate_type: typeof profileRaw.inflation_rate,
        kernelInflatie: kernelInput.inflatie,
        kernelInflatie_type: typeof kernelInput.inflatie,
        fireParams_grossReturn: fireParams.grossReturn,
        fireParams_inflatie: fireParams.inflationRate,
        box3Method: kernelInput.box3.method,
        box3Personen: kernelInput.box3.personen,
      },
      strategie: {
        eindstrategie: kernelInput.eindstrategie.selector,
        eindleeftijdOpeten: kernelInput.eindstrategie.eindleeftijdOpeten,
        nalatenschap: kernelInput.eindstrategie.nalatenschapBedrag,
        woningStrategie: `${housing.mode} → ${kernelInput.woning.selector}`,
        woningTrigger: kernelInput.woning.trigger,
        woningVerkoopleeftijd: kernelInput.woning.verkoopleeftijd,
        woningDrempelMnd: kernelInput.woning.drempelMaandenUitgave,
        woningVerkoopprijsPctWoz: kernelInput.woning.verkoopprijsPctWoz,
        onttrekkingsprofiel: kernelInput.onttrekkingsprofiel.profiel,
      },
    }

    // ── Wegschrijven ────────────────────────────────────────────────────────────
    mkdirSync(OUT_DIR, { recursive: true })
    const write = (name: string, data: unknown) =>
      writeFileSync(join(OUT_DIR, name), JSON.stringify(data, null, 2), 'utf-8')
    write('kernel-input.json', kernelInput)
    write('solve-result.json', {
      fireAge: solve.fireAge,
      fireAgeYears,
      fireAgeMonths,
      eindleeftijd: solve.eindleeftijd,
      doelbedrag: solve.doelbedrag,
      modelwaarde: solve.modelwaarde,
      gap: solve.gap,
      status: solve.status,
      maandHint: solve.maandHint,
      tekortLeningTotEindleeftijd: solve.tekortLeningTotEindleeftijd,
      engineRuns: solve.engineRuns,
    })
    write('prognose-samples.json', samples)
    write('raw-summary.json', rawSummary)
    write('notices.json', notices)

    // ── Console-samenvatting ─────────────────────────────────────────────────────
    /* eslint-disable no-console */
    console.log('\n========== EIGENAAR-LIVE DUMP ==========')
    console.log('owner:', OWNER_EMAIL, OWNER_ID)
    console.log('assets:', assets.length, 'debts:', debts.length, 'events:', events.length, 'aow-rows:', aowRows.length)
    console.log('startLeeftijd:', kernelInput.startLeeftijd, 'geboortejaar:', kernelInput.persoon.geboortejaar, 'aowLeeftijd:', kernelInput.persoon.aowLeeftijd)
    console.log('inflatie:', JSON.stringify(kernelInput.inflatie), '(type', typeof kernelInput.inflatie + ')')
    console.log('expected_return raw:', JSON.stringify(profileRaw.expected_return), 'type', typeof profileRaw.expected_return)
    console.log('nettoJaarinkomen:', kernelInput.inkomenUitgaven.nettoJaarinkomen, 'nettoJaaruitgaven:', kernelInput.inkomenUitgaven.nettoJaaruitgaven, 'naPensioen:', kernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar)
    console.log('eindstrategie:', kernelInput.eindstrategie.selector, 'eindleeftijd(opeten):', kernelInput.eindstrategie.eindleeftijdOpeten)
    console.log('woning:', kernelInput.woning.selector, kernelInput.woning.trigger, 'verkoopleeftijd', kernelInput.woning.verkoopleeftijd, 'prijs%woz', kernelInput.woning.verkoopprijsPctWoz)
    console.log('assetPotten:', JSON.stringify(kernelInput.assetPotten.map((p) => ({ slot: p.slot, cat: p.categorie, box3: p.box3Type, w: p.startwaarde, r: p.rendement, rol: p.rol }))))
    console.log('schuldPotten:', JSON.stringify(kernelInput.schuldPotten.map((p) => ({ slot: p.slot, cat: p.categorie, box3: p.box3Type, w: p.startwaarde, aflEur: p.aflossingEur, r: p.rente, rol: p.rol }))))
    console.log('pensioenPotten:', JSON.stringify(kernelInput.autoGebeurtenissen.pensioenPotten))
    console.log('aowOpbouwjaren:', kernelInput.autoGebeurtenissen.aowOpbouwjaren, 'leefsituatie:', kernelInput.autoGebeurtenissen.leefsituatie)
    console.log('gebeurtenissen(handmatig):', JSON.stringify(kernelInput.gebeurtenissen))
    console.log('---SOLVER---')
    console.log('fireAge:', solve.fireAge, `(${fireAgeYears}j ${fireAgeMonths}m)`)
    console.log('status:', solve.status)
    console.log('eindleeftijd:', solve.eindleeftijd, 'doelbedrag:', solve.doelbedrag, 'modelwaarde:', solve.modelwaarde, 'gap:', solve.gap)
    console.log('tekortLening:', solve.tekortLeningTotEindleeftijd, 'engineRuns:', solve.engineRuns)
    console.log('notices:', notices.length ? JSON.stringify(notices) : '(geen)')
    console.log('Prognose J samples (age→J):', samples.filter((s) => s.age % 5 === 0).map((s) => `${s.age}:${s.J === '' ? '—' : Math.round(Number(s.J))}`).join('  '))
    console.log('OUT_DIR:', OUT_DIR)
    console.log('========================================\n')
    /* eslint-enable no-console */

    expect(kernelInput.assetPotten.length).toBeGreaterThan(0)
  }, 60000)
})
