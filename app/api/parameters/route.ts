import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeCashSettingsInput, parseCashflowBasisPrefs } from '@/lib/cashflow-settings'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { loadParameterSavingsRateTarget } from '@/lib/cashflow-settings-data'
import { PARAMETER_BANDS, bandError, isWithinBand } from '@/lib/parameters-band'
import { z } from 'zod'
import { BOX3_METHODS } from '@/lib/box3-method'

/**
 * Box 3-methode — de enige enum-parameter op deze route, sinds TPR-10 met een
 * scherm (/toekomst/voorkeuren) en daarom met zod bewaakt (ADR 0044). `optional`
 * omdat de route deelpatches accepteert; `undefined` = niet meegestuurd.
 */
const box3MethodSchema = z.enum(BOX3_METHODS).optional()

/**
 * TPR-12 — heffingvrij inkomen (Box 3, werkelijk-tak; kernel P!B91) in euro per persoon
 * per jaar. Band uit de GEDEELDE bron `PARAMETER_BANDS` (= de DB-CHECK
 * profiles_box3_heffingvrij_inkomen_range). `null` = wis → kernel-default 1800.
 */
const HEFFINGVRIJ_KEY = 'box3_heffingvrij_inkomen'
const heffingvrijBand = PARAMETER_BANDS[HEFFINGVRIJ_KEY]
const heffingvrijInkomenSchema = z.number().min(heffingvrijBand.min).max(heffingvrijBand.max).nullable()

/**
 * Ontbreekt een kolom? PostgREST meldt een onbekende kolom in een upsert-payload als
 * `PGRST204` (schema cache); Postgres zelf als `42703` (undefined_column).
 */
function isOntbrekendeKolom(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST204' || error?.code === '42703'
}

// ── GET — Lees berekeningsparameters uit profiles ─────────────────────

export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  // Drie tiers, elk met één kolom minder. Tier 0 vraagt `cashflow_basis_prefs`
  // (ADR 0103) en `box3_heffingvrij_inkomen` (TPR-12, migratie 20260913150000) erbij;
  // die kolommen kunnen op een DB zonder de migratie nog ontbreken en zouden dan de
  // HELE select laten falen — met tier 1 als vangnet levert de route dan nog steeds
  // alle bestaande velden, in plaats van stil terug te vallen op de kale tier 2
  // (waar income_source/expenses_source verdwijnen).
  const BASE_COLUMNS =
    'expected_return, inflation_rate, box3_method, pension_factor_a, pension_factor_a_source, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount, target_savings_rate, income_source, expenses_source'

  let data: Record<string, unknown> | null = null
  const { data: d0, error: e0 } = await supabase
    .from('profiles')
    .select(`${BASE_COLUMNS}, cashflow_basis_prefs, ${HEFFINGVRIJ_KEY}`)
    .eq('id', claims.sub)
    .single()

  const { data: d1, error: e1 } = e0
    ? await supabase.from('profiles').select(BASE_COLUMNS).eq('id', claims.sub).single()
    : { data: d0, error: null }

  if (!e1) {
    data = d1 as Record<string, unknown>
  } else {
    // Fallback: column may not exist yet (migration not applied)
    const { data: d2, error: e2 } = await supabase
      .from('profiles')
      .select('expected_return, inflation_rate, box3_method, net_monthly_income')
      .eq('id', claims.sub)
      .single()
    if (e2) {
      return serverError(e2, 'parameters:GET')
    }
    data = d2 as Record<string, unknown>
  }

  // Spaarquote-doel leest voortaan uit de goals-bron (ronde 4, besluit 3): het
  // door het /toekomst-lab gegenereerde parameter-doel wint; de (DEPRECATED)
  // profielkolom `target_savings_rate` is enkel nog fallback.
  const goalTargetSavingsRate = await loadParameterSavingsRateTarget(supabase, claims.sub)

  return NextResponse.json({
    expected_return: data?.expected_return ?? 0.07,
    inflation_rate: data?.inflation_rate ?? 0.02,
    box3_method: data?.box3_method ?? 'forfaitair',
    // TPR-12 — NULL = kernel-default (EXCEL_HEFFINGVRIJ_INKOMEN_PP); de client toont dan de default.
    box3_heffingvrij_inkomen: data?.box3_heffingvrij_inkomen ?? null,
    pension_factor_a: data?.pension_factor_a ?? null,
    pension_factor_a_source: data?.pension_factor_a_source ?? null,
    net_monthly_income: data?.net_monthly_income ?? null,
    estimated_monthly_expenses: Number(data?.estimated_monthly_expenses ?? 0),
    retirement_expense_method: data?.retirement_expense_method ?? 'essential_budgets',
    retirement_expense_custom_amount: Number(data?.retirement_expense_custom_amount ?? 0),
    target_savings_rate: goalTargetSavingsRate ?? data?.target_savings_rate ?? null,
    income_source: data?.income_source ?? 'auto',
    expenses_source: data?.expenses_source ?? 'auto',
    // Bronwaarde én selectie in ÉÉN uitgifte, spiegelbeeld van de PUT (ADR 0103).
    // Opnieuw defensief geparsed: DB-inhoud wordt nooit vertrouwd. NULL of een
    // onbekende vorm → null = "nooit gezet" → alles telt mee.
    cashflow_basis_prefs: parseCashflowBasisPrefs(data?.cashflow_basis_prefs),
  })
}

// ── PUT — Sla berekeningsparameters op in profiles ────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return badRequest('Ongeldig verzoek')
  }

  // Valideer return/inflatie alleen wanneer ze in de body zitten — zo kan de
  // cashflow-pagina deelpatches sturen (bv. alleen net_monthly_income) zonder
  // dat de parameters-validatie afketst op ontbrekende velden. De parameters-
  // instellingenpagina stuurt beide altijd mee, dus die blijft identiek werken.
  // Banden uit de GEDEELDE bron (lib/parameters-band.ts) — dezelfde module die
  // de bewerk-sheet gebruikt voor zijn client-side feedback, zodat de twee niet
  // uit elkaar kunnen lopen.
  let expectedReturn: number | undefined
  if (body.expected_return !== undefined) {
    const n = Number(body.expected_return)
    if (!isWithinBand('expected_return', n)) {
      return NextResponse.json({ error: bandError('expected_return') }, { status: 400 })
    }
    expectedReturn = n
  }
  let inflationRate: number | undefined
  if (body.inflation_rate !== undefined) {
    const n = Number(body.inflation_rate)
    if (!isWithinBand('inflation_rate', n)) {
      return NextResponse.json({ error: bandError('inflation_rate') }, { status: 400 })
    }
    inflationRate = n
  }

  // Box 3-methode (enum, zod). `marginaal_tarief` wordt hier sinds TPR-10 NIET
  // meer geaccepteerd of geschreven: geen scherm zette 'm en de kern las 'm niet;
  // het marginale tarief is uitsluitend jaar-afgeleid (lib/fire-params.ts).
  const parsedBox3 = box3MethodSchema.safeParse(body.box3_method)
  if (!parsedBox3.success) {
    return badRequest(`Box 3-methode moet ${BOX3_METHODS.map((m) => `"${m}"`).join(' of ')} zijn`)
  }
  const box3Method = parsedBox3.data

  // TPR-12 — heffingvrij inkomen (euro p.p. per jaar): alleen wanneer de sleutel in de
  // body staat; null = wis (→ kernel-default). Buiten de band → 400 met de gedeelde tekst.
  let heffingvrijInkomen: number | null | undefined
  if (HEFFINGVRIJ_KEY in body) {
    const parsed = heffingvrijInkomenSchema.safeParse(body[HEFFINGVRIJ_KEY])
    if (!parsed.success) {
      return badRequest(bandError(HEFFINGVRIJ_KEY))
    }
    heffingvrijInkomen = parsed.data
  }

  // Validate pension_factor_a if provided — null means "wissen / niet ingevuld".
  // NULL ≠ 0: een lege waarde betekent "onbekend", een expliciete 0 betekent
  // "geen pensioenaangroei". Beide zijn geldige opslagwaarden.
  const rawFactorA = body.pension_factor_a
  let pensionFactorA: number | null | undefined
  if (rawFactorA === null) {
    pensionFactorA = null // expliciet wissen
  } else if (rawFactorA !== undefined) {
    const n = Number(rawFactorA)
    if (isNaN(n) || n < 0) {
      return NextResponse.json({ error: 'Factor A moet 0 of hoger zijn' }, { status: 400 })
    }
    pensionFactorA = n
  }

  // Validate pension_factor_a_source if provided — null = onbekend/wissen.
  const rawFactorASource = body.pension_factor_a_source
  let pensionFactorASource: string | null | undefined
  if (rawFactorASource === null) {
    pensionFactorASource = null
  } else if (rawFactorASource !== undefined) {
    if (rawFactorASource !== 'upo' && rawFactorASource !== 'estimated') {
      return NextResponse.json({ error: 'Factor A bron moet "upo" of "estimated" zijn' }, { status: 400 })
    }
    pensionFactorASource = rawFactorASource
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }
  if (expectedReturn !== undefined) {
    updateData.expected_return = expectedReturn
  }
  if (inflationRate !== undefined) {
    updateData.inflation_rate = inflationRate
  }
  if (box3Method !== undefined) {
    updateData.box3_method = box3Method
  }
  if (heffingvrijInkomen !== undefined) {
    updateData[HEFFINGVRIJ_KEY] = heffingvrijInkomen
  }
  if (pensionFactorA !== undefined) {
    updateData.pension_factor_a = pensionFactorA
  }
  if (pensionFactorASource !== undefined) {
    updateData.pension_factor_a_source = pensionFactorASource
  }

  const cashSettings = sanitizeCashSettingsInput(body)
  Object.assign(updateData, cashSettings)

  let { error } = await supabase
    .from('profiles')
    .upsert(updateData)

  // Wat de retry-tak WEL heeft weggeschreven — de response mag NOOIT iets
  // bevestigen dat niet is opgeslagen (zie hieronder).
  const persistedCashSettings: typeof cashSettings = { ...cashSettings }

  // Ontbreekt een nieuwere kolom nog (legacy-DB), retry dan één keer zonder de optionele
  // kolommen (the factor-A pair, cashflow_basis_prefs en het TPR-12-veld
  // box3_heffingvrij_inkomen). Zonder die zou een DB waarop migratie 20260811160000 resp.
  // 20260913150000 nog niet draaide de HELE parameters-PUT laten falen — dus ook het
  // opslaan van de bronwaarde zelf. ALLEEN bij een ontbrekende kolom (TPR-15): bij elke
  // andere fout (CHECK-schending, storing) zou de retry de optionele velden stil laten
  // vallen en een deels geslaagde write als succes melden.
  let persistedHeffingvrij = heffingvrijInkomen
  if (
    isOntbrekendeKolom(error) &&
    (pensionFactorA !== undefined ||
      pensionFactorASource !== undefined ||
      heffingvrijInkomen !== undefined ||
      cashSettings.cashflow_basis_prefs !== undefined)
  ) {
    delete updateData[HEFFINGVRIJ_KEY]
    persistedHeffingvrij = undefined
    delete updateData.pension_factor_a
    delete updateData.pension_factor_a_source
    delete updateData.cashflow_basis_prefs
    // De selectie is NIET weggeschreven, dus hij mag ook niet in de response
    // staan. Zonder deze regel kreeg de client zijn uitsluitingen terug alsof ze
    // bewaard waren, terwijl de grondslag bij de volgende render weer op "alles
    // telt mee" staat — een stille tweede waarheid, precies waar ADR 0103 tegen
    // beschermt. De bronwaarde (income_source/expenses_source) IS wel bewaard en
    // blijft daarom in de response staan.
    delete persistedCashSettings.cashflow_basis_prefs
    const retry = await supabase.from('profiles').upsert(updateData)
    error = retry.error
  }

  if (error) {
    return serverError(error, 'parameters:PUT')
  }

  return NextResponse.json({
    success: true,
    expected_return: expectedReturn ?? null,
    inflation_rate: inflationRate ?? null,
    // Alleen echoën wat écht is weggeschreven: een deelpatch zonder methode (bv. alleen
    // het heffingvrije inkomen) mag geen 'forfaitair' bevestigen die niet is opgeslagen.
    ...(box3Method !== undefined ? { box3_method: box3Method } : {}),
    // Idem voor het heffingvrije inkomen (zie de retry hierboven).
    ...(persistedHeffingvrij !== undefined ? { [HEFFINGVRIJ_KEY]: persistedHeffingvrij } : {}),
    pension_factor_a: pensionFactorA !== undefined ? pensionFactorA : null,
    pension_factor_a_source: pensionFactorASource !== undefined ? pensionFactorASource : null,
    ...persistedCashSettings,
  })
}
